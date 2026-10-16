import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLogsPayload } from "../src/logs.js";
import type { AttributeValue, ParsedSpan } from "../src/otlp.js";
import { toTinybirdLog, toTinybirdSpan } from "../src/tinybird.js";

function span(overrides: Partial<ParsedSpan> = {}): ParsedSpan {
  return {
    timestamp: new Date("2026-10-16T10:00:00Z"),
    endTimestamp: new Date("2026-10-16T10:00:01Z"),
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
    parentSpanId: "",
    traceState: "",
    name: "POST /api/auth/sign-in",
    kind: 2,
    durationNano: "1000000000",
    statusCode: 2,
    statusMessage: "Sign-in failed",
    serviceName: "console",
    serviceNamespace: "",
    serviceVersion: "1.0.0",
    environment: "production",
    region: "",
    scopeName: "http",
    scopeVersion: "1.0.0",
    httpMethod: "POST",
    resourceAttributes: {},
    spanAttributes: {},
    scopeAttributes: {},
    events: [],
    links: [],
    ...overrides,
  };
}

function log(body: AttributeValue) {
  const [parsed] = parseLogsPayload({
    resourceLogs: [{
      resource: { attributes: [{ key: "service.name", value: { stringValue: "console" } }] },
      scopeLogs: [{ logRecords: [{
        timeUnixNano: "1792144800000000000",
        severityText: "ERROR",
        body: { stringValue: "Auth failed" },
      }] }],
    }],
  }).records;
  assert(parsed);
  return { ...parsed, body };
}

test("keeps auth errors, response fields and requests while redacting credentials", () => {
  const row = toTinybirdSpan("org_test", 30, span({
    spanAttributes: {
      "http.response.status_code": 403,
      "http.route": "/api/auth/sign-in",
      "outray.http.response.body.content_type": "application/json; charset=utf-8",
      "outray.http.response.body": JSON.stringify({
        code: "INVALID_ORIGIN",
        message: "Origin is not allowed",
        status: 403,
        state: "failed",
        session: { id: "hidden-session-id" },
        token: "hidden-access-token",
        user: { id: "usr_test", email: "user@example.com" },
      }),
      "outray.http.request.body.content_type": "application/x-www-form-urlencoded; charset=utf-8",
      "outray.http.request.body": "email=user%40example.com&password=hidden-password&access_token=hidden-token",
      "outray.http.response.headers": JSON.stringify({
        "set-cookie": ["session=hidden-cookie; Secure", "csrf=hidden-csrf"],
        "x-request-id": "req_test",
        location: "https://outray.co/api/auth/callback/github?code=hidden-code&state=hidden-state&error=invalid_origin",
      }),
    },
  }));
  const response = JSON.parse(row.span_attributes["outray.http.response.body"]!);
  assert.equal(response.code, "INVALID_ORIGIN");
  assert.equal(response.message, "Origin is not allowed");
  assert.equal(response.status, 403);
  assert.equal(response.state, "failed");
  assert.equal(response.session, "[REDACTED]");
  assert.equal(response.user.id, "usr_test");
  const headers = JSON.parse(row.span_attributes["outray.http.response.headers"]!);
  assert.equal(headers["x-request-id"], "req_test");
  assert.equal(headers["set-cookie"], "[REDACTED]");
  assert.match(headers.location, /error=invalid_origin/);
  assert.doesNotMatch(JSON.stringify(row), /hidden-/);
});

test("redacts URL credentials and OAuth values in log bodies and nested redirect URLs", () => {
  const callback = "https://user:password@outray.co/api/auth/callback?c%6fde=hidden-code&state=hidden-state&error=invalid_origin";
  const nested = `https://outray.co/login?redirect=${encodeURIComponent(`/cli/login?code=hidden-cli-code&returnTo=${encodeURIComponent("https://example.com/callback?state=hidden-nested-state")}`)}`;
  const row = toTinybirdLog("org_test", 30, log({
    message: `Callback failed: ${callback}`,
    redirect: nested,
    share: "https://share.outray.co/link#hidden-decryption-key",
    relativeShare: "/share/link#hidden-relative-decryption-key",
    error: { code: "ECONNRESET", status: 502, message: "upstream reset" },
    authorization: "Basic hidden-basic-credential",
    auth_key: "hidden-auth-key",
    credential: "hidden-credential",
  }));
  const body = JSON.parse(row.body);
  assert.equal(body.error.code, "ECONNRESET");
  assert.equal(body.error.status, 502);
  assert.equal(body.error.message, "upstream reset");
  assert.match(body.message, /Callback failed:/);
  assert.match(body.message, /error=invalid_origin/);
  assert.doesNotMatch(row.body, /hidden-|user:password/);
});

test("redacts free-form headers, assignments, JWTs and private keys without dropping logs", () => {
  const body = [
    "Authentication callback failed code=INVALID_ORIGIN status=403",
    "Cookie: arbitrary=hidden-cookie; second=hidden-cookie-two",
    "Authorization: Basic aGlkZGVuLWJhc2lj",
    'error: password=hidden-password {"client_secret":"hidden-client-secret","code":"INVALID_ORIGIN"}',
    "Bearer hidden-bearer",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoaWRkZW4ifQ.hidden-signature",
    "-----BEGIN PRIVATE KEY-----\nhidden-private-key\n-----END PRIVATE KEY-----",
    "connect postgres://hidden-user:hidden-db-password@[invalid]/app",
    "request_id=req_test",
  ].join("\n");
  const row = toTinybirdLog("org_test", 30, log(body));
  assert.match(row.body, /code=INVALID_ORIGIN status=403/);
  assert.match(row.body, /request_id=req_test/);
  assert.doesNotMatch(row.body, /hidden-|aGlkZGVuLWJhc2lj|eyJhbGci/);
});

test("redacts exception/link AnyValue strings and nested kvlists before queuing", () => {
  const row = toTinybirdSpan("org_test", 30, span({
    name: "GET /api/auth/callback?code=hidden-name-code",
    statusMessage: "callback failed https://outray.co/auth?state=hidden-status-state&error=denied",
    spanAttributes: {
      "exception.message": "Error: authorization=hidden-attribute-auth",
      "url.full": "https://outray.co/api/auth/callback?code=hidden-url-code&error=denied",
      "error.code": "INVALID_ORIGIN",
    },
    events: [{
      name: "exception",
      timeUnixNano: "1792144800000000000",
      attributes: [
        { key: "exception.message", value: { stringValue: "Callback failed /auth/callback?code=hidden-event-code&state=hidden-event-state" } },
        { key: "exception.stacktrace", value: { stringValue: "Error: password=hidden-stack-password\n at callback (server.js:10:1)" } },
        { key: "error.code", value: { stringValue: "INVALID_ORIGIN" } },
        { key: "details", value: { kvlistValue: { values: [
          { key: "session_id", value: { stringValue: "hidden-nested-session" } },
          { key: "code", value: { stringValue: "INVALID_ORIGIN" } },
          { key: "message", value: { arrayValue: { values: [{ stringValue: "Bearer hidden-nested-bearer" }] } } },
        ] } } },
      ],
    }],
    links: [{
      traceId: "c".repeat(32),
      spanId: "d".repeat(16),
      attributes: [{ key: "callback", value: { stringValue: "https://outray.co/auth?code=hidden-link-code" } }],
    }],
  }));
  assert.equal(row.status_code, 2);
  assert.match(row.status_message, /callback failed/);
  assert.equal(row.span_attributes["error.code"], "INVALID_ORIGIN");
  const [event] = JSON.parse(row.events);
  assert.equal(event.name, "exception");
  assert.equal(event.attributes[2].value.stringValue, "INVALID_ORIGIN");
  assert.equal(event.attributes[3].value.kvlistValue.values[0].value.stringValue, "[REDACTED]");
  assert.match(row.events, /server.js:10:1/);
  assert.equal(JSON.parse(row.links).length, 1);
  assert.doesNotMatch(JSON.stringify(row), /hidden-/);
});

test("redaction preserves existing capture bounds and does not mutate source records", () => {
  const original = span({
    spanAttributes: {
      authorization: "hidden-auth",
      diagnostic: "x".repeat(30_000),
      "outray.http.response.body.content_type": "application/json",
      "outray.http.response.body": JSON.stringify({ message: "x".repeat(30_000) }),
    },
    events: Array.from({ length: 200 }, () => ({ name: "event", attributes: [] })),
  });
  const row = toTinybirdSpan("org_test", 30, original);
  assert.equal(row.span_attributes.diagnostic!.length, 16_384);
  assert.equal(row.span_attributes["outray.http.response.body"], '"[TRUNCATED]"');
  assert.equal(JSON.parse(row.events).length, 128);
  assert.equal(original.spanAttributes.authorization, "hidden-auth");
  assert.equal(original.events.length, 200);
});
