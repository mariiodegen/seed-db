import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Faker } from "@faker-js/faker";
import type { Schema, Table } from "../introspect/types";
import type { ResolvedConfig } from "../config/types";
import type { TableOrderResult } from "../graph/types";
import type { KeyPool } from "../generate/types";
import { buildTablePlan, generateTableRows } from "../generate/generate";
import { calculateBatchSize, chunkRows } from "./batch";
import {
  formatInsertSql,
  formatSequenceSyncSql,
  formatUpdateSql,
} from "./sql-format";
import type { ExecutionResult, TableExecutionStats } from "./types";

export interface FileModeOptions {
  outFile: string;
  startId?: number;
  schema: Schema;
  config: ResolvedConfig;
  orderResult: TableOrderResult;
  faker: Faker;
}

/**
 * Generates a standalone PostgreSQL SQL script with client-assigned primary keys,
 * deferred FK patch pass, and sequence synchronization.
 */
export function executeFileMode(options: FileModeOptions): ExecutionResult {
  const startTime = Date.now();
  const { outFile, startId = 1, schema, config, orderResult, faker } = options;
  const tableMap = new Map<string, Table>(schema.tables.map((t) => [t.name, t]));
  const keyPools = new Map<string, KeyPool>();

  const sqlStatements: string[] = [
    `-- seed-db generated SQL seed file`,
    `-- Generated on: ${new Date().toISOString()}`,
    `-- Schema: "${schema.name}"`,
    `\nBEGIN;\n`,
  ];

  const tableStats: TableExecutionStats[] = [];
  let totalRows = 0;

  // Track next available ID per table in file mode
  const nextIdMap = new Map<string, number>();

  for (const tableName of orderResult.order) {
    const table = tableMap.get(tableName);
    if (!table) continue;

    const plan = buildTablePlan(table, schema, config, orderResult.deferredFks);
    if (plan.ignored || plan.rowCount === 0) continue;

    // In file mode, client assigns primary keys so child tables have real IDs to reference
    const hasSingleIntPk =
      table.primaryKey.length === 1 &&
      ["int2", "int4", "int8", "smallint", "integer", "bigint"].includes(
        table.columns.find((c) => c.name === table.primaryKey[0])?.udtName.toLowerCase() ?? ""
      );

    const hasSingleUuidPk =
      table.primaryKey.length === 1 &&
      table.columns.find((c) => c.name === table.primaryKey[0])?.udtName.toLowerCase() === "uuid";

    let currentId = nextIdMap.get(tableName) ?? startId;
    const generatedKeys: unknown[][] = [];

    // Pre-generate client-assigned keys for this table
    for (let i = 0; i < plan.rowCount; i++) {
      if (hasSingleIntPk) {
        generatedKeys.push([currentId]);
        currentId++;
      } else if (hasSingleUuidPk) {
        generatedKeys.push([faker.string.uuid()]);
      }
    }
    nextIdMap.set(tableName, currentId);

    if (generatedKeys.length > 0) {
      keyPools.set(tableName, {
        table: tableName,
        keyColumns: table.primaryKey,
        keys: generatedKeys,
      });
    }

    // Generate row objects
    const rows = generateTableRows(table, plan, schema, config, keyPools, faker);

    // Merge client-assigned PKs into generated rows if they were skipped in live mode
    if (generatedKeys.length > 0) {
      const pkCol = table.primaryKey[0];
      rows.forEach((row, idx) => {
        if (row[pkCol] === undefined) {
          row[pkCol] = generatedKeys[idx][0];
        }
      });
    }

    // Determine columns to include in INSERT statement
    const insertColumns = table.columns
      .map((c) => c.name)
      .filter((colName) => rows.some((r) => r[colName] !== undefined));

    const hasIdentityAlways = table.columns.some(
      (c) => insertColumns.includes(c.name) && c.identity === "always"
    );

    // Chunk rows into safe batches
    const batchSize = calculateBatchSize(insertColumns.length);
    const batches = chunkRows(rows, batchSize);

    sqlStatements.push(`-- Table: ${schema.name}.${tableName} (${rows.length} rows)`);

    for (const batch of batches) {
      const insertSql = formatInsertSql({
        tableName,
        schema: schema.name,
        columns: insertColumns,
        rows: batch,
        hasIdentityAlways,
      });
      sqlStatements.push(insertSql);
    }
    sqlStatements.push("");

    totalRows += rows.length;
    tableStats.push({
      table: tableName,
      rowsInserted: rows.length,
      batches: batches.length,
      deferredPatched: 0,
    });
  }

  // Two-Phase Patch Pass for Deferred Foreign Keys
  if (orderResult.deferredFks.length > 0) {
    sqlStatements.push(`-- Deferred Foreign Key Patch Pass`);

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

            // Sample parent ID
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

          sqlStatements.push(...updateStatements);

          const stat = tableStats.find((s) => s.table === table.name);
          if (stat) {
            stat.deferredPatched += patches.length;
          }
        }
      }
    }
    sqlStatements.push("");
  }

  // Sequence continuation synchronizers (SELECT setval)
  sqlStatements.push(`-- Sequence Synchronization`);
  for (const tableName of orderResult.order) {
    const table = tableMap.get(tableName);
    if (table && table.primaryKey.length === 1) {
      const pkCol = table.columns.find((c) => c.name === table.primaryKey[0]);
      if (pkCol && (pkCol.hasDefault || pkCol.identity !== null)) {
        sqlStatements.push(formatSequenceSyncSql(tableName, pkCol.name, schema.name));
      }
    }
  }

  sqlStatements.push(`\nCOMMIT;\n`);

  // Write to destination file
  const resolvedPath = resolve(process.cwd(), outFile);
  writeFileSync(resolvedPath, sqlStatements.join("\n"), "utf-8");

  return {
    mode: "file",
    success: true,
    totalRows,
    tables: tableStats,
    deferredFks: orderResult.deferredFks,
    durationMs: Date.now() - startTime,
    outFile: resolvedPath,
  };
}
