// In-memory Schema data model and raw introspection query types.

export interface Schema {
  name: string;
  tables: Table[];
  enums: Record<string, string[]>; // typname -> array of allowed string labels
}

export interface Table {
  name: string;
  columns: Column[];
  primaryKey: string[];
  uniques: string[][];
  foreignKeys: ForeignKey[];
}

export interface Column {
  name: string;
  position: number;
  dataType: string; // information_schema data_type (e.g. "integer", "character varying")
  udtName: string; // underlying Postgres type name (e.g. "int4", "varchar", "_int4")
  nullable: boolean;
  hasDefault: boolean;
  identity: "always" | "by_default" | null;
  generated: boolean; // GENERATED ALWAYS AS (...) STORED
  maxLength?: number;
  precision?: number;
  scale?: number;
  isArray: boolean;
}

export interface ForeignKey {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  nullable: boolean; // true when every column in this foreign key is nullable
}

// Raw row shapes returned by PostgreSQL catalog queries

export interface RawColumnRow {
  table_name: string;
  column_name: string;
  ordinal_position: number;
  data_type: string;
  udt_name: string;
  nullable: boolean;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_identity: boolean;
  identity_generation: string | null;
  is_generated: boolean;
}

export interface RawConstraintRow {
  name: string;
  type: "p" | "u" | "f";
  table_name: string;
  columns: string[];
  ref_table: string | null;
  ref_columns: string[] | null;
}

export interface RawEnumRow {
  typname: string;
  labels: string[];
}
