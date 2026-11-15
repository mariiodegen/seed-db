import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { initCommand } from "./init";
import { SeedError } from "../errors";

const TEST_DIR = resolve("/tmp/seed-db-init-test");

describe("seed-db init command", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("creates seed.config.ts and .env.example in target directory", async () => {
    const result = await initCommand({}, TEST_DIR);

    expect(existsSync(result.configPath)).toBe(true);
    expect(existsSync(result.envPath)).toBe(true);

    const configText = readFileSync(result.configPath, "utf-8");
    expect(configText).toContain("satisfies SeedConfig");
    expect(configText).toContain('schema: "public"');

    const envText = readFileSync(result.envPath, "utf-8");
    expect(envText).toContain("DATABASE_URL=");
  });

  test("refuses to overwrite existing config without --force", async () => {
    // First creation succeeds
    await initCommand({}, TEST_DIR);

    // Second creation without force must throw E_CONFIG_EXISTS (exit 2)
    try {
      await initCommand({}, TEST_DIR);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err instanceof SeedError).toBe(true);
      const seedErr = err as SeedError;
      expect(seedErr.code).toBe("E_CONFIG_EXISTS");
      expect(seedErr.exit).toBe(2);
    }
  });

  test("overwrites existing config when --force is passed", async () => {
    await initCommand({}, TEST_DIR);

    // With force: true, should succeed without error
    const result = await initCommand({ force: true }, TEST_DIR);
    expect(existsSync(result.configPath)).toBe(true);
  });
});
