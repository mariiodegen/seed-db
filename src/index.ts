#!/usr/bin/env bun
import { createProgram, isJsonRequested } from "./cli";
import { SeedError, formatError } from "./errors";

export async function main(argv = process.argv) {
  const program = createProgram();

  try {
    await program.parseAsync(argv);
  } catch (err) {
    const format = isJsonRequested(argv) ? "json" : "text";

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

if (import.meta.main) {
  main();
}
