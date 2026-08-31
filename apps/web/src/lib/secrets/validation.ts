import { SecretsError } from "./types";

export const MAX_SECRET_VALUE_BYTES = 64 * 1024;
export const MAX_ENV_TEXT_BYTES = 1024 * 1024;
const SECRET_KEY_PATTERN = /^[A-Z_][A-Z0-9_]{0,255}$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SecretsError("Request body must be a JSON object", {
      code: "INVALID_REQUEST",
      status: 400,
    });
  }
  return value as Record<string, unknown>;
}

export function readRequiredString(
  input: Record<string, unknown>,
  field: string,
  options: { maxLength?: number; allowEmpty?: boolean } = {},
): string {
  const value = input[field];
  if (typeof value !== "string") {
    throw new SecretsError(`${field} is required`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  const normalized = options.allowEmpty ? value : value.trim();
  if (!options.allowEmpty && !normalized) {
    throw new SecretsError(`${field} is required`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  if (normalized.length > (options.maxLength ?? 200)) {
    throw new SecretsError(`${field} is too long`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  return normalized;
}

export function readOptionalString(
  input: Record<string, unknown>,
  field: string,
  maxLength = 500,
): string | null | undefined {
  if (!(field in input)) return undefined;
  if (input[field] === null) return null;
  if (typeof input[field] !== "string") {
    throw new SecretsError(`${field} must be a string or null`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  const value = input[field].trim();
  if (value.length > maxLength) {
    throw new SecretsError(`${field} is too long`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  return value || null;
}

export function slugifySecretsName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

export function validateSlug(value: string, field = "slug"): string {
  const normalized = value.trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new SecretsError(
      `${field} must contain only lowercase letters, numbers, and single hyphen-separated words`,
      { code: "VALIDATION_ERROR", status: 400, field },
    );
  }
  return normalized;
}

export function validateSecretKey(value: unknown): string {
  const normalized =
    typeof value === "string"
      ? value.trim().replace(/\s+/g, "_").toUpperCase()
      : "";
  if (!SECRET_KEY_PATTERN.test(normalized)) {
    throw new SecretsError(
      "key must start with a letter or underscore and contain only uppercase letters, numbers, and underscores",
      { code: "VALIDATION_ERROR", status: 400, field: "key" },
    );
  }
  return normalized;
}

export function validateSecretValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new SecretsError("value must be a string", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "value",
    });
  }
  if (Buffer.byteLength(value, "utf8") > MAX_SECRET_VALUE_BYTES) {
    throw new SecretsError("value must be at most 64 KiB", {
      code: "VALIDATION_ERROR",
      status: 413,
      field: "value",
    });
  }
  return value;
}

export function validateSecretImportSize(values: Record<string, string>) {
  const bytes = Object.entries(values).reduce(
    (total, [key, value]) =>
      total +
      Buffer.byteLength(key, "utf8") +
      Buffer.byteLength(value, "utf8") +
      2,
    0,
  );
  if (bytes > MAX_ENV_TEXT_BYTES) {
    throw new SecretsError("Imported secrets must be at most 1 MiB in total", {
      code: "VALIDATION_ERROR",
      status: 413,
      field: "values",
    });
  }
}

export function optionalNonNegativeInteger(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SecretsError(`${field} must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  return value as number;
}

export function requiredNonNegativeInteger(value: unknown, field: string) {
  const parsed = optionalNonNegativeInteger(value, field);
  if (parsed === undefined) {
    throw new SecretsError(`${field} is required`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  return parsed;
}

export function requiredPositiveInteger(value: unknown, field: string) {
  const parsed = requiredNonNegativeInteger(value, field);
  if (parsed < 1) {
    throw new SecretsError(`${field} must be a positive integer`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  return parsed;
}

export function readExpectedSecretVersions(
  value: unknown,
  secretKeys: readonly string[],
): Record<string, number | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SecretsError("expectedVersions must be an object", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "expectedVersions",
    });
  }
  const expected: Record<string, number | null> = {};
  for (const [rawKey, rawVersion] of Object.entries(value)) {
    const key = validateSecretKey(rawKey);
    if (Object.hasOwn(expected, key)) {
      throw new SecretsError(`Duplicate expected version key: ${key}`, {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "expectedVersions",
      });
    }
    expected[key] =
      rawVersion === null
        ? null
        : requiredPositiveInteger(rawVersion, `expectedVersions.${key}`);
  }

  const normalizedKeys = Array.from(new Set(secretKeys.map(validateSecretKey))).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (
    normalizedKeys.length !== expectedKeys.length ||
    normalizedKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new SecretsError(
      "expectedVersions must contain exactly one entry for every supplied secret",
      {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "expectedVersions",
        details: { requiredKeys: normalizedKeys },
      },
    );
  }
  return expected;
}

export function readExpectedEnvironmentRevisions(
  value: unknown,
  environmentSlugs: readonly string[],
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SecretsError("expectedRevisions must be an object", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "expectedRevisions",
    });
  }
  const expected: Record<string, number> = {};
  for (const [rawSlug, rawRevision] of Object.entries(value)) {
    const slug = validateSlug(rawSlug, "expectedRevisions");
    if (Object.hasOwn(expected, slug)) {
      throw new SecretsError(`Duplicate expected revision slug: ${slug}`, {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "expectedRevisions",
      });
    }
    expected[slug] = requiredNonNegativeInteger(
      rawRevision,
      `expectedRevisions.${slug}`,
    );
  }

  const normalizedSlugs = Array.from(
    new Set(
      environmentSlugs.map((slug) =>
        validateSlug(slug, "environmentSlugs"),
      ),
    ),
  ).sort();
  const expectedSlugs = Object.keys(expected).sort();
  if (
    normalizedSlugs.length !== expectedSlugs.length ||
    normalizedSlugs.some((slug, index) => slug !== expectedSlugs[index])
  ) {
    throw new SecretsError(
      "expectedRevisions must contain exactly one entry for every selected environment",
      {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "expectedRevisions",
        details: { requiredSlugs: normalizedSlugs },
      },
    );
  }
  return expected;
}

export function isProductionEnvironment(input: {
  slug: string;
  name?: string | null;
}): boolean {
  return [input.slug, input.name ?? ""].some((value) =>
    /^(prod|production|live)$/i.test(value.trim()),
  );
}

export function requireProductionConfirmation(
  environment: { isProduction: boolean },
  confirmation: unknown,
) {
  if (environment.isProduction && confirmation !== true) {
    throw new SecretsError(
      "Production changes require confirmProduction: true",
      {
        code: "PRODUCTION_CONFIRMATION_REQUIRED",
        status: 409,
        field: "confirmProduction",
      },
    );
  }
}

export type ParsedEnv = {
  values: Record<string, string>;
  duplicates: string[];
};

function closingQuoteIndex(raw: string, quote: string) {
  let escaped = false;
  for (let index = 1; index < raw.length; index += 1) {
    if (!escaped && raw[index] === quote) return index;
    if (quote === '"') {
      escaped = !escaped && raw[index] === "\\";
      if (raw[index] !== "\\") escaped = false;
    }
  }
  return -1;
}

function parseQuotedValue(raw: string, lineNumber: number): string {
  const quote = raw[0];
  if (quote === "'" || quote === '"') {
    const closing = closingQuoteIndex(raw, quote);
    if (closing < 0 || raw.slice(closing + 1).trim().replace(/^#.*$/, "")) {
      throw new SecretsError(`Invalid quoted value on line ${lineNumber}`, {
        code: "INVALID_ENV_TEXT",
        status: 400,
        field: "envText",
      });
    }
    const content = raw.slice(1, closing);
    if (quote === "'") return content;
    return content.replace(/\\(n|r|t|"|\\)/g, (_match, escaped: string) => {
      if (escaped === "n") return "\n";
      if (escaped === "r") return "\r";
      if (escaped === "t") return "\t";
      return escaped;
    });
  }

  const comment = raw.search(/\s+#/);
  return (comment >= 0 ? raw.slice(0, comment) : raw).trim();
}

export function parseEnvText(envText: string): ParsedEnv {
  if (Buffer.byteLength(envText, "utf8") > MAX_ENV_TEXT_BYTES) {
    throw new SecretsError("envText must be at most 1 MiB", {
      code: "VALIDATION_ERROR",
      status: 413,
      field: "envText",
    });
  }
  const values: Record<string, string> = {};
  const duplicates = new Set<string>();
  const lines = envText.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    let declaration = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = declaration.indexOf("=");
    if (separator < 1) {
      throw new SecretsError(`Invalid environment assignment on line ${index + 1}`, {
        code: "INVALID_ENV_TEXT",
        status: 400,
        field: "envText",
      });
    }
    const valueStart = declaration.slice(separator + 1).trim();
    const quote = valueStart[0];
    if ((quote === "'" || quote === '"') && closingQuoteIndex(valueStart, quote) < 0) {
      while (index + 1 < lines.length) {
        index += 1;
        line = `${line}\n${lines[index]}`;
        declaration = line.startsWith("export ") ? line.slice(7).trim() : line;
        const candidate = declaration.slice(declaration.indexOf("=") + 1).trim();
        if (closingQuoteIndex(candidate, quote) >= 0) break;
      }
    }
    const finalSeparator = declaration.indexOf("=");
    const key = validateSecretKey(declaration.slice(0, finalSeparator).trim());
    const value = validateSecretValue(
      parseQuotedValue(declaration.slice(finalSeparator + 1).trim(), index + 1),
    );
    if (Object.hasOwn(values, key)) {
      duplicates.add(key);
      throw new SecretsError(`Duplicate environment key: ${key}`, {
        code: "DUPLICATE_ENV_KEYS",
        status: 400,
        field: "envText",
        details: { duplicates: [...duplicates].sort() },
      });
    }
    values[key] = value;
  }
  return { values, duplicates: [...duplicates].sort() };
}

function formatEnvValue(value: string): string {
  if (value && /^[A-Za-z0-9_./:@%+,=-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function serializeEnvText(values: Record<string, string>): string {
  return `${Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${validateSecretKey(key)}=${formatEnvValue(value)}`)
    .join("\n")}\n`;
}
