# seed-db: Project Plan, Schema & MVP Spec

Oct 4, 2026 · @Tony

## Overview

seed-db is a terminal tool that reads a live PostgreSQL schema and fills it with realistic, relationally consistent mock data, with no per-table setup. The MVP does one job well: `seed-db run` on an unfamiliar schema produces valid data in the right order, or fails cleanly with nothing written.

**Mission.** Remove the manual INSERT scripts and brittle seed files that break whenever a schema changes.

**Audience.** Full-stack and backend engineers, and QA testers, who need a populated development or test database quickly.

**Differentiator.** The database is the source of truth. Column types, nullability, enums, and foreign keys are read from the live schema, so about 90% of generation works with zero configuration. A small config file covers the remaining 10%.

**Success criteria for the MVP** (targets, to be measured in Milestone 5):

- A 20-table schema with foreign keys seeds with no constraint errors and no config file.
- Any failure rolls back completely; the database is never left half-seeded.
- 10,000 rows per table inserts in under 30 seconds against a local Postgres.
- The same `--seed` value produces identical data on every run.
- The compiled binary starts in under 100 ms and needs no Node or Bun installed.

## Positioning

seed-db's promise is that it behaves the same way every time, and when it cannot, it says exactly why. Two properties follow, and they share most of their implementation.

**Trustworthy in CI.** Output is deterministic with `--seed`, nothing prompts when stdout is not a terminal, exit codes are fixed, and a failed run leaves the database untouched. `--check` runs the whole seed and rolls it back, so a pipeline can prove that a schema change did not break seeding. `--format json` makes every result and error machine-readable.

**Errors that name the fix.** Every failure, including raw database errors, goes through one contract:

| Field | Meaning |
| --- | --- |
| `code` | Stable identifier that scripts can match, for example `E_UNSUPPORTED_TYPE` |
| `where` | The table and column, or the constraint, involved |
| `cause` | What happened, in plain words |
| `fix` | One concrete next step, including a config snippet when one applies |
| `exit` | The exit code from the CLI surface section |

In a terminal the same failure reads like this:

```text
error E_UNSUPPORTED_TYPE  orders.total
  No generator exists for type "money", and the column is NOT NULL.
  Fix: add a rule in seed.config.ts:
       tables: { orders: { columns: { total: ({ faker }) => "$" + faker.finance.amount() } } }
```

With `--format json` it is one object:

```json
{"error": {"code": "E_UNSUPPORTED_TYPE", "where": "orders.total", "cause": "No generator exists for type money and the column is NOT NULL", "fix": "Add a rule for orders.total in seed.config.ts", "exit": 3}}
```

Codes are stable from the first release: new codes may be added, but renaming one is a breaking change. Build the contract in Milestone 1, before any generator exists, so every later stage reports through it.

**A CI step** looks like this, run after migrations against a throwaway database:

```bash
seed-db run --check --seed 1 --format json
```

`--check` differs from `--dry-run`: a dry run prints SQL with placeholder keys and never touches the database, while a check actually executes the inserts, so it catches real constraint failures. Sequences still advance after the rollback, so do not use it against a database where gaps in ids matter.

## MVP scope

The MVP is PostgreSQL only, single schema, with a safe `run` and `--dry-run`. Everything else is deliberately deferred so the first release stays shippable.

**Decided for version 1: lean first.** The goal is learning and a portfolio piece, so the first release is the smallest tool that is trustworthy. In: single-column foreign keys, type mapping plus a short list of name matches, one transaction, `--dry-run`, `--check`, `--out`, snapshots, clear errors, and filling in circular links afterwards (self-references and nullable cycles). Out until real schemas need them: multi-column foreign keys, the schema-file input (PGlite), and extra name matches. Where a later section still mentions these as MVP, this paragraph wins. If time is short, cut in this order: multi-column foreign keys, then extra name matches, then circular-link fill-in. Keep the transaction, `--dry-run`, `--check` and the error system.

| Area | In the MVP | After the MVP |
| --- | --- | --- |
| Database | PostgreSQL, one schema per run (default `public`); schema read from a live database or a snapshot | MySQL, SQLite, multi-schema, schema-file input (PGlite) |
| Introspection | Tables, columns, types, enums, nullability, defaults, identity, PK, unique, FK (including composite) | Multi-column foreign keys, check-constraint parsing, views, partition awareness |
| Ordering | Topological sort, cycle detection, self-references, deferred FK for nullable cycles | Smarter cycle breaking hints |
| Generation | Type mapping, name-based semantic mapping, config overrides, deterministic `--seed` | Custom generator plugins, sampling from existing data, LLM-assisted rules |
| Relationships | FK values drawn from generated or existing parent keys, 1:1 handling | Weighted distributions, skewed parent popularity |
| Execution | Batched inserts, single transaction, `--dry-run`, `--check` (run, then roll back), `--out` SQL file, production-host guard | `--truncate`, resume after failure |
| Interface | `init` (interactive), `inspect`, `run`, `--format json` output with stable error codes | `diff`, interactive table picker, watch mode, GitHub Action |
| Distribution | `bun run`, npm package, compiled binaries (macOS, Linux, Windows) | Homebrew tap, install script |

**Explicitly out of scope for the MVP:** a GUI, cloud or hosted features, data anonymization of real production data, schema migrations, non-relational databases, triggers, stored procedures and materialized views, data that needs external APIs, and CI platform integrations such as a GitHub Action. The `--format json` output and `--check` mode that such integrations would build on are in scope.

## Inputs, outputs and trust

A tool that insists on a live connection fails two groups of people: those with no database yet (a new project, or a CI job before its services start) and those who will not point an unfamiliar tool at a real one. seed-db therefore separates where the schema comes from from where the data goes.

[embedded content: inputs and outputs · 3 in, 1 model, 3 out]

Every input produces the same `Schema` object, so ordering, generation, and the error contract do not care which one was used.

**Schema inputs**

| Input | Flag | Connection needed | How it works |
| --- | --- | --- | --- |
| Live database | `--database-url` | Yes, for reading | Runs the three catalog queries from the Introspection section |
| Schema file | `--schema-file schema.sql` | No | Replays `pg_dump --schema-only` output, or your migrations in order, in a scratch Postgres, then runs the same three queries |
| Snapshot | `--snapshot schema.json` | No | Loads the output of `inspect --json` directly; it holds no data and no connection details |

A schema file is replayed in a real engine rather than parsed by hand. A hand-written DDL parser would have to understand every Postgres feature, and any gap would make a file and a live database produce different `Schema` objects. Replaying it and reading the catalogs reuses the introspection code exactly. The proposed engine is PGlite, a WebAssembly build of Postgres that runs inside the process, so users need no Docker or server. Two things are unverified, so this input waits until after version 1 and gets its own spike: that it runs under Bun and inside the compiled binary, and how it reports extensions it does not include (the error should name the extension).

**Outputs**

| Output | Flag | Writes to a database |
| --- | --- | --- |
| Insert | default | Yes, one transaction |
| SQL file | `--out seed.sql` | No. Plain `INSERT` statements you can read, then apply with `psql` |
| Check | `--check` | Executes, then rolls back. Runs against a live database or the scratch one |

**Keys in file mode.** A SQL file cannot use `RETURNING`, because nothing executes. In this mode the tool assigns primary keys itself: integer keys count up from 1 (or from `--start-id`), uuid keys are generated, `GENERATED ALWAYS` identity columns are filled with `OVERRIDING SYSTEM VALUE`, and the file ends with `setval` calls so sequences continue after the seeded rows. The file assumes the target tables are empty. Because keys are known up front, a self-referencing row can point at an earlier row directly, so file mode needs no patch pass for self-references. Live mode keeps `RETURNING`, which coexists with rows that are already there.

**Trust model.** What the tool does and does not do:

- It connects only to the database URL you give it. There is no telemetry, no update check, and no other network access.
- Introspection runs `SELECT` statements against `information_schema` and `pg_catalog`. It reads no table rows. The one exception is seeding a subset of tables, which reads the primary keys of existing parent tables (`LIMIT 10000`) to link new rows to them.
- Snapshots contain schema names and types only, with no rows and no credentials. Table and column names can still be sensitive, so review a snapshot before sharing it.
- A run changes a database only when you use plain `run`. `--dry-run` and `--out` never write; `--check` writes inside a transaction and rolls it back.
- The code is MIT-licensed, so anyone can read exactly what it does, and release binaries are published with checksums.

**Three ways to work without a live connection:**

```bash
# 1. Dump the schema yourself, generate a file, review it, apply it
pg_dump --schema-only --no-owner mydb > schema.sql
seed-db run --schema-file schema.sql --out seed.sql --seed 1
psql mydb -f seed.sql

# 2. Check that seeding would succeed, with no real database at all
seed-db run --schema-file schema.sql --check

# 3. Share what the tool sees, without a connection
seed-db inspect --json > schema.json
seed-db run --snapshot schema.json --out seed.sql
```

## Architecture and tech stack

seed-db is a five-stage pipeline where each stage hands a typed object to the next, so every stage can be tested on its own.

[embedded content: pipeline architecture · 5 stages]

Generation and insertion run together for each table because parent keys returned by earlier inserts feed the foreign keys of later tables. Only `introspect/` and `execute/` touch the database; `graph/` and `generate/` are pure functions of their inputs.

**Tech stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime and bundler | Bun | Runs TypeScript directly, starts fast, and compiles to a single-file binary |
| Language | TypeScript, strict mode | Types for the schema model and config catch most wiring errors |
| CLI framework | `commander` | Mature handling of subcommands and flags |
| Database driver | `postgres.js` | Light, fast, with a simple transaction and bulk-insert API |
| Scratch Postgres | `@electric-sql/pglite` | In-process Postgres for schema files and offline checks, with no Docker or server (after version 1, with its own spike) |
| Data generation | `@faker-js/faker` | Wide set of realistic generators, with seeding |
| Terminal UI | `@clack/prompts`, `picocolors` | Spinners, prompts, and colored output |
| Tests | `bun test`, Postgres container | Unit tests without a database; integration tests against a real one |

**Project structure**

```text
seed-db/
├── src/
│   ├── index.ts              # entry point, commander setup
│   ├── commands/             # init.ts, inspect.ts, run.ts
│   ├── config/               # load, validate, merge flags
│   ├── introspect/           # SQL queries, Schema model
│   ├── graph/                # dependency graph, sort, cycles
│   ├── generate/             # type map, semantic map, key pools, rules
│   ├── execute/              # batching, transaction, dry-run printer
│   └── ui/                   # prompts, spinner, logger
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/             # SQL schemas and inspect snapshots
├── package.json
└── tsconfig.json
```

## Data model reference

Three kinds of data move through the pipeline: facts from introspection, decisions in the plan, and errors under one contract. Everything lives in memory, except the optional `inspect --json` snapshot.

[embedded content: data model · introspected facts and planned decisions]

Introspection output never changes once it is built. The plan is derived from it plus the config, and each `ColumnPlan` records which source won for its column. That `source` field is what `inspect` prints, so the plan doubles as the explanation of what the tool will do.

The introspected types (`Schema`, `Table`, `Column`, `ForeignKey`) are defined under Introspection. The planned types and the error type are:

```ts
export interface TablePlan {
  table: string;                 // Table.name
  rowCount: number;
  ignored: boolean;              // config ignore, or left out by --tables
  columns: ColumnPlan[];         // in column order
  deferred: DeferredFk[];        // foreign keys patched after the inserts
}

export type ColumnSource = "skip" | "config" | "fk" | "semantic" | "type";

export interface ColumnPlan {
  column: string;                // Column.name
  source: ColumnSource;
  generator?: string;            // e.g. "faker.internet.email", "fk:users.id", "type:int4"
}

export interface DeferredFk {
  fk: string;                    // ForeignKey.name
  reason: "self-reference" | "cycle";
}

export interface KeyPool {
  table: string;                 // Table.name
  keys: unknown[][];             // one entry per row, one value per key column
}

export interface SeedError {
  code: string;                  // stable, e.g. "E_UNSUPPORTED_TYPE"
  where: string;                 // "orders.total" or a constraint name
  cause: string;
  fix: string;
  exit: 1 | 2 | 3;
}
```

**Who writes and who reads each object**

| Object | Written by | Read by |
| --- | --- | --- |
| `Schema` | `introspect/` (database, file, or snapshot) | `graph/`, `generate/`, `inspect` |
| `DeferredFk` | `graph/` | `execute/` for the patch pass |
| `TablePlan`, `ColumnPlan` | `generate/` (planning step) | `execute/`, `inspect` |
| `KeyPool` | `execute/` after each batch, or by sampling existing parents | `generate/` for foreign key columns |
| `SeedError` | any stage | `ui/`, as text or JSON |

**Worked example.** A small schema with one self-reference shows the ordering and the patch pass. It describes live mode, where the database assigns keys.

[embedded content: worked example · insert order for a sample schema]

The first round holds every table with no unresolved parent. `employees` joins it because its only foreign key points at itself, and that edge is set aside as deferred. Ties inside a round break alphabetically, so the final order is `employees`, `products`, `users`, `orders`, `order_items`. In file mode (client-assigned keys) a row can reference an earlier employee directly, so the patch pass disappears. The `inspect` command prints this plan before anything runs; the output below is illustrative:

```text
$ seed-db inspect
Insert order
  1  employees    10 rows   manager_id deferred (self-reference)
  2  products     10 rows
  3  users        10 rows
  4  orders       10 rows   user_id <- users.id
  5  order_items  10 rows   order_id <- orders.id, product_id <- products.id
Patch pass
  employees.manager_id
```

## CLI surface

Three commands cover the MVP: `init` to scaffold, `inspect` to see what the tool understands, and `run` to seed.

| Command | Purpose |
| --- | --- |
| `seed-db init` | Interactive setup (database URL, default row count). Writes `seed.config.ts` and a `.env.example`; refuses to overwrite unless `--force`. |
| `seed-db inspect` | Introspects the database and prints tables, columns, relationships, insert order, and which generator each column will use. `--json` emits the schema model. |
| `seed-db run` | Generates data and inserts it. `--dry-run` prints the SQL; `--check` runs everything and rolls back. |

**Flags for `run`** (the global flags also apply to `inspect`):

| Flag | Meaning |
| --- | --- |
| `-t, --tables <a,b>` | Seed only these tables (default: all tables in the schema). Missing parents are sampled from existing rows. |
| `-r, --rows <n>` | Rows to generate per table (default: 10, or `defaultRows` from config). |
| `--seed <n>` | Seed the random generator for reproducible data. |
| `--dry-run` | Print the SQL; make no changes to the database. |
| `--check` | Run the full seed inside the transaction, report the result, then roll back. Exit code 0 means a real run would succeed. |
| `--out <file>` | Write the INSERT statements to a file instead of a database. Keys are assigned by the tool (see Inputs, outputs and trust). |
| `--start-id <n>` | First integer key in file mode (default: 1). |
| `--schema-file <file>` | After version 1. Read the schema from a `pg_dump --schema-only` file instead of a live database. Also accepted by `inspect`. |
| `--snapshot <file>` | Read the schema from an `inspect --json` snapshot. Also accepted by `inspect`. |
| `--yes` | Skip the confirmation prompt for non-local hosts. |

**Global flags:** `-c, --config <path>` (default `./seed.config.ts`), `--database-url <url>`, `--schema <name>`, `--format <text|json>` (`--json` is shorthand), `--verbose`.

**Precedence:** CLI flags, then `seed.config.ts`, then the `DATABASE_URL` environment variable, then built-in defaults.

**Exit codes:**

| Code | Meaning |
| --- | --- |
| 0 | Success (or a clean dry run) |
| 1 | Runtime or database error; transaction rolled back |
| 2 | Usage or config error (bad flag, missing URL, invalid config) |
| 3 | Schema problem (unbreakable circular dependency, unsupported required column type) |

## Config schema

`seed.config.ts` is optional. It exists to override what introspection gets wrong: fixed values, custom generators, and tables to skip. `seed-db init` scaffolds it interactively. A plain default-exported object is valid. The scaffold uses a type-only import so the file also loads inside the compiled binary; npm installs can use an optional `defineSeedConfig` helper instead.

```ts
// seed.config.ts
import type { SeedConfig } from "seed-db"; // type-only: erased at runtime

export default {
  databaseUrl: process.env.DATABASE_URL,
  defaultRows: 50,
  seed: 42,
  tables: {
    users: {
      rows: 200,
      columns: {
        status: ({ faker }) => faker.helpers.arrayElement(["active", "suspended"]),
        tenant_id: "fixed-tenant-uuid-1234",
        age: { int: { min: 18, max: 90 } },
      },
    },
    _prisma_migrations: { ignore: true },
  },
} satisfies SeedConfig;
```

The types the tool exports:

```ts
export interface SeedConfig {
  databaseUrl?: string;                // default: the DATABASE_URL environment variable
  schema?: string;                     // default: "public"
  defaultRows?: number;                // default: 10
  seed?: number;                       // faker seed, same as --seed
  nullRate?: number;                   // 0..1, chance a nullable column is NULL (default 0.1)
  allowedHosts?: string[];             // hosts that skip the production prompt
  tables?: Record<string, TableConfig>;
}

export interface TableConfig {
  ignore?: boolean;                    // never touch this table
  rows?: number;                       // overrides defaultRows
  columns?: Record<string, ColumnRule>;
}

export type ColumnRule =
  | string | number | boolean | null   // constant value
  | { oneOf: Array<string | number | boolean>; weights?: number[] }
  | { int: { min: number; max: number } }
  | { float: { min: number; max: number; precision?: number } }
  | { faker: string }                  // dotted path, e.g. "internet.email"
  | ((ctx: GenContext) => unknown);

export interface GenContext {
  faker: Faker;
  index: number;                       // row number within this table
  row: Record<string, unknown>;        // columns already generated for this row
}
```

Validation happens at load time. An unknown table, an unknown column, or a rule whose type cannot fit the column exits with code 2 and names the offending key. Custom functions should use the supplied `faker` rather than `Math.random()`, because unseeded randomness breaks `--seed` reproducibility.

## Introspection

Introspection runs three read-only queries and builds one `Schema` object that every later stage consumes. Columns come from `information_schema`; keys come from `pg_catalog`, because `information_schema.key_column_usage` cannot reliably pair the columns of a composite foreign key and hides objects the role cannot own.

**1. Columns (base tables only):**

```sql
SELECT c.table_name, c.column_name, c.ordinal_position,
       c.data_type, c.udt_name,
       c.is_nullable = 'YES'          AS nullable,
       c.column_default,
       c.character_maximum_length, c.numeric_precision, c.numeric_scale,
       c.is_identity = 'YES'          AS is_identity,
       c.identity_generation,
       c.is_generated = 'ALWAYS'      AS is_generated
FROM information_schema.columns c
JOIN information_schema.tables t
  USING (table_schema, table_name)
WHERE c.table_schema = $1 AND t.table_type = 'BASE TABLE'
  AND NOT EXISTS (SELECT 1 FROM pg_class pc
                  JOIN pg_namespace pn ON pn.oid = pc.relnamespace
                  WHERE pn.nspname = c.table_schema
                    AND pc.relname = c.table_name AND pc.relispartition)
ORDER BY c.table_name, c.ordinal_position;
```

**2. Primary, unique, and foreign keys:**

```sql
SELECT con.conname AS name, con.contype AS type, rel.relname AS table_name,
  ARRAY(SELECT a.attname::text
        FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
        ORDER BY k.ord)::text[] AS columns,
  frel.relname AS ref_table,
  ARRAY(SELECT a.attname::text
        FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
        ORDER BY k.ord)::text[] AS ref_columns
FROM pg_constraint con
JOIN pg_class rel      ON rel.oid = con.conrelid
JOIN pg_namespace ns   ON ns.oid = rel.relnamespace
LEFT JOIN pg_class frel ON frel.oid = con.confrelid
WHERE ns.nspname = $1 AND con.contype IN ('p', 'u', 'f');
```

**3. Enum labels:**

```sql
SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
FROM pg_type t
JOIN pg_enum e      ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = $1
GROUP BY t.typname;
```

**The internal model:**

```ts
export interface Schema {
  name: string;
  tables: Table[];
  enums: Record<string, string[]>;      // typname -> labels
}

export interface Table {
  name: string;
  columns: Column[];
  primaryKey: string[];
  uniques: string[][];
  foreignKeys: ForeignKey[];
}

export interface Column {
  name: string;
  position: number;
  dataType: string;                     // information_schema data_type
  udtName: string;                      // underlying type, e.g. int4, _text
  nullable: boolean;
  hasDefault: boolean;
  identity: "always" | "by_default" | null;
  generated: boolean;                   // GENERATED ALWAYS AS (...) STORED
  maxLength?: number;
  precision?: number;
  scale?: number;
  isArray: boolean;
}

export interface ForeignKey {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  nullable: boolean;                    // true when every FK column is nullable
}
```

**Edge cases the introspector must handle:** views and materialized views are excluded; partition children are skipped so only the parent is seeded; a foreign key that points to another schema produces a warning and is treated as unresolvable (so the column must be nullable or configured); a table with no primary key is seeded but cannot serve as a parent.

`inspect --json` writes this `Schema` object to stdout. Those snapshots double as test fixtures, so the generator and sorter can be tested without a database.

## Dependency graph and ordering

Tables are nodes and each foreign key is an edge from child to parent. Parents are inserted first, so `users` is seeded before `orders` when `orders.user_id` references it. Ordering must be deterministic, or `--seed` cannot give reproducible output.

**Algorithm**

1. Build the graph from `Table.foreignKeys`, ignoring tables outside the run set (their parents are sampled from the database instead).
2. Remove self-edges (for example `employees.manager_id`) and record them separately.
3. Run Kahn's algorithm. Whenever several tables are ready, take them in alphabetical order.
4. If tables remain after Kahn finishes, they sit on or behind a cycle. Run Tarjan's strongly connected components to find the exact cycles for the error message.

**Handling cycles and self-references**

Primary keys are often assigned by the database (serial or identity), so a child row cannot reference a parent row of the same table until it has been inserted. The MVP uses one mechanism for both cases: **deferred foreign keys**.

| Situation | Behavior |
| --- | --- |
| Self-reference, FK nullable | Insert rows with the FK as NULL, then run a batched `UPDATE` that assigns parents from already-inserted keys. |
| Cycle between tables, at least one FK in the cycle is nullable | Pick the nullable edge (alphabetical tie-break), insert with NULL, then `UPDATE` after the cycle's tables are done. |
| Cycle where every FK is NOT NULL | Cannot be satisfied by insertion order. Exit code 3, print the cycle as `a -> b -> c -> a`, and suggest making one column nullable or deferring the constraint in the database. |

**Output of this stage:** an ordered list of tables, plus a list of deferred FKs to patch after inserts. `inspect` prints both, so users can see the plan before anything runs.

## Generation engine

For every column the engine picks exactly one source, in a fixed priority order, so the result is predictable and `inspect` can show the choice.

**Resolution order per column**

1. **Skip.** Identity-always columns, generated columns, and database-assigned primary keys (serial, identity, or a default like `gen_random_uuid()`) are left out of the INSERT so the default fires. Keys come back through `RETURNING`.
2. **Config rule** from `seed.config.ts`.
3. **Foreign key.** Draw from the parent key pool (below).
4. **Semantic match** on the column name.
5. **Type mapping.**
6. **Null roll.** A nullable column with no default becomes NULL with probability `nullRate` (default 0.1). Foreign key columns are never rolled to NULL unless the FK is nullable and the config asks for it.

A column with none of these (an unsupported type, NOT NULL, no default) stops the run with exit code 3 and a hint to add a config rule.

**Type mapping**

| Postgres type | Generator |
| --- | --- |
| `smallint`, `integer`, `bigint` | `faker.number.int`, bounded to the type's range and capped at 100,000 |
| `numeric(p,s)`, `real`, `double precision` | `faker.number.float`, respecting precision and scale |
| `text` | `faker.lorem.sentence` |
| `varchar(n)`, `char(n)` | `faker.lorem.words`, truncated to `n` |
| `boolean` | `faker.datatype.boolean` |
| `timestamp`, `timestamptz` | `faker.date.past` (one year) |
| `date`, `time` | Derived from the same date generator |
| `uuid` | `faker.string.uuid` |
| `json`, `jsonb` | A small object with one or two string fields |
| enum | A random label from the enum |
| array types | One to three elements using the element type's generator |
| `inet` | `faker.internet.ipv4` |
| `bytea` | A few random bytes |

**Semantic mapping**

Matching is case-insensitive, on the whole column name first and then on a suffix (`billing_email` matches `email`). A semantic generator applies only when its output fits the column type; otherwise the engine falls back to type mapping. Output is truncated to `maxLength`.

| Column name | Generator |
| --- | --- |
| `email` | `faker.internet.email` |
| `first_name`, `last_name`, `full_name`, `name` | `faker.person.*` |
| `username`, `handle` | `faker.internet.username` |
| `phone` | `faker.phone.number` |
| `avatar_url`, `image_url` | `faker.image.avatar` |
| `url`, `website` | `faker.internet.url` |
| `address`, `city`, `country`, `zip`, `postal_code` | `faker.location.*` |
| `company`, `title`, `description`, `bio` | `faker.company.name`, `faker.person.jobTitle`, `faker.lorem.paragraph` |
| `price`, `amount`, `total` | `faker.finance.amount` |
| `slug` | `faker.lorem.slug` |
| `created_at`, `updated_at` | Date generator, with `updated_at` never earlier than `created_at` |

A column named `password` or `password_hash` gets a random string. It is not a real hash, so seeded accounts cannot be logged into; the docs should say this and show a config rule for users who need working logins.

**Relationships.** Each parent table keeps an in-memory pool of its inserted primary keys. A child foreign key draws uniformly from the pool. A foreign key that is also unique (one-to-one) draws without replacement and errors if parents run out. A composite foreign key copies all of its columns from one parent row so the pair always matches. If a parent table is not in the run set, the pool is loaded with `SELECT <pk> FROM parent LIMIT 10000`; an empty parent with a NOT NULL foreign key stops the run and names the table to seed first.

**Constraints.** NOT NULL is always honored. Unique and composite-unique columns track used values in a set, retry up to 50 times, then append a counter; if that still fails the run stops with the column name. Check constraints are not parsed in the MVP, so a violation surfaces as a database error that names the constraint, and the fix is a config rule.

**Determinism.** The faker instance is seeded from `--seed` (or `seed` in config) and tables are generated in the sorted order, so a fixed seed always gives identical data.

## Execution and safety

Everything runs inside one transaction, so the database ends up fully seeded or untouched.

**Order of operations inside `run`:**

1. Connect and, for a non-local host, ask for confirmation (see the production guard below).
2. `BEGIN`.
3. For each table in sorted order: generate rows, insert in batches with `RETURNING` on the key columns, and add the returned keys to the parent pool.
4. Run the deferred-FK `UPDATE` pass for self-references and cycles.
5. `COMMIT`. Any error anywhere triggers `ROLLBACK` and exit code 1.

**Batching.** Rows go in as multi-row `INSERT ... VALUES` statements. Postgres allows at most 65,535 bind parameters per statement, so the batch size is `min(1000, floor(65000 / columnCount))`. A table with 50 columns therefore inserts 1,000 rows per statement; one with 100 columns inserts 650.

**Dry run.** `--dry-run` never opens a write path. It prints the statements in execution order. Because database-assigned keys are unknown without inserting, the dry run substitutes placeholder keys (sequential integers, or generated UUIDs) and labels the output as illustrative for those columns. Everything else, including generated values, is exactly what a real run with the same `--seed` would produce.

**Check mode.** `--check` runs the full sequence inside the transaction, including the deferred pass, reports row counts per table, and then issues `ROLLBACK` instead of `COMMIT`. It verifies constraints, foreign keys, and uniqueness against the real database. Exit code 0 means a real run with the same flags and seed would succeed.

**Production guard.** If the connection host is not `localhost`, `127.0.0.1`, `::1`, or listed in `allowedHosts`, `run` prints the host and database name and asks for confirmation. In a non-interactive shell it refuses unless `--yes` is passed. `--dry-run` skips the prompt.

**Failure output.** A failure reports the table, the batch number, the Postgres error code, the constraint name, and Postgres's detail line, plus a one-line hint (for example, "add a rule for `orders.status` in seed.config.ts"). Row data is not printed by default; `--verbose` adds it.

**Progress.** One line per table with a spinner and a final row count, drawn with `@clack/prompts`. When stdout is not a terminal the spinner is replaced by plain log lines, so CI logs stay readable.

**Re-running on a seeded database.** The MVP does not clean existing data. A unique-constraint collision with rows from a previous run rolls the transaction back with a clear message. A `--truncate` flag is planned after the MVP because it is destructive and needs its own safeguards.

## Testing, edge cases and risks

Testing rests on two layers: fast unit tests that need no database, and integration tests against a real Postgres, since most MVP bugs will be about how Postgres actually behaves.

**Unit tests (`bun test`):** topological sort and cycle reporting, semantic name matching, type-to-generator mapping, config validation, batch-size calculation, and determinism (same seed, same output). These run from saved `inspect --json` snapshots.

**Integration tests:** a Postgres container started by the test run, loaded with fixture schemas, then seeded and checked. Each fixture targets a known hard case:

| Fixture | What it proves |
| --- | --- |
| `blog` (users, posts, comments) | The basic three-level parent chain |
| `shop` (orders, items, products, enums) | Many-to-one fan-out, enums, numeric precision |
| `employees` | Self-referencing nullable FK |
| `cycle_nullable`, `cycle_strict` | Deferred-FK update pass; exit code 3 with the cycle printed |
| `composite` | Composite PK and composite FK stay consistent |
| `uniques` | Unique and composite-unique columns at 10,000 rows |
| `types` | Arrays, jsonb, uuid, bytea, inet, timestamptz |
| `identity` | `GENERATED ALWAYS` identity and generated columns are skipped |

Every integration test asserts three things: no constraint errors, every foreign key resolves, and a forced failure leaves the tables empty. A CI job also compiles the binary and runs `seed-db --version` and one dry run against it, so packaging problems are caught before release.

**Risks and mitigations**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Config file imports `seed-db` and fails inside the compiled binary, which has no `node_modules` | Config would not load for binary users | Use `import type` only (erased at runtime); verify in the Milestone 0 spike |
| PGlite does not run under Bun or inside the compiled binary, or lacks an extension the schema uses | Schema files and offline checks would not work | Deferred with the schema-file input (after version 1); then verify and fall back to requiring a throwaway Postgres (Docker) for schema files; name the missing extension in the error |
| Client-assigned keys in file mode collide with existing rows | The SQL file fails on apply | Document the empty-tables assumption; offer `--start-id`; keep `RETURNING` for live mode |
| Faker renames APIs between major versions | Broken generators after an upgrade | Pin the major version; the type-mapping tests call every generator |
| Check constraints are not parsed | Database rejects a generated value | Clear error naming the constraint; config rule as the fix; parsing simple checks after the MVP |
| Unique value exhaustion on small domains (booleans, enums, short strings) | Run stops partway | Retry then counter suffix; clear error naming the column |
| Very large tables (millions of rows) | Memory pressure from key pools | Pools hold keys only, and sampling caps parent pools at 10,000 |
| Triggers, row-level security, or partitioned tables | Unexpected rejections or skipped rows | Documented limitation; partition children skipped; errors surface Postgres detail |
| `postgres.js` behavior under Bun | Driver quirks | Verify connection, transactions, and large batches in the Milestone 0 spike |

## Milestones and build order

Build in seven milestones, in order, and do not start one until the previous gate passes.

[embedded content: build roadmap · 7 milestones, each with a gate]

For version 1, M0 tests postgres.js batches and the compiled binary only; the PGlite check in the diagram above moves to after version 1. M0 is the only milestone that can change the plan: if the compiled binary cannot load a config file, the config format changes before M1. After that, each milestone feeds the next: the Schema model from M2 drives ordering, and the key pools from M4 drive execution.

## Open decisions

The scoped name `@mariiodegen/seed-db` is published as a `0.0.1` placeholder. The unscoped `seed-db` was unregistered when last checked (Oct 4, 2026) and can be reserved the same way. Seven choices remain before Milestone 1. Each has a recommendation already built into this plan, so only the ones you disagree with need discussion.

| Decision | Recommendation | Reasoning |
| --- | --- | --- |
| Cycle handling | Keep deferred foreign keys for self-references and nullable cycles in live mode; exit with an error only on strict cycles | `employees.manager_id` is common. Erroring on any cycle is simpler and easy to switch to, but blocks those schemas |
| Introspection source | `pg_catalog` for keys, `information_schema` for columns | Correct composite foreign keys; used in this plan |
| Key strategy | Database-assigned keys with `RETURNING` in live mode; client-assigned keys in file mode. Revisit a single strategy after Milestone 5 | File mode cannot use `RETURNING`. Two strategies double the surface for key bugs, so both need fixtures |
| Schema-file engine | Deferred past version 1. Then PGlite, replaying the file and reusing the introspection queries | Avoids a hand-written DDL parser. Depends on its own spike after version 1; the fallback is a user-supplied throwaway Postgres |
| Default row count | 10 per table, changed with `defaultRows` or `-r` | Fast enough to run on every change, including in CI |
| Binary name | Package `seed-db`, command `seed-db`; consider a shorter alias | A long command is typed in every CI script and README |
| License and telemetry | MIT, no telemetry | Lowest friction for adoption in company environments |
