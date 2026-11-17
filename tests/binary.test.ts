import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json";

const BIN_PATH = resolve(__dirname, "../dist/seed-db");

describe("Milestone 7: Standalone Binary & Release Packaging", () => {
  beforeAll(async () => {
    // If binary does not exist, compile it first
    if (!existsSync(BIN_PATH)) {
      const proc = Bun.spawnSync(["bun", "run", "build"]);
      expect(proc.exitCode).toBe(0);
    }
  });

  it("verifies compiled standalone executable exists", () => {
    expect(existsSync(BIN_PATH)).toBe(true);
  });

  it("executes --version and matches package.json", () => {
    const proc = Bun.spawnSync([BIN_PATH, "--version"]);
    expect(proc.exitCode).toBe(0);
    const output = proc.stdout.toString().trim();
    expect(output).toBe(packageJson.version);
  });

  it("executes --help and renders command descriptions", () => {
    const proc = Bun.spawnSync([BIN_PATH, "--help"]);
    expect(proc.exitCode).toBe(0);
    const output = proc.stdout.toString();
    expect(output).toContain("Usage: seed-db");
    expect(output).toContain("init");
    expect(output).toContain("inspect");
    expect(output).toContain("run");
  });

  it("executes offline --dry-run with an offline snapshot", () => {
    // Create temporary snapshot
    const snapshotPath = resolve(__dirname, "temp-snapshot.json");
    const sampleSchema = {
      name: "public",
      tables: [
        {
          name: "users",
          schema: "public",
          columns: [
            {
              name: "id",
              ordinalPosition: 1,
              dataType: "integer",
              udtName: "int4",
              nullable: false,
              hasDefault: true,
              isIdentity: true,
              identityGeneration: "BY DEFAULT",
              generated: false,
              isArray: false,
            },
            {
              name: "email",
              ordinalPosition: 2,
              dataType: "text",
              udtName: "text",
              nullable: false,
              hasDefault: false,
              isIdentity: false,
              identityGeneration: null,
              generated: false,
              isArray: false,
            },
          ],
          primaryKey: ["id"],
          uniques: [],
          foreignKeys: [],
        },
      ],
      enums: {},
    };

    Bun.write(snapshotPath, JSON.stringify(sampleSchema));

    try {
      const proc = Bun.spawnSync([
        BIN_PATH,
        "run",
        "--snapshot",
        snapshotPath,
        "--dry-run",
        "--rows",
        "3",
        "--seed",
        "42",
      ]);

      expect(proc.exitCode).toBe(0);
      const output = proc.stdout.toString();
      expect(output).toContain("DRY RUN MODE");
      expect(output).toContain("INSERT INTO \"public\".\"users\"");
      expect(output).toContain("ROLLBACK;");
    } finally {
      const rm = Bun.spawnSync(["rm", "-f", snapshotPath]);
      expect(rm.exitCode).toBe(0);
    }
  });

  it("returns exit code 2 and actionable fix on invalid configuration", () => {
    const proc = Bun.spawnSync([BIN_PATH, "run", "--rows", "-10"]);
    expect(proc.exitCode).toBe(2);
    const errOutput = proc.stderr.toString();
    expect(errOutput).toContain("E_INVALID_CONFIG");
    expect(errOutput).toContain("defaultRows");
    expect(errOutput).toContain("Fix:");
  });
});
