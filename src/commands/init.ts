import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SeedError } from "../errors";
import type { InitCommandOptions } from "../types";

export const STARTER_CONFIG_CONTENT = `// seed.config.ts
import type { SeedConfig } from "./src/config/types";

export default {
  databaseUrl: process.env.DATABASE_URL,
  defaultRows: 10,
  schema: "public",
  nullRate: 0.1,
  tables: {
    // Example custom table rule:
    // users: {
    //   rows: 50,
    //   columns: {
    //     role: "member",
    //   },
    // },
  },
} satisfies SeedConfig;
`;

export const STARTER_ENV_CONTENT = `# Local PostgreSQL connection string
DATABASE_URL="postgres://seed:seed@localhost:5433/seed"
`;

export async function initCommand(
  options: InitCommandOptions = {},
  targetDir: string = process.cwd(),
): Promise<{ configPath: string; envPath: string }> {
  const configPath = resolve(targetDir, "seed.config.ts");
  const envPath = resolve(targetDir, ".env.example");

  // Check if config already exists
  if (existsSync(configPath) && !options.force) {
    throw new SeedError({
      code: "E_CONFIG_EXISTS",
      where: "seed.config.ts",
      cause: "Configuration file seed.config.ts already exists.",
      fix: "Pass --force to overwrite: seed-db init --force",
      exit: 2,
    });
  }

  // Write files
  writeFileSync(configPath, STARTER_CONFIG_CONTENT, "utf-8");
  writeFileSync(envPath, STARTER_ENV_CONTENT, "utf-8");

  console.log("Created seed.config.ts");
  console.log("Created .env.example");

  return { configPath, envPath };
}
