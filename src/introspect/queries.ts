import type { Sql } from "postgres";
import type { RawColumnRow, RawConstraintRow, RawEnumRow } from "./types";

// 1. Query all columns for base tables in the specified schema
export async function queryColumns(sql: Sql, schemaName: string): Promise<RawColumnRow[]> {
  const rows = await sql<RawColumnRow[]>`
    SELECT c.table_name, c.column_name, c.ordinal_position,
           c.data_type, c.udt_name,
           c.is_nullable = 'YES'          AS nullable,
           c.column_default,
           c.character_maximum_length, c.numeric_precision, c.numeric_scale,
           c.is_identity = 'YES'          AS is_identity,
           c.identity_generation,
           c.is_generated = 'ALWAYS'      AS is_generated
    FROM information_schema.columns c
    JOIN information_schema.tables t
      USING (table_schema, table_name)
    WHERE c.table_schema = ${schemaName} AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (
        SELECT 1 FROM pg_class pc
        JOIN pg_namespace pn ON pn.oid = pc.relnamespace
        WHERE pn.nspname = c.table_schema
          AND pc.relname = c.table_name AND pc.relispartition
      )
    ORDER BY c.table_name, c.ordinal_position;
  `;
  return rows;
}

// 2. Query primary keys, unique constraints, and foreign keys
export async function queryConstraints(sql: Sql, schemaName: string): Promise<RawConstraintRow[]> {
  const rows = await sql<RawConstraintRow[]>`
    SELECT con.conname AS name, con.contype AS type, rel.relname AS table_name,
      ARRAY(SELECT a.attname::text
            FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
            ORDER BY k.ord)::text[] AS columns,
      frel.relname AS ref_table,
      ARRAY(SELECT a.attname::text
            FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
            ORDER BY k.ord)::text[] AS ref_columns
    FROM pg_constraint con
    JOIN pg_class rel      ON rel.oid = con.conrelid
    JOIN pg_namespace ns   ON ns.oid = rel.relnamespace
    LEFT JOIN pg_class frel ON frel.oid = con.confrelid
    WHERE ns.nspname = ${schemaName} AND con.contype IN ('p', 'u', 'f');
  `;
  return rows;
}

// 3. Query all custom enum types and their allowed values
export async function queryEnums(sql: Sql, schemaName: string): Promise<RawEnumRow[]> {
  const rows = await sql<RawEnumRow[]>`
    SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
    FROM pg_type t
    JOIN pg_enum e      ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = ${schemaName}
    GROUP BY t.typname;
  `;
  return rows;
}
