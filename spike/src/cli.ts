import { pathToFileURL } from "node:url";
import { runProbe, TOTAL, BATCH, BATCHES } from "./probe";

// Load ./seed.config.ts from the folder the binary is run in (process.cwd()).
// The config uses a type-only import, so nothing must resolve at runtime.
let config: Record<string, unknown> = {};
const configPath = pathToFileURL(`${process.cwd()}/seed.config.ts`).href;
try {
  const mod = (await import(configPath)) as { default?: Record<string, unknown> };
  config = mod.default ?? {};
  console.log("config loaded:", JSON.stringify(config));
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error("config load FAILED:", message);
  process.exit(2);
}

const connUrl =
  (config.databaseUrl as string | undefined) ??
  process.env.DATABASE_URL ??
  "postgres://seed:seed@localhost:5433/seed";

const result = await runProbe(connUrl);

console.log(`inserted ${TOTAL.toLocaleString()} rows in ${BATCHES} batches of ${BATCH}`);
console.log(`wall time: ${result.insertMs.toFixed(1)} ms`);
console.log(
  `rows after rollback: ${result.remainingAfterRollback} (${result.passed ? "PASS: nothing survived" : "FAIL"})`,
);

process.exit(result.passed ? 0 : 1);