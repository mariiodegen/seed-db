// Types for seed.config.ts and resolved pipeline configuration.
import type { GlobalOptions } from "../types";

export interface ColumnRuleContext {
  faker: unknown;
}

export type ColumnRule =
  | string
  | number
  | boolean
  | null
  | { oneOf: Array<string | number | boolean>; weights?: number[] }
  | { int: { min: number; max: number } }
  | { float: { min: number; max: number; precision?: number } }
  | { faker: string }
  | ((ctx: ColumnRuleContext) => unknown);

export interface TableConfig {
  ignore?: boolean;
  rows?: number;
  columns?: Record<string, ColumnRule>;
}

// User-facing config exported by seed.config.ts
export interface SeedConfig {
  databaseUrl?: string;
  schema?: string;
  defaultRows?: number;
  seed?: number;
  nullRate?: number;
  allowedHosts?: string[];
  tables?: Record<string, TableConfig>;
}

// Fully resolved, validated configuration used by the pipeline
export interface ResolvedConfig {
  databaseUrl?: string;
  schema: string;
  defaultRows: number;
  seed?: number;
  nullRate: number;
  allowedHosts: string[];
  tables: Record<string, TableConfig>;
  format: "text" | "json";
  verbose: boolean;
}
