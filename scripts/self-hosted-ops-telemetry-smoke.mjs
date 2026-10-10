// Authorized synthetic end-to-end verification for the independent Ops org.
// Credentials stay in private files/memory; output contains only proof counts/IDs.
import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { opsTinybirdHost } from "./self-hosted-config-tinybird.mjs";
import { assertOpsConfiguration, privateToken, tokenEndpoint } from "./self-hosted-observability-token.mjs";

export const smokeOrganization = "UzVcKEJWFA89IaeLrPgRf4a6H9RNRsIa";
const failure = "Ops telemetry verification failed; credential-bearing diagnostics suppressed. No production data or credentials were changed.";
const fail = () => { throw new Error(failure); };
const logMessage = "OutRay Ops synthetic telemetry verification";

export function smokeArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--file" || !argv[1] || argv[1].startsWith("--")) fail();
  const file = resolve(argv[1]);
  if (!file.endsWith("/instance.env")) fail();
  return { file, integration: resolve(dirname(file), "outray-web-observability.env") };
}

function privateFile(file) {
  const info = lstatSync(file), parent = lstatSync(dirname(file));
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600 || info.nlink !== 1 || info.uid !== process.getuid()
    || !parent.isDirectory() || parent.mode & 0o077 || parent.uid !== process.getuid() || realpathSync(file) !== file || realpathSync(dirname(file)) !== dirname(file)) fail();
  return readFileSync(file, "utf8");
}

export function smokePayloads({ traceId, spanId, nonce, now = Date.now() }) {
  if (!/^[a-f0-9]{32}$/.test(traceId || "") || !/^[a-f0-9]{16}$/.test(spanId || "") || !/^[a-f0-9]{16}$/.test(nonce || "") || !Number.isSafeInteger(now) || now <= 0) fail();
  const service = `outray-ops-smoke-${nonce}`, metricName = `outray.ops.smoke.${nonce}`;
  const start = (BigInt(now) * 1_000_000n).toString(), end = (BigInt(now) * 1_000_000n + 12_000_000n).toString();
  const resource = { attributes: [
    { key: "service.name", value: { stringValue: service } },
    { key: "deployment.environment.name", value: { stringValue: "verification" } },
  ] };
  const scope = { name: "outray-ops-telemetry-smoke", version: "1.0.0" };
  const trace = { resourceSpans: [{ resource, scopeSpans: [{ scope, spans: [{
    traceId, spanId, name: "GET /internal-ops-smoke", kind: 2, startTimeUnixNano: start, endTimeUnixNano: end, status: { code: 1 },
    attributes: [
      { key: "http.request.method", value: { stringValue: "GET" } },
      { key: "url.path", value: { stringValue: "/internal-ops-smoke" } },
      { key: "http.route", value: { stringValue: "/internal-ops-smoke" } },
      { key: "http.response.status_code", value: { intValue: "200" } },
    ],
  }] }] }] };
  const logs = { resourceLogs: [{ resource, scopeLogs: [{ scope, logRecords: [{ timeUnixNano: start, observedTimeUnixNano: start, traceId, spanId, severityNumber: 9, severityText: "INFO", eventName: "ops.smoke.verified", body: { stringValue: logMessage }, attributes: [] }] }] }] };
  const metrics = { resourceMetrics: [{ resource, scopeMetrics: [{ scope, metrics: [{ name: metricName, description: "Synthetic Ops delivery check", unit: "{check}", gauge: { dataPoints: [{ timeUnixNano: start, asInt: "7", attributes: [] }] } }] }] }] };
  return { traceId, spanId, service, metricName, trace, logs, metrics };
}

export function smokeQueries(payload) {
  const common = { organization_id: smokeOrganization, hours: "1", service: payload.service, limit: "3" };
  const queries = {
    traces: ["trace_details", { organization_id: smokeOrganization, trace_id: payload.traceId }],
    logs: ["logs", { ...common, trace_id: payload.traceId }],
    metrics: ["metric_series", { ...common, metric_name: payload.metricName, metric_type: "gauge", interval_seconds: "60" }],
    requests: ["http_requests", { ...common, search: payload.traceId }],
  };
  return Object.fromEntries(Object.entries(queries).map(([signal, [pipe, parameters]]) => [signal, new URL(`/v0/pipes/${pipe}.json?${new URLSearchParams(parameters)}`, opsTinybirdHost)]));
}

export function verifySmokeRows(payload, responses) {
  if (Object.values(responses).some((result) => !Array.isArray(result?.data))) fail();
  if (Object.values(responses).some((result) => result.data.length === 0)) return null;
  if (Object.values(responses).some((result) => result.data.length !== 1)) fail();
  const trace = responses.traces.data[0], log = responses.logs.data[0], metric = responses.metrics.data[0], request = responses.requests.data[0];
  if (trace.trace_id !== payload.traceId || trace.span_id !== payload.spanId || trace.service !== payload.service
    || log.trace_id !== payload.traceId || log.span_id !== payload.spanId || log.service !== payload.service || log.message !== logMessage || !/^[a-f0-9]{64}$/.test(log.id || "")
    || Number(metric.count) !== 1 || Number(metric.value) !== 7 || metric.type !== "gauge"
    || request.trace_id !== payload.traceId || request.span_id !== payload.spanId || request.service !== payload.service || request.method !== "GET" || Number(request.status_code) !== 200) fail();
  return { success: true, traces: 1, logs: 1, metrics: 1, requests: 1, traceId: payload.traceId, spanId: payload.spanId, logEventId: log.id };
}

export async function runSmoke(argv = process.argv.slice(2), dependencies = {}) {
  const { file, integration } = smokeArguments(argv), source = parseEnv(privateFile(file));
  assertOpsConfiguration(source);
  if (source.TINYBIRD_API_HOST !== opsTinybirdHost || !/^[A-Za-z0-9._~+\/=-]{20,4096}$/.test(source.TINYBIRD_QUERY_TOKEN || "")
    || source.TINYBIRD_QUERY_TOKEN === source.TINYBIRD_INGEST_TOKEN) fail();
  const apiKey = privateToken(privateFile(integration)), fetcher = dependencies.fetch || fetch, pause = dependencies.delay || delay;
  const now = dependencies.now || Date.now, deadline = now() + 25_000;
  const request = async (url, options = {}) => {
    const remaining = deadline - now();
    if (remaining <= 0) fail();
    try {
      return await fetcher(url, { ...options, redirect: "error", signal: AbortSignal.timeout(Math.min(6000, remaining)) });
    } catch { fail(); }
  };
  // No writes until the private credentials/config pass and public auth/path
  // boundaries respond correctly. Invalid auth cannot enqueue any records.
  const [unauthorized, unknown] = await Promise.all([
    request(new URL("/v1/traces", tokenEndpoint), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceSpans: [] }) }),
    request(new URL("/not-a-telemetry-route", tokenEndpoint)),
  ]);
  if (unauthorized.status !== 401 || unknown.status !== 404) fail();
  await Promise.all([unauthorized.body?.cancel(), unknown.body?.cancel()]);
  const payload = smokePayloads({ traceId: randomBytes(16).toString("hex"), spanId: randomBytes(8).toString("hex"), nonce: randomBytes(8).toString("hex"), now: now() });
  const receipts = await Promise.all([["traces", payload.trace], ["logs", payload.logs], ["metrics", payload.metrics]].map(async ([signal, body]) => {
    const response = await request(new URL(`/v1/${signal}`, tokenEndpoint), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
    if (response.status !== 200) fail();
    let receipt;
    try { receipt = await response.json(); } catch { fail(); }
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) || Object.keys(receipt).length !== 0) fail();
    return signal;
  }));
  if (receipts.length !== 3) fail();
  const queries = smokeQueries(payload);
  for (let attempt = 0; attempt < 12 && now() < deadline; attempt++) {
    const responses = Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([signal, url]) => {
      const response = await request(url, { headers: { Authorization: `Bearer ${source.TINYBIRD_QUERY_TOKEN}` } });
      if (!response.ok) fail();
      let result;
      try { result = await response.json(); } catch { fail(); }
      return [signal, result];
    })));
    const result = verifySmokeRows(payload, responses);
    if (result) { console.log(JSON.stringify(result)); return result; }
    if (deadline - now() <= 1000) break;
    await pause(1000);
  }
  fail();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runSmoke(); } catch { console.error(failure); process.exitCode = 1; }
}
