// M0 spike: the batched-transaction probe, as a reusable function.
import postgres from "postgres";

export const TOTAL = 20_000;
export const BATCH = 1000;
export const BATCHES = TOTAL / BATCH;

export interface ProbeResult {
  insertMs: number;
  remainingAfterRollback: number;
  passed: boolean;
}

export async function runProbe(connUrl: string): Promise<ProbeResult> {
  const sql = postgres(connUrl);

  await sql`drop table if exists probe`;
  await sql`create table probe (num integer primary key, label text)`;

  let insertMs = 0;
  try {
    await sql.begin(async (tx) => {
      const t0 = performance.now();
      for (let b = 0; b < BATCHES; b++) {
        const rows = [];
        for (let i = 0; i < BATCH; i++) {
          rows.push({ num: b * BATCH + i, label: `row-${b}-${i}` });
        }
        await tx`insert into probe ${sql(rows)}`;
      }
      insertMs = performance.now() - t0;

      // Simulated failure: rollback must undo all rows.
      throw new Error("SIMULATED_FAILURE");
    });
  } catch (e) {
    if (e?.message !== "SIMULATED_FAILURE") throw e;
  }

  const [{ count }] = await sql`select count(*)::int as count from probe`;
  await sql.end();

  return {
    insertMs,
    remainingAfterRollback: count,
    passed: count === 0,
  };
}