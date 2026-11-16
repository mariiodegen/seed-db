import type { Column, Schema } from "../introspect/types";
import type { GenContext } from "./types";

function clampString(str: string, maxLength?: number): string {
  if (maxLength && maxLength > 0 && str.length > maxLength) {
    return str.slice(0, maxLength);
  }
  return str;
}

/**
 * Returns a generator function for a standard PostgreSQL data type, or null if unsupported.
 */
export function getTypeGenerator(
  col: Column,
  schema: Schema
): ((ctx: GenContext) => unknown) | null {
  const udt = col.udtName.toLowerCase();

  // 1. Array types (Postgres prepends an underscore to the udt_name, e.g. _int4, _text)
  if (col.isArray) {
    const baseUdt = udt.startsWith("_") ? udt.slice(1) : udt;
    const baseCol: Column = {
      ...col,
      udtName: baseUdt,
      isArray: false,
    };
    const elementGen = getTypeGenerator(baseCol, schema);
    if (!elementGen) return null;

    return (ctx) => {
      const count = ctx.faker.number.int({ min: 1, max: 3 });
      const arr: unknown[] = [];
      for (let i = 0; i < count; i++) {
        arr.push(elementGen(ctx));
      }
      return arr;
    };
  }

  // 2. Custom Enums
  if (schema.enums && schema.enums[udt]) {
    const labels = schema.enums[udt];
    return (ctx) => ctx.faker.helpers.arrayElement(labels);
  }

  // 3. Built-in PostgreSQL Core Types
  switch (udt) {
    case "int2": // smallint
      return (ctx) => ctx.faker.number.int({ min: 1, max: 32767 });

    case "int4": // integer
      return (ctx) => ctx.faker.number.int({ min: 1, max: 100000 });

    case "int8": // bigint
      return (ctx) => ctx.faker.number.int({ min: 1, max: 1000000 });

    case "float4": // real
      return (ctx) => ctx.faker.number.float({ min: 0, max: 10000, fractionDigits: 2 });

    case "float8": // double precision
      return (ctx) => ctx.faker.number.float({ min: 0, max: 10000, fractionDigits: 4 });

    case "numeric":
    case "decimal":
      return (ctx) => {
        const scale = col.scale ?? 2;
        const precision = col.precision ?? 10;
        const maxVal = Math.min(10000, Math.pow(10, Math.max(1, precision - scale)) - 1);
        return ctx.faker.number.float({ min: 0, max: maxVal, fractionDigits: scale });
      };

    case "text":
      return (ctx) => ctx.faker.lorem.sentence();

    case "varchar":
    case "bpchar": // char(n)
      return (ctx) => clampString(ctx.faker.lorem.words({ min: 1, max: 3 }), col.maxLength);

    case "bool":
      return (ctx) => ctx.faker.datatype.boolean();

    case "timestamptz":
    case "timestamp":
      return (ctx) => ctx.faker.date.past({ years: 1 });

    case "date":
      return (ctx) => ctx.faker.date.past({ years: 1 }).toISOString().split("T")[0];

    case "time":
    case "timetz":
      return (ctx) => ctx.faker.date.past({ years: 1 }).toTimeString().split(" ")[0];

    case "uuid":
      return (ctx) => ctx.faker.string.uuid();

    case "json":
    case "jsonb":
      return (ctx) => ({
        [ctx.faker.lorem.word()]: ctx.faker.lorem.word(),
        count: ctx.faker.number.int({ max: 100 }),
      });

    case "inet":
    case "cidr":
      return (ctx) => ctx.faker.internet.ipv4();

    case "macaddr":
      return (ctx) => ctx.faker.internet.mac();

    case "bytea":
      return (ctx) => Buffer.from(ctx.faker.string.alphanumeric(16));

    default:
      return null;
  }
}

/**
 * Returns a human-readable generator label for planning/inspect output.
 */
export function getTypeLabel(col: Column, schema: Schema): string {
  if (col.isArray) {
    return `type:array[${col.udtName}]`;
  }
  if (schema.enums && schema.enums[col.udtName]) {
    return `enum:${col.udtName}`;
  }
  return `type:${col.udtName}`;
}
