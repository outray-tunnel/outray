import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { gunzipSync } from "node:zlib";
import { Redis } from "ioredis";
import { ApiTokenAuthenticator, apiKeyFromHeaders } from "./auth.js";
import { config } from "./config.js";
import { parseTracePayload } from "./otlp.js";
import { decodeTraceRequest, encodeTraceResponse } from "./protobuf.js";
import { TraceQueue } from "./queue.js";
import { TinybirdIngestClient, toTinybirdSpan } from "./tinybird.js";

const authenticator = new ApiTokenAuthenticator(config.databaseUrl);
const tinybird = new TinybirdIngestClient(
  config.tinybirdApiHost,
  config.tinybirdIngestToken,
);
const traceQueue = new TraceQueue({
  redisUrl: config.redisUrl,
  streamKey: config.queueKey,
  deadLetterKey: config.queueDeadLetterKey,
  group: "tinybird-writers",
  maxEntries: config.queueMaxEntries,
  batchSize: config.queueBatchSize,
  maxDeliveryAttempts: config.queueMaxDeliveryAttempts,
});
const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

redis.on("error", (error: Error) =>
  console.error("Redis ingestion limiter error", error),
);
void redis
  .connect()
  .catch((error: Error) =>
    console.error("Redis ingestion limiter unavailable", error),
  );
traceQueue.start(tinybird);

function sendJson(response: ServerResponse, status: number, body: unknown) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(encoded),
    "Cache-Control": "no-store",
  });
  response.end(encoded);
}

function sendProtobuf(response: ServerResponse, status: number, body: Uint8Array) {
  response.writeHead(status, {
    "Content-Type": "application/x-protobuf",
    "Content-Length": body.byteLength,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > config.maxPayloadBytes) throw new HttpError(413, "OTLP payload is too large");
    chunks.push(buffer);
  }

  const encoded = Buffer.concat(chunks);
  const contentEncoding = request.headers["content-encoding"]?.toLowerCase();
  if (!contentEncoding || contentEncoding === "identity") return encoded;
  if (contentEncoding !== "gzip") throw new HttpError(415, "Unsupported Content-Encoding");

  try {
    const decoded = gunzipSync(encoded, { maxOutputLength: config.maxPayloadBytes + 1 });
    if (decoded.byteLength > config.maxPayloadBytes) throw new Error("payload too large");
    return decoded;
  } catch {
    throw new HttpError(400, "Invalid or oversized gzip payload");
  }
}

async function enforceRateLimit(organizationId: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60_000);
  const key = `otel:rate:${organizationId}:${minute}`;
  try {
    const result = await redis.multi().incr(key).expire(key, 120).exec();
    const count = Number(result?.[0]?.[1] || 0);
    return count <= config.rateLimitPerMinute;
  } catch {
    return true;
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function handleTraces(request: IncomingMessage, response: ServerResponse) {
  const contentType = request.headers["content-type"]
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

  const apiKey = apiKeyFromHeaders(requestHeaders(request));
  if (!apiKey) throw new HttpError(401, "Missing OutRay API key");

  const auth = await authenticator.authenticate(apiKey);
  if (!auth) throw new HttpError(401, "Invalid OutRay API key");
  if (!(await enforceRateLimit(auth.organizationId))) {
    throw new HttpError(429, "OTLP ingestion rate limit exceeded");
  }

  const body = await readBody(request);
  let payload: unknown;
  try {
    payload =
      contentType === "application/x-protobuf"
        ? decodeTraceRequest(body)
        : JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(
      400,
      `Request body is not valid OTLP ${contentType === "application/x-protobuf" ? "protobuf" : "JSON"}`,
    );
  }

  let parsed: ReturnType<typeof parseTracePayload>;
  try {
    parsed = parseTracePayload(payload);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid OTLP trace payload");
  }

  const accepted = parsed.spans.slice(0, config.maxRecordsPerRequest);
  const rejected = parsed.rejected + Math.max(0, parsed.spans.length - accepted.length);
  await traceQueue.enqueue(
    accepted.map((span) =>
      toTinybirdSpan(auth.organizationId, auth.retentionDays, span),
    ),
  );

  const errorMessage = rejected
    ? `${rejected} invalid or over-limit spans were rejected`
    : "";
  if (contentType === "application/x-protobuf") {
    sendProtobuf(response, 200, encodeTraceResponse(rejected, errorMessage));
  } else {
    sendJson(
      response,
      200,
      rejected
        ? {
            partialSuccess: {
              rejectedSpans: rejected,
              errorMessage,
            },
          }
        : {},
    );
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { status: "ok", service: "outray-ingest" });
      return;
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/v1/traces" || url.pathname === "/api/otlp/v1/traces")
    ) {
      await handleTraces(request, response);
      return;
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/v1/logs" || url.pathname === "/v1/metrics")
    ) {
      sendJson(response, 501, { message: "This OTLP signal is not enabled yet" });
      return;
    }

    sendJson(response, 404, { message: "Not found" });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(response, error.status, { message: error.message });
      return;
    }
    console.error("Trace ingestion failed", error);
    sendJson(response, 503, { message: "Telemetry ingestion is temporarily unavailable" });
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`OutRay ingestion listening on http://0.0.0.0:${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; stopping ingestion service`);
  server.close();
  await Promise.allSettled([authenticator.close(), redis.quit(), traceQueue.close()]);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
