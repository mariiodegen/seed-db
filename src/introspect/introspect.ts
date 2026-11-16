import postgres from "postgres";
import { SeedError } from "../errors";
import { assembleSchema } from "./assemble";
import { queryColumns, queryConstraints, queryEnums } from "./queries";
import type { Schema } from "./types";

export interface IntrospectOptions {
  databaseUrl: string;
  schema?: string;
  timeoutSeconds?: number;
}

export async function introspectDatabase(options: IntrospectOptions): Promise<Schema> {
  const schemaName = options.schema ?? "public";
  const timeout = options.timeoutSeconds ?? 5;

  let sql: ReturnType<typeof postgres>;

  try {
    sql = postgres(options.databaseUrl, {
      connect_timeout: timeout,
      max: 1,
    });
  } catch (err) {
    throw new SeedError({
      code: "E_CONNECTION_FAILED",
      where: options.databaseUrl.replace(/:[^:@]+@/, ":****@"), // redact password
      cause: err instanceof Error ? err.message : String(err),
      fix: "Check that your DATABASE_URL is valid.",
      exit: 1,
    });
  }

  try {
    // Run the three catalog queries in parallel
    const [rawColumns, rawConstraints, rawEnums] = await Promise.all([
      queryColumns(sql, schemaName),
      queryConstraints(sql, schemaName),
      queryEnums(sql, schemaName),
    ]);

    return assembleSchema(schemaName, rawColumns, rawConstraints, rawEnums);
  } catch (err) {
    if (err instanceof SeedError) throw err;

    throw new SeedError({
      code: "E_INTROSPECTION_FAILED",
      where: `schema "${schemaName}"`,
      cause: err instanceof Error ? err.message : String(err),
      fix: `Ensure PostgreSQL is running and user has SELECT permissions on "${schemaName}".`,
      exit: 1,
    });
  } finally {
    await sql.end({ timeout: 2 });
  }
}
