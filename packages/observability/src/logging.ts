import { format } from "node:util";
import type { Logger } from "@opentelemetry/api-logs";

const MAX_LOG_BYTES = 16 * 1024;
const MAX_VALUE_BYTES = 4 * 1024;
const MAX_DEPTH = 4;
const MAX_ENTRIES = 50;
const MAX_ARRAY_ITEMS = 20;
const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|secret|token|apikey|authkey|privatekey|session/i;
const SENSITIVE_ASSIGNMENT =
  /\b(authorization|cookie|set[._-]?cookie|password|passwd|secret|token|access[._-]?token|refresh[._-]?token|auth[._-]?token|api[._-]?key|auth[._-]?key|private[._-]?key|client[._-]?secret|session(?:[._-]?id)?)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const FORMAT_PLACEHOLDER = /%[sdifjoOc]/;
const FORMAT_SPECIFIER = /%[%sdifjoOc]/g;
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

function sensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

// Known credentials are redacted, but arbitrary free-form secret values cannot
// be identified reliably. Applications must still avoid logging sensitive data.
function redactText(value: string, preserveFormatPlaceholders = false): string {
  return value
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`)
    .replace(OUTRAY_TOKEN, "outray_[REDACTED]")
    .replace(
      SENSITIVE_ASSIGNMENT,
      (match, name: string, separator: string, assignedValue: string) =>
        preserveFormatPlaceholders && FORMAT_PLACEHOLDER.test(assignedValue)
          ? match
          : `${name}${separator}${REDACTED}`,
    );
}

function redactString(
  value: string,
  state?: SanitizeState,
  preserveFormatPlaceholders = false,
): string {
  const redacted = redactText(value, preserveFormatPlaceholders);
  const bounded = truncateUtf8(redacted, MAX_VALUE_BYTES);
  if (state && bounded !== redacted) state.truncated = true;
  return bounded;
}

function sensitiveFormatArguments(args: readonly unknown[]): Set<number> {
  const result = new Set<number>();
  const formatString = args[0];
  if (typeof formatString !== "string" || args.length < 2) return result;

  const sensitiveRanges: Array<{ start: number; end: number }> = [];
  for (const match of formatString.matchAll(SENSITIVE_ASSIGNMENT)) {
    const assignedValue = match[3]!;
    const start = match.index + match[0].length - assignedValue.length;
    sensitiveRanges.push({ start, end: start + assignedValue.length });
  }
  let argumentIndex = 1;
  for (const match of formatString.matchAll(FORMAT_SPECIFIER)) {
    if (match[0] === "%%") continue;
    if (sensitiveRanges.some(({ start, end }) => match.index >= start && match.index < end)) {
      result.add(argumentIndex);
    }
    argumentIndex += 1;
  }
  return result;
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
      result[key] = sensitiveKey(key)
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
  redactedArguments: ReadonlySet<number>,
): Record<string, boolean | number | string> {
  const attributes: Record<string, boolean | number | string> = {
    "log.argument.count": args.length,
  };

  for (const [index, argument] of args.entries()) {
    // A value passed to `token=%o` is sensitive even when its internal field
    // names look innocuous; do not re-export it through structured attributes.
    if (redactedArguments.has(index)) continue;
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
      if (sensitiveKey(key)) {
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
    const redactedArguments = sensitiveFormatArguments(args);
    const sanitized = args.map((argument, index) =>
      redactedArguments.has(index)
        ? REDACTED
        : index === 0 && typeof argument === "string" && args.length > 1
          ? redactString(argument, state, true)
          : sanitizeValue(argument, state),
    );
    const unboundedBody = format(...sanitized);
    // Redact once more AFTER printf interpolation, so `token=%s` cannot strip
    // the placeholder and accidentally append the unredacted argument.
    const redactedBody = redactText(unboundedBody);
    const body = truncateUtf8(redactedBody, MAX_LOG_BYTES);
    logger.emit({
      attributes: {
        ...attributesFromArguments(args, redactedArguments),
        ...(state.truncated || body !== redactedBody
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

function logCaptureAllowed(shouldCaptureLog?: () => boolean): boolean {
  try {
    return shouldCaptureLog ? shouldCaptureLog() === true : true;
  } catch {
    // A failing context filter must neither leak a log nor affect local output.
    return false;
  }
}

export function createOutrayLogMethods(
  logger: Pick<Logger, "emit">,
  target: OutrayConsoleTarget = console,
  shouldCaptureLog?: () => boolean,
): OutrayLogMethods {
  const original = snapshotConsole(target);
  const write = (level: Exclude<OutrayLogLevel, "log">, args: unknown[]) => {
    original[level].apply(target, args);
    if (!logCaptureAllowed(shouldCaptureLog)) return;
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
  shouldCaptureLog?: () => boolean,
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
        if (logCaptureAllowed(shouldCaptureLog)) {
          emitOutrayLog(logger, level, args);
        }
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
