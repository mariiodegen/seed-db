import type { Faker } from "@faker-js/faker";
import type { DeferredForeignKey } from "../graph/types";

export type ColumnSource = "skip" | "config" | "fk" | "semantic" | "type";

export interface ColumnPlan {
  column: string;
  source: ColumnSource;
  generator: string; // e.g. "skip", "config", "fk:users.id", "semantic:email", "type:int4"
}

export interface TablePlan {
  table: string;
  rowCount: number;
  ignored: boolean;
  columns: ColumnPlan[];
  deferred: DeferredForeignKey[];
}

export interface KeyPool {
  table: string;
  keyColumns: string[]; // Primary key column names
  keys: unknown[][]; // Array of primary key tuples (one array of values per inserted row)
}

export interface GenContext {
  faker: Faker;
  index: number; // Row number within current table (0..rowCount-1)
  row: Record<string, unknown>; // Columns already generated for the current row
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
  | ((ctx: GenContext) => unknown);
