import type { Faker } from "@faker-js/faker";
import type { Schema, Table } from "../introspect/types";
import type { ResolvedConfig } from "../config/types";
import type { TableOrderResult } from "../graph/types";
import type { KeyPool } from "../generate/types";
import { buildTablePlan, generateTableRows } from "../generate/generate";
import { calculateBatchSize, chunkRows } from "./batch";
import { formatInsertSql, formatUpdateSql } from "./sql-format";
import type { ExecutionResult, TableExecutionStats } from "./types";

export interface DryRunOptions {
  schema: Schema;
  config: ResolvedConfig;
  orderResult: TableOrderResult;
  faker: Faker;
}

/**
 * Simulates the execution pipeline and prints the exact SQL statements without writing to any database.
 */
export function executeDryRun(options: DryRunOptions): ExecutionResult {
  const startTime = Date.now();
  const { schema, config, orderResult, faker } = options;
  const tableMap = new Map<string, Table>(schema.tables.map((t) => [t.name, t]));
  const keyPools = new Map<string, KeyPool>();

  console.log(`-- DRY RUN MODE: No changes will be written to the database.`);
  console.log(`-- Database-assigned primary keys are illustrated with sequential placeholders.`);
  console.log(`\nBEGIN;\n`);

  const tableStats: TableExecutionStats[] = [];
  let totalRows = 0;
  let placeholderId = 1;

  for (const tableName of orderResult.order) {
    const table = tableMap.get(tableName);
    if (!table) continue;

    const plan = buildTablePlan(table, schema, config, orderResult.deferredFks);
    if (plan.ignored || plan.rowCount === 0) continue;

    const hasSingleIntPk =
      table.primaryKey.length === 1 &&
      ["int2", "int4", "int8", "smallint", "integer", "bigint"].includes(
        table.columns.find((c) => c.name === table.primaryKey[0])?.udtName.toLowerCase() ?? ""
      );

    const hasSingleUuidPk =
      table.primaryKey.length === 1 &&
      table.columns.find((c) => c.name === table.primaryKey[0])?.udtName.toLowerCase() === "uuid";

    const generatedKeys: unknown[][] = [];
    for (let i = 0; i < plan.rowCount; i++) {
      if (hasSingleIntPk) {
        generatedKeys.push([placeholderId++]);
      } else if (hasSingleUuidPk) {
        generatedKeys.push([faker.string.uuid()]);
      }
    }

    if (generatedKeys.length > 0) {
      keyPools.set(tableName, {
        table: tableName,
        keyColumns: table.primaryKey,
        keys: generatedKeys,
      });
    }

    const rows = generateTableRows(table, plan, schema, config, keyPools, faker);

    // Merge illustrative IDs
    if (generatedKeys.length > 0) {
      const pkCol = table.primaryKey[0];
      rows.forEach((row, idx) => {
        if (row[pkCol] === undefined) {
          row[pkCol] = generatedKeys[idx][0];
        }
      });
    }

    const insertColumns = table.columns
      .map((c) => c.name)
      .filter((colName) => rows.some((r) => r[colName] !== undefined));

    const batchSize = calculateBatchSize(insertColumns.length);
    const batches = chunkRows(rows, batchSize);

    console.log(`-- Table: ${schema.name}.${tableName} (${rows.length} rows, batch size ${batchSize})`);
    for (const batch of batches) {
      const sql = formatInsertSql({
        tableName,
        schema: schema.name,
        columns: insertColumns,
        rows: batch,
        hasIdentityAlways: false,
      });
      console.log(sql);
    }
    console.log("");

    totalRows += rows.length;
    tableStats.push({
      table: tableName,
      rowsInserted: rows.length,
      batches: batches.length,
      deferredPatched: 0,
    });
  }

  // Deferred FK updates in dry run
  if (orderResult.deferredFks.length > 0) {
    console.log(`-- Deferred Foreign Key Patch Pass`);
    for (const deferred of orderResult.deferredFks) {
      const table = tableMap.get(deferred.table);
      const parentPool = keyPools.get(deferred.fk.refTable);

      if (table && parentPool && parentPool.keys.length > 0 && table.primaryKey.length > 0) {
        const tablePool = keyPools.get(table.name);
        const fkCol = deferred.fk.columns[0];

        if (tablePool) {
          const patches: Array<{ pkValues: Record<string, unknown>; fkValue: unknown }> = [];
          tablePool.keys.forEach((pkTuple) => {
            const pkValues: Record<string, unknown> = {};
            table.primaryKey.forEach((pkName, idx) => {
              pkValues[pkName] = pkTuple[idx];
            });
            const parentTuple = faker.helpers.arrayElement(parentPool.keys);
            patches.push({
              pkValues,
              fkValue: parentTuple[0],
            });
          });

          const updateStatements = formatUpdateSql({
            tableName: table.name,
            schema: schema.name,
            pkColumns: table.primaryKey,
            fkColumn: fkCol,
            patches,
          });

          updateStatements.forEach((stmt) => console.log(stmt));
          const stat = tableStats.find((s) => s.table === table.name);
          if (stat) stat.deferredPatched += patches.length;
        }
      }
    }
    console.log("");
  }

  console.log(`ROLLBACK; -- Dry run completed safely.\n`);

  return {
    mode: "dry-run",
    success: true,
    totalRows,
    tables: tableStats,
    deferredFks: orderResult.deferredFks,
    durationMs: Date.now() - startTime,
  };
}
