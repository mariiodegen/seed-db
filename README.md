# seed-db

> **Deterministic, relationally consistent mock data generator for PostgreSQL.**  
> Built with Bun, TypeScript, and `postgres.js`.

`seed-db` reads your live PostgreSQL schema (or an offline JSON snapshot), computes table dependencies into a Directed Acyclic Graph (DAG), and populates your database with realistic fake data in the correct topological order—all inside an atomic, all-or-nothing transaction.

---

## Key Features

- **Zero-Config by Default:** Reads constraints and column types directly from PostgreSQL catalogs (`information_schema` + `pg_catalog`). No manual model definition required.
- **Dependency Graph Sorting:** Uses Kahn's algorithm to resolve parent-child table hierarchies, automatically deferring self-references (`employees.manager_id`) and breaking nullable cycles.
- **6-Tier Column Waterfall:** Evaluates a strict priority ladder (`Skip > Config > Foreign Key > Semantic Match > Type Mapping > Null Roll`).
- **Semantic Pattern Matching:** Generates hyper-realistic names, emails, phone numbers, addresses, and avatar URLs based on column names, with strict SQL type guards and length truncation.
- **Parent Key Pools:** Automatically captures primary keys returned from parent inserts (`RETURNING id`) into an in-memory `KeyPool` to populate child foreign keys with 100% referential integrity.
- **Single-Transaction Safety:** All inserts run inside a single `BEGIN ... COMMIT` block. Any error triggers an immediate `ROLLBACK`, leaving the database untouched.
- **Deterministic Reproducibility:** Supplying `--seed <number>` guarantees identical fake data and identical insert order across runs.
- **Single-File Binary:** Compiles into a standalone executable (`bun build --compile`) that runs with zero dependencies on user machines.

---

## Current Milestone Status

| Milestone | Description | Status |
| :--- | :--- | :---: |
| **M0: Spike** | Bun + postgres.js + standalone binary + TS config loader | **Complete** |
| **M1: Skeleton & Config** | 4-tier precedence loader, structured `SeedError`, CLI skeleton, `init` | **Complete** |
| **M2: Introspect & Schema** | 3 catalog queries, pure schema assembly, `inspect` live & snapshot modes | **Complete** |
| **M3: Dependency Graph** | Kahn's algorithm, distinct in-degrees, tie-breaking, cycle breaking | **Complete** |
| **M4: Generation Engine** | 6-tier waterfall, `@faker-js/faker`, semantic rules, `KeyPool`, uniqueness | **Complete** |
| **M5: Execution & Seeding** | Dynamic batching, single transaction, `--check`, `--dry-run`, `--out` | *In Progress* |

---

## CLI Reference

### Global Options

These options apply to all subcommands:

```bash
Options:
  -c, --config <path>   Path to seed.config.ts (default: "./seed.config.ts")
  --database-url <url>  PostgreSQL connection string (or via DATABASE_URL env var)
  --schema <name>       PostgreSQL schema name (default: "public")
  --format <type>       Output format: text | json (default: "text")
  --json                Shorthand for --format json
  --verbose             Show detailed execution logs
  -V, --version         Output the version number
  -h, --help            Display help for command
```

---

### Commands

#### 1. `seed-db init`
Scaffolds a starter `seed.config.ts` and `.env.example` file in the current working directory.

```bash
# Initialize a new project configuration
seed-db init

# Overwrite existing configuration files
seed-db init --force
```

#### 2. `seed-db inspect`
Inspects the database schema, calculates the topological insertion order, identifies deferred foreign keys (patch pass), and displays column types, primary keys, and constraints.

```bash
# Inspect a live database (uses DATABASE_URL)
seed-db inspect

# Inspect a specific PostgreSQL database URL
seed-db inspect --database-url postgres://user:pass@localhost:5433/mydb

# Export an offline schema snapshot for testing or CI/CD
seed-db inspect --json > schema.json

# Inspect an offline snapshot without connecting to a database
seed-db inspect --snapshot schema.json
```

**Example Output:**
```text
Insert order:
   1  organizations
   2  users          (org_id -> organizations.id)
   3  orders         (user_id -> users.id)
   4  employees      (manager_id deferred (self-reference))

Patch pass:
  employees.manager_id (self-reference)

Schema "public" (4 tables):
table users (4 columns)
  id                   integer | PK | NOT NULL | default | identity (always)
  email                varchar | unique | NOT NULL
  org_id               integer | NOT NULL | -> organizations.id
  created_at           timestamptz | NOT NULL | default
```

#### 3. `seed-db run` *(Milestone 5)*
Seeds the database with relationally consistent fake data.

```bash
# Seed all tables with 10 rows (default)
seed-db run

# Seed a custom row count per table
seed-db run --rows 50

# Seed with a deterministic random seed for repeatable test data
seed-db run --seed 42

# Seed only specific tables
seed-db run --tables users,orders

# Dry-run: view generated SQL statements without writing to the database
seed-db run --dry-run

# Constraint check: execute inside a transaction and rollback to verify schema validity
seed-db run --check

# Generate a standalone SQL script file with client-assigned primary keys
seed-db run --out seed.sql --snapshot schema.json

# Skip confirmation prompts when targeting non-local hosts
seed-db run --yes
```

---

## Configuration (`seed.config.ts`)

`seed.config.ts` is optional. It is used to override specific column generators, specify static test values, or skip migration tables.

```ts
import type { SeedConfig } from "seed-db"; // Type-only import (erased at runtime)

export default {
  defaultRows: 25,
  seed: 42,
  nullRate: 0.1, // 10% chance of NULL for nullable columns

  tables: {
    // Ignore internal migration tables
    _prisma_migrations: { ignore: true },

    users: {
      rows: 100, // Custom row count for this table
      columns: {
        // 1. Static constant
        role: "customer",

        // 2. Pre-computed bcrypt hash (instant test logins with "password123")
        password_hash: "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",

        // 3. OneOf categorical distribution
        status: { oneOf: ["active", "pending", "suspended"], weights: [70, 20, 10] },

        // 4. Integer range
        age: { int: { min: 18, max: 75 } },

        // 5. Custom context function
        referral_code: ({ index, faker }) => `REF-${index + 1}-${faker.string.alphanumeric(4).toUpperCase()}`,
      },
    },
  },
} satisfies SeedConfig;
```

---

## Architecture: "Thin Edges, Pure Core"

`seed-db` isolates side effects (network I/O) to the boundaries of the application:

```
INPUTS                  PIPELINE (5 stages)                   OUTPUTS
live DB     ─┐   1. Config → 2. Introspect → 3. Order →     ┌─ Insert (1 transaction)
snapshot    ─┼─→             4. Generate   → 5. Execute    ├─ SQL file (--out)
schema file ─┘                                             └─ Check (--check, rollback)
```

- **Pure Core:** `src/config/`, `src/graph/`, and `src/generate/` are 100% pure functions. They do not connect to networks or touch disk files during generation, enabling unit tests to run in milliseconds.
- **Thin Edges:** Only `src/introspect/` (reads catalog metadata) and `src/execute/` (writes batched inserts) interact with PostgreSQL.

### Parameter Math: Safe Dynamic Batching
PostgreSQL protocol limits bind parameters to **65,535** ($2^{16} - 1$). `seed-db` dynamically bounds batch sizes to ensure statements never exceed this ceiling:

$$\text{batchSize} = \min\left(1000, \left\lfloor \frac{65000}{\text{columnCount}} \right\rfloor\right)$$

---

## Development & Testing

Built with Bun. Tests run hermetically in memory:

```bash
# Install dependencies
bun install

# Run full test suite (46 unit tests across 8 suites)
bun test

# Run tests in watch mode
bun test --watch

# Build standalone compiled binary
bun build --compile ./src/index.ts --outfile dist/seed-db
```

---

## License

MIT
