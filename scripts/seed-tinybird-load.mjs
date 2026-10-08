import { buildTinybirdRecords } from "./seed-development.mjs";

const organizationId = process.env.OUTRAY_LOAD_ORGANIZATION_ID || "";
const spanTotal = Number(process.env.OUTRAY_OTEL_SPANS || 1_000_000);
const spanOffset = Number(process.env.OUTRAY_OTEL_SPAN_OFFSET || 0);
const metricRows = Number(process.env.OUTRAY_OTEL_METRICS || 1_000_000);
const metricOffset = Number(process.env.OUTRAY_OTEL_METRIC_OFFSET || 0);
const metricTotal = Math.ceil(metricRows / 36);
const spanBatchSize = 5_000;
const metricBatchSize = 100;
const remoteStageSeed =
  process.env.OUTRAY_ALLOW_REMOTE_LOAD_SEED === "true" &&
  process.env.OUTRAY_LOAD_SEED_TARGET === "outray.co";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function append(apiHost, token, dataSource, records) {
  const response = await fetch(`${apiHost}/v0/events?name=${encodeURIComponent(dataSource)}&wait=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-ndjson" },
    body: records.map((record) => JSON.stringify(record)).join("\n"),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${dataSource} ingestion failed (${response.status}): ${body.slice(0, 500)}`);
  const result = JSON.parse(body);
  if (Number(result.quarantined_rows || 0) > 0) {
    throw new Error(`${dataSource} quarantined ${result.quarantined_rows} rows: ${body.slice(0, 500)}`);
  }
}

async function main() {
  if (process.env.NODE_ENV === "production" && !remoteStageSeed) {
    throw new Error("Refusing to seed load data in production");
  }
  const allowedBranch =
    process.env.TINYBIRD_BRANCH === "development" ||
    (remoteStageSeed && process.env.TINYBIRD_BRANCH === "next");
  if (!allowedBranch) {
    throw new Error(`TINYBIRD_BRANCH must be development; got ${process.env.TINYBIRD_BRANCH || "<unset>"}`);
  }
  if (!organizationId) throw new Error("OUTRAY_LOAD_ORGANIZATION_ID is required");
  if (!Number.isInteger(spanTotal) || spanTotal < 1 || spanTotal > 2_000_000) {
    throw new Error("OUTRAY_OTEL_SPANS must be an integer between 1 and 2000000");
  }
  const apiHost = required("TINYBIRD_API_HOST").replace(/\/$/, "");
  const token = required("TINYBIRD_INGEST_TOKEN");
  let spans = 0;
  let logs = 0;
  let metrics = 0;

  for (let start = 0; start < spanTotal; start += spanBatchSize) {
    const records = buildTinybirdRecords(organizationId, {
      spanStart: spanOffset + start,
      spanCount: Math.min(spanBatchSize, spanTotal - start),
      spanTotal: spanOffset + spanTotal,
      metricPoints: 0,
    });
    await append(apiHost, token, "otel_spans", records.spans);
    await append(apiHost, token, "otel_logs", records.logs);
    spans += records.spans.length;
    logs += records.logs.length;
    if ((start + records.spans.length) % 100_000 === 0) {
      console.log(`OTEL spans/logs: ${start + records.spans.length}/${spanTotal}`);
    }
  }

  for (let start = 0; start < metricTotal; start += metricBatchSize) {
    const records = buildTinybirdRecords(organizationId, {
      metricStart: metricOffset + start,
      metricPoints: Math.min(metricBatchSize, metricTotal - start),
      metricTotal: metricOffset + metricTotal,
      spanCount: 0,
    });
    await append(apiHost, token, "otel_metrics", records.metrics);
    metrics += records.metrics.length;
    if ((start + Math.min(metricBatchSize, metricTotal - start)) % 1_000 === 0) {
      console.log(`OTEL metric points: ${start + Math.min(metricBatchSize, metricTotal - start)}/${metricTotal}`);
    }
  }
  console.log(JSON.stringify({ organizationId, spans, logs, metrics }));
}

main().catch((error) => {
  console.error(`Tinybird load seed failed: ${error.message}`);
  process.exitCode = 1;
});
