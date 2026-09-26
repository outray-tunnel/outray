import { format } from "node:util";
import type { Logger } from "@opentelemetry/api-logs";

const MAX_LOG_BYTES = 16 * 1024;
const MAX_VALUE_BYTES = 4 * 1024;
const MAX_DEPTH = 4;
const MAX_ENTRIES = 50;
const MAX_ARRAY_ITEMS = 20;
const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /(?:^|[._-])(authorization|cookie|password|passwd|secret|token|api[._-]?key|private[._-]?key|session)(?:$|[._-])/i;
const SENSITIVE_ASSIGNMENT =
  /\b(authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key|session)\b\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const OUTRAY_TOKEN = /\boutray_[A-Za-z0-9_-]+\b/gi;

const severity = {
  debug: { number: 5, text: "DEBUG" },
  error: { number: 17, text: "ERROR" },
  info: { number: 9, text: "INFO" },
  log: { number: 9, text: "INFO" },
  warn: { number: 13, text: "WARN" },
} as const;

export type OutrayLogLevel = keyof typeof severity;
export type OutrayLogMethod = (...args: unknown[]) => void;

export interface OutrayLogMethods {
  debug: OutrayLogMethod;
  error: OutrayLogMethod;
  info: OutrayLogMethod;
  warn: OutrayLogMethod;
}

export interface OutrayConsoleTarget {
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

interface SanitizeState {
  seen: WeakSet<object>;
  truncated: boolean;
}

type SanitizedValue =
  | boolean
  | number
  | string
  | null
  | SanitizedValue[]
  | { [key: string]: SanitizedValue };

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const suffix = "…";
  const target = Math.max(0, maxBytes - Buffer.byteLength(suffix));
  let truncated = value.slice(0, target);
  while (Buffer.byteLength(truncated) > target) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}${suffix}`;
}

function redactString(value: string, state?: SanitizeState): string {
  const redacted = value
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`)
    .replace(OUTRAY_TOKEN, "outray_[REDACTED]")
    .replace(
      SENSITIVE_ASSIGNMENT,
      (_match, name: string, separator: string) =>
        `${name}${separator}${REDACTED}`,
    );
  const bounded = truncateUtf8(redacted, MAX_VALUE_BYTES);
  if (state && bounded !== redacted) state.truncated = true;
  return bounded;
}

function sanitizeValue(
  value: unknown,
  state: SanitizeState,
  depth = 0,
): SanitizedValue {
  if (value === null || value === undefined) return value === null ? null : "undefined";
  if (typeof value === "string") return redactString(value, state);
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return String(value);
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (depth >= MAX_DEPTH) {
    state.truncated = true;
    return "[Truncated]";
  }

  if (value instanceof Error) {
    return {
      message: redactString(value.message, state),
      name: value.name,
      ...(value.stack ? { stack: redactString(value.stack, state) } : {}),
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return redactString(value.toString(), state);
  if (state.seen.has(value)) return "[Circular]";

  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitizeValue(item, state, depth + 1));
      if (value.length > MAX_ARRAY_ITEMS) {
        state.truncated = true;
        items.push("[Truncated]");
      }
      return items;
    }

    const result: Record<string, SanitizedValue> = {};
    const entries = Object.entries(value).slice(0, MAX_ENTRIES);
    for (const [key, entryValue] of entries) {
      result[key] = SENSITIVE_KEY.test(key)
        ? REDACTED
        : sanitizeValue(entryValue, state, depth + 1);
    }
    if (Object.keys(value).length > MAX_ENTRIES) {
      state.truncated = true;
      result.__outray_truncated__ = true;
    }
    return result;
  } catch {
    return `[${value.constructor?.name ?? "Object"}]`;
  } finally {
    state.seen.delete(value);
  }
}

function attributesFromArguments(
  args: readonly unknown[],
): Record<string, boolean | number | string> {
  const attributes: Record<string, boolean | number | string> = {
    "log.argument.count": args.length,
  };

  for (const argument of args) {
    if (argument instanceof Error) {
      attributes["exception.type"] = argument.name;
      attributes["exception.message"] = redactString(argument.message);
      if (argument.stack) {
        attributes["exception.stacktrace"] = redactString(argument.stack);
      }
      continue;
    }

    if (!argument || typeof argument !== "object" || Array.isArray(argument)) {
      continue;
    }
    for (const [key, value] of Object.entries(argument).slice(0, MAX_ENTRIES)) {
      if (SENSITIVE_KEY.test(key)) {
        attributes[key] = REDACTED;
      } else if (
        typeof value === "boolean" ||
        typeof value === "number" ||
        typeof value === "string"
      ) {
        attributes[key] =
          typeof value === "string" ? redactString(value) : value;
      }
    }
  }

  return attributes;
}

export function emitOutrayLog(
  logger: Pick<Logger, "emit">,
  level: OutrayLogLevel,
  args: readonly unknown[],
): void {
  try {
    const state: SanitizeState = { seen: new WeakSet(), truncated: false };
    const sanitized = args.map((argument) => sanitizeValue(argument, state));
    const unboundedBody = format(...sanitized);
    const body = truncateUtf8(unboundedBody, MAX_LOG_BYTES);
    logger.emit({
      attributes: {
        ...attributesFromArguments(args),
        ...(state.truncated || body !== unboundedBody
          ? { "outray.log.truncated": true }
          : {}),
      },
      body,
      severityNumber: severity[level].number,
      severityText: severity[level].text,
    });
  } catch {
    // Logging must never affect the host application.
  }
}

function snapshotConsole(target: OutrayConsoleTarget): OutrayConsoleTarget {
  return {
    debug: target.debug,
    error: target.error,
    info: target.info,
    log: target.log,
    warn: target.warn,
  };
}

export function createOutrayLogMethods(
  logger: Pick<Logger, "emit">,
  target: OutrayConsoleTarget = console,
): OutrayLogMethods {
  const original = snapshotConsole(target);
  const write = (level: Exclude<OutrayLogLevel, "log">, args: unknown[]) => {
    original[level].apply(target, args);
    emitOutrayLog(logger, level, args);
  };
  return {
    debug: (...args) => write("debug", args),
    error: (...args) => write("error", args),
    info: (...args) => write("info", args),
    warn: (...args) => write("warn", args),
  };
}

export function captureConsoleLogs(
  logger: Pick<Logger, "emit">,
  target: OutrayConsoleTarget = console,
): () => void {
  const original = snapshotConsole(target);
  const patched = {} as Record<OutrayLogLevel, OutrayLogMethod>;
  let emitting = false;

  for (const level of Object.keys(severity) as OutrayLogLevel[]) {
    patched[level] = (...args: unknown[]) => {
      original[level].apply(target, args);
      if (emitting) return;
      emitting = true;
      try {
        emitOutrayLog(logger, level, args);
      } finally {
        emitting = false;
      }
    };
    target[level] = patched[level];
  }

  return () => {
    for (const level of Object.keys(severity) as OutrayLogLevel[]) {
      if (target[level] === patched[level]) target[level] = original[level];
    }
  };
}
