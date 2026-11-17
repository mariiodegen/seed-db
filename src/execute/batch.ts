// Multi-row batching math enforcing PostgreSQL's 65,535 bind parameter ceiling.

/**
 * Calculates the maximum safe batch size for a table given its column count.
 * PostgreSQL bind parameters ($1, $2, ...) are indexed by an unsigned 16-bit integer,
 * capping individual query parameters at 65,535.
 *
 * Formula: min(1000, floor(65000 / columnCount))
 */
export function calculateBatchSize(columnCount: number): number {
  const safeCols = Math.max(1, columnCount);
  return Math.max(1, Math.min(1000, Math.floor(65000 / safeCols)));
}

/**
 * Splits an array of items into chunks of up to batchSize.
 */
export function chunkRows<T>(items: T[], batchSize: number): T[][] {
  if (items.length === 0) return [];
  const safeSize = Math.max(1, batchSize);
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }

  return chunks;
}
