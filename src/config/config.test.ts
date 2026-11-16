import { test, expect, describe } from "bun:test";
import { mergeConfig, DEFAULT_CONFIG } from "./merge";
import { validateConfig } from "./validate";
import { loadConfigFile } from "./load";
import { SeedError } from "../errors";

describe("Config Precedence (Flags > File > Env > Defaults)", () => {
  test("uses built-in defaults when no inputs provided", () => {
    const config = mergeConfig({ env: {} });
    expect(config.schema).toBe(DEFAULT_CONFIG.schema);
    expect(config.defaultRows).toBe(DEFAULT_CONFIG.defaultRows);
    expect(config.nullRate).toBe(DEFAULT_CONFIG.nullRate);
    expect(config.databaseUrl).toBeUndefined();
  });

  test("env variable DATABASE_URL takes precedence over defaults", () => {
    const config = mergeConfig({
      env: { DATABASE_URL: "postgres://env-user:pass@localhost:5432/db" },
    });
    expect(config.databaseUrl).toBe("postgres://env-user:pass@localhost:5432/db");
  });

  test("file config takes precedence over env and defaults", () => {
    const config = mergeConfig({
      fileConfig: {
        databaseUrl: "postgres://file-user:pass@localhost:5432/filedb",
        defaultRows: 50,
        schema: "custom_schema",
      },
      env: { DATABASE_URL: "postgres://env-user:pass@localhost:5432/db" },
    });
    expect(config.databaseUrl).toBe("postgres://file-user:pass@localhost:5432/filedb");
    expect(config.defaultRows).toBe(50);
    expect(config.schema).toBe("custom_schema");
  });

  test("CLI flags take highest precedence over file and env", () => {
    const config = mergeConfig({
      flags: {
        databaseUrl: "postgres://flag-user:pass@localhost:5432/flagdb",
        rows: 200,
        schema: "flag_schema",
        seed: 99,
      },
      fileConfig: {
        databaseUrl: "postgres://file-user:pass@localhost:5432/filedb",
        defaultRows: 50,
        schema: "file_schema",
        seed: 42,
      },
      env: { DATABASE_URL: "postgres://env-user:pass@localhost:5432/db" },
    });
    expect(config.databaseUrl).toBe("postgres://flag-user:pass@localhost:5432/flagdb");
    expect(config.defaultRows).toBe(200);
    expect(config.schema).toBe("flag_schema");
    expect(config.seed).toBe(99);
  });
});

describe("Config Validation (Exit code 2)", () => {
  test("rejects invalid defaultRows (< 1)", () => {
    expect(() =>
      mergeConfig({
        flags: { rows: 0 },
      }),
    ).toThrow(SeedError);

    try {
      mergeConfig({ flags: { rows: -5 } });
    } catch (err) {
      expect(err instanceof SeedError).toBe(true);
      const seedErr = err as SeedError;
      expect(seedErr.exit).toBe(2);
      expect(seedErr.code).toBe("E_INVALID_CONFIG");
      expect(seedErr.where).toBe("defaultRows");
    }
  });

  test("rejects non-integer defaultRows", () => {
    expect(() =>
      mergeConfig({
        flags: { rows: 3.14 },
      }),
    ).toThrow(SeedError);
  });

  test("rejects invalid nullRate (< 0 or > 1)", () => {
    try {
      mergeConfig({
        fileConfig: { nullRate: 1.5 },
      });
    } catch (err) {
      expect(err instanceof SeedError).toBe(true);
      const seedErr = err as SeedError;
      expect(seedErr.exit).toBe(2);
      expect(seedErr.code).toBe("E_INVALID_CONFIG");
      expect(seedErr.where).toBe("nullRate");
    }
  });

  test("rejects non-integer seed", () => {
    try {
      mergeConfig({
        flags: { seed: 42.5 },
      });
    } catch (err) {
      expect(err instanceof SeedError).toBe(true);
      const seedErr = err as SeedError;
      expect(seedErr.exit).toBe(2);
      expect(seedErr.code).toBe("E_INVALID_CONFIG");
      expect(seedErr.where).toBe("seed");
    }
  });

  test("rejects empty schema", () => {
    try {
      mergeConfig({
        flags: { schema: "   " },
      });
    } catch (err) {
      expect(err instanceof SeedError).toBe(true);
      const seedErr = err as SeedError;
      expect(seedErr.exit).toBe(2);
      expect(seedErr.code).toBe("E_INVALID_CONFIG");
      expect(seedErr.where).toBe("schema");
    }
  });
});

describe("Config File Loading", () => {
  test("returns empty config if default file is missing", async () => {
    const config = await loadConfigFile("./non-existent-default-seed.config.ts", false);
    expect(config).toEqual({});
  });

  test("throws E_CONFIG_NOT_FOUND (exit 2) if custom config file is missing", async () => {
    try {
      await loadConfigFile("./non-existent-custom.config.ts", true);
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err instanceof SeedError).toBe(true);
      const seedErr = err as SeedError;
      expect(seedErr.exit).toBe(2);
      expect(seedErr.code).toBe("E_CONFIG_NOT_FOUND");
    }
  });
});
