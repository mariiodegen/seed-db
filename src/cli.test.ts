import { test, expect, describe } from "bun:test";
import { createProgram, isJsonRequested } from "./cli";

describe("CLI skeleton", () => {
  test("program has expected metadata and commands", () => {
    const program = createProgram();
    expect(program.name()).toBe("seed-db");

    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain("init");
    expect(commands).toContain("inspect");
    expect(commands).toContain("run");
  });

  test("global options are registered", () => {
    const program = createProgram();
    const optionNames = program.options.map((opt) => opt.long);

    expect(optionNames).toContain("--config");
    expect(optionNames).toContain("--database-url");
    expect(optionNames).toContain("--schema");
    expect(optionNames).toContain("--format");
    expect(optionNames).toContain("--json");
    expect(optionNames).toContain("--verbose");
  });

  test("run command options are registered", () => {
    const program = createProgram();
    const runCmd = program.commands.find((c) => c.name() === "run");
    expect(runCmd).toBeDefined();

    const runOptionNames = runCmd!.options.map((opt) => opt.long);
    expect(runOptionNames).toContain("--tables");
    expect(runOptionNames).toContain("--rows");
    expect(runOptionNames).toContain("--seed");
    expect(runOptionNames).toContain("--dry-run");
    expect(runOptionNames).toContain("--check");
    expect(runOptionNames).toContain("--out");
    expect(runOptionNames).toContain("--start-id");
    expect(runOptionNames).toContain("--yes");
  });
});

describe("isJsonRequested flag parser", () => {
  test("detects --json flag", () => {
    expect(isJsonRequested(["bun", "seed-db", "run", "--json"])).toBe(true);
  });

  test("detects --format json", () => {
    expect(isJsonRequested(["bun", "seed-db", "run", "--format", "json"])).toBe(true);
  });

  test("detects --format=json", () => {
    expect(isJsonRequested(["bun", "seed-db", "run", "--format=json"])).toBe(true);
  });

  test("does NOT trigger on filenames with json", () => {
    expect(isJsonRequested(["bun", "seed-db", "run", "--out", "my.json"])).toBe(false);
    expect(isJsonRequested(["bun", "seed-db", "run", "--snapshot", "snapshot.json"])).toBe(false);
  });

  test("does NOT trigger on format text", () => {
    expect(isJsonRequested(["bun", "seed-db", "run", "--format", "text"])).toBe(false);
  });
});
