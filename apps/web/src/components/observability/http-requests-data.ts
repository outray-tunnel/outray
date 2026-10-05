import { parseServiceLastSeen } from "./services-data";

export type RequestCaptureState = "full" | "metadata" | "redacted";
export type StatusFilter = "all" | "success" | "errors";
export type CaptureFilter = "all" | RequestCaptureState;
export type InspectorTab = "request" | "response" | "context";

export interface HttpRequestSummary {
  id: string;
  requestId: string;
  timestamp: string;
  method: string;
  route: string;
  path: string;
  service: string;
  environment: string;
  region: string;
  statusCode: number;
  duration: number;
  traceId: string;
  spanId: string;
  captureState: RequestCaptureState;
  requestSize: number;
  responseSize: number;
}

export interface HttpRequestDetails extends HttpRequestSummary {
  url: string;
  clientAddress: string;
  userAgent: string;
  protocol: string;
  request: {
    headers: Record<string, string>;
    headersCaptured: boolean;
    headersTruncated: boolean;
    query: Record<string, string>;
    body: string | null;
    bodyCaptured: boolean;
    bodyTruncated: boolean;
    bodyContentType: string;
    size: number;
  };
  response: {
    headers: Record<string, string>;
    headersCaptured: boolean;
    headersTruncated: boolean;
    body: string | null;
    bodyCaptured: boolean;
    bodyTruncated: boolean;
    bodyContentType: string;
    size: number;
  };
  attributes: Record<string, string>;
  resourceAttributes: Record<string, string>;
}

export interface CorrelatedLog {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface RequestStatistics {
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  p95Duration: number;
  payloadCaptureCount: number;
  metadataCount: number;
}

export interface RequestsResponse {
  requests: HttpRequestSummary[];
  statistics: RequestStatistics;
  services?: string[];
  methods?: string[];
  total: number;
  hasMore: boolean;
  nextCursor: RequestCursor | null;
  limit: number;
  range: string;
}

export interface RequestFacets {
  services: string[];
  methods: string[];
}

export interface CachedRequestFacets extends RequestFacets {
  refreshedAt: number;
}

export interface RequestCursor {
  timestamp: string;
  traceId: string;
  spanId: string;
}

export interface RequestDetailsResponse {
  request: HttpRequestDetails;
  logs: CorrelatedLog[];
}

export function formatHttpRequestNumber(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  return Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatHttpRequestDuration(duration?: number | null): string {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) return "—";
  return duration >= 1_000
    ? `${(duration / 1_000).toFixed(2)} s`
    : `${formatHttpRequestNumber(duration)} ms`;
}

export function parseHttpRequestTimestamp(value: string): number | null {
  const timestamp = parseServiceLastSeen(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function formatHttpRequestTime(value: string): string {
  const timestamp = parseHttpRequestTimestamp(value);
  if (timestamp === null) return "—";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
