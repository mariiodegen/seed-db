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

## Current phase

**M0 — the throwaway spike — COMPLETE.** Proved that Bun + postgres.js + a
compiled binary work together, and a compiled binary can load a TS config file
(type-only import). Spike code lives in `spike/` and is disposable; `spike/
FINDINGS.md` records the results and the decision: keep the TypeScript config
format. Product code (`src/`) has not started.

## Next phase

**M1 — Skeleton and errors.** SeedError type + text/JSON printer, the three
commands (init, inspect, run) with commander (each printing "not built yet"),
the config loader (flags > file > env > defaults), config checks with exit 2,
`init` writes a starter config, unit-test the merge order and error output.

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

## Next phase

**M5 — Execution engine & Live Seeding.** Multi-row batching formula ($\min(1000, \lfloor 65000 / \text{cols} \rfloor)$), single transaction `BEGIN ... COMMIT` with automatic `ROLLBACK`, parent `KeyPool` collection via `RETURNING`, two-phase patch pass for deferred FKs, `--dry-run`, `--check` (transaction rollback verification), and `--out` (SQL script generation with sequential keys & `setval`).
