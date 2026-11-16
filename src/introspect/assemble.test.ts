import { test, expect, describe } from "bun:test";
import { assembleSchema } from "./assemble";
import type { RawColumnRow, RawConstraintRow, RawEnumRow } from "./types";

describe("Schema Assembly (Pure Core)", () => {
  test("assembles tables, columns, and constraints correctly", () => {
    const rawColumns: RawColumnRow[] = [
      {
        table_name: "users",
        column_name: "id",
        ordinal_position: 1,
        data_type: "integer",
        udt_name: "int4",
        nullable: false,
        column_default: "nextval('users_id_seq'::regclass)",
        character_maximum_length: null,
        numeric_precision: 32,
        numeric_scale: 0,
        is_identity: true,
        identity_generation: "ALWAYS",
        is_generated: false,
      },
      {
        table_name: "users",
        column_name: "email",
        ordinal_position: 2,
        data_type: "character varying",
        udt_name: "varchar",
        nullable: false,
        column_default: null,
        character_maximum_length: 255,
        numeric_precision: null,
        numeric_scale: null,
        is_identity: false,
        identity_generation: null,
        is_generated: false,
      },
      {
        table_name: "orders",
        column_name: "id",
        ordinal_position: 1,
        data_type: "integer",
        udt_name: "int4",
        nullable: false,
        column_default: null,
        character_maximum_length: null,
        numeric_precision: 32,
        numeric_scale: 0,
        is_identity: false,
        identity_generation: null,
        is_generated: false,
      },
      {
        table_name: "orders",
        column_name: "user_id",
        ordinal_position: 2,
        data_type: "integer",
        udt_name: "int4",
        nullable: true, // Nullable foreign key
        column_default: null,
        character_maximum_length: null,
        numeric_precision: 32,
        numeric_scale: 0,
        is_identity: false,
        identity_generation: null,
        is_generated: false,
      },
    ];

    const rawConstraints: RawConstraintRow[] = [
      {
        name: "users_pkey",
        type: "p",
        table_name: "users",
        columns: ["id"],
        ref_table: null,
        ref_columns: null,
      },
      {
        name: "users_email_key",
        type: "u",
        table_name: "users",
        columns: ["email"],
        ref_table: null,
        ref_columns: null,
      },
      {
        name: "orders_pkey",
        type: "p",
        table_name: "orders",
        columns: ["id"],
        ref_table: null,
        ref_columns: null,
      },
      {
        name: "orders_user_id_fkey",
        type: "f",
        table_name: "orders",
        columns: ["user_id"],
        ref_table: "users",
        ref_columns: ["id"],
      },
    ];

    const rawEnums: RawEnumRow[] = [
      {
        typname: "order_status",
        labels: ["pending", "shipped", "delivered"],
      },
    ];

    const schema = assembleSchema("public", rawColumns, rawConstraints, rawEnums);

    expect(schema.name).toBe("public");
    expect(schema.tables.length).toBe(2);

    const usersTable = schema.tables.find((t) => t.name === "users")!;
    expect(usersTable.primaryKey).toEqual(["id"]);
    expect(usersTable.uniques).toEqual([["email"]]);
    expect(usersTable.columns[0]?.identity).toBe("always");

    const ordersTable = schema.tables.find((t) => t.name === "orders")!;
    expect(ordersTable.foreignKeys.length).toBe(1);
    expect(ordersTable.foreignKeys[0]?.refTable).toBe("users");
    expect(ordersTable.foreignKeys[0]?.columns).toEqual(["user_id"]);
    expect(ordersTable.foreignKeys[0]?.nullable).toBe(true); // Since user_id is nullable

    expect(schema.enums["order_status"]).toEqual(["pending", "shipped", "delivered"]);
  });

  test("handles tables with no primary key", () => {
    const rawColumns: RawColumnRow[] = [
      {
        table_name: "log_events",
        column_name: "event_name",
        ordinal_position: 1,
        data_type: "text",
        udt_name: "text",
        nullable: false,
        column_default: null,
        character_maximum_length: null,
        numeric_precision: null,
        numeric_scale: null,
        is_identity: false,
        identity_generation: null,
        is_generated: false,
      },
    ];

    const schema = assembleSchema("public", rawColumns, [], []);
    const table = schema.tables[0]!;
    expect(table.primaryKey).toEqual([]);
    expect(table.uniques).toEqual([]);
    expect(table.foreignKeys).toEqual([]);
  });
});
