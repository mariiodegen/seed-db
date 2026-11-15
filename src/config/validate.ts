import { SeedError } from "../errors";
import type { ResolvedConfig } from "./types";

export function validateConfig(config: ResolvedConfig): void {
  // 1. defaultRows must be an integer >= 1
  if (!Number.isInteger(config.defaultRows) || config.defaultRows < 1) {
    throw new SeedError({
      code: "E_INVALID_CONFIG",
      where: "defaultRows",
      cause: `Expected a positive integer >= 1, but received ${config.defaultRows}.`,
      fix: "Set defaultRows to an integer >= 1 in seed.config.ts or via the --rows flag.",
      exit: 2,
    });
  }

  // 2. nullRate must be between 0.0 and 1.0
  if (typeof config.nullRate !== "number" || Number.isNaN(config.nullRate) || config.nullRate < 0 || config.nullRate > 1) {
    throw new SeedError({
      code: "E_INVALID_CONFIG",
      where: "nullRate",
      cause: `Expected a number between 0.0 and 1.0, but received ${config.nullRate}.`,
      fix: "Set nullRate to a value between 0.0 (never NULL) and 1.0 (always NULL).",
      exit: 2,
    });
  }

  // 3. seed must be an integer if provided
  if (config.seed !== undefined && !Number.isInteger(config.seed)) {
    throw new SeedError({
      code: "E_INVALID_CONFIG",
      where: "seed",
      cause: `Expected an integer seed, but received ${config.seed}.`,
      fix: "Pass an integer for --seed, e.g. --seed 42.",
      exit: 2,
    });
  }

  // 4. schema must be a non-empty string
  if (typeof config.schema !== "string" || config.schema.trim().length === 0) {
    throw new SeedError({
      code: "E_INVALID_CONFIG",
      where: "schema",
      cause: "Schema name cannot be empty.",
      fix: "Specify a valid PostgreSQL schema name, e.g. --schema public.",
      exit: 2,
    });
  }
}
