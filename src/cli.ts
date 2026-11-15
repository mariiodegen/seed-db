import { Command } from "commander";
import { initCommand } from "./commands/init";
import { inspectCommand } from "./commands/inspect";
import { runCommand } from "./commands/run";
import type { GlobalOptions, InitCommandOptions, InspectCommandOptions, RunCommandOptions } from "./types";

// Determines whether JSON error output was explicitly requested via --json or --format json.
// Avoids false positives from filenames or arguments containing the word "json" (e.g. --out my.json).
export function isJsonRequested(argv: string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") return true;
    if (arg === "--format=json") return true;
    if (arg === "--format" && argv[i + 1] === "json") return true;
  }
  return false;
}

// One rule, one place: merge global and subcommand options and normalize format
function mergeOptions<T extends GlobalOptions>(program: Command, commandOpts: Record<string, unknown>): T {
  const globalOpts = program.opts<GlobalOptions>();
  const merged = { ...globalOpts, ...commandOpts } as T;
  if (merged.json) {
    merged.format = "json";
  }
  return merged;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("seed-db")
    .description("Generate realistic mock data for PostgreSQL schemas")
    .version("0.0.1");

  // Global options
  program
    .option("-c, --config <path>", "Path to seed.config.ts", "./seed.config.ts")
    .option("--database-url <url>", "PostgreSQL connection string")
    .option("--schema <name>", "PostgreSQL schema name", "public")
    .option("--format <type>", "Output format (text | json)", "text")
    .option("--json", "Shorthand for --format json")
    .option("--verbose", "Show detailed execution logs");

  // Command: init
  program
    .command("init")
    .description("Scaffold a starter seed.config.ts configuration")
    .option("-f, --force", "Overwrite existing configuration file")
    .action(async (options: InitCommandOptions) => {
      await initCommand(options);
    });

  // Command: inspect
  program
    .command("inspect")
    .description("Inspect database schema, table hierarchy, and insertion plan")
    .option("--snapshot <file>", "Read schema from an inspect JSON snapshot")
    .action(async (options) => {
      const opts = mergeOptions<InspectCommandOptions>(program, options);
      await inspectCommand(opts);
    });

  // Command: run
  program
    .command("run")
    .description("Seed the database with relationally consistent data")
    .option("-t, --tables <names>", "Comma-separated list of tables to seed")
    .option("-r, --rows <number>", "Number of rows per table", (val) => parseInt(val, 10))
    .option("--seed <number>", "Random generator seed for reproducible output", (val) => parseInt(val, 10))
    .option("--dry-run", "Print generated SQL statements without writing to database")
    .option("--check", "Execute seed in a transaction and rollback to verify constraints")
    .option("--out <file>", "Write SQL statements to file instead of connecting to database")
    .option("--start-id <number>", "First primary key in file mode", (val) => parseInt(val, 10), 1)
    .option("--snapshot <file>", "Read schema from an inspect JSON snapshot")
    .option("-y, --yes", "Skip confirmation prompt on non-local databases")
    .action(async (options) => {
      const opts = mergeOptions<RunCommandOptions>(program, options);
      await runCommand(opts);
    });

  return program;
}
