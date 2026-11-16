import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAndResolveConfig } from "../config";
import { SeedError } from "../errors";
import { introspectDatabase } from "../introspect";
import type { Schema } from "../introspect/types";
import type { InspectCommandOptions } from "../types";

export function formatSchemaText(schema: Schema): string {
  if (schema.tables.length === 0) {
    return `Schema "${schema.name}": 0 tables found.`;
  }

  const lines: string[] = [`Schema "${schema.name}" (${schema.tables.length} tables):`];

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
