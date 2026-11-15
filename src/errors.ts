// One error type for the whole tool.
// Every failure carries: a stable code, where it happened, the cause, a fix, and an exit code.

export type ExitCode = 1 | 2 | 3;

export interface SeedErrorOptions {
  code: string; // e.g. "E_UNSUPPORTED_TYPE"
  where: string; // e.g. "orders.total"
  cause: string; // what happened, in plain words
  fix: string; // one concrete next step
  exit: ExitCode; // 1 runtime, 2 usage/config, 3 schema
}

export class SeedError extends Error {
  readonly code: string;
  readonly where: string;
  readonly cause: string;
  readonly fix: string;
  readonly exit: ExitCode;

  constructor(opts: SeedErrorOptions) {
    super(`${opts.code} ${opts.where}: ${opts.cause}`);
    this.name = "SeedError";
    this.code = opts.code;
    this.where = opts.where;
    this.cause = opts.cause;
    this.fix = opts.fix;
    this.exit = opts.exit;
  }
}

// Two ways to show the same error: for a person (text) or for a script (json).
export function formatError(err: SeedError, format: "text" | "json"): string {
  if (format === "json") {
    return JSON.stringify({
      error: {
        code: err.code,
        where: err.where,
        cause: err.cause,
        fix: err.fix,
        exit: err.exit,
      },
    });
  }

  return `error ${err.code}  ${err.where}\n  ${err.cause}\n  Fix: ${err.fix}`;
}