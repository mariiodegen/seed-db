# AGENTS.md

Instructions for AI agents working in this repository. Read this first, every session.

## The most important rule: this is a learning project

The owner is learning. The goal is understanding, not just working code. Every reply
must teach.

- **Explain the concept first.** Before or while doing something, explain what it is,
  why it exists, and how it works, in simple words.
- **Explain the why of every design choice.** Not just "do X", but "X because Y".
- **Teach over doing.** Show the command or the code, then break it down.
- **No unexplained jargon.** Define a term the first time it appears.
- **Small steps, then pause.** Stop at each gate and invite questions.
- **Prefer showing the mechanism.** When something is a black box (Docker, a compiled
  binary, a transaction), open it up so the owner sees what is actually happening.
- Keep it simple. Short sentences. Concrete examples.

## Project: seed-db

A terminal tool that reads a live PostgreSQL schema, works out table dependencies,
and fills the tables with realistic fake data in the right order, all-or-nothing.
Two documents describe it:

- `docs/PLAN.md` and `docs/seed-db-full-plan.pdf` — the full spec (mission, MVP scope, error
  contract, CLI surface, config types, SQL queries, data model, milestones, risks).
- `docs/seed-db-build-guide.pdf` — a shorter summary guide.

## Historical Spike (M0)

The throwaway spike proved that Bun + postgres.js + a compiled binary work together, and a compiled binary can load a TS config file (type-only import). Having served its purpose, the disposable `spike/` sandbox was removed after Milestone 7 verification.

## Key facts

- Runtime/tooling: **Bun** (runs TypeScript directly, compiles to a single binary).
- Database driver: **postgres.js**.
- Target DB: PostgreSQL 16 in Docker on port **5433** (port 5432 is taken by a local
  PostgreSQL 14 on this machine).
- Language: TypeScript, strict mode.
- `docs/LEARNING.md` is the owner's running study journal. Add a section whenever a new
  concept is introduced, written for a learner.

## Ways of working

- **Proactively update documentation (.md files) without being reminded.**
  Whenever an architectural pattern, design decision, security contract, or trade-off is discussed or implemented:
  - **`docs/DESIGN.md` (Architecture Reference):** Keep it clean, structured, and scannable with diagrams, tables, decisions to defend, pros and cons, and tradeoffs.
  - **`docs/LEARNING.md` (Study Journal):** Detailed, pedagogical, and deeply educational. Must explain complex topics in depth using simple words, intuitive analogies, and step-by-step mechanisms. Never condense it into bare bullet summaries; it exists to teach someone who is learning systems engineering from scratch.
  - Keep documentation synchronized immediately at each step without waiting for the owner to ask.
- Only `introspect/` and `execute/` will touch the database in the real tool; keep
  logic pure elsewhere. (Design rule: "thin edges, pure core".)
- Never commit secrets. Use a `.env` for local connection strings and keep it ignored.
- Regularly commit and push clean code and tests via SSH.

## Current phase

- **M0 (Spike) — COMPLETE.** Bun + postgres.js + compiled binary + TS config loaded.
- **M1 (Skeleton, Errors, Config) — COMPLETE.** SeedError, CLI skeleton, 4-tier precedence loader, `init` command.
- **M2 (Introspect & Schema Model) — COMPLETE.** 3 catalog queries, pure schema assembly, `inspect` live & snapshot modes.
- **M3 (Dependency Graph & Ordering) — COMPLETE.** Kahn's algorithm, distinct in-degrees, tie-breaking, cycle breaking, deferred FKs.
- **M4 (Generation Engine & Resolution) — COMPLETE.** 6-tier waterfall, `@faker-js/faker` deterministic seeding, semantic dictionary, type mapping, parent `KeyPool` sampling, uniqueness retry loop, custom config rules.
- **M5 (Execution Engine & Modes) — COMPLETE.** Dynamic batching math, single transaction atomicity with automatic rollback, parent `KeyPool` collection via `RETURNING`, two-phase patch pass for deferred FKs, `--dry-run`, `--check` (transaction rollback verification), and `--out` (standalone SQL script generation).
- **M6 (Integration Testing & Schema Fixtures) — COMPLETE.** 10 integration tests against live PostgreSQL 16 container across 9 hard fixture schemas (`blog`, `shop`, `employees`, `cycle_nullable`, `cycle_strict`, `composite`, `uniques`, `types`, `identity`, `check_mode`). Hermetic schema isolation with `DROP ... CASCADE`. 100% referential integrity and constraint checks verified. 63 total tests passing.
- **M7 (Packaging, Standalone Compilation & Release Verification) — COMPLETE.** Single-file native ELF binary compiled via `bun build --compile --minify --outfile dist/seed-db src/index.ts`. Standalone execution verified (`--version`, `--help`, `--dry-run`, live `--check`, dynamic `seed.config.ts` loading, exit code 2 contract). 68 total tests passing across 11 test suites.

## Project Status

**MVP COMPLETE (Milestones 0 through 7).** All architectural invariants, topological graph ordering, 6-tier column resolution waterfall, dynamic batching math, production safety guards, and live database verification contracts are fully implemented, tested, and verified. Ready for version tagging and distribution.
