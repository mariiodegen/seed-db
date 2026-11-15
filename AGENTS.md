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

- Only `introspect/` and `execute/` will touch the database in the real tool; keep
  logic pure elsewhere. (Design rule: "thin edges, pure core".)
- Never commit secrets. Use a `.env` for local connection strings and keep it ignored.
- Do not commit unless the owner asks.
