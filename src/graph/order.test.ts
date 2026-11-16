import { describe, expect, it } from "bun:test";
import { orderTables } from "./order";
import type { Schema, Table, ForeignKey } from "../introspect/types";
import { SeedError } from "../errors";

function makeTable(
  name: string,
  foreignKeys: Array<{
    name: string;
    columns: string[];
    refTable: string;
    refColumns: string[];
    nullable?: boolean;
  }> = []
): Table {
  return {
    name,
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
    ],
    primaryKey: ["id"],
    uniques: [],
    foreignKeys: foreignKeys.map((fk) => ({
      name: fk.name,
      columns: fk.columns,
      refTable: fk.refTable,
      refColumns: fk.refColumns,
      nullable: fk.nullable ?? false,
    })),
  };
}

function makeSchema(tables: Table[]): Schema {
  return {
    name: "public",
    tables,
    enums: {},
  };
}

describe("Table Dependency Graph & Topological Ordering (Pure Core)", () => {
  it("orders a simple linear dependency chain (users -> orders -> order_items)", () => {
    const users = makeTable("users");
    const orders = makeTable("orders", [
      {
        name: "orders_user_id_fkey",
        columns: ["user_id"],
        refTable: "users",
        refColumns: ["id"],
        nullable: false,
      },
    ]);
    const orderItems = makeTable("order_items", [
      {
        name: "order_items_order_id_fkey",
        columns: ["order_id"],
        refTable: "orders",
        refColumns: ["id"],
        nullable: false,
      },
    ]);

    const schema = makeSchema([orderItems, users, orders]);
    const result = orderTables(schema);

    expect(result.order).toEqual(["users", "orders", "order_items"]);
    expect(result.deferredFks).toEqual([]);
  });

  it("breaks ties deterministically in alphabetical order", () => {
    // 3 completely independent tables
    const zebra = makeTable("zebra");
    const apple = makeTable("apple");
    const mango = makeTable("mango");

    const schema = makeSchema([zebra, apple, mango]);
    const result = orderTables(schema);

    expect(result.order).toEqual(["apple", "mango", "zebra"]);
    expect(result.deferredFks).toEqual([]);
  });

  it("orders a diamond dependency graph with deterministic tie-breaking", () => {
    // orgs -> (projects, users) -> tasks
    const orgs = makeTable("organizations");
    const users = makeTable("users", [
      {
        name: "users_org_id_fkey",
        columns: ["org_id"],
        refTable: "organizations",
        refColumns: ["id"],
      },
    ]);
    const projects = makeTable("projects", [
      {
        name: "projects_org_id_fkey",
        columns: ["org_id"],
        refTable: "organizations",
        refColumns: ["id"],
      },
    ]);
    const tasks = makeTable("tasks", [
      {
        name: "tasks_user_id_fkey",
        columns: ["user_id"],
        refTable: "users",
        refColumns: ["id"],
      },
      {
        name: "tasks_project_id_fkey",
        columns: ["project_id"],
        refTable: "projects",
        refColumns: ["id"],
      },
    ]);

    const schema = makeSchema([tasks, users, orgs, projects]);
    const result = orderTables(schema);

    // Alphabetical tie between 'projects' and 'users': 'projects' comes before 'users'
    expect(result.order).toEqual(["organizations", "projects", "users", "tasks"]);
  });

  it("handles self-referencing tables by deferring the self-FK", () => {
    const employees = makeTable("employees", [
      {
        name: "employees_manager_id_fkey",
        columns: ["manager_id"],
        refTable: "employees",
        refColumns: ["id"],
        nullable: true,
      },
    ]);

    const schema = makeSchema([employees]);
    const result = orderTables(schema);

    expect(result.order).toEqual(["employees"]);
    expect(result.deferredFks).toHaveLength(1);
    expect(result.deferredFks[0].table).toBe("employees");
    expect(result.deferredFks[0].fk.name).toBe("employees_manager_id_fkey");
    expect(result.deferredFks[0].reason).toBe("self-reference");
  });

  it("breaks a 2-table cycle when at least one foreign key is nullable", () => {
    // teams has captain_id -> players.id (nullable)
    // players has team_id -> teams.id (NOT NULL)
    const teams = makeTable("teams", [
      {
        name: "teams_captain_id_fkey",
        columns: ["captain_id"],
        refTable: "players",
        refColumns: ["id"],
        nullable: true, // Nullable edge can be deferred!
      },
    ]);
    const players = makeTable("players", [
      {
        name: "players_team_id_fkey",
        columns: ["team_id"],
        refTable: "teams",
        refColumns: ["id"],
        nullable: false,
      },
    ]);

    const schema = makeSchema([teams, players]);
    const result = orderTables(schema);

    // Once teams_captain_id_fkey is deferred, teams has in-degree 0 and is inserted first
    expect(result.order).toEqual(["teams", "players"]);
    expect(result.deferredFks).toHaveLength(1);
    expect(result.deferredFks[0].table).toBe("teams");
    expect(result.deferredFks[0].fk.name).toBe("teams_captain_id_fkey");
    expect(result.deferredFks[0].reason).toBe("cycle");
  });

  it("throws SeedError E_CIRCULAR_DEPENDENCY (exit 3) on strict cycles with all NOT NULL FKs", () => {
    const teams = makeTable("teams", [
      {
        name: "teams_captain_id_fkey",
        columns: ["captain_id"],
        refTable: "players",
        refColumns: ["id"],
        nullable: false, // Strict NOT NULL!
      },
    ]);
    const players = makeTable("players", [
      {
        name: "players_team_id_fkey",
        columns: ["team_id"],
        refTable: "teams",
        refColumns: ["id"],
        nullable: false, // Strict NOT NULL!
      },
    ]);

    const schema = makeSchema([teams, players]);

    try {
      orderTables(schema);
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(SeedError);
      const seedErr = err as SeedError;
      expect(seedErr.code).toBe("E_CIRCULAR_DEPENDENCY");
      expect(seedErr.exit).toBe(3);
      expect(seedErr.where).toContain("players");
      expect(seedErr.where).toContain("teams");
      expect(seedErr.fix).toContain("ALTER TABLE");
    }
  });

  it("ignores foreign keys pointing to tables outside the specified run set", () => {
    // schema has tenants, users, orders
    // user only wants to run ['orders']
    // orders.tenant_id -> tenants.id (tenants not in runSet)
    const tenants = makeTable("tenants");
    const orders = makeTable("orders", [
      {
        name: "orders_tenant_id_fkey",
        columns: ["tenant_id"],
        refTable: "tenants",
        refColumns: ["id"],
        nullable: false,
      },
    ]);

    const schema = makeSchema([tenants, orders]);
    const result = orderTables(schema, ["orders"]);

    expect(result.order).toEqual(["orders"]);
    expect(result.deferredFks).toEqual([]);
  });

  it("throws SeedError E_TABLE_NOT_FOUND (exit 2) when a requested table is not in the schema", () => {
    const users = makeTable("users");
    const schema = makeSchema([users]);

    try {
      orderTables(schema, ["non_existent_table"]);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SeedError);
      const seedErr = err as SeedError;
      expect(seedErr.code).toBe("E_TABLE_NOT_FOUND");
      expect(seedErr.exit).toBe(2);
      expect(seedErr.where).toContain("non_existent_table");
    }
  });
});
