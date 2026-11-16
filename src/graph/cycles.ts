// Cycle detection and cycle path extraction for table dependency graphs.

/**
 * Finds a directed cycle among the provided nodes.
 * An edge from U to V means "table U depends on table V (V must precede U)".
 *
 * @param nodes List of node names (e.g. table names)
 * @param getNeighbors Function returning outgoing neighbor nodes (e.g. parent tables)
 * @returns Array representing the cycle (e.g. ["teams", "players", "teams"]) or null if acyclic.
 */
export function findCycle(
  nodes: string[],
  getNeighbors: (node: string) => string[]
): string[] | null {
  // State: 0 = unvisited, 1 = visiting (on current path), 2 = visited
  const state = new Map<string, number>();
  for (const node of nodes) {
    state.set(node, 0);
  }

  const path: string[] = [];

  function dfs(current: string): string[] | null {
    state.set(current, 1);
    path.push(current);

    const neighbors = getNeighbors(current);
    for (const neighbor of neighbors) {
      const neighborState = state.get(neighbor) ?? 0;
      if (neighborState === 1) {
        // Cycle detected! Extract the slice from the first occurrence of neighbor
        const cycleStartIndex = path.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          return [...path.slice(cycleStartIndex), neighbor];
        }
        return [neighbor, current, neighbor];
      }

      if (neighborState === 0) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      }
    }

    state.set(current, 2);
    path.pop();
    return null;
  }

  // Iterate over all nodes in deterministic sorted order
  const sortedNodes = [...nodes].sort();
  for (const node of sortedNodes) {
    if ((state.get(node) ?? 0) === 0) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }

  return null;
}
