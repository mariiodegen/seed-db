import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { calculateBatchSize, chunkRows } from "../execute/batch";
import { isLocalHost, extractHostInfo } from "../execute/guard";
import { runCommand } from "./run";
import { SeedError } from "../errors";
import type { Schema } from "../introspect/types";

describe("Execution Engine & Batching Math", () => {
  it("calculates safe batch size adhering to 65,535 parameter ceiling", () => {
    // 10 columns: min(1000, floor(65000/10)) = 1000
    expect(calculateBatchSize(10)).toBe(1000);

    // 50 columns: min(1000, floor(65000/50)) = 1000
    expect(calculateBatchSize(50)).toBe(1000);

    // 100 columns: min(1000, floor(65000/100)) = 650
    expect(calculateBatchSize(100)).toBe(650);

    // 200 columns: min(1000, floor(65000/200)) = 325
    expect(calculateBatchSize(200)).toBe(325);

    // Extreme: 1000 columns: floor(65000/1000) = 65
    expect(calculateBatchSize(1000)).toBe(65);
  });

  it("chunks rows into correctly sized batches", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
    const batches = chunkRows(rows, 10);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(10);
    expect(batches[2]).toHaveLength(5);
  });
});

describe("Production Safety Guard", () => {
  it("identifies localhost addresses and allowedHosts as safe", () => {
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("::1")).toBe(true);
    expect(isLocalHost("staging.internal.net", ["staging.internal.net"])).toBe(true);
    expect(isLocalHost("db.production.aws.com")).toBe(false);
  });

  it("extracts host and database from connection URL", () => {
    const info = extractHostInfo("postgres://seed:secret@db.company.com:5432/production_app");
    expect(info.host).toBe("db.company.com");
    expect(info.database).toBe("production_app");
  });
});

describe("runCommand CLI Options & Execution Modes", () => {
  const mockSnapshotSchema: Schema = {
    name: "public",
    tables: [
      {
        name: "users",
        primaryKey: ["id"],
        uniques: [],
        foreignKeys: [],
        columns: [
          {
            name: "id",
            position: 1,
            dataType: "integer",
            udtName: "int4",
            nullable: false,
            hasDefault: true,
            identity: "always",
            generated: false,
            isArray: false,
          },
          {
            name: "email",
            position: 2,
            dataType: "varchar",
            udtName: "varchar",
            nullable: false,
            hasDefault: false,
            identity: null,
            generated: false,
            maxLength: 100,
            isArray: false,
          },
        ],
      },
      {
        name: "orders",
        primaryKey: ["id"],
        uniques: [],
        foreignKeys: [
          {
            name: "orders_user_id_fkey",
            columns: ["user_id"],
            refTable: "users",
            refColumns: ["id"],
            nullable: false,
          },
        ],
        columns: [
          {
            name: "id",
            position: 1,
            dataType: "integer",
            udtName: "int4",
            nullable: false,
            hasDefault: true,
            identity: null,
            generated: false,
            isArray: false,
          },
          {
            name: "user_id",
            position: 2,
            dataType: "integer",
            udtName: "int4",
            nullable: false,
            hasDefault: false,
            identity: null,
            generated: false,
            isArray: false,
          },
        ],
      },
    ],
    enums: {},
  };

  const snapshotPath = resolve(process.cwd(), "test-run-snapshot.json");

  it("executes --dry-run mode from an offline snapshot", async () => {
    await Bun.write(snapshotPath, JSON.stringify(mockSnapshotSchema));

    const result = await runCommand({
      snapshot: snapshotPath,
      dryRun: true,
      rows: 5,
      seed: 42,
    });

    expect(result.mode).toBe("dry-run");
    expect(result.success).toBe(true);
    expect(result.totalRows).toBe(10); // 5 users + 5 orders
    expect(result.tables).toHaveLength(2);
    expect(result.tables[0].table).toBe("users");
    expect(result.tables[1].table).toBe("orders");

    if (existsSync(snapshotPath)) unlinkSync(snapshotPath);
  });

  it("executes file mode (--out <file>) generating valid SQL file", async () => {
    await Bun.write(snapshotPath, JSON.stringify(mockSnapshotSchema));
    const outSqlPath = resolve(process.cwd(), "test-output.sql");

    const result = await runCommand({
      snapshot: snapshotPath,
      out: outSqlPath,
      rows: 3,
      seed: 123,
      startId: 10,
    });

    expect(result.mode).toBe("file");
    expect(result.success).toBe(true);
    expect(existsSync(outSqlPath)).toBe(true);

    const sqlContent = readFileSync(outSqlPath, "utf-8");
    expect(sqlContent).toContain("BEGIN;");
    expect(sqlContent).toContain("INSERT INTO \"public\".\"users\"");
    expect(sqlContent).toContain("OVERRIDING SYSTEM VALUE"); // identity: always
    expect(sqlContent).toContain("INSERT INTO \"public\".\"orders\"");
    expect(sqlContent).toContain("SELECT setval");
    expect(sqlContent).toContain("COMMIT;");

    // Clean up test files
    if (existsSync(snapshotPath)) unlinkSync(snapshotPath);
    if (existsSync(outSqlPath)) unlinkSync(outSqlPath);
  });

  it("throws E_MISSING_DB_URL (exit 2) when no URL provided and no snapshot", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      await runCommand({
        config: "./seed.config.ts",
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SeedError);
      const seedErr = err as SeedError;
      expect(seedErr.code).toBe("E_MISSING_DB_URL");
      expect(seedErr.exit).toBe(2);
    } finally {
      if (saved) process.env.DATABASE_URL = saved;
    }
  });
});
