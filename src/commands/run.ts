import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAndResolveConfig } from "../config";
import { SeedError } from "../errors";
import { introspectDatabase } from "../introspect";
import type { Schema } from "../introspect/types";
import { orderTables } from "../graph/order";
import { createSeededFaker } from "../generate/generate";
import { assertProductionSafety } from "../execute/guard";
import { executeDryRun } from "../execute/dry-run";
import { executeFileMode } from "../execute/file-mode";
import { executeLive } from "../execute/live";
import { formatExecutionText } from "../execute/format";
import type { ExecutionResult } from "../execute/types";
import type { RunCommandOptions } from "../types";

export async function runCommand(options: RunCommandOptions): Promise<ExecutionResult> {
  const config = await loadAndResolveConfig(options);
  let schema: Schema;

  // 1. Resolve Schema (Snapshot mode vs Live DB mode)
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
    // Live database mode requires a connection URL
    if (!config.databaseUrl) {
      throw new SeedError({
        code: "E_MISSING_DB_URL",
        where: "--database-url",
        cause: "No database URL provided. Seeding requires a PostgreSQL connection string.",
        fix: "Pass --database-url, set DATABASE_URL environment variable, or use --snapshot <file> with --out <file>.",
        exit: 2,
      });
    }

    schema = await introspectDatabase({
      databaseUrl: config.databaseUrl,
      schema: config.schema,
    });
  }

  // 2. Parse target tables if specified
  const requestedTables = options.tables
    ? options.tables
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  // 3. Compute topological insertion order & cycle breaking
  const orderResult = orderTables(schema, requestedTables);

  // 4. Initialize deterministic Faker instance
  const faker = createSeededFaker(config.seed);

  let result: ExecutionResult;

  // 5. Execution branch
  // Branch A: Dry Run (--dry-run)
  if (options.dryRun) {
    result = executeDryRun({
      schema,
      config,
      orderResult,
      faker,
    });
  }
  // Branch B: File Mode (--out <file>)
  else if (options.out) {
    result = executeFileMode({
      outFile: options.out,
      startId: options.startId,
      schema,
      config,
      orderResult,
      faker,
    });
  }
  // Branch C: Live Mode / Check Mode (--check)
  else {
    // Assert production safety unless dry-run or file mode
    await assertProductionSafety(config.databaseUrl!, config.allowedHosts, options.yes);

    result = await executeLive({
      databaseUrl: config.databaseUrl!,
      schema,
      config,
      orderResult,
      faker,
      check: options.check,
      verbose: options.verbose,
    });
  }

  // 6. Output formatting
  if (options.format === "json" || options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!options.dryRun) {
    // In dry-run mode, the statements were already printed to stdout
    console.log(formatExecutionText(result));
  }

  return result;
}
