import type { CaptureFilter, StatusFilter } from "./http-requests-data";

export type HttpRequestsRange = "1h" | "6h" | "24h" | "7d" | "30d";

export interface HttpRequestsSearch {
  search?: string;
  service?: string;
  method?: string;
  status?: StatusFilter;
  capture?: CaptureFilter;
  range?: HttpRequestsRange;
}

const invalidMethodCharacter = /[^!#$%&'*+\-.^_`|~0-9A-Za-z]/;
const statuses = ["success", "errors"] as const;
const captures = ["full", "metadata", "redacted"] as const;
const ranges = ["6h", "24h", "7d", "30d"] as const;

function isChoice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.some((choice) => choice === value);
}

/** Defaults stay absent so existing links need not supply a search object. */
export function parseHttpRequestsSearch(input: Record<string, unknown>): HttpRequestsSearch {
  const parsed: HttpRequestsSearch = {};
  if (typeof input.search === "string" && input.search.trim()) parsed.search = input.search.trim();
  // Service names are exact identifiers, not already-encoded URL fragments.
  if (typeof input.service === "string" && input.service.trim()) parsed.service = input.service;
  // Methods come from telemetry facets and can include custom RFC HTTP tokens.
  if (typeof input.method === "string" && input.method && input.method !== "all" && !invalidMethodCharacter.test(input.method)) parsed.method = input.method;
  if (isChoice(input.status, statuses)) parsed.status = input.status;
  if (isChoice(input.capture, captures)) parsed.capture = input.capture;
  if (isChoice(input.range, ranges)) parsed.range = input.range;
  return parsed;
}
