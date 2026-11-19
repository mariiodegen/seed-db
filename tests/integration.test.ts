import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { runCommand } from "../src/commands/run";
import { SeedError } from "../src/errors";

const DB_URL = process.env.DATABASE_URL || "postgres://seed:seed@localhost:5433/seed";

describe("Milestone 6: Integration Testing & Schema Fixtures (PostgreSQL 16)", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(DB_URL);
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  // Helper to load fixture DDL into a hermetically isolated schema
  async function setupFixtureSchema(schemaName: string, fixtureFileName: string) {
    const fixturePath = resolve(__dirname, "fixtures", fixtureFileName);
    const ddl = readFileSync(fixturePath, "utf-8");

    // Hermetic isolation: drop and recreate schema
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
    await sql.unsafe(`CREATE SCHEMA ${schemaName};`);
    await sql.unsafe(`SET search_path TO ${schemaName}, public;`);
    await sql.unsafe(ddl);
  }

  async function teardownSchema(schemaName: string) {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
  }

  // --------------------------------------------------------------------------
  // 1. Fixture: blog (3-level dependency chain: users -> posts -> comments)
  // --------------------------------------------------------------------------
  it("blog: correctly populates 3-level parent chain with 100% referential integrity", async () => {
    const schema = "fixture_blog";
    await setupFixtureSchema(schema, "blog.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 10,
        seed: 42,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("live");
      expect(result.totalRows).toBe(30);

      // Verify row counts in PostgreSQL
      const [{ count: userCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.users;`);
      const [{ count: postCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.posts;`);
      const [{ count: commentCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.comments;`);

      expect(userCount).toBe(10);
      expect(postCount).toBe(10);
      expect(commentCount).toBe(10);

      // Verify referential integrity
      const [{ count: orphanPosts }] = await sql.unsafe(`
        SELECT count(*)::int FROM ${schema}.posts
        WHERE user_id NOT IN (SELECT id FROM ${schema}.users);
      `);
      expect(orphanPosts).toBe(0);

      const [{ count: orphanComments }] = await sql.unsafe(`
        SELECT count(*)::int FROM ${schema}.comments
        WHERE post_id NOT IN (SELECT id FROM ${schema}.posts)
           OR user_id NOT IN (SELECT id FROM ${schema}.users);
      `);
      expect(orphanComments).toBe(0);
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 2. Fixture: shop (many-to-one fanout, custom enums, numeric scale & precision)
  // --------------------------------------------------------------------------
  it("shop: handles custom enums, numeric precision, and many-to-one fanout", async () => {
    const schema = "fixture_shop";
    await setupFixtureSchema(schema, "shop.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 15,
        seed: 123,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("live");

      // Verify ENUM values are legitimate
      const enumRows = await sql.unsafe(`SELECT DISTINCT status::text FROM ${schema}.orders;`);
      const validStatuses = new Set(["pending", "processing", "shipped", "delivered", "cancelled"]);
      for (const row of enumRows) {
        expect(validStatuses.has(row.status)).toBe(true);
      }

      // Verify numeric precision and values
      const products = await sql.unsafe(`SELECT price::float FROM ${schema}.products;`);
      expect(products.length).toBe(15);
      for (const p of products) {
        expect(p.price).toBeGreaterThanOrEqual(0);
      }

      // Verify child foreign key links
      const [{ count: orphanItems }] = await sql.unsafe(`
        SELECT count(*)::int FROM ${schema}.order_items
        WHERE order_id NOT IN (SELECT id FROM ${schema}.orders)
           OR product_id NOT IN (SELECT id FROM ${schema}.products);
      `);
      expect(orphanItems).toBe(0);
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 3. Fixture: employees (self-referencing nullable foreign key)
  // --------------------------------------------------------------------------
  it("employees: correctly handles self-referencing FK via two-phase insert and patch pass", async () => {
    const schema = "fixture_employees";
    await setupFixtureSchema(schema, "employees.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 20,
        seed: 99,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("live");
      expect(result.totalRows).toBe(20);

      // Verify rows were patched with managers in Phase 2
      const [{ count: patchedManagers }] = await sql.unsafe(`
        SELECT count(*)::int FROM ${schema}.employees
        WHERE manager_id IS NOT NULL;
      `);
      expect(patchedManagers).toBeGreaterThan(0);

      // Verify all non-null manager_ids point to valid employees
      const [{ count: invalidManagers }] = await sql.unsafe(`
        SELECT count(*)::int FROM ${schema}.employees
        WHERE manager_id IS NOT NULL
          AND manager_id NOT IN (SELECT id FROM ${schema}.employees);
      `);
      expect(invalidManagers).toBe(0);
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 4. Fixture: cycle_nullable (circular foreign keys with at least one nullable FK)
  // --------------------------------------------------------------------------
  it("cycle_nullable: automatically breaks cycle and patches deferred FK", async () => {
    const schema = "fixture_cycle_nullable";
    await setupFixtureSchema(schema, "cycle_nullable.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 10,
        seed: 77,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("live");

      const [{ count: teamCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.teams;`);
      const [{ count: playerCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.players;`);
      expect(teamCount).toBe(10);
      expect(playerCount).toBe(10);

      // Both directions must have valid foreign keys
      const [{ count: invalidTeams }] = await sql.unsafe(`
        SELECT count(*)::int FROM ${schema}.players
        WHERE team_id NOT IN (SELECT id FROM ${schema}.teams);
      `);
      expect(invalidTeams).toBe(0);

      const [{ count: invalidCaptains }] = await sql.unsafe(`
        SELECT count(*)::int FROM ${schema}.teams
        WHERE captain_id IS NOT NULL
          AND captain_id NOT IN (SELECT id FROM ${schema}.players);
      `);
      expect(invalidCaptains).toBe(0);
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 5. Fixture: cycle_strict (circular foreign keys where all FKs are NOT NULL)
  // --------------------------------------------------------------------------
  it("cycle_strict: throws SeedError E_CIRCULAR_DEPENDENCY (exit 3) and leaves DB empty", async () => {
    const schema = "fixture_cycle_strict";
    await setupFixtureSchema(schema, "cycle_strict.sql");

    try {
      let threw = false;
      try {
        await runCommand({
          databaseUrl: DB_URL,
          schema,
          rows: 5,
          yes: true,
        });
      } catch (err) {
        threw = true;
        expect(err instanceof SeedError).toBe(true);
        const seedErr = err as SeedError;
        expect(seedErr.code).toBe("E_CIRCULAR_DEPENDENCY");
        expect(seedErr.exit).toBe(3);
        expect(seedErr.fix).toContain("ALTER TABLE");
      }
      expect(threw).toBe(true);

      // Verify atomicity: neither table has any rows inserted
      const [{ count: teamCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.team_strict;`);
      const [{ count: playerCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.player_strict;`);
      expect(teamCount).toBe(0);
      expect(playerCount).toBe(0);
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 6. Fixture: composite (composite PK and composite FK)
  // --------------------------------------------------------------------------
  it("composite: preserves multi-column composite PK and FK relational consistency", async () => {
    const schema = "fixture_composite";
    await setupFixtureSchema(schema, "composite.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 10,
        seed: 55,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("live");

      // Verify composite foreign key pairs in tenant_documents match tenant_users exactly
      const [{ count: invalidDocs }] = await sql.unsafe(`
        SELECT count(*)::int FROM ${schema}.tenant_documents d
        WHERE NOT EXISTS (
          SELECT 1 FROM ${schema}.tenant_users u
          WHERE u.tenant_id = d.tenant_id
            AND u.user_id = d.author_user_id
        );
      `);
      expect(invalidDocs).toBe(0);
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 7. Fixture: uniques (single and composite unique constraints)
  // --------------------------------------------------------------------------
  it("uniques: enforces single and composite unique constraints without collisions", async () => {
    const schema = "fixture_uniques";
    await setupFixtureSchema(schema, "uniques.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 50,
        seed: 101,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("live");
      expect(result.totalRows).toBe(50);

      // Verify zero duplicates for username
      const [{ count: distinctUsernames }] = await sql.unsafe(`
        SELECT count(DISTINCT username)::int FROM ${schema}.members;
      `);
      expect(distinctUsernames).toBe(50);

      // Verify zero duplicates for email
      const [{ count: distinctEmails }] = await sql.unsafe(`
        SELECT count(DISTINCT email)::int FROM ${schema}.members;
      `);
      expect(distinctEmails).toBe(50);
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 8. Fixture: types (arrays, jsonb, uuid, inet, bytea, timestamptz, date)
  // --------------------------------------------------------------------------
  it("types: generates valid data for complex PostgreSQL native data types", async () => {
    const schema = "fixture_types";
    await setupFixtureSchema(schema, "types.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 10,
        seed: 33,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("live");
      expect(result.totalRows).toBe(10);

      const rows = await sql.unsafe(`SELECT * FROM ${schema}.special_types;`);
      expect(rows.length).toBe(10);

      for (const r of rows) {
        // Arrays: text[]
        expect(Array.isArray(r.tags)).toBe(true);
        expect(r.tags.length).toBeGreaterThanOrEqual(1);

        // JSONB: object
        expect(typeof r.metadata).toBe("object");
        expect(r.metadata).not.toBeNull();

        // UUID: 36-char string with dashes
        expect(r.tracking_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

        // INET: IPv4 format
        expect(r.ip_address).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);

        // BYTEA: Buffer / Uint8Array
        expect(r.payload).toBeDefined();

        // BOOLEAN
        expect(typeof r.is_active).toBe("boolean");

        // DATE & TIMESTAMPTZ
        expect(r.event_date).toBeDefined();
        expect(r.event_timestamp instanceof Date).toBe(true);
      }
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 9. Fixture: identity (GENERATED ALWAYS identity and computed columns)
  // --------------------------------------------------------------------------
  it("identity: successfully skips GENERATED ALWAYS identity and computed columns", async () => {
    const schema = "fixture_identity";
    await setupFixtureSchema(schema, "identity.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 10,
        seed: 88,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("live");
      expect(result.totalRows).toBe(10);

      const rows = await sql.unsafe(`SELECT * FROM ${schema}.generated_items ORDER BY id;`);
      expect(rows.length).toBe(10);

      for (const r of rows) {
        // Verify identity column auto-incremented
        expect(r.id).toBeGreaterThanOrEqual(1);

        // Verify computed full_name column matches formula
        expect(r.full_name).toBe(`${r.first_name} ${r.last_name}`);

        // Verify computed total_price matches formula
        const expectedTotal = parseFloat((r.quantity * parseFloat(r.unit_price)).toFixed(2));
        const actualTotal = parseFloat(parseFloat(r.total_price).toFixed(2));
        expect(actualTotal).toBe(expectedTotal);
      }
    } finally {
      await teardownSchema(schema);
    }
  });

  // --------------------------------------------------------------------------
  // 10. Check Mode & Atomicity (100% rollback guarantee)
  // --------------------------------------------------------------------------
  it("check mode: verifies schema constraints and intentionally rolls back with 0 state change", async () => {
    const schema = "fixture_check_mode";
    await setupFixtureSchema(schema, "blog.sql");

    try {
      const result = await runCommand({
        databaseUrl: DB_URL,
        schema,
        rows: 10,
        check: true,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe("check");
      expect(result.rolledBack).toBe(true);
      expect(result.totalRows).toBe(30);

      // Verify that database tables remained completely empty!
      const [{ count: userCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.users;`);
      const [{ count: postCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.posts;`);
      const [{ count: commentCount }] = await sql.unsafe(`SELECT count(*)::int FROM ${schema}.comments;`);

      expect(userCount).toBe(0);
      expect(postCount).toBe(0);
      expect(commentCount).toBe(0);
    } finally {
      await teardownSchema(schema);
    }
  });
});
