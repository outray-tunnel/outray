import {
  closeSync,
  linkSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  fsyncSync,
} from "fs";
import path from "path";
import { randomBytes } from "crypto";

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]{0,255}$/;

export function normalizeSecretKey(key: string): string {
  const normalized = key.trim().replace(/\s+/g, "_").toUpperCase();
  if (!ENV_KEY_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid secret key "${key}". Normalized keys must match ${ENV_KEY_PATTERN.source}.`,
    );
  }
  return normalized;
}

export function assertSecretKey(key: string): string {
  if (!ENV_KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid secret key "${key}". Keys must match ${ENV_KEY_PATTERN.source}.`,
    );
  }
  return key;
}

function closingQuoteIndex(value: string, quote: string): number {
  for (let index = 1; index < value.length; index++) {
    if (value[index] !== quote) continue;
    if (quote === "'") return index;
    let backslashes = 0;
    for (
      let cursor = index - 1;
      cursor >= 0 && value[cursor] === "\\";
      cursor--
    ) {
      backslashes++;
    }
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}

function decodeQuotedValue(value: string, quote: string): string {
  const inner = value.slice(1, -1);
  if (quote === "'") return inner;

  let result = "";
  for (let index = 0; index < inner.length; index++) {
    const character = inner[index];
    if (character !== "\\") {
      result += character;
      continue;
    }

    const next = inner[index + 1];
    if (next === undefined) {
      result += "\\";
      continue;
    }
    index++;
    if (next === "n") result += "\n";
    else if (next === "r") result += "\r";
    else if (next === "t") result += "\t";
    else if (next === '"' || next === "\\") result += next;
    else result += `\\${next}`;
  }
  return result;
}

export function parseEnvText(text: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const sourceKeys = new Map<string, string>();
  const lines = text.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([^=]+?)\s*=\s*(.*)$/);
    if (!match) {
      throw new Error(`Invalid dotenv syntax on line ${lineIndex + 1}.`);
    }

    const rawKey = match[1].trim();
    const key = normalizeSecretKey(rawKey);
    if (sourceKeys.has(key)) {
      throw new Error(
        `Duplicate secret key after normalization: "${sourceKeys.get(key)}" and "${rawKey}" both become ${key}.`,
      );
    }

    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      let closingIndex = closingQuoteIndex(value, quote);
      while (closingIndex === -1) {
        lineIndex++;
        if (lineIndex >= lines.length) {
          throw new Error(`Unterminated quoted value for ${key}.`);
        }
        value += `\n${lines[lineIndex]}`;
        closingIndex = closingQuoteIndex(value, quote);
      }
      const trailing = value.slice(closingIndex + 1).trim();
      if (trailing && !trailing.startsWith("#")) {
        throw new Error(`Unexpected text after quoted value for ${key}.`);
      }
      value = decodeQuotedValue(value.slice(0, closingIndex + 1), quote);
    } else {
      const comment = value.search(/\s+#/);
      value = (comment >= 0 ? value.slice(0, comment) : value).trim();
    }
    entries[key] = value;
    sourceKeys.set(key, rawKey);
  }

  return entries;
}

function renderEnvValue(value: string): string {
  if (value.length > 0 && !/[\s#"'\\=]/.test(value)) return value;
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

export function exportEnvText(secrets: Record<string, string>): string {
  const lines = Object.entries(secrets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${assertSecretKey(key)}=${renderEnvValue(value)}`);
  return `${lines.join("\n")}\n`;
}

export function secretsToJson(secrets: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.entries(secrets).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * Publishes a private file without an overwrite race. The temporary file and
 * destination are hard-linked in the same directory, so an existing target
 * always wins and partially-written output is never observable.
 */
export function writePrivateFileExclusiveAtomic(
  outputPath: string,
  contents: string,
  options: { force?: boolean } = {},
): void {
  const target = path.resolve(outputPath);
  const directory = path.dirname(target);
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  let descriptor: number | undefined;

  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (options.force) renameSync(temporary, target);
    else linkSync(temporary, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Refusing to overwrite existing file: ${target}`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function stripSingleTrailingLineBreak(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}
