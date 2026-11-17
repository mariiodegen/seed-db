import { test, expect } from "bun:test";
import { SeedError, formatError } from "./errors";

const unsupportedType = new SeedError({
  code: "E_UNSUPPORTED_TYPE",
  where: "orders.total",
  cause: 'No generator exists for type "money", and the column is NOT NULL.',
  fix: "Add a rule for orders.total in seed.config.ts",
  exit: 3,
});

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");

test("text format is readable by a person", () => {
  const formatted = stripAnsi(formatError(unsupportedType, "text"));
  expect(formatted).toBe(
    'error E_UNSUPPORTED_TYPE  orders.total\n' +
      '  No generator exists for type "money", and the column is NOT NULL.\n' +
      "  Fix: Add a rule for orders.total in seed.config.ts",
  );
});

test("json format is one object for scripts", () => {
  expect(JSON.parse(formatError(unsupportedType, "json"))).toEqual({
    error: {
      code: "E_UNSUPPORTED_TYPE",
      where: "orders.total",
      cause: 'No generator exists for type "money", and the column is NOT NULL.',
      fix: "Add a rule for orders.total in seed.config.ts",
      exit: 3,
    },
  });
});

test("the exit code is kept", () => {
  expect(unsupportedType.exit).toBe(3);
});