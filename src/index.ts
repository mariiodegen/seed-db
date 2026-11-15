#!/usr/bin/env bun
import { createProgram } from "./cli";
import { SeedError, formatError } from "./errors";

async function main() {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const format = process.argv.includes("--json") || process.argv.includes("json") ? "json" : "text";

    if (err instanceof SeedError) {
      console.error(formatError(err, format));
      process.exit(err.exit);
    }

    // Unexpected error fallback
    const unexpected = new SeedError({
      code: "E_UNEXPECTED",
      where: "cli",
      cause: err instanceof Error ? err.message : String(err),
      fix: "Check your arguments or report this issue.",
      exit: 1,
    });
    console.error(formatError(unexpected, format));
    process.exit(1);
  }
}

main();
