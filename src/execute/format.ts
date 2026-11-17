import pc from "picocolors";
import type { ExecutionResult } from "./types";

export function formatExecutionText(result: ExecutionResult): string {
  const lines: string[] = [];

  if (result.mode === "dry-run") {
    lines.push(pc.yellow(`[dry-run] Dry run completed. ${result.totalRows} rows simulated.`));
  } else if (result.mode === "check") {
    lines.push(
      pc.green(`✓ Check passed: all constraints and foreign keys verified.`) +
        ` ` +
        pc.dim(`(Transaction rolled back safely; 0 rows persisted)`)
    );
  } else if (result.mode === "file") {
    lines.push(
      pc.green(`✓ Generated SQL seed script:`) + ` ${pc.bold(result.outFile ?? "out.sql")}`
    );
  } else {
    lines.push(
      pc.green(`✓ Successfully seeded database:`) +
        ` ${result.totalRows} rows in ${result.durationMs}ms`
    );
  }

  lines.push("");
  lines.push(pc.bold("Table Summary:"));

  for (const stat of result.tables) {
    const patchNote =
      stat.deferredPatched > 0 ? pc.dim(` (${stat.deferredPatched} deferred patched)`) : "";
    const batchNote = pc.dim(`[${stat.batches} batch${stat.batches === 1 ? "" : "es"}]`);
    lines.push(
      `  ${pc.cyan(stat.table.padEnd(20))} ${String(stat.rowsInserted).padStart(5)} rows  ${batchNote}${patchNote}`
    );
  }

  return lines.join("\n");
}
