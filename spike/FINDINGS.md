# M0 — Spike Findings

Date: Oct 12, 2026 · Environment: Linux, Bun 1.4.3, postgres.js 3.4.9, Postgres 16.15 in Docker

## Question M0 set out to answer

Do Bun + postgres.js + a compiled binary work together, and can a compiled
binary load a config file? If not, the tech stack or the config format changes.

## Results

| Test | Result |
| --- | --- |
| `bun run` executes TypeScript directly | PASS — no build step needed |
| postgres.js batched insert under Bun (20,000 rows / 1,000-row batches) | PASS |
| Transaction rollback (simulated failure, then count) | PASS — 0 rows survive |
| `bun build --compile` produces a native binary | PASS — single ELF executable |
| Compiled binary loads `seed.config.ts` (type-only import) | PASS |
| Binary runs in a folder with no `node_modules`, empty `PATH` (`env -i`) | PASS |

## Measurements (throwaway numbers, not benchmarks)

| Run | Wall time |
| --- | --- |
| `bun run` script, first probe | 407 ms |
| Compiled binary (spike dir) | 217 ms |
| Compiled binary (second build) | 223 ms |
| Compiled binary in clean dir, empty env | 179 ms |

The MVP target is 10,000 rows per table in under 30 s, so the batch path is
not a bottleneck.

Binary size: ~91 MB (bundles the Bun runtime).

## Decisions this spike settles

1. **Keep TypeScript config, no JSON fallback.** The compiled binary loaded
   `seed.config.ts` from the current folder using only a type-only import
   (`import type { SeedConfig } from "seed-db"`). The binary must resolve no
   package imports at runtime, so it works without `node_modules`.
2. **Batch formula is on solid ground.** 1,000 rows × 2 columns = 2,000 bind
   parameters per statement — comfortably under Postgres's 65,535 limit.
3. **One transaction, one commit.** `sql.begin` + a thrown error rolled back
   all 20,000 rows cleanly. The "never leave a mess" design rule is feasible.

## Environment notes for later

- Docker Hub pull failed once with a TLS timeout. The Docker daemon uses its
  own DNS (`8.8.8.8`, `1.1.1.1` in `/etc/docker/daemon.json`), separate from
  the host resolver. Retrying worked.
- Native Postgres 14 owns host port 5432; the spike's Postgres 16 container
  maps host 5433 → container 5432.

## Not tested here (deferred or later milestones)

- PGlite (schema-file input) — explicitly deferred past version 1.
- commander, faker, semantic mapping, the config precedence merge.
- The full 65,535-parameter ceiling with wide tables.