// Shared types for CLI options and global configuration.

export type OutputFormat = "text" | "json";

export interface GlobalOptions {
  config: string;
  databaseUrl?: string;
  schema: string;
  format: OutputFormat;
  json?: boolean;
  verbose?: boolean;
}

export interface InitCommandOptions {
  force?: boolean;
}

export interface InspectCommandOptions extends GlobalOptions {
  snapshot?: string;
}

export interface RunCommandOptions extends GlobalOptions {
  tables?: string;
  rows?: number;
  seed?: number;
  dryRun?: boolean;
  check?: boolean;
  out?: string;
  startId?: number;
  snapshot?: string;
  yes?: boolean;
}
