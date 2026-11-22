import type { SeedConfig } from "./types";

/**
 * Type-safe configuration helper for seed.config.ts
 *
 * @example
 * ```ts
 * import { defineSeedConfig } from "@mariiodegen/seed-db";
 *
 * export default defineSeedConfig({
 *   defaultRows: 25,
 *   seed: 42,
 * });
 * ```
 */
export function defineSeedConfig(config: SeedConfig): SeedConfig {
  return config;
}
