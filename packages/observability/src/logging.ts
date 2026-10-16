import { format } from "node:util";
import type { Logger } from "@opentelemetry/api-logs";

const MAX_LOG_BYTES = 16 * 1024;
const MAX_VALUE_BYTES = 4 * 1024;
const MAX_DEPTH = 4;
const MAX_ENTRIES = 50;
const MAX_ARRAY_ITEMS = 20;
const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|passphrase|secret|token|apikey|authkey|privatekey|session|credential|assertion|codeverifier|codechallenge|oauthcode|oauthstate|csrf|xsrf|nonce/i;
const DEFAULT_REDACTED_FIELDS = ["query", "sql", "params", "parameters", "bindings", "bind", "connectionString"];
const ASSIGNMENT = /(["']?\b[A-Za-z][A-Za-z0-9_.-]*\b["']?)(\s*[:=]\s*)/gi;
const FORMAT_PLACEHOLDER = /%[sdifjoOc]/;
const FORMAT_SPECIFIER = /%[%sdifjoOc]/g;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BASIC_CREDENTIAL = /\bBasic\s+[A-Za-z0-9+/=]+/gi;
const OUTRAY_TOKEN = /\boutray_[A-Za-z0-9_-]+\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const URL_TEXT = /\b[a-z][a-z\d+.-]*:\/\/[^\s<>"'`]+/gi;
const PRIVATE_KEY = /-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z ]* )?PRIVATE KEY-----|$)/g;

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
  policy: RedactionPolicy;
}

interface RedactionPolicy {
  fields: ReadonlySet<string>;
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

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function createRedactionPolicy(fields: readonly string[] = []): RedactionPolicy {
  const extra = [...DEFAULT_REDACTED_FIELDS, ...fields]
    .filter((field) => typeof field === "string")
    .map(normalizeKey)
    .filter(Boolean);
  return {
    fields: new Set(extra.map(normalizeKey)),
  };
}

function sensitiveKey(key: string, policy: RedactionPolicy): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY.test(normalized) || policy.fields.has(normalized);
}

function tokenLikeAuthCode(value: unknown): boolean {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string") return false;
  if (/^\d{6,8}$/.test(text) || /^[\da-f]{32,}$/i.test(text) || /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(text)) return true;
  return text.length >= 20 && /^[A-Za-z\d._~+/=-]+$/.test(text) && !diagnosticCode(text);
}

function diagnosticCode(value: unknown): boolean {
  return typeof value === "string" && (/^(?:[A-Z][A-Z\d_]*|[a-z]+(?:_[a-z]+)+)$/.test(value) || /^[\dA-Z]{5}$/.test(value));
}

function authContext(entries: ReadonlyArray<readonly [string, unknown]>): boolean {
  return entries.some(([key, value]) => /^(?:codeverifier|codechallenge|oauthstate|oauthcode|redirecturi|authorizationurl|accesstoken|refreshtoken|idtoken)$/.test(normalizeKey(key)) ||
    (normalizeKey(key) === "provider" && typeof value === "string" && /^(?:github|google|oauth2?|oidc)$/i.test(value))) ||
    (entries.some(([key]) => normalizeKey(key) === "code") && entries.some(([key, value]) => normalizeKey(key) === "state" && typeof value === "string" && !/^(?:up|down|unknown|healthy|unhealthy|pending|active|inactive)$/i.test(value)));
}

function sensitiveAuthField(key: string, value: unknown, context: boolean): boolean {
  const normalized = normalizeKey(key);
  return (normalized === "code" || normalized === "state") &&
    (tokenLikeAuthCode(value) || (context && typeof value === "string" && !diagnosticCode(value)));
}

function assignmentEnd(text: string, start: number): number {
  const opening = text[start];
  if (opening === "\"" || opening === "'") {
    for (let index = start + 1; index < text.length; index += 1) {
      if (text[index] === "\\") index += 1;
      else if (text[index] === opening) return index + 1;
    }
    return text.length;
  }
  if (opening === "{" || opening === "[") {
    const stack = [opening];
    for (let index = start + 1; index < text.length; index += 1) {
      const character = text[index];
      if (character === "\"" || character === "'") {
        index = assignmentEnd(text, index) - 1;
      } else if (character === "{" || character === "[") {
        stack.push(character);
      } else if (character === "}" || character === "]") {
        stack.pop();
        if (!stack.length) return index + 1;
      }
    }
    return text.length;
  }
  const delimiter = text.slice(start).search(/[\s,;&}]/);
  return delimiter < 0 ? text.length : start + delimiter;
}

function assignmentRanges(value: string, policy: RedactionPolicy) {
  const pattern = new RegExp(ASSIGNMENT);
  const result: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  const stateValue = value.match(/\bstate["']?\s*[:=]\s*["']?([^\s,;"'}]+)/i)?.[1];
  const context = /\b(?:oauth|code[._-]?verifier|redirect[._-]?uri)\b/i.test(value) ||
    (/\bcode["']?\s*[:=]/i.test(value) && stateValue !== undefined && !/^(?:up|down|unknown|healthy|unhealthy|pending|active|inactive)$/i.test(stateValue));
  while ((match = pattern.exec(value))) {
    const start = match.index + match[0].length;
    const key = normalizeKey(match[1]!);
    const assignedEnd = assignmentEnd(value, start);
    const assigned = value.slice(start, assignedEnd).replace(/^["']|["']$/g, "");
    if (!sensitiveKey(key, policy) && !sensitiveAuthField(key, assigned, context)) continue;
    const rawCookie = /cookie$/.test(key) && !/["'{[]/.test(value[start] ?? "");
    const newline = value.indexOf("\n", start);
    const end = rawCookie ? (newline < 0 ? value.length : newline) : assignedEnd;
    result.push({ start, end });
    pattern.lastIndex = Math.max(end, pattern.lastIndex);
  }
  return result;
}

function redactUrl(value: string, policy: RedactionPolicy, preserveFormatPlaceholders: boolean, depth = 0): string {
  try {
    const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
    const url = new URL(value, "https://outray.invalid");
    if (url.username || url.password) {
      url.username = REDACTED;
      url.password = REDACTED;
    }
    for (const [name, entry] of [...url.searchParams]) {
      if (sensitiveKey(name, policy) || /^(?:code|state)$/i.test(name)) {
        if (!preserveFormatPlaceholders || !FORMAT_PLACEHOLDER.test(entry)) {
          url.searchParams.set(name, REDACTED);
        }
      } else if (/[a-z][a-z\d+.-]*(?::\/\/|%3a%2f%2f)/i.test(entry) || /^(?:\/|%2f)/i.test(entry)) {
        let decoded = entry;
        let decoding = 0;
        while (/%(?:3a|2f|25)/i.test(decoded) && decoding < 3) {
          const next = decodeURIComponent(decoded);
          if (next === decoded) break;
          decoded = next;
          decoding += 1;
        }
        url.searchParams.set(name, depth < 3 && !/%(?:3a|2f|25)/i.test(decoded) ? redactUrl(decoded, policy, preserveFormatPlaceholders, depth + 1) : REDACTED);
      }
    }
    if (url.hash && (!preserveFormatPlaceholders || !FORMAT_PLACEHOLDER.test(url.hash))) url.hash = REDACTED;
    return absolute ? url.toString() : `${value.startsWith("?") ? "" : url.pathname}${url.search}${url.hash}`;
  } catch {
    // Invalid URLs can still contain credentials, so fail closed for userinfo.
    return value.replace(/(\/\/)[^/@\s]+@/, `$1${REDACTED}@`);
  }
}

// Known credentials are redacted, but arbitrary free-form secret values cannot
// be identified reliably. Applications must still avoid logging sensitive data.
function redactText(value: string, policy: RedactionPolicy, preserveFormatPlaceholders = false): string {
  // Drizzle's outer message includes raw SQL and parameters. The nested cause
  // carries the useful database diagnostic and is sanitized separately.
  let redacted = value
    .replace(/\bFailed query\s*:(?!\s*\[REDACTED\])[\s\S]*?(?=\n\s+at\b|$)/gi, `Failed query: ${REDACTED}`)
    .replace(/((?:^|\n)\s*(?:params|parameters)\s*[:=])[^\n]*/gi, `$1 ${REDACTED}`)
    .replace(PRIVATE_KEY, REDACTED)
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`)
    .replace(BASIC_CREDENTIAL, `Basic ${REDACTED}`)
    .replace(OUTRAY_TOKEN, "outray_[REDACTED]")
    .replace(JWT, REDACTED)
    .replace(URL_TEXT, (url) => redactUrl(url, policy, preserveFormatPlaceholders))
    .replace(/(\/[^\s<>"'`#]*)#[^\s<>"'`]+/g, `$1#${REDACTED}`)
    .replace(/([?&](?:code|state)=)([^&#\s]*)/gi, (match, prefix: string, assigned: string) =>
      preserveFormatPlaceholders && FORMAT_PLACEHOLDER.test(assigned) ? match : `${prefix}${REDACTED}`,
    );
  if (/^[a-z][a-z\d+.-]*%3a%2f%2f/i.test(redacted)) {
    try {
      redacted = encodeURIComponent(redactUrl(decodeURIComponent(redacted), policy, preserveFormatPlaceholders));
    } catch {
      redacted = REDACTED;
    }
  }
  for (const { start, end } of assignmentRanges(redacted, policy).reverse()) {
    const assigned = redacted.slice(start, end);
    if (preserveFormatPlaceholders && FORMAT_PLACEHOLDER.test(assigned)) continue;
    redacted = `${redacted.slice(0, start)}${REDACTED}${redacted.slice(end)}`;
  }
  return redacted;
}

function redactString(
  value: string,
  state: SanitizeState,
  preserveFormatPlaceholders = false,
): string {
  const input = truncateUtf8(value, MAX_VALUE_BYTES);
  if (input !== value) state.truncated = true;
  const redacted = redactText(input, state.policy, preserveFormatPlaceholders);
  const bounded = truncateUtf8(redacted, MAX_VALUE_BYTES);
  if (state && bounded !== redacted) state.truncated = true;
  return bounded;
}

function sensitiveFormatArguments(args: readonly unknown[], policy: RedactionPolicy): Set<number> {
  const result = new Set<number>();
  const formatString = args[0];
  if (typeof formatString !== "string" || args.length < 2) return result;

  const sensitiveRanges: Array<{ start: number; end: number }> = [];
  const codeRanges: Array<{ start: number; end: number }> = [];
  sensitiveRanges.push(...assignmentRanges(formatString, policy));
  for (const match of formatString.matchAll(/[?&](?:code|state)=([^&#\s]*)/gi)) {
    const start = match.index + match[0].length - match[1]!.length;
    sensitiveRanges.push({ start, end: start + match[1]!.length });
  }
  for (const match of formatString.matchAll(/\b[a-z][a-z\d+.-]*:\/\/([^/@\s]+)@|#[^\s]+|\b(?:Bearer|Basic)\s+%[sdifjoOc]/gi)) {
    sensitiveRanges.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const match of formatString.matchAll(/\b(?:code|state)["']?\s*[:=]\s*/gi)) {
    const start = match.index + match[0].length;
    codeRanges.push({ start, end: assignmentEnd(formatString, start) });
  }
  let argumentIndex = 1;
  for (const match of formatString.matchAll(FORMAT_SPECIFIER)) {
    if (match[0] === "%%") continue;
    if (sensitiveRanges.some(({ start, end }) => match.index >= start && match.index < end) ||
      (codeRanges.some(({ start, end }) => match.index >= start && match.index < end) && (tokenLikeAuthCode(args[argumentIndex]) || (typeof args[argumentIndex] === "object" && args[argumentIndex] !== null)))) {
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

  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return redactString(value.toString(), state);
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return `[Binary ${value.byteLength} bytes]`;
  if (state.seen.has(value)) return "[Circular]";

  state.seen.add(value);
  try {
    if (value instanceof Error) {
      const result: Record<string, SanitizedValue> = {
        message: redactString(value.message, state),
        name: redactString(value.name, state),
        ...(value.stack ? { stack: redactString(value.stack, state) } : {}),
      };
      // Never enumerate database/HTTP error objects: request configs, SQL and
      // parameter arrays often contain plaintext secrets. Preserve diagnostics
      // explicitly, including non-enumerable Error.cause.
      for (const key of ["code", "status", "statusCode", "errno", "syscall"] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor && "value" in descriptor && ["string", "number", "boolean"].includes(typeof descriptor.value)) {
          result[key] = sensitiveKey(key, state.policy) ? REDACTED : sanitizeValue(descriptor.value, state, depth + 1);
        }
      }
      const cause = Object.getOwnPropertyDescriptor(value, "cause");
      if (cause && "value" in cause) result.cause = sanitizeValue(cause.value, state, depth + 1);
      return result;
    }
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
    const context = authContext(entries);
    for (const [key, entryValue] of entries) {
      result[key] = sensitiveKey(key, state.policy) || sensitiveAuthField(key, entryValue, context)
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
  args: readonly SanitizedValue[],
  redactedArguments: ReadonlySet<number>,
  errors: ReadonlySet<number>,
): Record<string, boolean | number | string> {
  const attributes: Record<string, boolean | number | string> = {
    "log.argument.count": args.length,
  };

  for (const [index, argument] of args.entries()) {
    // A value passed to `token=%o` is sensitive even when its internal field
    // names look innocuous; do not re-export it through structured attributes.
    if (redactedArguments.has(index)) continue;
    if (errors.has(index) && argument && typeof argument === "object" && !Array.isArray(argument)) {
      if (typeof argument.name === "string") attributes["exception.type"] = argument.name;
      if (typeof argument.message === "string") attributes["exception.message"] = argument.message;
      if (typeof argument.stack === "string") attributes["exception.stacktrace"] = argument.stack;
      for (const key of ["code", "status", "statusCode"]) {
        const value = argument[key];
        if (typeof value === "string" || typeof value === "number") attributes[`exception.${key}`] = value;
      }
      continue;
    }

    if (!argument || typeof argument !== "object" || Array.isArray(argument)) {
      continue;
    }
    for (const [key, value] of Object.entries(argument).slice(0, MAX_ENTRIES)) {
      if (
        typeof value === "boolean" ||
        typeof value === "number" ||
        typeof value === "string"
      ) {
        attributes[key] = value;
      }
    }
  }

  return attributes;
}

export function emitOutrayLog(
  logger: Pick<Logger, "emit">,
  level: OutrayLogLevel,
  args: readonly unknown[],
  redactedFields: readonly string[] = [],
): void {
  try {
    const state: SanitizeState = { seen: new WeakSet(), truncated: false, policy: createRedactionPolicy(redactedFields) };
    const redactedArguments = sensitiveFormatArguments(args, state.policy);
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
    const redactedBody = redactText(unboundedBody, state.policy);
    const body = truncateUtf8(redactedBody, MAX_LOG_BYTES);
    logger.emit({
      attributes: {
        ...attributesFromArguments(sanitized, redactedArguments, new Set(args.flatMap((argument, index) => argument instanceof Error ? [index] : []))),
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
  redactedFields: readonly string[] = [],
): OutrayLogMethods {
  const original = snapshotConsole(target);
  const write = (level: Exclude<OutrayLogLevel, "log">, args: unknown[]) => {
    original[level].apply(target, args);
    if (!logCaptureAllowed(shouldCaptureLog)) return;
    emitOutrayLog(logger, level, args, redactedFields);
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
  redactedFields: readonly string[] = [],
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
          emitOutrayLog(logger, level, args, redactedFields);
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
