import { describe, expect, it } from "bun:test";
import {
  buildTablePlan,
  generateTableRows,
  createSeededFaker,
} from "./generate";
import type { Schema, Table, Column } from "../introspect/types";
import type { ResolvedConfig } from "../config/types";
import type { KeyPool } from "./types";
import { SeedError } from "../errors";

function makeColumn(
  name: string,
  udtName: string,
  options: Partial<Column> = {}
): Column {
  return {
    name,
    position: 1,
    dataType: udtName,
    udtName,
    nullable: options.nullable ?? false,
    hasDefault: options.hasDefault ?? false,
    identity: options.identity ?? null,
    generated: options.generated ?? false,
    maxLength: options.maxLength,
    precision: options.precision,
    scale: options.scale,
    isArray: options.isArray ?? false,
  };
}

function makeDefaultConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    configPath: "./seed.config.ts",
    schema: "public",
    defaultRows: 5,
    seed: 42,
    nullRate: 0.1,
    format: "text",
    verbose: false,
    tables: {},
    ...overrides,
  };
}

describe("Generation Engine & Value Resolution (Pure Core)", () => {
  it("buildTablePlan resolves column sources according to 6-tier waterfall", () => {
    const table: Table = {
      name: "users",
      columns: [
        makeColumn("id", "int4", { hasDefault: true }), // Tier 1: Skip (serial PK)
        makeColumn("status", "varchar", { nullable: false }), // Tier 2: Config
        makeColumn("org_id", "int4", { nullable: false }), // Tier 3: Foreign Key
        makeColumn("email", "varchar", { nullable: false }), // Tier 4: Semantic match
        makeColumn("age", "int4", { nullable: false }), // Tier 5: Type fallback
      ],
      primaryKey: ["id"],
      uniques: [["email"]],
      foreignKeys: [
        {
          name: "users_org_id_fkey",
          columns: ["org_id"],
          refTable: "organizations",
          refColumns: ["id"],
          nullable: false,
        },
      ],
    };

    const schema: Schema = { name: "public", tables: [table], enums: {} };
    const config = makeDefaultConfig({
      tables: {
        users: {
          columns: {
            status: "active",
          },
        },
      },
    });

    const plan = buildTablePlan(table, schema, config, []);

    expect(plan.table).toBe("users");
    expect(plan.columns[0]).toEqual({
      column: "id",
      source: "skip",
      generator: "pk (default)",
    });
    expect(plan.columns[1]).toEqual({
      column: "status",
      source: "config",
      generator: "config",
    });
    expect(plan.columns[2]).toEqual({
      column: "org_id",
      source: "fk",
      generator: "fk:organizations.id",
    });
    expect(plan.columns[3]).toEqual({
      column: "email",
      source: "semantic",
      generator: "semantic:email",
    });
    expect(plan.columns[4]).toEqual({
      column: "age",
      source: "type",
      generator: "type:int4",
    });
  });

  it("throws SeedError E_UNSUPPORTED_TYPE (exit 3) on unsupported NOT NULL column", () => {
    const table: Table = {
      name: "locations",
      columns: [
        makeColumn("id", "int4", { hasDefault: true }),
        makeColumn("geom", "geometry", { nullable: false, hasDefault: false }), // Unsupported!
      ],
      primaryKey: ["id"],
      uniques: [],
      foreignKeys: [],
    };

    const schema: Schema = { name: "public", tables: [table], enums: {} };
    const config = makeDefaultConfig();

    try {
      buildTablePlan(table, schema, config, []);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SeedError);
      const seedErr = err as SeedError;
      expect(seedErr.code).toBe("E_UNSUPPORTED_TYPE");
      expect(seedErr.exit).toBe(3);
      expect(seedErr.where).toContain("locations.geom");
    }
  });

  it("samples foreign keys accurately from parent KeyPool", () => {
    const table: Table = {
      name: "orders",
      columns: [
        makeColumn("id", "int4", { hasDefault: true }),
        makeColumn("user_id", "int4", { nullable: false }),
        makeColumn("total_amount", "numeric", { nullable: false, precision: 10, scale: 2 }),
      ],
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
    };

    const schema: Schema = { name: "public", tables: [table], enums: {} };
    const config = makeDefaultConfig();
    const plan = buildTablePlan(table, schema, config, []);

    // Parent KeyPool containing user IDs [101], [102], [103]
    const keyPools = new Map<string, KeyPool>([
      [
        "users",
        {
          table: "users",
          keyColumns: ["id"],
          keys: [[101], [102], [103]],
        },
      ],
    ]);

    const faker = createSeededFaker(42);
    const rows = generateTableRows(table, plan, schema, config, keyPools, faker);

    expect(rows).toHaveLength(5);
    for (const row of rows) {
      // Must not contain skipped PK column
      expect(row.id).toBeUndefined();
      // user_id must be one of the parent keys
      expect([101, 102, 103]).toContain(row.user_id as number);
      // total_amount must be a valid float
      expect(typeof row.total_amount).toBe("number");
    }
  });

  it("generates realistic semantic data and respects maxLength truncation", () => {
    const table: Table = {
      name: "profiles",
      columns: [
        makeColumn("email", "varchar", { nullable: false, maxLength: 50 }),
        makeColumn("short_code", "varchar", { nullable: false, maxLength: 5 }), // Tight limit!
        makeColumn("avatar_url", "varchar", { nullable: false, maxLength: 200 }),
        makeColumn("password_hash", "varchar", { nullable: false, maxLength: 60 }),
      ],
      primaryKey: [],
      uniques: [],
      foreignKeys: [],
    };

    const schema: Schema = { name: "public", tables: [table], enums: {} };
    const config = makeDefaultConfig();
    const plan = buildTablePlan(table, schema, config, []);

    const faker = createSeededFaker(123);
    const rows = generateTableRows(table, plan, schema, config, new Map(), faker);

    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(typeof row.email).toBe("string");
      expect((row.email as string)).toContain("@");
      expect((row.short_code as string).length).toBeLessThanOrEqual(5);
      expect((row.avatar_url as string)).toMatch(/^https?:\/\//);
      // Password hash is a 60-character dummy hash
      expect((row.password_hash as string)).toMatch(/^\$2b\$12\$/);
      expect((row.password_hash as string).length).toBe(60);
    }
  });

  it("enforces updated_at is always greater than or equal to created_at", () => {
    const table: Table = {
      name: "articles",
      columns: [
        makeColumn("created_at", "timestamptz", { nullable: false }),
        makeColumn("updated_at", "timestamptz", { nullable: false }),
      ],
      primaryKey: [],
      uniques: [],
      foreignKeys: [],
    };

    const schema: Schema = { name: "public", tables: [table], enums: {} };
    const config = makeDefaultConfig({ defaultRows: 10 });
    const plan = buildTablePlan(table, schema, config, []);

    const faker = createSeededFaker(999);
    const rows = generateTableRows(table, plan, schema, config, new Map(), faker);

    for (const row of rows) {
      const createdAt = new Date(row.created_at as string | Date).getTime();
      const updatedAt = new Date(row.updated_at as string | Date).getTime();
      expect(updatedAt).toBeGreaterThanOrEqual(createdAt);
    }
  });

  it("evaluates custom config rules (functions, oneOf, int ranges)", () => {
    const table: Table = {
      name: "members",
      columns: [
        makeColumn("plan", "varchar", { nullable: false }),
        makeColumn("score", "int4", { nullable: false }),
        makeColumn("code", "varchar", { nullable: false }),
      ],
      primaryKey: [],
      uniques: [],
      foreignKeys: [],
    };

    const schema: Schema = { name: "public", tables: [table], enums: {} };
    const config = makeDefaultConfig({
      tables: {
        members: {
          columns: {
            plan: { oneOf: ["bronze", "silver", "gold"] },
            score: { int: { min: 80, max: 100 } },
            code: (ctx) => `MEMBER-${ctx.index + 1}`,
          },
        },
      },
    });

    const plan = buildTablePlan(table, schema, config, []);
    const faker = createSeededFaker(42);
    const rows = generateTableRows(table, plan, schema, config, new Map(), faker);

    expect(rows).toHaveLength(5);
    rows.forEach((row, idx) => {
      expect(["bronze", "silver", "gold"]).toContain(row.plan as string);
      expect(row.score as number).toBeGreaterThanOrEqual(80);
      expect(row.score as number).toBeLessThanOrEqual(100);
      expect(row.code).toBe(`MEMBER-${idx + 1}`);
    });
  });

  it("enforces uniqueness tracking without duplicate values", () => {
    const table: Table = {
      name: "tags",
      columns: [makeColumn("name", "varchar", { nullable: false })],
      primaryKey: [],
      uniques: [["name"]], // Unique column!
      foreignKeys: [],
    };

    const schema: Schema = { name: "public", tables: [table], enums: {} };
    const config = makeDefaultConfig({ defaultRows: 25 });
    const plan = buildTablePlan(table, schema, config, []);

    const faker = createSeededFaker(42);
    const rows = generateTableRows(table, plan, schema, config, new Map(), faker);

    const values = rows.map((r) => r.name);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(rows.length); // Zero duplicates!
  });

  it("is 100% deterministic with the same faker seed", () => {
    const table: Table = {
      name: "customers",
      columns: [
        makeColumn("email", "varchar", { nullable: false }),
        makeColumn("phone", "varchar", { nullable: false }),
        makeColumn("balance", "numeric", { nullable: false }),
      ],
      primaryKey: [],
      uniques: [],
      foreignKeys: [],
    };

    const schema: Schema = { name: "public", tables: [table], enums: {} };
    const config = makeDefaultConfig();
    const plan = buildTablePlan(table, schema, config, []);

    const faker1 = createSeededFaker(777);
    const rowsRun1 = generateTableRows(table, plan, schema, config, new Map(), faker1);

    const faker2 = createSeededFaker(777);
    const rowsRun2 = generateTableRows(table, plan, schema, config, new Map(), faker2);

    expect(rowsRun1).toEqual(rowsRun2); // Exact identical data!
  });
});
