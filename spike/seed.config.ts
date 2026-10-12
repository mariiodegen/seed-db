import type { SeedConfig } from "seed-db";

export default {
  databaseUrl: process.env.DATABASE_URL,
  defaultRows: 50,
  seed: 42,
} satisfies SeedConfig;