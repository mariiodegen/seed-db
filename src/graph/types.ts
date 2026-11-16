import type { ForeignKey } from "../introspect/types";

export interface DeferredForeignKey {
  table: string;
  fk: ForeignKey;
  reason: "self-reference" | "cycle";
}

export interface TableOrderResult {
  order: string[]; // Table names in topological insertion order
  deferredFks: DeferredForeignKey[]; // Foreign keys to be populated in the second patch pass
}
