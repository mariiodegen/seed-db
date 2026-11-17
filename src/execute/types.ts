import type { DeferredForeignKey } from "../graph/types";

export type ExecutionMode = "live" | "dry-run" | "check" | "file";

export interface TableExecutionStats {
  table: string;
  rowsInserted: number;
  batches: number;
  deferredPatched: number;
}

export interface ExecutionResult {
  mode: ExecutionMode;
  success: boolean;
  totalRows: number;
  tables: TableExecutionStats[];
  deferredFks: DeferredForeignKey[];
  durationMs: number;
  rolledBack?: boolean; // True when --check rolls back intentionally
  outFile?: string; // Present in file mode
}
