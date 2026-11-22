<p align="center">
  <img src="./assets/wordmark.svg" alt="seed-db logo" width="320" />
</p>

<p align="center">
  <b>Deterministic, relationally consistent mock data generator for PostgreSQL.</b><br>
  Built with Bun, TypeScript, and postgres.js.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mariiodegen/seed-db"><img src="https://img.shields.io/npm/v/@mariiodegen/seed-db.svg?color=emerald&label=npm" alt="npm version" /></a>
  <a href="https://mariiodegen.github.io/seed-db/"><img src="https://img.shields.io/badge/docs-website-blue.svg" alt="Documentation Website" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License" /></a>
</p>

---

`seed-db` connects to any live PostgreSQL database, analyzes table relationships into a Directed Acyclic Graph (DAG), and fills your tables with realistic fake data in the correct dependency order—all wrapped in a safe, all-or-nothing transaction.

---

## 🚀 30-Second Quickstart

Run directly with zero installation via `npx`:

```bash
# 1. Scaffold a starter configuration and .env file
npx @mariiodegen/seed-db init

# 2. Inspect your schema to see the calculated insertion order and patch pass
npx @mariiodegen/seed-db inspect

# 3. Seed your database with 25 rows per table using a repeatable seed
npx @mariiodegen/seed-db run --rows 25 --seed 42
```

Or install as a development dependency:

```bash
npm install -D @mariiodegen/seed-db
# or
bun add -d @mariiodegen/seed-db
```

---

## Key Features

- **Zero Configuration:** Reads constraints, foreign keys, and column types directly from PostgreSQL's live system catalogs (`information_schema` + `pg_catalog`).
- **Graph-Aware Ordering:** Uses Kahn's topological sort algorithm to insert parents before children, automatically deferring self-references (`employees.manager_id`) and breaking circular loops.
- **6-Tier Waterfall Resolution:** Strict priority ladder ensures database-generated columns and relational integrity always take precedence over text guessing (`Skip > Config > Foreign Key > Semantic Match > Type Mapping > Null Roll`).
- **Smart Semantic Matching:** Intelligently recognizes column names to generate realistic emails, full names, phone numbers, addresses, avatar URLs, and dummy password hashes.
- **Referential Integrity via Key Pools:** Automatically captures database-assigned primary keys (`RETURNING id`) into an in-memory `KeyPool`, guaranteeing child foreign keys always point to real rows.
- **All-or-Nothing Safety:** Everything executes inside a single transaction (`BEGIN ... COMMIT`). Any error triggers an immediate `ROLLBACK`, leaving your database clean.
- **100% Deterministic:** Running with the same `--seed` produces the exact same fake data and exact same row order every time.
- **Single-File Binary:** Compiles into a standalone executable (`bun build --compile`) that runs with zero dependencies on user machines.

---

## 💡 Core Concept: `--rows` vs `--seed`

It is common to confuse these two flags, but they control completely different things:

| Flag | Question it Answers | What it Controls | Example |
| :--- | :--- | :--- | :--- |
| **`--rows <number>`** | *"How much data do you want?"* | **Quantity / Volume** | `--rows 50` creates 50 users, 50 orders, 50 products. |
| **`--seed <number>`** | *"Which specific fake data do you want?"* | **Reproducibility** | `--seed 42` generates the *exact same* names, emails, and dates every time. |

### Why `--seed` is a Superpower for Testing
Computers use Pseudo-Random Number Generators (PRNG). If you don't supply `--seed`, the generator uses the current computer clock time, generating completely different names and emails on every run.

When you specify `--seed 42`:
- **Run 1:** User #1 is `"Sarah Connor"`, email `"sarah@example.com"`.
- **Run 2 (Tomorrow):** User #1 is **still** `"Sarah Connor"`, email `"sarah@example.com"`.
- **Run 3 (On your colleague's laptop in another country):** User #1 is **still** `"Sarah Connor"`.

> [!TIP]
> **Use them together for automated tests:**  
> `seed-db run --rows 50 --seed 42`  
> *"Generate 50 rows per table, and make sure they are the exact same 50 records every time my test suite runs."*

---

## CLI Reference & Examples

### Global Flags

These flags work across all subcommands:

```bash
Options:
  -c, --config <path>   Path to seed.config.ts (default: "./seed.config.ts")
  --database-url <url>  PostgreSQL connection string (or via DATABASE_URL env var)
  --schema <name>       PostgreSQL schema name (default: "public")
  --format <type>       Output format: text | json (default: "text")
  --json                Shorthand for --format json
  --verbose             Show detailed execution and configuration logs
  -h, --help            Display help for command
```

---

### Commands

#### 1. `seed-db init`
Creates a starter `seed.config.ts` and `.env.example` file in the current directory.

```bash
# Create starter config files
seed-db init

# Force overwrite if files already exist
seed-db init --force
```

#### 2. `seed-db inspect`
Examines your database, resolves dependencies, and prints the plan without writing any data.

```bash
# Inspect your live database (reads connection from DATABASE_URL)
seed-db inspect

# Inspect a specific remote database URL
seed-db inspect --database-url postgres://user:pass@localhost:5433/mydb

# Export an offline schema snapshot (safe to share: zero passwords, zero row data)
seed-db inspect --json > schema.json

# Inspect an offline snapshot file without connecting to any database
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

#### 3. `seed-db run`
Generates and inserts relationally consistent mock data into your tables.

```bash
# Seed all tables with default 10 rows
seed-db run

# Seed a custom row count (e.g. 100 rows per table)
seed-db run --rows 100

# Seed with a fixed random seed for reproducible test suites
seed-db run --seed 42

# Seed only specific tables (skipping unrelated tables)
seed-db run --tables users,orders

# Dry-run: view generated SQL statements in your terminal without executing
seed-db run --dry-run

# Safety check: execute inserts inside a transaction and rollback
# (Verifies all foreign keys and constraints pass without keeping data)
seed-db run --check

# Export as a standalone SQL script file instead of connecting to a live database
seed-db run --out seed.sql --snapshot schema.json

# Skip the production prompt when targeting non-localhost databases
seed-db run --yes
```

---

## Configuration (`seed.config.ts`)

An optional TypeScript configuration file for custom business rules, fixed IDs, and test passwords:

```ts
import type { SeedConfig } from "seed-db"; // Type-only import (erased at runtime)

export default {
  defaultRows: 25,
  seed: 42,
  nullRate: 0.1, // 10% chance a nullable column becomes NULL

  tables: {
    // 1. Skip internal migration tables
    _prisma_migrations: { ignore: true },

    // 2. Custom rules for the users table
    users: {
      rows: 100, // Custom row count for this specific table
      columns: {
        // Constant value
        role: "customer",

        // Pre-computed bcrypt hash for "password123" (instant logins, zero CPU lag)
        password_hash: "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",

        // Categorical distribution with custom weights
        status: { oneOf: ["active", "pending", "suspended"], weights: [70, 20, 10] },

        // Integer range
        age: { int: { min: 18, max: 75 } },

        // Dynamic custom generator function
        member_code: ({ index, faker }) => `MEMBER-${index + 1}-${faker.string.alphanumeric(4).toUpperCase()}`,
      },
    },
  },
} satisfies SeedConfig;
```

---

## Architecture: "Thin Edges, Pure Core"

`seed-db` isolates database interactions to the edges of the pipeline:

```mermaid
flowchart LR
    A["1. Config\n(Flags, File, Env)"] --> B["2. Introspect\n(Reads DB / Snapshot)"]
    B --> C["3. Order\n(Kahn's Sort DAG)"]
    C --> D["4. Generate\n(Waterfall Rules)"]
    D --> E["5. Execute\n(1 Transaction)"]

    style A fill:#e9ecef,stroke:#495057
    style B fill:#d8f3dc,stroke:#2d6a4f
    style C fill:#d8f3dc,stroke:#2d6a4f
    style D fill:#d8f3dc,stroke:#2d6a4f
    style E fill:#cfe2ff,stroke:#084298
```

- **Pure Core:** Stages 1, 3, and 4 are pure functions. They execute in-memory with zero network or filesystem dependencies, allowing unit tests to run in milliseconds.
- **Thin Edges:** Only Stage 2 (Introspect) and Stage 5 (Execute) touch PostgreSQL.

### Parameter Math: Safe Dynamic Batching
PostgreSQL protocol binds query parameters using an unsigned 16-bit integer ($2^{16} - 1 = 65,535$). Passing more parameters in a single statement causes a query crash.

`seed-db` dynamically calculates batch sizes to maximize speed while guaranteeing safety:
$$\text{batchSize} = \min\left(1000, \left\lfloor \frac{65000}{\text{columnCount}} \right\rfloor\right)$$

- Table with 10 columns: $\min(1000, 6500) = 1,000\text{ rows/batch}$ ($10,000\text{ parameters}$).
- Table with 100 columns: $\min(1000, 650) = 650\text{ rows/batch}$ ($65,000\text{ parameters}$).

---

## Development & Testing

```bash
# Install dependencies
bun install

# Run the complete test suite (46 tests across 8 suites)
bun test

# Run tests in watch mode
bun test --watch

# Compile standalone single binary
bun build --compile ./src/index.ts --outfile dist/seed-db
```

---

## License

MIT
