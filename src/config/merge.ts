import type { RunCommandOptions } from "../types";
import type { SeedConfig, ResolvedConfig } from "./types";
import { validateConfig } from "./validate";

export interface MergeInputs {
  flags?: Partial<RunCommandOptions>;
  fileConfig?: SeedConfig;
  env?: Record<string, string | undefined>;
}

export const DEFAULT_CONFIG = {
  schema: "public",
  defaultRows: 10,
  nullRate: 0.1,
  format: "text" as const,
  verbose: false,
};

// Pure function implementing 4-tier precedence:
// Flags > seed.config.ts > Environment Variables > Built-in Defaults
export function mergeConfig(inputs: MergeInputs = {}): ResolvedConfig {
  const flags = inputs.flags ?? {};
  const file = inputs.fileConfig ?? {};
  const env = inputs.env ?? process.env;

  const resolved: ResolvedConfig = {
    databaseUrl: flags.databaseUrl ?? file.databaseUrl ?? env.DATABASE_URL,
    schema: flags.schema ?? file.schema ?? DEFAULT_CONFIG.schema,
    defaultRows: flags.rows ?? file.defaultRows ?? DEFAULT_CONFIG.defaultRows,
    seed: flags.seed ?? file.seed,
    nullRate: file.nullRate ?? DEFAULT_CONFIG.nullRate,
    allowedHosts: file.allowedHosts ?? [],
    tables: file.tables ?? {},
    format: (flags.format === "json" || flags.json ? "json" : DEFAULT_CONFIG.format),
    verbose: flags.verbose ?? DEFAULT_CONFIG.verbose,
  };

  validateConfig(resolved);
  return resolved;
}
