# LEARNING.md

A running study journal for the seed-db project. Each section explains one concept in
plain words: what it is, why it exists, and how it works here. Newest concepts are
added as we go.

---

## How to read this journal

Each entry answers three questions:

1. **What is it?** A plain-language definition.
2. **Why do we care?** The problem it solves for seed-db.
3. **How does it work here?** The concrete commands or code we used.

---

## Concepts index

| # | Concept | Where it came up |
| - | ------- | ---------------- |
| 1 | The M0 spike | Build plan |
| 2 | Bun (runtime + compiler) | Phase A0 |
| 3 | Git and `.gitignore` | Phase A1 |
| 4 | postgres.js (the driver) | Phase A2 |
| 5 | Docker & containers | Phase B |
| 6 | Docker Compose | Phase B |
| 7 | Ports and port mapping | Phase B |
| 8 | The Docker daemon vs the host | Phase B |
| 9 | Database transactions | Phase C1 |
| 10 | Batched inserts & bind-parameter limit | Phase C1 |
| 11 | Compiled binaries | Phase C2 |
| 12 | Loading a config file (type-only imports) | Phase C3 |

---

## 1. The M0 spike

**What.** A *spike* is a small, throwaway program written only to answer a yes/no
question about something risky. The code is not kept; the knowledge is.

**Why.** Building a feature on top of an assumption that later proves false wastes
work. It is cheaper to test the assumption first, in isolation.

**How here.** The riskiest assumption for seed-db is: *Bun + postgres.js + a compiled
binary work together, and a compiled binary can load a config file.* If that is false,
the tech choices change. So M0 (`spike/`) tests exactly that, with no real features.

## 2. Bun (runtime + compiler)

**What.** A runtime is the program that executes JavaScript/TypeScript. Bun is a newer,
faster runtime than Node.js. It can also *bundle* and *compile*.

**Why.** Two features matter for seed-db: (a) it runs `.ts` files directly, so there is
no separate "build the TypeScript" step while developing; (b) `bun build --compile`
turns the whole program into one file users can run without installing anything. The
catch: Bun is newer, so some libraries may misbehave — which is why M0 exists.

**How here.** Installed with the official script to `~/.bun/bin/bun` (version 1.4.3).
The script also added `~/.bun/bin` to `PATH` in `~/.bashrc`, so the `bun` command
resolves.

## 3. Git and `.gitignore`

**What.** Git is version control: it saves snapshots ("commits") of your files so you
can see history and undo changes. `.gitignore` is a list of paths Git is told to
pretend do not exist.

**Why.** We ignore three kinds of thing: downloaded dependencies (`node_modules/`,
huge and restorable), build output (`dist/`, regenerated on demand), and secrets
(`.env`). Committing those would bloat the repo and risk leaking credentials.

**How here.** `git init -b main` created the repo. `.gitignore` ignores `node_modules/`,
`dist/`, `.env`, logs, and OS junk. The first snapshot is commit `1afef0e`.

## 4. postgres.js (the driver)

**What.** A *driver* is a library that speaks PostgreSQL's wire protocol: it turns your
function calls into SQL sent over the network, and turns the results back into
JavaScript values.

**Why.** It is the bridge between the tool and the database. In the finished tool it is
"thin edge" code: only `introspect/` and `execute/` use it. It was chosen for being
small, fast, and simple at transactions and bulk inserts.

**How here.** `bun add postgres` installed `postgres@3.4.9` into `spike/` and wrote a
lockfile so the exact version is reproducible.

## 5. Docker & containers

**What.** A container is a lightweight, isolated box that holds a program plus
everything it needs (its own filesystem and network). Think of it as a tiny disposable
computer on your machine, sharing the host's kernel.

**Why here.** Your machine already has a native Postgres 14 running as a systemd
service on port 5432. Installing Postgres 16 natively would fight it for ports and
config. A container is isolated (can't touch the native one), disposable, and easy to
delete or recreate.

**How here.** `docker compose up -d` pulled the `postgres:16` image and started the
container. `docker inspect` reported it `healthy`. One surprise: pulling failed once
with a TLS timeout — the daemon uses its own DNS (`8.8.8.8`, `1.1.1.1` from
`/etc/docker/daemon.json`), separate from the system's resolver, so network glitches
can differ between your shell and the daemon.

## 6. Docker Compose

**What.** Compose reads one file, `docker-compose.yml`, describing one or more
containers and starts them all with one command. Instead of a long `docker run ...`
line, the setup is a readable, committable file.

**Why.** Reproducible: anyone (or CI) can recreate the exact same database setup with
two commands. No remembering flags.

**How here.** `spike/docker-compose.yml` defines one service `postgres` with the
image, environment, port mapping, named volume, and healthcheck. `docker compose up
-d` started it; `docker compose down -v` would stop it and delete the data volume.

## 7. Ports and port mapping

**What.** A port is a numbered door for network traffic (Postgres speaks on 5432).
Port mapping lets a container listen on a different *host* port than its internal one.

**Why here.** Native Postgres 14 owns host 5432, so the container maps host 5433 →
container 5432 (`"5433:5432"`). We connect to `localhost:5433`; inside the container
Postgres just hears 5432.

**Also learned.** `down` (without `-v`) deletes the *container* but keeps the named
volume — the data survives. `down -v` also removes the volume. So "start fresh":
`docker compose down -v && docker compose up -d`. On `up`, the volume is empty, so
Postgres runs first-time initialization and creates the `seed` user/db from the
`environment:` block.

## 8. The Docker daemon vs the host

**What.** Docker has two parts: the *client* (`docker` commands you type) and the
*daemon* (`dockerd`, a background service doing the real work). They can even be on
different machines. The daemon's network is its own: it uses the DNS servers listed in
`/etc/docker/daemon.json`, not necessarily your machine's resolver.

**Why it matters.** A pull that fails in Docker might succeed from your browser, and
vice versa. When diagnosing network problems, check the daemon's config, not just the
host's.

## 9. Database transactions

**What.** A transaction groups several statements into one all-or-nothing
unit. Either every statement takes effect (`COMMIT`), or none do (`ROLLBACK`).
What one statement sees during a transaction is isolated from everyone else.

**Why.** This is the seed-db "all or nothing" design rule: a failed seed must
leave the database exactly as it was, never half-seeded. Also: one commit at
the end is far faster than committing after every row.

**How here.** postgres.js's `sql.begin(async (tx) => { ... })`: the driver sends
`BEGIN`, runs your statements, and then COMMITs on a normal return or ROLLBACKs
on a thrown error. The probe inserted 20,000 rows, deliberately threw a
`SIMULATED_FAILURE`, and the table read 0 rows afterwards — proof the rollback
undid everything.

## 10. Batched inserts & the bind-parameter limit

**What.** A batch is one statement that inserts many rows:
`INSERT ... VALUES (...),(...),...`. Postgres accepts at most **65,535 bind
parameters** (numbered `$1,$2,...` placeholders) in one statement.

**Why.** Twenty thousand one-row inserts = 20,000 network round-trips (slow).
Twenty batches = 20 round-trips (fast). The plan's formula keeps batches under
the ceiling: `min(1000, floor(65000 / columnCount))`.

**How here.** The probe used 20 batches of 1,000 rows × 2 columns = 2,000
parameters each — comfortably under the limit. 20,000 rows took ~180–400 ms.

## 11. Compiled binaries

**What.** `bun build --compile` bundles your code *plus the Bun runtime* into a
single native executable. Postgres.js is bundled in too. The result runs with no
Node, no Bun, and no dependencies installed.

**Why.** Distribution: a stranger with "nothing installed" can run the tool
(seed-db's release goal). The `node_modules` folder does not need to exist.

**How here.** `bun build --compile ./src/cli.ts --outfile dist/seed-db-spike`
produced an `ELF 64-bit` executable (~91 MB). It ran from a clean folder with an
empty `PATH` (`env -i`), connected to Postgres, and passed the probe.

## 12. Loading the config (type-only imports)

**What.** A config file in TypeScript. `import type { SeedConfig } from
"seed-db"` is a *type-only* import: TypeScript erases it entirely at runtime, so
the compiled file has no import to resolve. The binary loads the file with a
runtime `import()` of its path, runs through Bun's transpiler, and reads the
`default` export.

**Why.** This decides the config format. If the binary could not load TypeScript,
the plan said "switch config to JSON". It worked, so the config stays `.ts`.

**How here.** `seed.config.ts` exports a plain object `satisfies SeedConfig`.
`cli.ts` builds a `pathToFileURL` for it in the current folder and imports it;
the logs showed `config loaded: {"defaultRows":50,"seed":42}` both in the spike
folder and in a clean folder with no dependencies.
