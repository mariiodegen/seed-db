import { confirm, isCancel } from "@clack/prompts";
import { SeedError } from "../errors";

export interface HostInfo {
  host: string;
  database: string;
}

/**
 * Extracts host and database name from a connection URL, with safe fallbacks.
 */
export function extractHostInfo(databaseUrl: string): HostInfo {
  try {
    const parsed = new URL(databaseUrl);
    const database = parsed.pathname.replace(/^\//, "") || "unknown";
    return {
      host: parsed.hostname || "unknown",
      database,
    };
  } catch {
    return {
      host: "unknown",
      database: "unknown",
    };
  }
}

/**
 * Determines whether the specified host is considered local/safe without confirmation.
 */
export function isLocalHost(host: string, allowedHosts: string[] = []): boolean {
  const normalized = host.toLowerCase().trim();
  if (["localhost", "127.0.0.1", "::1", ""].includes(normalized)) {
    return true;
  }
  return allowedHosts.some((h) => h.toLowerCase().trim() === normalized);
}

/**
 * Ensures user is warned and confirms before seeding any non-local/production database.
 */
export async function assertProductionSafety(
  databaseUrl: string,
  allowedHosts: string[] = [],
  yesFlag = false
): Promise<void> {
  const { host, database } = extractHostInfo(databaseUrl);

  // Localhost and allowedHosts are immediately safe
  if (isLocalHost(host, allowedHosts)) {
    return;
  }

  // If --yes flag was explicitly passed, proceed
  if (yesFlag) {
    return;
  }

  // Non-interactive shell (CI or pipe): refuse unless --yes is passed
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isInteractive) {
    throw new SeedError({
      code: "E_PROD_GUARD",
      where: `${host}/${database}`,
      cause: `Refusing to seed non-local database "${database}" on host "${host}" in non-interactive environment without --yes flag.`,
      fix: `Pass the --yes flag to confirm seeding this database: seed-db run --yes`,
      exit: 2,
    });
  }

  // Interactive prompt using @clack/prompts
  const shouldProceed = await confirm({
    message: `Target database "${database}" on host "${host}" is not local. Proceed with seeding?`,
    initialValue: false,
  });

  if (isCancel(shouldProceed) || !shouldProceed) {
    throw new SeedError({
      code: "E_PROD_GUARD",
      where: `${host}/${database}`,
      cause: "Operation cancelled by user.",
      fix: "Run again when ready, or target a local development database.",
      exit: 2,
    });
  }
}
