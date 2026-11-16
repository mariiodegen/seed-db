import { Faker, en } from "@faker-js/faker";
import { SeedError } from "../errors";
import type { Column, ForeignKey, Schema, Table } from "../introspect/types";
import type { ResolvedConfig } from "../config/types";
import type { DeferredForeignKey } from "../graph/types";
import type {
  ColumnPlan,
  ColumnRule,
  ColumnSource,
  GenContext,
  KeyPool,
  TablePlan,
} from "./types";
import { findSemanticRule } from "./semantic";
import { getTypeGenerator, getTypeLabel } from "./types-map";

/**
 * Builds the execution plan for a single table, mapping every column to its resolution source.
 */
export function buildTablePlan(
  table: Table,
  schema: Schema,
  config: ResolvedConfig,
  deferredFks: DeferredForeignKey[]
): TablePlan {
  const tableConfig = config.tables?.[table.name];
  const isIgnored = Boolean(tableConfig?.ignore);
  const rowCount = tableConfig?.rows ?? config.defaultRows;
  const tableDeferred = deferredFks.filter((d) => d.table === table.name);

  const columns: ColumnPlan[] = [];

  for (const col of table.columns) {
    // 1. Tier 1: Skip
    // Identity ALWAYS, generated ALWAYS, or database-managed serial PK
    const isIdentityAlways = col.identity === "always";
    const isGenerated = col.generated;
    const isDefaultPk =
      table.primaryKey.length === 1 &&
      table.primaryKey[0] === col.name &&
      (col.hasDefault || col.identity !== null);

    if (isIdentityAlways || isGenerated || isDefaultPk) {
      columns.push({
        column: col.name,
        source: "skip",
        generator: isIdentityAlways
          ? "identity (always)"
          : isGenerated
            ? "generated"
            : "pk (default)",
      });
      continue;
    }

    // 2. Tier 2: Config rule
    const rule = tableConfig?.columns?.[col.name];
    if (rule !== undefined) {
      columns.push({
        column: col.name,
        source: "config",
        generator: "config",
      });
      continue;
    }

    // 3. Tier 3: Foreign Key
    const fk = table.foreignKeys.find((f) => f.columns.includes(col.name));
    if (fk) {
      const isDeferred = tableDeferred.some((d) => d.fk.name === fk.name);
      const colIdx = fk.columns.indexOf(col.name);
      const targetCol = fk.refColumns[colIdx] ?? "id";

      columns.push({
        column: col.name,
        source: "fk",
        generator: isDeferred
          ? `deferred (${fk.refTable}.${targetCol})`
          : `fk:${fk.refTable}.${targetCol}`,
      });
      continue;
    }

    // 4. Tier 4: Semantic Match
    const semantic = findSemanticRule(col);
    if (semantic) {
      columns.push({
        column: col.name,
        source: "semantic",
        generator: semantic.label,
      });
      continue;
    }

    // 5. Tier 5: Type Fallback
    const typeGen = getTypeGenerator(col, schema);
    if (typeGen) {
      columns.push({
        column: col.name,
        source: "type",
        generator: getTypeLabel(col, schema),
      });
      continue;
    }

    // 6. Unsupported Type Check
    if (!col.nullable && !col.hasDefault) {
      throw new SeedError({
        code: "E_UNSUPPORTED_TYPE",
        where: `${table.name}.${col.name} (${col.dataType})`,
        cause: `Column "${col.name}" has unsupported PostgreSQL type "${col.udtName}" with no default value.`,
        fix: `Add a custom generator rule in seed.config.ts for this column: { tables: { ${table.name}: { columns: { ${col.name}: ... } } } }`,
        exit: 3,
      });
    }

    // If nullable or has default, we can safely fall back
    columns.push({
      column: col.name,
      source: "type",
      generator: "fallback:null",
    });
  }

  return {
    table: table.name,
    rowCount,
    ignored: isIgnored,
    columns,
    deferred: tableDeferred,
  };
}

/**
 * Evaluates a user-supplied ColumnRule in seed.config.ts.
 */
function evaluateCustomRule(
  rule: ColumnRule,
  ctx: GenContext
): unknown {
  if (typeof rule === "function") {
    return rule(ctx);
  }
  if (rule === null || typeof rule === "string" || typeof rule === "number" || typeof rule === "boolean") {
    return rule;
  }
  if ("oneOf" in rule) {
    if (rule.weights && rule.weights.length === rule.oneOf.length) {
      const weighted = rule.oneOf.map((val, idx) => ({
        weight: rule.weights![idx],
        value: val,
      }));
      return ctx.faker.helpers.weightedArrayElement(weighted);
    }
    return ctx.faker.helpers.arrayElement(rule.oneOf);
  }
  if ("int" in rule) {
    return ctx.faker.number.int({ min: rule.int.min, max: rule.int.max });
  }
  if ("float" in rule) {
    return ctx.faker.number.float({
      min: rule.float.min,
      max: rule.float.max,
      fractionDigits: rule.float.precision ?? 2,
    });
  }
  if ("faker" in rule) {
    const parts = rule.faker.split(".");
    let current: any = ctx.faker;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }
    return typeof current === "function" ? current() : current;
  }
  return null;
}

/**
 * Generates relationally consistent fake rows for a table using its TablePlan.
 */
export function generateTableRows(
  table: Table,
  plan: TablePlan,
  schema: Schema,
  config: ResolvedConfig,
  keyPools: Map<string, KeyPool>,
  faker: Faker
): Record<string, unknown>[] {
  if (plan.ignored || plan.rowCount === 0) {
    return [];
  }

  const rows: Record<string, unknown>[] = [];
  const colMap = new Map<string, Column>(table.columns.map((c) => [c.name, c]));
  const tableConfig = config.tables?.[table.name];

  // Track unique values per column to prevent duplicate key violations
  const uniqueTrackers = new Map<string, Set<string>>();
  for (const uniqueGroup of table.uniques) {
    if (uniqueGroup.length === 1) {
      uniqueTrackers.set(uniqueGroup[0], new Set());
    }
  }

  // Pre-resolve semantic and type generators
  const semanticMap = new Map<string, (ctx: GenContext, col: Column) => unknown>();
  const typeGenMap = new Map<string, (ctx: GenContext) => unknown>();

  for (const colPlan of plan.columns) {
    const col = colMap.get(colPlan.column)!;
    if (colPlan.source === "semantic") {
      const rule = findSemanticRule(col);
      if (rule) semanticMap.set(col.name, rule.generate);
    } else if (colPlan.source === "type") {
      const gen = getTypeGenerator(col, schema);
      if (gen) typeGenMap.set(col.name, gen);
    }
  }

  for (let rowIndex = 0; rowIndex < plan.rowCount; rowIndex++) {
    const row: Record<string, unknown> = {};
    const ctx: GenContext = {
      faker,
      index: rowIndex,
      row,
    };

    // Pre-sample parent tuples for foreign keys to ensure composite FK consistency
    const sampledFkTuples = new Map<string, unknown[]>();
    for (const fk of table.foreignKeys) {
      const isDeferred = plan.deferred.some((d) => d.fk.name === fk.name);
      if (isDeferred) {
        continue;
      }

      const parentPool = keyPools.get(fk.refTable);
      if (parentPool && parentPool.keys.length > 0) {
        const tuple = faker.helpers.arrayElement(parentPool.keys);
        sampledFkTuples.set(fk.name, tuple);
      } else {
        // Parent pool is empty
        const isFkNullable = fk.nullable;
        if (!isFkNullable) {
          throw new SeedError({
            code: "E_EMPTY_PARENT_KEY_POOL",
            where: `${table.name} -> ${fk.refTable}`,
            cause: `Parent table "${fk.refTable}" has no rows to satisfy non-nullable foreign key in "${table.name}".`,
            fix: `Ensure table "${fk.refTable}" is seeded before "${table.name}" and generates at least 1 row.`,
            exit: 3,
          });
        }
      }
    }

    // Generate values for each column in plan
    for (const colPlan of plan.columns) {
      if (colPlan.source === "skip") {
        continue; // Omitted from row object so database default/identity assigns it
      }

      const col = colMap.get(colPlan.column)!;
      let value: unknown;

      // Unique retry loop (up to 50 retries)
      const isUnique = uniqueTrackers.has(col.name);
      const tracker = uniqueTrackers.get(col.name);
      let attempts = 0;

      while (attempts < 50) {
        attempts++;

        // 1. Config source
        if (colPlan.source === "config") {
          const rule = tableConfig!.columns![col.name];
          value = evaluateCustomRule(rule, ctx);
        }
        // 2. Foreign Key source
        else if (colPlan.source === "fk") {
          const fk = table.foreignKeys.find((f) => f.columns.includes(col.name))!;
          const isDeferred = plan.deferred.some((d) => d.fk.name === fk.name);

          if (isDeferred) {
            value = null; // Deferred FKs inserted as NULL, patched later
          } else {
            const tuple = sampledFkTuples.get(fk.name);
            if (tuple) {
              const colIdx = fk.columns.indexOf(col.name);
              value = tuple[colIdx];
            } else {
              value = null;
            }
          }
        }
        // 3. Semantic match source
        else if (colPlan.source === "semantic") {
          const gen = semanticMap.get(col.name);
          value = gen ? gen(ctx, col) : null;
        }
        // 4. Type fallback source
        else if (colPlan.source === "type") {
          const gen = typeGenMap.get(col.name);
          value = gen ? gen(ctx) : null;
        }

        // Null Roll (Tier 6): apply only if nullable and not a foreign key
        if (col.nullable && colPlan.source !== "fk" && !col.hasDefault) {
          const roll = faker.number.float({ min: 0, max: 1 });
          if (roll < config.nullRate) {
            value = null;
          }
        }

        // Check uniqueness collision
        if (isUnique && tracker && value !== null) {
          const serialized = String(value);
          if (tracker.has(serialized)) {
            continue; // Collision! Retry generation
          }
          tracker.add(serialized);
          break;
        } else {
          break; // Not unique or value is null, accept immediately
        }
      }

      // If 50 attempts failed to find a unique value, append index counter
      if (isUnique && tracker && attempts >= 50 && value !== null) {
        value = `${String(value)}_${rowIndex + 1}`;
        tracker.add(String(value));
      }

      row[col.name] = value;
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Creates an instance of Faker seeded deterministically.
 */
export function createSeededFaker(seed?: number): Faker {
  const faker = new Faker({ locale: [en] });
  faker.seed(seed ?? 42);
  return faker;
}
