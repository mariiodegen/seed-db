// Pure core topological sort using Kahn's algorithm with deterministic tie-breaking,
// self-reference extraction, and cycle breaking via deferred foreign keys.

import { SeedError } from "../errors";
import type { Schema, Table, ForeignKey } from "../introspect/types";
import type { DeferredForeignKey, TableOrderResult } from "./types";
import { findCycle } from "./cycles";

/**
 * Calculates the topological insertion order for database tables based on their foreign keys.
 *
 * Algorithm:
 * 1. Filter to tables in the requested run set (defaulting to all tables in schema).
 * 2. Extract self-referencing foreign keys (e.g. employees.manager_id) and mark them deferred.
 * 3. Execute Kahn's algorithm:
 *    - In-degree = count of distinct uninserted parent tables in the run set.
 *    - When multiple tables have in-degree 0, pick alphabetically for deterministic repeatability.
 * 4. If a cycle stalls the resolution:
 *    - Trace the cycle using DFS.
 *    - If any foreign key in the cycle is nullable, break the cycle by deferring that FK.
 *    - If all foreign keys in the cycle are NOT NULL, halt with E_CIRCULAR_DEPENDENCY (exit 3).
 */
export function orderTables(
  schema: Schema,
  runTables?: string[]
): TableOrderResult {
  const tableMap = new Map<string, Table>(schema.tables.map((t) => [t.name, t]));

  // 1. Determine run set
  let selectedTableNames: string[];
  if (runTables && runTables.length > 0) {
    const uniqueRequested = Array.from(new Set(runTables));
    for (const name of uniqueRequested) {
      if (!tableMap.has(name)) {
        throw new SeedError({
          code: "E_TABLE_NOT_FOUND",
          where: `--tables ${name}`,
          cause: `Table "${name}" specified in run set was not found in schema "${schema.name}".`,
          fix: `Check spelling or run "seed-db inspect" to see available tables in schema "${schema.name}".`,
          exit: 2,
        });
      }
    }
    selectedTableNames = uniqueRequested;
  } else {
    selectedTableNames = schema.tables.map((t) => t.name);
  }

  const runSet = new Set<string>(selectedTableNames);
  const deferredFks: DeferredForeignKey[] = [];

  // 2. Active foreign keys map (mutable during cycle breaking)
  // Maps table name -> list of active foreign keys pointing to tables in runSet
  const activeFks = new Map<string, ForeignKey[]>();

  for (const tableName of selectedTableNames) {
    const table = tableMap.get(tableName)!;
    const tableActiveFks: ForeignKey[] = [];

    for (const fk of table.foreignKeys) {
      // Ignore foreign keys targeting tables outside the run set (sampled from DB instead)
      if (!runSet.has(fk.refTable)) {
        continue;
      }

      // Check for self-reference
      if (fk.refTable === tableName) {
        deferredFks.push({
          table: tableName,
          fk,
          reason: "self-reference",
        });
        continue;
      }

      tableActiveFks.push(fk);
    }

    activeFks.set(tableName, tableActiveFks);
  }

  // 3. Track remaining uninserted parents for each table
  const remainingParents = new Map<string, Set<string>>();
  for (const tableName of selectedTableNames) {
    const parents = new Set<string>();
    for (const fk of activeFks.get(tableName) ?? []) {
      parents.add(fk.refTable);
    }
    remainingParents.set(tableName, parents);
  }

  const remainingTables = new Set<string>(selectedTableNames);
  const order: string[] = [];

  // 4. Main resolution loop: Kahn's algorithm + Cycle breaking
  while (remainingTables.size > 0) {
    // Find all tables whose dependencies are completely satisfied (in-degree == 0)
    const ready: string[] = [];
    for (const tableName of remainingTables) {
      const parents = remainingParents.get(tableName);
      if (!parents || parents.size === 0) {
        ready.push(tableName);
      }
    }

    if (ready.length > 0) {
      // Deterministic tie-breaking: pick alphabetically
      ready.sort();
      const nextTable = ready[0];

      order.push(nextTable);
      remainingTables.delete(nextTable);

      // Decrement in-degree for all children waiting on nextTable
      for (const tableName of remainingTables) {
        remainingParents.get(tableName)?.delete(nextTable);
      }
      continue;
    }

    // No ready tables: A cycle exists among the remaining tables
    const cycle = findCycle(Array.from(remainingTables), (t) => {
      const parents = remainingParents.get(t);
      return parents ? Array.from(parents) : [];
    });

    if (!cycle || cycle.length < 2) {
      // Fallback safeguard in case of unexpected graph state
      const remainingList = Array.from(remainingTables).sort().join(", ");
      throw new SeedError({
        code: "E_CIRCULAR_DEPENDENCY",
        where: remainingList,
        cause: `Circular dependency detected among tables: ${remainingList}`,
        fix: "Check table foreign keys or make at least one foreign key nullable.",
        exit: 3,
      });
    }

    // Inspect edges in the detected cycle: cycle is [T0, T1, ..., Tn, T0]
    // An edge from cycle[i] to cycle[i+1] means cycle[i] has an active FK pointing to cycle[i+1]
    interface NullableCandidate {
      table: string;
      refTable: string;
      fk: ForeignKey;
    }

    const nullableCandidates: NullableCandidate[] = [];

    for (let i = 0; i < cycle.length - 1; i++) {
      const sourceTable = cycle[i];
      const targetTable = cycle[i + 1];

      const fksToTarget = (activeFks.get(sourceTable) ?? []).filter(
        (fk) => fk.refTable === targetTable
      );

      for (const fk of fksToTarget) {
        if (fk.nullable) {
          nullableCandidates.push({
            table: sourceTable,
            refTable: targetTable,
            fk,
          });
        }
      }
    }

    if (nullableCandidates.length > 0) {
      // Deterministic selection: break the first nullable FK alphabetically by table name, then FK name
      nullableCandidates.sort((a, b) => {
        const tableCmp = a.table.localeCompare(b.table);
        if (tableCmp !== 0) return tableCmp;
        return a.fk.name.localeCompare(b.fk.name);
      });

      const candidateToBreak = nullableCandidates[0];

      // Defer this foreign key
      deferredFks.push({
        table: candidateToBreak.table,
        fk: candidateToBreak.fk,
        reason: "cycle",
      });

      // Remove from active FKs
      const currentActive = activeFks.get(candidateToBreak.table) ?? [];
      const updatedActive = currentActive.filter((f) => f.name !== candidateToBreak.fk.name);
      activeFks.set(candidateToBreak.table, updatedActive);

      // If no other active FK points to targetTable, remove targetTable from remainingParents
      const stillHasDependency = updatedActive.some(
        (f) => f.refTable === candidateToBreak.refTable
      );
      if (!stillHasDependency) {
        remainingParents.get(candidateToBreak.table)?.delete(candidateToBreak.refTable);
      }

      // Continue loop to re-evaluate ready queue
      continue;
    }

    // No nullable foreign keys in the cycle: STRICT CYCLE (cannot be broken by insertion order)
    const cyclePath = cycle.join(" -> ");
    throw new SeedError({
      code: "E_CIRCULAR_DEPENDENCY",
      where: cyclePath,
      cause: `Circular foreign key dependency detected where all foreign keys are NOT NULL: ${cyclePath}. No table in this cycle can be inserted first without violating constraints.`,
      fix: `Make at least one foreign key column nullable (e.g. ALTER TABLE ${cycle[0]} ALTER COLUMN <column> DROP NOT NULL) or declare the constraint as DEFERRABLE in PostgreSQL.`,
      exit: 3,
    });
  }

  return {
    order,
    deferredFks,
  };
}
