// Helper functions for formatting PostgreSQL SQL statements for --dry-run and --out file mode.

export function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (Buffer.isBuffer(value)) {
    return `E'\\\\x${value.toString("hex")}'`;
  }
  if (typeof value === "object") {
    const jsonStr = JSON.stringify(value).replace(/'/g, "''");
    return `'${jsonStr}'`;
  }
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

export function escapeIdentifier(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

export interface InsertSqlOptions {
  tableName: string;
  schema?: string;
  columns: string[];
  rows: Record<string, unknown>[];
  hasIdentityAlways?: boolean;
}

/**
 * Formats a multi-row INSERT statement with optional OVERRIDING SYSTEM VALUE for identity columns.
 */
export function formatInsertSql(options: InsertSqlOptions): string {
  const { tableName, schema = "public", columns, rows, hasIdentityAlways } = options;
  if (rows.length === 0 || columns.length === 0) {
    return "";
  }

  const tableIdent = `${escapeIdentifier(schema)}.${escapeIdentifier(tableName)}`;
  const colList = columns.map(escapeIdentifier).join(", ");
  const overridingClause = hasIdentityAlways ? " OVERRIDING SYSTEM VALUE" : "";

  const valueRows = rows.map((row) => {
    const values = columns.map((col) => escapeSqlValue(row[col]));
    return `  (${values.join(", ")})`;
  });

  return `INSERT INTO ${tableIdent} (${colList})${overridingClause}\nVALUES\n${valueRows.join(",\n")};`;
}

export interface UpdateSqlOptions {
  tableName: string;
  schema?: string;
  pkColumns: string[];
  fkColumn: string;
  patches: Array<{
    pkValues: Record<string, unknown>;
    fkValue: unknown;
  }>;
}

/**
 * Formats deferred FK patch pass UPDATE statements.
 */
export function formatUpdateSql(options: UpdateSqlOptions): string[] {
  const { tableName, schema = "public", pkColumns, fkColumn, patches } = options;
  const tableIdent = `${escapeIdentifier(schema)}.${escapeIdentifier(tableName)}`;
  const statements: string[] = [];

  for (const patch of patches) {
    const whereClauses = pkColumns.map(
      (pk) => `${escapeIdentifier(pk)} = ${escapeSqlValue(patch.pkValues[pk])}`
    );
    const setClause = `${escapeIdentifier(fkColumn)} = ${escapeSqlValue(patch.fkValue)}`;
    statements.push(
      `UPDATE ${tableIdent} SET ${setClause} WHERE ${whereClauses.join(" AND ")};`
    );
  }

  return statements;
}

/**
 * Formats sequence synchronization statement so auto-incrementing serials continue seamlessly.
 */
export function formatSequenceSyncSql(tableName: string, pkColumn: string, schema = "public"): string {
  const tableRef = `'${schema}.${tableName}'`;
  const pkRef = `'${pkColumn}'`;
  const tableIdent = `${escapeIdentifier(schema)}.${escapeIdentifier(tableName)}`;
  return `SELECT setval(pg_get_serial_sequence(${tableRef}, ${pkRef}), (SELECT max(${escapeIdentifier(pkColumn)}) FROM ${tableIdent}));`;
}
