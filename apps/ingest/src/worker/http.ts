import { apiKeyFromHeaders, type IngestAuthContext } from "../auth.js";
import { Buffer } from "node:buffer";
import { parseLogsPayload } from "../logs.js";
import { parseMetricsPayload } from "../metrics.js";
import { parseTracePayload } from "../otlp.js";
import {
  decodeLogsRequest,
  decodeMetricsRequest,
  decodeTraceRequest,
  encodeLogsResponse,
  encodeMetricsResponse,
  encodeTraceResponse,
} from "../protobuf.js";
import {
  toTinybirdLog,
  toTinybirdMetric,
  toTinybirdSpan,
} from "../tinybird.js";
import type { IngestRecord, IngestSignal } from "./delivery.js";

export interface HttpDependencies {
  authenticate(apiKey: string): Promise<IngestAuthContext | null>;
  allowRequest(organizationId: string): Promise<boolean>;
  enqueue(signal: IngestSignal, records: IngestRecord[]): Promise<void>;
  maxPayloadBytes?: number;
  maxRecords?: number;
  maxNormalizedBytes?: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429
        ? { "Retry-After": "60" }
        : status === 503
          ? { "Retry-After": "2" }
          : {}),
    },
  });
}

function normalizeWithinBudget<T>(
  items: T[],
  convert: (item: T) => IngestRecord,
  budget: number,
) {
  const rows: IngestRecord[] = [];
  let bytes = 0;
  for (const item of items) {
    const row = convert(item);
    const size = Buffer.byteLength(JSON.stringify(row), "utf8");
    // Resource/scope attributes are shared in OTLP but repeated per Tinybird
    // row. Bound that amplification before retaining the normalized records.
    if (bytes + size > budget) break;
    bytes += size;
    rows.push(row);
  }
  return { rows, rejected: items.length - rows.length };
}

async function readBody(request: Request, limit: number) {
  const encoding = request.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();
  if (encoding && encoding !== "identity" && encoding !== "gzip") {
    throw new HttpError(415, "Unsupported Content-Encoding");
  }
  if (Number(request.headers.get("content-length")) > limit) {
    throw new HttpError(413, "OTLP payload is too large");
  }
  if (!request.body) return new Uint8Array();
  let encodedBytes = 0;
  const bounded = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        encodedBytes += chunk.byteLength;
        if (encodedBytes > limit)
          throw new HttpError(413, "OTLP payload is too large");
        controller.enqueue(chunk);
      },
    }),
  );
  const stream =
    encoding === "gzip"
      ? bounded.pipeThrough(new DecompressionStream("gzip"))
      : bounded;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        throw new HttpError(
          encoding === "gzip" ? 400 : 413,
          encoding === "gzip"
            ? "Invalid or oversized gzip payload"
            : "OTLP payload is too large",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof HttpError) throw error;
    if (encoding === "gzip")
      throw new HttpError(400, "Invalid or oversized gzip payload");
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Native Worker request handler; dependencies also enable wire-contract tests. */
export async function handleIngestRequest(
  request: Request,
  dependencies: HttpDependencies,
): Promise<Response> {
  try {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") {
      return json(200, {
        status: "ok",
        service: "outray-ingest",
        runtime: "cloudflare-workers",
      });
    }
    const signal = path.match(
      /^\/(?:api\/otlp\/)?v1\/(traces|logs|metrics)$/,
    )?.[1] as IngestSignal | undefined;
    if (request.method !== "POST" || !signal)
      return json(404, { message: "Not found" });
    const contentType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (
      contentType !== "application/json" &&
      contentType !== "application/x-protobuf"
    ) {
      throw new HttpError(
        415,
        "Content-Type must be application/json or application/x-protobuf",
      );
    }
    const apiKey = apiKeyFromHeaders(request.headers);
    if (!apiKey) throw new HttpError(401, "Missing OutRay API key");
    const auth = await dependencies.authenticate(apiKey);
    if (!auth) throw new HttpError(401, "Invalid OutRay API key");
    if (!(await dependencies.allowRequest(auth.organizationId))) {
      throw new HttpError(429, "OTLP ingestion rate limit exceeded");
    }
    const body = await readBody(
      request,
      dependencies.maxPayloadBytes ?? 8 * 1024 * 1024,
    );
    const protobuf = contentType === "application/x-protobuf";
    let payload: unknown;
    try {
      payload = protobuf
        ? {
            traces: decodeTraceRequest,
            logs: decodeLogsRequest,
            metrics: decodeMetricsRequest,
          }[signal](body)
        : JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new HttpError(
        400,
        `Request body is not valid OTLP ${protobuf ? "protobuf" : "JSON"}`,
      );
    }
    let rows: IngestRecord[];
    let rejected: number;
    let noun: string;
    const maxRecords = dependencies.maxRecords ?? 10_000;
    const normalizedBudget =
      dependencies.maxNormalizedBytes ?? 16 * 1024 * 1024;
    try {
      if (signal === "traces") {
        const parsed = parseTracePayload(payload, maxRecords);
        const normalized = normalizeWithinBudget(
          parsed.spans,
          (span) =>
            toTinybirdSpan(auth.organizationId, auth.retentionDays, span),
          normalizedBudget,
        );
        rejected = parsed.rejected + normalized.rejected;
        rows = normalized.rows;
        noun = "spans";
      } else if (signal === "logs") {
        const parsed = parseLogsPayload(payload, maxRecords);
        const normalized = normalizeWithinBudget(
          parsed.records,
          (record) =>
            toTinybirdLog(auth.organizationId, auth.retentionDays, record),
          normalizedBudget,
        );
        rejected = parsed.rejected + normalized.rejected;
        rows = normalized.rows;
        noun = "log records";
      } else {
        const parsed = parseMetricsPayload(payload, maxRecords);
        const normalized = normalizeWithinBudget(
          parsed.points,
          (point) =>
            toTinybirdMetric(auth.organizationId, auth.retentionDays, point),
          normalizedBudget,
        );
        rejected = parsed.rejected + normalized.rejected;
        rows = normalized.rows;
        noun = "metric data points";
      }
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error
          ? error.message
          : `Invalid OTLP ${signal} payload`,
      );
    }
    // Do not use waitUntil here: an accepted export must already be durable.
    await dependencies.enqueue(signal, rows);
    const errorMessage = rejected
      ? `${rejected} invalid or over-limit ${noun} were rejected`
      : "";
    if (protobuf) {
      const encoded = {
        traces: encodeTraceResponse,
        logs: encodeLogsResponse,
        metrics: encodeMetricsResponse,
      }[signal](rejected, errorMessage);
      return new Response(new Uint8Array(encoded).buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/x-protobuf",
          "Cache-Control": "no-store",
        },
      });
    }
    const rejectedField = {
      traces: "rejectedSpans",
      logs: "rejectedLogRecords",
      metrics: "rejectedDataPoints",
    }[signal];
    return json(
      200,
      rejected
        ? { partialSuccess: { [rejectedField]: rejected, errorMessage } }
        : {},
    );
  } catch (error) {
    if (error instanceof HttpError)
      return json(error.status, { message: error.message });
    // Credentials and captured payloads must never appear in Worker logs.
    console.error("Telemetry ingestion failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return json(503, {
      message: "Telemetry ingestion is temporarily unavailable",
    });
  }
}
