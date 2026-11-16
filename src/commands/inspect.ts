import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAndResolveConfig } from "../config";
import { SeedError } from "../errors";
import { introspectDatabase } from "../introspect";
import type { Schema } from "../introspect/types";
import type { InspectCommandOptions } from "../types";
import { orderTables } from "../graph/order";

export function formatSchemaText(schema: Schema): string {
  if (schema.tables.length === 0) {
    return `Schema "${schema.name}": 0 tables found.`;
  }

  const { order, deferredFks } = orderTables(schema);
  const lines: string[] = [];

  // 1. Insert order plan
  lines.push("Insert order:");
  const tableMap = new Map(schema.tables.map((t) => [t.name, t]));
  order.forEach((tableName, index) => {
    const table = tableMap.get(tableName);
    const notes: string[] = [];

    // Note deferred FKs for this table
    const tableDeferred = deferredFks.filter((d) => d.table === tableName);
    for (const d of tableDeferred) {
      notes.push(`${d.fk.columns.join(",")} deferred (${d.reason})`);
    }

    // Note active FK relationships
    if (table) {
      for (const fk of table.foreignKeys) {
        if (!tableDeferred.some((d) => d.fk.name === fk.name)) {
          notes.push(`${fk.columns.join(",")} -> ${fk.refTable}.${fk.refColumns.join(",")}`);
        }
      }
    }

    const noteStr = notes.length > 0 ? `  (${notes.join(", ")})` : "";
    lines.push(`  ${String(index + 1).padStart(2)}  ${tableName}${noteStr}`);
  });

  // 2. Patch pass (if any deferred foreign keys exist)
  if (deferredFks.length > 0) {
    lines.push("");
    lines.push("Patch pass:");
    for (const d of deferredFks) {
      lines.push(`  ${d.table}.${d.fk.columns.join(",")} (${d.reason})`);
    }
  }

  lines.push("");
  lines.push(`Schema "${schema.name}" (${schema.tables.length} tables):`);

  // 3. Detailed table column definitions
  for (const table of schema.tables) {
    lines.push("");
    lines.push(`table ${table.name} (${table.columns.length} columns)`);

    for (const col of table.columns) {
      const tags: string[] = [col.dataType];
      if (table.primaryKey.includes(col.name)) tags.push("PK");
      if (table.uniques.some((u) => u.includes(col.name))) tags.push("unique");
      if (!col.nullable) tags.push("NOT NULL");
      if (col.hasDefault) tags.push("default");
      if (col.identity) tags.push(`identity (${col.identity})`);

      const fk = table.foreignKeys.find((f) => f.columns.includes(col.name));
      if (fk) {
        tags.push(`-> ${fk.refTable}.${fk.refColumns.join(",")}`);
      }

      lines.push(`  ${col.name.padEnd(20)} ${tags.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

export async function inspectCommand(options: InspectCommandOptions): Promise<Schema> {
  const config = await loadAndResolveConfig(options);

  let schema: Schema;

  // 1. Snapshot mode (--snapshot <file>)
  if (options.snapshot) {
    const snapshotPath = resolve(process.cwd(), options.snapshot);
    if (!existsSync(snapshotPath)) {
      throw new SeedError({
        code: "E_SNAPSHOT_NOT_FOUND",
        where: options.snapshot,
        cause: `Snapshot file "${options.snapshot}" does not exist.`,
        fix: "Check the path or generate a snapshot using: seed-db inspect --json > snapshot.json",
        exit: 2,
      });
    }

    try {
      schema = JSON.parse(readFileSync(snapshotPath, "utf-8")) as Schema;
    } catch (err) {
      throw new SeedError({
        code: "E_SNAPSHOT_INVALID",
        where: options.snapshot,
        cause: err instanceof Error ? err.message : String(err),
        fix: "Ensure snapshot file contains valid JSON Schema output.",
        exit: 2,
      });
    }
  } else {
    // 2. Live database mode
    if (!config.databaseUrl) {
      throw new SeedError({
        code: "E_MISSING_DB_URL",
        where: "--database-url",
        cause: "No database URL provided. Introspection requires a PostgreSQL connection string.",
        fix: "Pass --database-url, set DATABASE_URL environment variable, or use --snapshot <file>.",
        exit: 2,
      });
    }

    schema = await introspectDatabase({
      databaseUrl: config.databaseUrl,
      schema: config.schema,
    });
  }

  // 3. Output formatting
  if (options.format === "json" || options.json) {
    console.log(JSON.stringify(schema, null, 2));
  } else {
    console.log(formatSchemaText(schema));
  }

  return schema;
}
