import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SeedError } from "../errors";
import type { GlobalOptions } from "../types";
import { mergeConfig } from "./merge";
import type { ResolvedConfig, SeedConfig } from "./types";

export const DEFAULT_CONFIG_PATH = "./seed.config.ts";

export async function loadConfigFile(configPath = DEFAULT_CONFIG_PATH, isCustomPath = false): Promise<SeedConfig> {
  const fullPath = resolve(process.cwd(), configPath);

  if (!existsSync(fullPath)) {
    if (isCustomPath) {
      throw new SeedError({
        code: "E_CONFIG_NOT_FOUND",
        where: configPath,
        cause: `Configuration file does not exist at "${configPath}".`,
        fix: "Check the file path or omit --config to run with defaults.",
        exit: 2,
      });
    }
    // Default config file is optional
    return {};
  }

  try {
    const fileUrl = pathToFileURL(fullPath).href;
    const mod = (await import(fileUrl)) as { default?: SeedConfig; config?: SeedConfig };
    return (mod.default ?? mod.config ?? mod) as SeedConfig;
  } catch (err) {
    if (err instanceof SeedError) throw err;
    throw new SeedError({
      code: "E_CONFIG_INVALID",
      where: configPath,
      cause: err instanceof Error ? err.message : String(err),
      fix: "Fix the syntax or export in your configuration file.",
      exit: 2,
    });
  }
}

export async function loadAndResolveConfig(flags: Partial<GlobalOptions> = {}): Promise<ResolvedConfig> {
  const configPath = flags.config ?? DEFAULT_CONFIG_PATH;
  const isCustomPath = flags.config !== undefined && flags.config !== DEFAULT_CONFIG_PATH;

  const fileConfig = await loadConfigFile(configPath, isCustomPath);
  return mergeConfig({ flags, fileConfig });
}
