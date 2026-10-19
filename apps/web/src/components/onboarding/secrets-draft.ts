import { SecretsError } from "../../lib/secrets/types";
import {
  parseEnvText,
  validateSecretImportSize,
  validateSecretKey,
  validateSecretValue,
} from "../../lib/secrets/validation";

export type SecretDraftRow = { id: number; key: string; value: string };
type SecretDraftEntry = Pick<SecretDraftRow, "key" | "value">;

export function createEmptySecretDraft(): SecretDraftRow[] {
  return [{ id: 0, key: "", value: "" }];
}

const assignment = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*(?:[ \t]+[A-Za-z0-9_]+)*[ \t]*=/;

export function parseSecretPaste(
  text: string,
  field: "key" | "value",
): SecretDraftEntry[] | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!lines.length || !assignment.test(lines[0])) return null;
  // A single assignment is also a valid secret value. Only expand a batch
  // pasted into a value field, so tokens and URLs containing '=' stay intact.
  if (field === "value" && lines.filter((line) => assignment.test(line)).length < 2) return null;
  const entries = Object.entries(parseEnvText(text).values)
    .map(([key, value]) => ({ key, value }));
  return field === "value" && entries.length < 2 ? null : entries;
}

function duplicateKey(key: string): never {
  throw new SecretsError(`Duplicate environment key: ${key}`, {
    code: "DUPLICATE_ENV_KEYS",
    status: 400,
    field: "key",
    details: { duplicates: [key] },
  });
}

export function populateSecretDraft(
  rows: SecretDraftRow[],
  targetId: number,
  entries: SecretDraftEntry[],
): SecretDraftRow[] {
  if (!rows.some((row) => row.id === targetId) || !entries.length) return rows;
  const existingKeys = new Set(rows
    .filter((row) => row.id !== targetId && row.key.trim())
    .map((row) => row.key.trim().replace(/\s+/g, "_").toUpperCase()));
  let nextId = Math.max(-1, ...rows.map((row) => row.id)) + 1;
  const populated = entries.map((entry, index) => {
    const key = validateSecretKey(entry.key);
    const value = validateSecretValue(entry.value);
    if (existingKeys.has(key)) duplicateKey(key);
    existingKeys.add(key);
    return { id: index === 0 ? targetId : nextId++, key, value };
  });
  return rows.flatMap((row) => row.id === targetId ? populated : [row]);
}

export function secretDraftValues(rows: SecretDraftRow[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of rows) {
    if (!row.key.trim() && !row.value) continue;
    const key = validateSecretKey(row.key);
    const value = validateSecretValue(row.value);
    if (Object.hasOwn(values, key)) duplicateKey(key);
    values[key] = value;
  }
  if (!Object.keys(values).length) {
    throw new SecretsError("Add at least one secret to continue.", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "key",
    });
  }
  validateSecretImportSize(values);
  return values;
}
