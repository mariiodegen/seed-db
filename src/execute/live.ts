import postgres from "postgres";
import type { Faker } from "@faker-js/faker";
import { SeedError } from "../errors";
import type { Schema, Table } from "../introspect/types";
import type { ResolvedConfig } from "../config/types";
import type { TableOrderResult } from "../graph/types";
import type { KeyPool } from "../generate/types";
import { buildTablePlan, generateTableRows } from "../generate/generate";
import { calculateBatchSize, chunkRows } from "./batch";
import type { ExecutionResult, TableExecutionStats } from "./types";

export interface LiveExecutionOptions {
  databaseUrl: string;
  schema: Schema;
  config: ResolvedConfig;
  orderResult: TableOrderResult;
  faker: Faker;
  check?: boolean; // If true, intentionally rollback transaction at the end to verify constraints
  verbose?: boolean;
}

// Internal sentinel to trigger rollback in check mode
class CheckRollbackSentinel extends Error {
  constructor() {
    super("CHECK_MODE_ROLLBACK");
  }
}

/**
 * Executes database seeding inside a single transaction with automatic rollback on error.
 */
export async function executeLive(options: LiveExecutionOptions): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { databaseUrl, schema, config, orderResult, faker, check = false, verbose = false } = options;

  const sql = postgres(databaseUrl, {
    connect_timeout: 5,
    max: 1, // Single connection for the transaction
    onnotice: () => {}, // Suppress notices
  });

  const tableMap = new Map<string, Table>(schema.tables.map((t) => [t.name, t]));
  const keyPools = new Map<string, KeyPool>();
  const tableStats: TableExecutionStats[] = [];
  let totalRows = 0;

  try {
    await sql.begin(async (tx) => {
      // 1. Insert each table in topological order
      for (const tableName of orderResult.order) {
        const table = tableMap.get(tableName);
        if (!table) continue;

        const plan = buildTablePlan(table, schema, config, orderResult.deferredFks);
        if (plan.ignored || plan.rowCount === 0) {
          continue;
        }

        // Generate rows using current parent key pools
        const rows = generateTableRows(table, plan, schema, config, keyPools, faker);
        if (rows.length === 0) continue;

        // Determine insert columns (excluding skipped columns)
        const insertColumns = table.columns
          .map((c) => c.name)
          .filter((colName) => rows.some((r) => r[colName] !== undefined));

        const batchSize = calculateBatchSize(insertColumns.length);
        const batches = chunkRows(rows, batchSize);

        const returnedKeys: unknown[][] = [];
        const pkColumns = table.primaryKey;

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];

          try {
            if (insertColumns.length === 0) {
              // Table with no columns or only default/identity columns
              for (let i = 0; i < batch.length; i++) {
                if (pkColumns.length > 0) {
                  const [res] = await tx`
                    INSERT INTO ${tx(schema.name)}.${tx(tableName)} DEFAULT VALUES
                    RETURNING ${tx(pkColumns)}
                  `;
                  returnedKeys.push(pkColumns.map((pk) => res[pk]));
                } else {
                  await tx`INSERT INTO ${tx(schema.name)}.${tx(tableName)} DEFAULT VALUES`;
                }
              }
            } else {
              // Standard multi-row insert batch
              if (pkColumns.length > 0) {
                const results = await tx`
                  INSERT INTO ${tx(schema.name)}.${tx(tableName)} ${tx(batch, insertColumns)}
                  RETURNING ${tx(pkColumns)}
                `;
                for (const res of results) {
                  returnedKeys.push(pkColumns.map((pk) => res[pk]));
                }
              } else {
                await tx`
                  INSERT INTO ${tx(schema.name)}.${tx(tableName)} ${tx(batch, insertColumns)}
                `;
              }
            }
          } catch (err: any) {
            throw new SeedError({
              code: "E_DATABASE_ERROR",
              where: `${schema.name}.${tableName} (batch ${batchIndex + 1}/${batches.length})`,
              cause: `PostgreSQL error: ${err.message}${err.detail ? " Detail: " + err.detail : ""}`,
              fix: err.constraint_name
                ? `Check constraint "${err.constraint_name}" or add a custom rule in seed.config.ts for table "${tableName}".`
                : `Check table schema definitions and constraints for "${tableName}".`,
              exit: 1,
            });
          }
        }

        // Store returned keys into KeyPool for child foreign keys
        if (pkColumns.length > 0 && returnedKeys.length > 0) {
          keyPools.set(tableName, {
            table: tableName,
            keyColumns: pkColumns,
            keys: returnedKeys,
          });
        }

        totalRows += rows.length;
        tableStats.push({
          table: tableName,
          rowsInserted: rows.length,
          batches: batches.length,
          deferredPatched: 0,
        });

        if (verbose) {
          console.log(`[execute] Inserted ${rows.length} rows into ${schema.name}.${tableName} (${batches.length} batches)`);
        }
      }

      // 2. Two-Phase Patch Pass for Deferred Foreign Keys
      if (orderResult.deferredFks.length > 0) {
        for (const deferred of orderResult.deferredFks) {
          const table = tableMap.get(deferred.table);
          const parentPool = keyPools.get(deferred.fk.refTable);

          if (table && parentPool && parentPool.keys.length > 0 && table.primaryKey.length > 0) {
            const tablePool = keyPools.get(table.name);
            const fkCol = deferred.fk.columns[0];

            if (tablePool && tablePool.keys.length > 0) {
              let patchedCount = 0;

              for (const pkTuple of tablePool.keys) {
                // Sample parent key
                const parentTuple = faker.helpers.arrayElement(parentPool.keys);
                const parentId = parentTuple[0];
                const childId = pkTuple[0];
                const pkColName = table.primaryKey[0];

                await tx`
                  UPDATE ${tx(schema.name)}.${tx(table.name)}
                  SET ${tx(fkCol)} = ${parentId as any}
                  WHERE ${tx(pkColName)} = ${childId as any}
                `;
                patchedCount++;
              }

              const stat = tableStats.find((s) => s.table === table.name);
              if (stat) stat.deferredPatched += patchedCount;

              if (verbose) {
                console.log(`[execute] Patched ${patchedCount} deferred foreign keys on ${table.name}.${fkCol}`);
              }
            }
          }
        }
      }

      // 3. If in check mode, intentionally rollback transaction
      if (check) {
        throw new CheckRollbackSentinel();
      }
    });

    // Transaction committed successfully
    return {
      mode: "live",
      success: true,
      totalRows,
      tables: tableStats,
      deferredFks: orderResult.deferredFks,
      durationMs: Date.now() - startTime,
      rolledBack: false,
    };
  } catch (err) {
    if (err instanceof CheckRollbackSentinel) {
      // Check mode rollback successful!
      return {
        mode: "check",
        success: true,
        totalRows,
        tables: tableStats,
        deferredFks: orderResult.deferredFks,
        durationMs: Date.now() - startTime,
        rolledBack: true,
      };
    }
    throw err;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
