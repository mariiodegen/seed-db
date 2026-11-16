import { test, expect, describe } from "bun:test";
import { formatSchemaText, inspectCommand } from "./inspect";
import { SeedError } from "../errors";
import type { Schema } from "../introspect/types";

describe("seed-db inspect command", () => {
  const mockSchema: Schema = {
    name: "public",
    tables: [
      {
        name: "users",
        primaryKey: ["id"],
        uniques: [["email"]],
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
            dataType: "character varying",
            udtName: "varchar",
            nullable: false,
            hasDefault: false,
            identity: null,
            generated: false,
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
            nullable: true,
          },
        ],
        columns: [
          {
            name: "id",
            position: 1,
            dataType: "integer",
            udtName: "int4",
            nullable: false,
            hasDefault: false,
            identity: null,
            generated: false,
            isArray: false,
          },
          {
            name: "user_id",
            position: 2,
            dataType: "integer",
            udtName: "int4",
            nullable: true,
            hasDefault: false,
            identity: null,
            generated: false,
            isArray: false,
          },
        ],
      },
    ],
    enums: {
      order_status: ["pending", "completed"],
    },
  };

  test("formatSchemaText renders readable table details", () => {
    const text = formatSchemaText(mockSchema);

    expect(text).toContain("Insert order:");
    expect(text).toContain("1  users");
    expect(text).toContain("2  orders  (user_id -> users.id)");
    expect(text).toContain('Schema "public" (2 tables):');
    expect(text).toContain("table users (2 columns)");
    expect(text).toContain("id                   integer | PK | NOT NULL | default | identity (always)");
    expect(text).toContain("email                character varying | unique | NOT NULL");
    expect(text).toContain("table orders (2 columns)");
    expect(text).toContain("user_id              integer | -> users.id");
  });

  test("throws E_MISSING_DB_URL (exit 2) when no URL provided and no snapshot", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await inspectCommand({
        config: "./seed.config.ts",
        schema: "public",
        format: "text",
      });
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err instanceof SeedError).toBe(true);
      const seedErr = err as SeedError;
      expect(seedErr.code).toBe("E_MISSING_DB_URL");
      expect(seedErr.exit).toBe(2);
    } finally {
      if (saved !== undefined) {
        process.env.DATABASE_URL = saved;
      }
    }
  });

  test("throws E_SNAPSHOT_NOT_FOUND (exit 2) when snapshot file does not exist", async () => {
    try {
      await inspectCommand({
        config: "./seed.config.ts",
        schema: "public",
        format: "text",
        snapshot: "./non-existent-snapshot.json",
      });
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err instanceof SeedError).toBe(true);
      const seedErr = err as SeedError;
      expect(seedErr.code).toBe("E_SNAPSHOT_NOT_FOUND");
      expect(seedErr.exit).toBe(2);
    }
  });
});
