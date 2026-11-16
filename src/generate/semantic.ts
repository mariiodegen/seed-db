import type { Column } from "../introspect/types";
import type { GenContext } from "./types";

function isTextType(col: Column): boolean {
  if (col.isArray) return false;
  const dt = col.dataType.toLowerCase();
  const udt = col.udtName.toLowerCase();
  return (
    dt === "text" ||
    dt.includes("char") ||
    udt === "varchar" ||
    udt === "text" ||
    udt === "bpchar"
  );
}

function isNumericType(col: Column): boolean {
  if (col.isArray) return false;
  const udt = col.udtName.toLowerCase();
  return [
    "int2",
    "int4",
    "int8",
    "float4",
    "float8",
    "numeric",
    "decimal",
  ].includes(udt);
}

function isDateType(col: Column): boolean {
  if (col.isArray) return false;
  const udt = col.udtName.toLowerCase();
  return ["timestamp", "timestamptz", "date"].includes(udt);
}

function matchesPattern(name: string, keyword: string): boolean {
  return name === keyword || name.endsWith(`_${keyword}`);
}

function clampString(str: string, maxLength?: number): string {
  if (maxLength && maxLength > 0 && str.length > maxLength) {
    return str.slice(0, maxLength);
  }
  return str;
}

export interface SemanticRule {
  name: string;
  label: string;
  match: (name: string, col: Column) => boolean;
  generate: (ctx: GenContext, col: Column) => unknown;
}

export const SEMANTIC_RULES: SemanticRule[] = [
  // 1. Email
  {
    name: "email",
    label: "semantic:email",
    match: (n, col) => isTextType(col) && matchesPattern(n, "email"),
    generate: (ctx, col) => clampString(ctx.faker.internet.email().toLowerCase(), col.maxLength),
  },

  // 2. First Name
  {
    name: "first_name",
    label: "semantic:first_name",
    match: (n, col) => isTextType(col) && (matchesPattern(n, "first_name") || matchesPattern(n, "firstname")),
    generate: (ctx, col) => clampString(ctx.faker.person.firstName(), col.maxLength),
  },

  // 3. Last Name
  {
    name: "last_name",
    label: "semantic:last_name",
    match: (n, col) => isTextType(col) && (matchesPattern(n, "last_name") || matchesPattern(n, "lastname")),
    generate: (ctx, col) => clampString(ctx.faker.person.lastName(), col.maxLength),
  },

  // 4. Full Name (matches name, full_name, but avoids table_name, file_name, column_name)
  {
    name: "full_name",
    label: "semantic:full_name",
    match: (n, col) =>
      isTextType(col) &&
      (matchesPattern(n, "full_name") ||
        matchesPattern(n, "fullname") ||
        (n === "name" && !["file_name", "table_name", "column_name"].includes(n))),
    generate: (ctx, col) => clampString(ctx.faker.person.fullName(), col.maxLength),
  },

  // 5. Username / Handle
  {
    name: "username",
    label: "semantic:username",
    match: (n, col) => isTextType(col) && (matchesPattern(n, "username") || matchesPattern(n, "handle")),
    generate: (ctx, col) => clampString(ctx.faker.internet.username(), col.maxLength),
  },

  // 6. Phone / Mobile
  {
    name: "phone",
    label: "semantic:phone",
    match: (n, col) =>
      isTextType(col) &&
      (matchesPattern(n, "phone") || matchesPattern(n, "phone_number") || matchesPattern(n, "mobile")),
    generate: (ctx, col) => clampString(ctx.faker.phone.number(), col.maxLength),
  },

  // 7. Avatar / Image URL
  {
    name: "avatar_url",
    label: "semantic:avatar_url",
    match: (n, col) =>
      isTextType(col) &&
      (matchesPattern(n, "avatar_url") ||
        matchesPattern(n, "avatar") ||
        matchesPattern(n, "image_url") ||
        matchesPattern(n, "photo_url")),
    generate: (ctx, col) => clampString(ctx.faker.image.avatar(), col.maxLength),
  },

  // 8. Website / URL
  {
    name: "url",
    label: "semantic:url",
    match: (n, col) => isTextType(col) && (matchesPattern(n, "url") || matchesPattern(n, "website")),
    generate: (ctx, col) => clampString(ctx.faker.internet.url(), col.maxLength),
  },

  // 9. Street Address
  {
    name: "address",
    label: "semantic:address",
    match: (n, col) =>
      isTextType(col) &&
      (matchesPattern(n, "address") || matchesPattern(n, "street") || matchesPattern(n, "street_address")),
    generate: (ctx, col) => clampString(ctx.faker.location.streetAddress(), col.maxLength),
  },

  // 10. City
  {
    name: "city",
    label: "semantic:city",
    match: (n, col) => isTextType(col) && matchesPattern(n, "city"),
    generate: (ctx, col) => clampString(ctx.faker.location.city(), col.maxLength),
  },

  // 11. Country
  {
    name: "country",
    label: "semantic:country",
    match: (n, col) => isTextType(col) && (matchesPattern(n, "country") || matchesPattern(n, "country_code")),
    generate: (ctx, col) =>
      col.maxLength && col.maxLength <= 3
        ? ctx.faker.location.countryCode()
        : clampString(ctx.faker.location.country(), col.maxLength),
  },

  // 12. Postal Code / Zip
  {
    name: "zip",
    label: "semantic:zip",
    match: (n, col) =>
      isTextType(col) &&
      (matchesPattern(n, "zip") || matchesPattern(n, "zip_code") || matchesPattern(n, "postal_code")),
    generate: (ctx, col) => clampString(ctx.faker.location.zipCode(), col.maxLength),
  },

  // 13. Company Name
  {
    name: "company",
    label: "semantic:company",
    match: (n, col) => isTextType(col) && (matchesPattern(n, "company") || matchesPattern(n, "company_name")),
    generate: (ctx, col) => clampString(ctx.faker.company.name(), col.maxLength),
  },

  // 14. Job Title
  {
    name: "title",
    label: "semantic:title",
    match: (n, col) => isTextType(col) && (matchesPattern(n, "job_title") || n === "title"),
    generate: (ctx, col) => clampString(ctx.faker.person.jobTitle(), col.maxLength),
  },

  // 15. Description / Bio
  {
    name: "description",
    label: "semantic:description",
    match: (n, col) => isTextType(col) && (matchesPattern(n, "description") || matchesPattern(n, "bio")),
    generate: (ctx, col) => clampString(ctx.faker.lorem.paragraph(), col.maxLength),
  },

  // 16. Slug
  {
    name: "slug",
    label: "semantic:slug",
    match: (n, col) => isTextType(col) && matchesPattern(n, "slug"),
    generate: (ctx, col) => clampString(ctx.faker.lorem.slug(), col.maxLength),
  },

  // 17. Password / Password Hash (Generates dummy 60-char hash string)
  {
    name: "password",
    label: "semantic:password",
    match: (n, col) =>
      isTextType(col) &&
      (matchesPattern(n, "password") || matchesPattern(n, "password_hash") || matchesPattern(n, "hashed_password")),
    generate: (ctx, col) => {
      // 60-character bcrypt-formatted dummy string
      const dummy = "$2b$12$" + ctx.faker.string.alphanumeric(53);
      return clampString(dummy, col.maxLength);
    },
  },

  // 18. Financial Amount / Price / Total
  {
    name: "amount",
    label: "semantic:amount",
    match: (n, col) =>
      isNumericType(col) &&
      (matchesPattern(n, "price") ||
        matchesPattern(n, "amount") ||
        matchesPattern(n, "total") ||
        matchesPattern(n, "cost")),
    generate: (ctx, col) => {
      const udt = col.udtName.toLowerCase();
      if (["int2", "int4", "int8"].includes(udt)) {
        // Integer amount (e.g. cents)
        return ctx.faker.number.int({ min: 100, max: 50000 });
      }
      return parseFloat(
        ctx.faker.finance.amount({ min: 5, max: 1000, dec: col.scale ?? 2 })
      );
    },
  },

  // 19. Created At
  {
    name: "created_at",
    label: "semantic:created_at",
    match: (n, col) => isDateType(col) && (matchesPattern(n, "created_at") || matchesPattern(n, "created")),
    generate: (ctx, col) => {
      const date = ctx.faker.date.past({ years: 1 });
      return col.udtName === "date" ? date.toISOString().split("T")[0] : date;
    },
  },

  // 20. Updated At (guarantees updated_at >= created_at)
  {
    name: "updated_at",
    label: "semantic:updated_at",
    match: (n, col) => isDateType(col) && (matchesPattern(n, "updated_at") || matchesPattern(n, "updated")),
    generate: (ctx, col) => {
      let fromDate: Date;
      if (ctx.row.created_at instanceof Date) {
        fromDate = ctx.row.created_at;
      } else if (typeof ctx.row.created_at === "string") {
        fromDate = new Date(ctx.row.created_at);
      } else {
        fromDate = ctx.faker.date.past({ years: 1 });
      }

      const date = ctx.faker.date.between({ from: fromDate, to: new Date() });
      return col.udtName === "date" ? date.toISOString().split("T")[0] : date;
    },
  },
];

/**
 * Finds a matching semantic rule for a column, if one exists and matches type safety guards.
 */
export function findSemanticRule(col: Column): SemanticRule | null {
  const normalized = col.name.toLowerCase().trim().replace(/-/g, "_");
  for (const rule of SEMANTIC_RULES) {
    if (rule.match(normalized, col)) {
      return rule;
    }
  }
  return null;
}
