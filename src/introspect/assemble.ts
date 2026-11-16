import type { Column, ForeignKey, RawColumnRow, RawConstraintRow, RawEnumRow, Schema, Table } from "./types";

// Pure function: turns raw database catalog rows into an immutable Schema object
export function assembleSchema(
  schemaName: string,
  rawColumns: RawColumnRow[],
  rawConstraints: RawConstraintRow[],
  rawEnums: RawEnumRow[],
): Schema {
  // 1. Group columns by table name
  const columnsByTable = new Map<string, Column[]>();

  for (const row of rawColumns) {
    let cols = columnsByTable.get(row.table_name);
    if (!cols) {
      cols = [];
      columnsByTable.set(row.table_name, cols);
    }

    const isArray = row.data_type === "ARRAY" || row.udt_name.startsWith("_");

    cols.push({
      name: row.column_name,
      position: row.ordinal_position,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.nullable,
      hasDefault: row.column_default !== null,
      identity: row.is_identity
        ? row.identity_generation === "ALWAYS"
          ? "always"
          : "by_default"
        : null,
      generated: row.is_generated,
      maxLength: row.character_maximum_length ?? undefined,
      precision: row.numeric_precision ?? undefined,
      scale: row.numeric_scale ?? undefined,
      isArray,
    });
  }

  // 2. Group constraints by table name
  const constraintsByTable = new Map<string, RawConstraintRow[]>();

  for (const con of rawConstraints) {
    let cons = constraintsByTable.get(con.table_name);
    if (!cons) {
      cons = [];
      constraintsByTable.set(con.table_name, cons);
    }
    cons.push(con);
  }

  // 3. Assemble Table objects
  const tables: Table[] = [];

  for (const [tableName, columns] of columnsByTable.entries()) {
    const tableConstraints = constraintsByTable.get(tableName) ?? [];

    // Find primary key
    const pkConstraint = tableConstraints.find((c) => c.type === "p");
    const primaryKey = pkConstraint ? pkConstraint.columns : [];

    // Find unique constraints
    const uniques = tableConstraints
      .filter((c) => c.type === "u")
      .map((c) => c.columns);

    // Find foreign keys
    const columnMap = new Map(columns.map((c) => [c.name, c]));

    const foreignKeys: ForeignKey[] = tableConstraints
      .filter((c) => c.type === "f" && c.ref_table && c.ref_columns)
      .map((c) => {
        // A foreign key is nullable only if ALL its constituent columns are nullable
        const isFkNullable = c.columns.every((colName) => {
          const col = columnMap.get(colName);
          return col ? col.nullable : false;
        });

        return {
          name: c.name,
          columns: c.columns,
          refTable: c.ref_table!,
          refColumns: c.ref_columns!,
          nullable: isFkNullable,
        };
      });

    tables.push({
      name: tableName,
      columns,
      primaryKey,
      uniques,
      foreignKeys,
    });
  }

  // 4. Assemble Enums map
  const enums: Record<string, string[]> = {};
  for (const row of rawEnums) {
    enums[row.typname] = row.labels;
  }

  return {
    name: schemaName,
    tables,
    enums,
  };
}
