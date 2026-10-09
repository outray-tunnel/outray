import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import Redis from "ioredis";
import pg from "pg";

const TARGET_ORG_SLUG = process.env.OUTRAY_SEED_ORG?.trim() || "outray-tunnel";
const EXPECTED_TINYBIRD_BRANCH = "development";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MAX_REQUEST_COUNT = 250_000;
const MAX_PROTOCOL_COUNT = 64_000;
const MAX_TINYBIRD_TOTAL = 2_000_000;

function boundedInteger(value, fallback, name, maximum, minimum = 0) {
  const count = value ?? fallback;
  if (!Number.isSafeInteger(count) || count < minimum || count > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return count;
}

function seedNow(options) {
  const wallNow = Date.now();
  const now = options.now ?? wallNow;
  if (!Number.isSafeInteger(now) || Math.abs(now) > 8_640_000_000_000_000 || now > wallNow) {
    throw new Error("now must be a valid epoch-millisecond timestamp at or before the current time");
  }
  return now;
}

export const TUNNELS = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Public API",
    url: "https://outray-dev-api.outray.app",
    protocol: "http",
    remotePort: null,
    online: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Checkout Webhooks",
    url: "https://outray-dev-webhooks.outray.app",
    protocol: "http",
    remotePort: null,
    online: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Postgres Preview",
    url: "tcp://outray-dev-postgres.outray.app:15432",
    protocol: "tcp",
    remotePort: 15432,
    online: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Game Events",
    url: "udp://outray-dev-events.outray.app:19000",
    protocol: "udp",
    remotePort: 19000,
    online: false,
  },
];

const additionalTunnels = [
  ["Storefront", "storefront", "http", null, true],
  ["Admin Dashboard", "admin", "http", null, true],
  ["Media API", "media", "http", null, true],
  ["Authentication", "auth", "http", null, true],
  ["Payment Gateway", "payments", "http", null, true],
  ["Documentation", "docs", "http", null, true],
  ["Notification Webhooks", "notifications", "http", null, true],
  ["Search API", "search", "http", null, true],
  ["Preview: feature / checkout redesign", "checkout-preview", "http", null, false],
  ["Internal Tools", "tools", "http", null, false],
  ["Redis Development", "redis", "tcp", 16379, true],
  ["SSH Workspace", "ssh", "tcp", 12222, true],
  ["Analytics Database", "analytics-db", "tcp", 15433, false],
  ["Telemetry Collector", "telemetry", "udp", 14317, false],
];
for (const [index, [name, slug, protocol, remotePort, online]] of additionalTunnels.entries()) {
  TUNNELS.push({
    id: `10000000-0000-4000-8000-${String(index + 5).padStart(12, "0")}`,
    name,
    url: `${protocol === "http" ? "https" : protocol}://outray-dev-${slug}.outray.app${remotePort ? `:${remotePort}` : ""}`,
    protocol,
    remotePort,
    online,
  });
}

export const SUBDOMAINS = [
  "outray-dev-api", "outray-dev-webhooks",
  ...additionalTunnels.filter((entry) => entry[2] === "http").map((entry) => `outray-dev-${entry[1]}`),
  ...Array.from({ length: 36 }, (_, index) => `outray-dev-preview-${String(index + 1).padStart(2, "0")}`),
];
export const DOMAINS = [
  ["api.dev.outray.test", "active"],
  ["hooks.dev.outray.test", "pending"],
  ["old.dev.outray.test", "failed"],
  ...["storefront", "admin", "media", "auth", "payments", "docs", "notifications", "search", "preview", "tools", "analytics", "assets", "mobile", "sandbox", "customer-portal"]
    .map((name, index) => [`${name}.dev.outray.test`, ["active", "active", "pending", "failed"][index % 4]]),
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsedUrl(name) {
  const raw = required(name);
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

export function assertDevelopmentTarget(name, url) {
  const host = url.hostname.toLowerCase();
  if (!/(^localhost$|^127\.0\.0\.1$|^\[::1\]$|(^|[.-])(dev|development)([.-]|$))/.test(host)) {
    throw new Error(
      `${name} points at ${host}, which does not look like a development service. Refusing to seed.`,
    );
  }
}

export function assertDevelopmentConfiguration(env = process.env) {
  if (env.NODE_ENV === "production") throw new Error("Refusing to seed with NODE_ENV=production");
  if (env.TINYBIRD_BRANCH !== EXPECTED_TINYBIRD_BRANCH) {
    throw new Error(`TINYBIRD_BRANCH must be ${EXPECTED_TINYBIRD_BRANCH} before any seed writes`);
  }
  for (const key of ["TINYBIRD_API_HOST", "TINYBIRD_INGEST_TOKEN", "TINYBIRD_QUERY_TOKEN"]) {
    if (!env[key]?.trim()) throw new Error(`${key} is required before any seed writes`);
  }
}

async function assertFixtureOwnership(client, organizationId) {
  const checks = [
    ["tunnels", "id", TUNNELS.map((entry) => entry.id)],
    ["tunnels", "url", TUNNELS.map((entry) => entry.url)],
    ["subdomains", "id", SUBDOMAINS.map((_, index) => `seed-dev-subdomain-${index + 1}`)],
    ["subdomains", "subdomain", SUBDOMAINS],
    ["domains", "id", DOMAINS.map((_, index) => `seed-dev-domain-${index + 1}`)],
    ["domains", "domain", DOMAINS.map(([domain]) => domain)],
    ["observability_alerts", "id", ["seed-dev-alert-latency", "seed-dev-alert-errors", "seed-dev-alert-worker"]],
    ["incidents", "id", ["seed-dev-incident-1", "seed-dev-incident-2"]],
    ["notifications", "id", ["seed-dev-notification-1", "seed-dev-notification-2"]],
  ];
  for (const [table, field, values] of checks) {
    const result = await client.query(
      `SELECT 1 FROM ${table} WHERE ${field} = ANY($1::text[]) AND organization_id IS DISTINCT FROM $2 LIMIT 1`,
      [values, organizationId],
    );
    if (result.rowCount) throw new Error(`Development fixtures in ${table} belong to another organization; refusing to overwrite`);
  }
  const statusBinding = await client.query(
    "SELECT 1 FROM domains WHERE domain = ANY($1::text[]) AND purpose <> 'tunnel' LIMIT 1",
    [DOMAINS.map(([domain]) => domain)],
  );
  if (statusBinding.rowCount) throw new Error("A fixture domain is bound to a status page; refusing to overwrite");
}

function pgOptions(name) {
  const url = parsedUrl(name);
  assertDevelopmentTarget(name, url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  const sslMode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: local
      ? false
      : sslMode || process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false"
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hex(value, length) {
  return hash(value).slice(0, length);
}

function seededNumber(value, min, max) {
  const integer = Number.parseInt(hash(value).slice(0, 8), 16);
  return min + (integer / 0xffffffff) * (max - min);
}

function iso(milliseconds) {
  return new Date(milliseconds).toISOString();
}

function onlineKey(tunnel) {
  const hostname = new URL(tunnel.url).hostname;
  return tunnel.protocol === "http" ? hostname : hostname.split(".")[0];
}

function chunked(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function retryDeadlocks(action, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (error?.code !== "40P01" || attempt === attempts) throw error;
      const delayMs = attempt * 750;
      console.warn(`PostgreSQL deadlock detected; retrying in ${delayMs} ms (${attempt}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function insertJson(client, table, columns, records, batchSize = 500) {
  if (!records.length) return;
  const definitions = columns.map(([name, type]) => `${name} ${type}`).join(", ");
  const names = columns.map(([name]) => name).join(", ");
  for (const batch of chunked(records, batchSize)) {
    await client.query(
      `INSERT INTO ${table} (${names}) SELECT ${names} FROM jsonb_to_recordset($1::jsonb) AS row(${definitions})`,
      [JSON.stringify(batch)],
    );
  }
}

export async function seedPrimaryDatabase(client, organization, user) {
  await client.query("BEGIN");
  try {
    await assertFixtureOwnership(client, organization.id);
    for (const tunnel of TUNNELS) {
      await client.query(
        `INSERT INTO tunnels
          (id, url, name, protocol, remote_port, user_id, organization_id, last_seen_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '35 days', NOW())
         ON CONFLICT (id) DO UPDATE SET
          url = EXCLUDED.url,
          name = EXCLUDED.name,
          protocol = EXCLUDED.protocol,
          remote_port = EXCLUDED.remote_port,
          user_id = EXCLUDED.user_id,
          organization_id = EXCLUDED.organization_id,
          last_seen_at = EXCLUDED.last_seen_at,
          updated_at = NOW()
         WHERE tunnels.organization_id = EXCLUDED.organization_id`,
        [
          tunnel.id,
          tunnel.url,
          tunnel.name,
          tunnel.protocol,
          tunnel.remotePort,
          user.id,
          organization.id,
          tunnel.online ? new Date() : new Date(Date.now() - 2 * DAY_MS),
        ],
      );
    }

    await client.query(
      `INSERT INTO organization_settings
        (id, organization_id, full_capture_enabled, created_at, updated_at)
       VALUES ('seed-dev-org-settings-' || $1, $1, true, NOW(), NOW())
       ON CONFLICT (organization_id) DO NOTHING`,
      [organization.id],
    );

    await client.query(
      `INSERT INTO subscriptions
        (id, organization_id, plan, status, billing_interval, current_period_end, cancel_at_period_end, created_at, updated_at)
       VALUES ('seed-dev-subscription-' || $1, $1, 'pulse', 'active', 'month', NOW() + INTERVAL '30 days', false, NOW(), NOW())
       ON CONFLICT (organization_id) DO NOTHING`,
      [organization.id],
    );

    for (const [index, subdomain] of SUBDOMAINS.entries()) {
      await client.query(
        `INSERT INTO subdomains (id, subdomain, organization_id, user_id, created_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '30 days')
         ON CONFLICT (subdomain) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          user_id = EXCLUDED.user_id
         WHERE subdomains.organization_id = EXCLUDED.organization_id`,
        [`seed-dev-subdomain-${index + 1}`, subdomain, organization.id, user.id],
      );
    }

    for (const [index, [domain, status]] of DOMAINS.entries()) {
      await client.query(
        `INSERT INTO domains
          (id, domain, organization_id, user_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '20 days', NOW())
         ON CONFLICT (domain) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          user_id = EXCLUDED.user_id,
          status = EXCLUDED.status,
          updated_at = NOW()
         WHERE domains.organization_id = EXCLUDED.organization_id AND domains.purpose = 'tunnel'`,
        [`seed-dev-domain-${index + 1}`, domain, organization.id, user.id, status],
      );
    }

    const alerts = [
      {
        id: "seed-dev-alert-latency",
        name: "API latency is elevated",
        description: "Warn when checkout-api p95 latency exceeds 750 ms.",
        signal: "request_latency_p95",
        service: "checkout-api",
        operator: "gt",
        threshold: 750,
        state: "firing",
        value: 982,
        samples: 187,
      },
      {
        id: "seed-dev-alert-errors",
        name: "Web error rate",
        description: "Track the production web error rate.",
        signal: "request_error_rate",
        service: "storefront-web",
        operator: "gt",
        threshold: 5,
        state: "healthy",
        value: 0.8,
        samples: 614,
      },
      {
        id: "seed-dev-alert-worker",
        name: "Worker heartbeat",
        description: "Alert when the payments worker stops reporting.",
        signal: "no_telemetry",
        service: "payments-worker",
        operator: "gt",
        threshold: 0,
        state: "no_data",
        value: null,
        samples: 0,
      },
    ];

    for (const alert of alerts) {
      await client.query(
        `INSERT INTO observability_alerts
          (id, organization_id, created_by, name, description, signal, service, environment,
           operator, threshold, window_minutes, evaluation_interval_seconds,
           consecutive_failures, consecutive_recoveries, minimum_samples, no_data_state,
           notification_email, enabled, underlying_state, current_value, sample_count,
           failure_streak, recovery_streak, last_evaluated_at, last_state_changed_at,
           next_evaluation_at, created_at, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, 'development', $8, $9, 5, 60,
           2, 2, 5, 'no_data', $10, false, $11, $12, $13,
           $14, $15, NOW() - INTERVAL '1 minute', NOW() - INTERVAL '25 minutes',
           NOW() + INTERVAL '1 hour', NOW() - INTERVAL '14 days', NOW())
         ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          service = EXCLUDED.service,
          underlying_state = EXCLUDED.underlying_state,
          current_value = EXCLUDED.current_value,
          sample_count = EXCLUDED.sample_count,
          enabled = false,
          notification_email = NULL,
          notification_emails = ARRAY[]::text[],
          last_evaluated_at = EXCLUDED.last_evaluated_at,
          next_evaluation_at = EXCLUDED.next_evaluation_at,
          updated_at = NOW()
         WHERE observability_alerts.organization_id = EXCLUDED.organization_id`,
        [
          alert.id,
          organization.id,
          user.id,
          alert.name,
          alert.description,
          alert.signal,
          alert.service,
          alert.operator,
          alert.threshold,
          null,
          alert.state,
          alert.value,
          alert.samples,
          alert.state === "firing" ? 3 : 0,
          alert.state === "healthy" ? 4 : 0,
        ],
      );

      await client.query(
        `DELETE FROM observability_alert_evaluations WHERE id LIKE $1 AND organization_id = $2`,
        [`${alert.id}:%`, organization.id],
      );
      for (let point = 0; point < 36; point += 1) {
        const evaluatedAt = new Date(Date.now() - (35 - point) * 5 * 60_000);
        const noData = alert.state === "no_data" && point > 29;
        const base = alert.id.endsWith("latency") ? 620 : 0.7;
        const value = noData
          ? null
          : base + seededNumber(`${alert.id}:${point}`, 0, alert.id.endsWith("latency") ? 480 : 2.2);
        const breached = value !== null && value > alert.threshold;
        const state = noData ? "no_data" : breached ? "firing" : "healthy";
        await client.query(
          `INSERT INTO observability_alert_evaluations
            (id, organization_id, alert_id, evaluated_at, window_started_at, window_ended_at,
             status, value, sample_count, breached, previous_state, resulting_state,
             query_duration_ms, created_at)
           VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz - INTERVAL '5 minutes',
             $4::timestamptz, $5, $6, $7, $8, $9, $9, $10, $4::timestamptz)`,
          [
            `${alert.id}:${point}`,
            organization.id,
            alert.id,
            evaluatedAt,
            noData ? "no_data" : "success",
            value,
            noData ? 0 : 40 + point,
            noData ? null : breached,
            state,
            18 + (point % 11),
          ],
        );
      }
    }

    await client.query(`DELETE FROM notifications WHERE id LIKE 'seed-dev-notification-%' AND organization_id = $1`, [organization.id]);
    await client.query(`DELETE FROM incidents WHERE id LIKE 'seed-dev-incident-%' AND organization_id = $1`, [organization.id]);

    const incidents = [
      {
        id: "seed-dev-incident-1",
        alert: alerts[0],
        status: "open",
        trigger: 914,
        last: 982,
        resolved: null,
        started: "42 minutes",
      },
      {
        id: "seed-dev-incident-2",
        alert: alerts[1],
        status: "resolved",
        trigger: 7.2,
        last: 0.8,
        resolved: 0.8,
        started: "3 days",
      },
    ];
    for (const [index, incident] of incidents.entries()) {
      await client.query(
        `INSERT INTO incidents
          (id, organization_id, source_type, source_id, status, title, source_snapshot,
           trigger_value, last_value, resolved_value, started_at, resolved_at, created_at, updated_at)
         VALUES ($1, $2, 'observability_alert', $3, $4::text, $5, $6, $7, $8, $9,
           NOW() - $10::interval,
           CASE WHEN $4::text = 'resolved' THEN NOW() - INTERVAL '2 days 20 hours' ELSE NULL END,
           NOW() - $10::interval, NOW())`,
        [
          incident.id,
          organization.id,
          incident.alert.id,
          incident.status,
          incident.alert.name,
          JSON.stringify({ service: incident.alert.service, signal: incident.alert.signal }),
          incident.trigger,
          incident.last,
          incident.resolved,
          incident.started,
        ],
      );
      await client.query(
        `INSERT INTO notifications
          (id, organization_id, incident_id, source_type, source_id, event, channel,
           recipient, payload, idempotency_key, status, attempts, max_attempts,
           next_attempt_at, sent_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'observability_alert', $4, $5, 'email', $6, $7, $8,
           'sent', 1, 5, NOW(), NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes', NOW())`,
        [
          `seed-dev-notification-${index + 1}`,
          organization.id,
          incident.id,
          incident.alert.id,
          incident.status === "open" ? "firing" : "resolved",
          "demo@example.invalid",
          JSON.stringify({ alertName: incident.alert.name, service: incident.alert.service }),
          `seed-dev:${incident.id}:${incident.status}`,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function buildTunnelEvents(organizationId, options = {}) {
  const events = [];
  const captures = [];
  const count = boundedInteger(options.count, 14_400, "request count", MAX_REQUEST_COUNT);
  const now = seedNow(options);
  const httpTunnels = TUNNELS.filter((tunnel) => tunnel.protocol === "http");
  const methods = ["GET", "GET", "GET", "POST", "POST", "PATCH", "DELETE"];
  const routes = [
    "/api/orders",
    "/api/orders/ord_42",
    "/api/products",
    "/api/checkout",
    "/webhooks/payment",
    "/health",
    "/api/customers/cus_17",
  ];

  for (let index = 0; index < count; index += 1) {
    const tunnel = httpTunnels[index % httpTunnels.length];
    const ageRatio = index / Math.max(1, count - 1);
    const age = Math.pow(ageRatio, 2.4) * 29.5 * DAY_MS;
    const timestamp = new Date(now - age);
    const requestId = `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const roll = seededNumber(`tunnel-status:${index}`, 0, 100);
    const statusCode = roll < 2.5 ? 500 : roll < 8 ? 404 : roll < 13 ? 401 : index % 11 === 0 ? 201 : 200;
    const method = methods[index % methods.length];
    const path = routes[index % routes.length];
    const duration = Math.round(
      seededNumber(`tunnel-duration:${index}`, 18, 340) +
        (statusCode >= 500 ? seededNumber(`slow:${index}`, 500, 1800) : 0),
    );
    const bytesIn = Math.round(seededNumber(`bytes-in:${index}`, 80, 8_000));
    const bytesOut = Math.round(seededNumber(`bytes-out:${index}`, 240, 64_000));
    // Offset each rotation so captures cover every HTTP tunnel, not just one.
    const captured = (index + Math.floor(index / httpTunnels.length)) % 4 === 0;

    events.push({
      timestamp,
      tunnel_id: tunnel.id,
      organization_id: organizationId,
      retention_days: 90,
      host: new URL(tunnel.url).hostname,
      method,
      path,
      status_code: statusCode,
      request_duration_ms: duration,
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      client_ip: `203.0.113.${(index % 220) + 1}`,
      user_agent: index % 4 === 0 ? "OutRaySeed/1.0" : "Mozilla/5.0 (development seed)",
      request_id: captured ? requestId : null,
    });

    if (captured) {
      const responseBody =
        statusCode >= 500
          ? { error: "upstream_timeout", requestId }
          : { ok: true, id: `resource_${String(index).padStart(4, "0")}` };
      const format = Math.floor(index / (httpTunnels.length * 4)) % 4;
      const contentType = ["application/json", "text/plain", "text/html", "application/x-www-form-urlencoded"][format];
      const requestBody = format === 0
        ? JSON.stringify({ quantity: (index % 5) + 1, source: "development-seed" }, null, 2)
        : format === 1 ? "Synthetic development payload\nNo real credentials or customer data."
        : format === 2 ? "<!doctype html><html><body><p>Development preview</p></body></html>"
        : "quantity=2&source=development-seed";
      const formattedResponse = format === 0 ? JSON.stringify(responseBody, null, 2)
        : format === 1 ? (statusCode >= 500 ? "Upstream timed out" : "OK: development fixture")
        : format === 2 ? "<!doctype html><html><body><h1>Preview ready</h1></body></html>"
        : "ok=true&source=development-seed";
      captures.push({
        id: requestId,
        timestamp,
        tunnel_id: tunnel.id,
        organization_id: organizationId,
        retention_days: 90,
        request_headers: {
          "content-type": contentType,
          "x-request-id": requestId,
          authorization: "[REDACTED]",
        },
        request_body: requestBody,
        request_body_size: Buffer.byteLength(requestBody),
        response_headers: { "content-type": contentType, "x-powered-by": "OutRay" },
        response_body: formattedResponse,
        response_body_size: Buffer.byteLength(formattedResponse),
      });
    }
  }

  return { events, captures };
}

export function buildProtocolEvents(organizationId, options = {}) {
  const records = [];
  const count = boundedInteger(options.count, 3_200, "protocol count", MAX_PROTOCOL_COUNT);
  const now = seedNow(options);
  const connectionTotal = Math.ceil(count / 4);
  const protocolTunnels = TUNNELS.filter((tunnel) => tunnel.protocol !== "http");
  for (let index = 0; index < count; index += 1) {
    const tunnel = protocolTunnels[Math.floor(index / 4) % protocolTunnels.length];
    const protocol = tunnel.protocol;
    const connectionIndex = Math.floor(index / 4);
    const timestamp = new Date(now - 1_000 - Math.pow(connectionIndex / Math.max(1, connectionTotal - 1), 2.4) * 29.5 * DAY_MS + (index % 4) * 100);
    records.push({
      timestamp,
      tunnel_id: tunnel.id,
      organization_id: organizationId,
      retention_days: 90,
      protocol,
      event_type: protocol === "tcp" ? ["connection", "data", "data", "close"][index % 4] : "packet",
      connection_id: protocol === "tcp" ? `seed-conn-${tunnel.id}-${Math.floor(index / 4)}` : "",
      client_ip: `198.51.100.${(connectionIndex % 220) + 1}`,
      client_port: 20_000 + (connectionIndex % 20_000),
      bytes_in: Math.round(seededNumber(`protocol-in:${index}`, 40, 32_000)),
      bytes_out: Math.round(seededNumber(`protocol-out:${index}`, 40, 48_000)),
      duration_ms: protocol === "tcp" ? Math.round(seededNumber(`protocol-duration:${index}`, 20, 18_000)) : 0,
    });
  }
  return records;
}

/** Pure Tinybird fixture mapping. Repeated delivery of a batch uses identical keys. */
export function buildTunnelTinybirdRecords(organizationId, options = {}) {
  const now = seedNow(options);
  const timestamp = (value) => new Date(value).toISOString().replace("T", " ").replace("Z", "");
  const version = timestamp(now);
  const { events, captures } = buildTunnelEvents(organizationId, { count: options.requestCount, now });
  const protocols = buildProtocolEvents(organizationId, { count: options.protocolCount, now });
  const map = (row) => ({ ...row, timestamp: timestamp(row.timestamp), ingested_at: version, retention_days: 90 });
  return {
    tunnel_events: events.map((row, index) => ({ ...map(row), event_id: `seed:${organizationId}:http:${index}`, request_id: row.request_id || "" })),
    tunnel_request_captures: captures.map((row) => ({ ...map(row), request_headers: JSON.stringify(row.request_headers), response_headers: JSON.stringify(row.response_headers),
      request_body: row.request_body === null ? null : Buffer.from(row.request_body).toString("base64"),
      response_body: row.response_body === null ? null : Buffer.from(row.response_body).toString("base64") })),
    tunnel_protocol_events: protocols.map((row, index) => ({ ...map(row), event_id: `seed:${organizationId}:protocol:${index}` })),
  };
}

export async function seedTimescale(client, organizationId, options = {}) {
  // Generate/validate before BEGIN so invalid counts never delete existing fixtures.
  const now = seedNow(options);
  const batchSize = boundedInteger(options.batchSize, 500, "batchSize", 10_000, 1);
  const { events, captures } = buildTunnelEvents(organizationId, { count: options.requestCount, now });
  const protocolEvents = buildProtocolEvents(organizationId, { count: options.protocolCount, now });
  const tunnelIds = TUNNELS.map((tunnel) => tunnel.id);
  await client.query("BEGIN");
  try {
    for (const table of ["request_captures", "tunnel_events", "protocol_events"]) {
      await client.query(`DELETE FROM ${table} WHERE tunnel_id = ANY($1::text[]) AND organization_id = $2`, [tunnelIds, organizationId]);
    }

    await insertJson(
      client,
      "tunnel_events",
      [
        ["timestamp", "timestamptz"], ["tunnel_id", "text"], ["organization_id", "text"],
        ["retention_days", "smallint"], ["host", "text"], ["method", "text"], ["path", "text"],
        ["status_code", "smallint"], ["request_duration_ms", "integer"], ["bytes_in", "integer"],
        ["bytes_out", "integer"], ["client_ip", "text"], ["user_agent", "text"], ["request_id", "text"],
      ],
      events,
      batchSize,
    );
    await insertJson(
      client,
      "request_captures",
      [
        ["id", "text"], ["timestamp", "timestamptz"], ["tunnel_id", "text"],
        ["organization_id", "text"], ["retention_days", "smallint"], ["request_headers", "jsonb"],
        ["request_body", "text"], ["request_body_size", "integer"], ["response_headers", "jsonb"],
        ["response_body", "text"], ["response_body_size", "integer"],
      ],
      captures,
      batchSize,
    );
    await insertJson(
      client,
      "protocol_events",
      [
        ["timestamp", "timestamptz"], ["tunnel_id", "text"], ["organization_id", "text"],
        ["retention_days", "smallint"], ["protocol", "text"], ["event_type", "text"],
        ["connection_id", "text"], ["client_ip", "text"], ["client_port", "integer"],
        ["bytes_in", "integer"], ["bytes_out", "integer"], ["duration_ms", "integer"],
      ],
      protocolEvents,
      batchSize,
    );
    await client.query("COMMIT");
    return { requests: events.length, captures: captures.length, protocolEvents: protocolEvents.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function seedRedis(redis, organization, user) {
  const onlineSet = `org:${organization.id}:online_tunnels`;
  const pipeline = redis.pipeline();
  for (const tunnel of TUNNELS) {
    pipeline.srem(onlineSet, tunnel.id);
    pipeline.del(`tunnel:last_seen:${tunnel.id}`);
    pipeline.del(`tunnel:online:${onlineKey(tunnel)}`);
  }
  await pipeline.exec();

  const active = redis.pipeline();
  for (const tunnel of TUNNELS.filter((entry) => entry.online)) {
    const updatedAt = Date.now();
    active.sadd(onlineSet, tunnel.id);
    active.set(`tunnel:last_seen:${tunnel.id}`, String(updatedAt), "EX", 7 * 24 * 60 * 60);
    active.set(
      `tunnel:online:${onlineKey(tunnel)}`,
      JSON.stringify({
        serverId: "development-seed",
        updatedAt,
        organizationId: organization.id,
        userId: user.id,
        dbTunnelId: tunnel.id,
        plan: "pulse",
        retentionDays: 90,
        fullCaptureEnabled: true,
      }),
      "EX",
      7 * 24 * 60 * 60,
    );
  }
  active.sadd("global:orgs_with_online_tunnels", organization.id);
  await active.exec();
  return TUNNELS.filter((entry) => entry.online).length;
}

function baseResource(service, version) {
  return {
    "service.name": service,
    "service.namespace": "outray-development",
    "service.version": version,
    "deployment.environment.name": "development",
    "cloud.region": "eu-west-1",
    "host.name": `${service}-dev-01`,
  };
}

export function buildTinybirdRecords(organizationId, options = {}) {
  const spanStart = boundedInteger(options.spanStart, 0, "spanStart", MAX_TINYBIRD_TOTAL);
  const spanCount = boundedInteger(options.spanCount, 1_440, "spanCount", 100_000);
  const spanTotal = boundedInteger(options.spanTotal, 1_440, "spanTotal", MAX_TINYBIRD_TOTAL, 1);
  const metricStart = boundedInteger(options.metricStart, 0, "metricStart", MAX_TINYBIRD_TOTAL);
  const metricPoints = boundedInteger(options.metricPoints, 192, "metricPoints", 10_000);
  const metricTotal = boundedInteger(options.metricTotal, 192, "metricTotal", MAX_TINYBIRD_TOTAL, 1);
  if (spanStart + spanCount > spanTotal || metricStart + metricPoints > metricTotal) {
    throw new Error("Batch start plus count must not exceed its total");
  }
  const now = seedNow(options);
  const anchor = options.anchor ?? Math.floor(now / HOUR_MS) * HOUR_MS;
  if (!Number.isSafeInteger(anchor) || Math.abs(anchor) > 8_640_000_000_000_000 || anchor > now) {
    throw new Error("anchor must be a valid epoch-millisecond timestamp at or before now");
  }
  const ingestedAt = iso(now);
  const services = [
    { name: "storefront-web", version: "1.8.0", baseMs: 180, errorEvery: 200 },
    { name: "checkout-api", version: "2.4.1", baseMs: 680, errorEvery: 29 },
    { name: "payments-worker", version: "1.3.2", baseMs: 1_350, errorEvery: 13 },
    { name: "inventory-api", version: "3.2.0", baseMs: 240, errorEvery: 43 },
    { name: "notification-worker", version: "1.6.4", baseMs: 430, errorEvery: 37 },
    { name: "edge-gateway", version: "2.1.0", baseMs: 72, errorEvery: 101 },
  ];
  const routes = ["/", "/products", "/api/orders", "/api/checkout", "/api/customers/:customerId", "/health"];
  const methods = ["GET", "GET", "GET", "POST", "PATCH", "GET"];
  const spans = [];
  const logs = [];
  const metrics = [];

  for (let offset = 0; offset < spanCount; offset += 1) {
    const index = spanStart + offset;
    const service = services[index % services.length];
    const traceId = hex(`dev-trace:${organizationId}:${anchor}:${index}`, 32);
    const rootSpanId = hex(`dev-root:${organizationId}:${anchor}:${index}`, 16);
    const isError = index % service.errorEvery === 0;
    const routeIndex = (Math.floor(index / services.length) + index) % routes.length;
    const route = routes[routeIndex];
    const method = methods[routeIndex];
    const durationMs = Math.round(service.baseMs + seededNumber(`trace-duration:${anchor}:${index}`, 20, service.baseMs * 0.75));
    const ageRatio = (spanTotal - 1 - index) / Math.max(1, spanTotal - 1);
    // The newest trace must finish before the snapshot, even when anchor === now.
    const startMs = Math.min(anchor - Math.pow(ageRatio, 2.4) * 29.5 * DAY_MS, now - durationMs);
    const status = isError ? 503 : index % 17 === 0 ? 201 : 200;
    const requestId = `req_${hex(`${anchor}:${index}`, 18)}`;
    const requestBody = method === "POST" ? JSON.stringify({ cartId: `cart_${index}`, items: 3 }) : "";
    const responseBody = isError
      ? JSON.stringify({ error: "payment_provider_timeout", requestId })
      : JSON.stringify({ ok: true, requestId });
    const captureMode = index % 5 === 0 ? "metadata" : index % 3 === 0 ? "full" : "redacted";
    const captureAttributes =
      captureMode === "metadata"
        ? {}
        : {
            "outray.http.request.headers": JSON.stringify(
              captureMode === "redacted"
                ? { "content-type": "application/json", authorization: "[REDACTED]" }
                : { "content-type": "application/json", "x-seed-mode": "full" },
            ),
            "outray.http.request.body": requestBody,
            "outray.http.response.headers": JSON.stringify({ "content-type": "application/json" }),
            "outray.http.response.body": responseBody,
          };
    const resource = baseResource(service.name, service.version);
    const common = {
      organization_id: organizationId,
      retention_days: 90,
      ingested_at: ingestedAt,
      trace_id: traceId,
      trace_state: "",
      service_name: service.name,
      service_namespace: "outray-development",
      service_version: service.version,
      environment: "development",
      region: "eu-west-1",
      scope_name: "@outray/observability",
      scope_version: "0.1.3",
      resource_attributes: resource,
      scope_attributes: {},
      events: isError ? JSON.stringify([{ name: "exception", attributes: { "exception.type": "UpstreamTimeout" } }]) : "[]",
      links: "[]",
    };
    spans.push({
      ...common,
      start_time: iso(startMs),
      end_time: iso(startMs + durationMs),
      span_id: rootSpanId,
      parent_span_id: "",
      span_name: `${method} ${route}`,
      span_kind: 2,
      duration_nano: durationMs * 1_000_000,
      status_code: isError ? 2 : 1,
      status_message: isError ? "payment provider timed out" : "",
      http_method: method,
      span_attributes: {
        "http.request.method": method,
        "http.route": route,
        "url.path": route.replace(":customerId", "cus_42"),
        "url.scheme": "https",
        "server.address": `${service.name}.dev.outray.test`,
        "http.response.status_code": String(status),
        "http.request.id": requestId,
        "http.request.body.size": String(requestBody.length),
        "http.response.body.size": String(responseBody.length),
        ...captureAttributes,
      },
    });

    const childDefinitions = [
      ["middleware authentication", 0.08, 0.2],
      ["db SELECT orders", 0.24, 0.42],
      ["redis GET session", 0.1, 0.14],
    ];
    for (const [childIndex, [name, offsetRatio, durationRatio]] of childDefinitions.entries()) {
      const childDuration = Math.max(2, Math.round(durationMs * durationRatio));
      const childStart = startMs + Math.round(durationMs * offsetRatio);
      spans.push({
        ...common,
        start_time: iso(childStart),
        end_time: iso(Math.min(startMs + durationMs, childStart + childDuration)),
        span_id: hex(`dev-child:${organizationId}:${anchor}:${index}:${childIndex}`, 16),
        parent_span_id: rootSpanId,
        span_name: name,
        span_kind: name.startsWith("db") ? 3 : 1,
        duration_nano: childDuration * 1_000_000,
        status_code: isError && childIndex === 1 ? 2 : 1,
        status_message: isError && childIndex === 1 ? "query deadline exceeded" : "",
        http_method: "",
        span_attributes: name.startsWith("db")
          ? { "db.system": "postgresql", "db.operation.name": "SELECT", "db.namespace": "outray_dev" }
          : name.startsWith("redis")
            ? { "db.system": "redis", "db.operation.name": "GET" }
            : { "middleware.name": "authentication" },
      });
    }

    const severity = isError ? [17, "ERROR", "error"] : index % 9 === 0 ? [13, "WARN", "warn"] : [9, "INFO", "info"];
    logs.push({
      organization_id: organizationId,
      retention_days: 90,
      ingested_at: ingestedAt,
      event_id: hex(`dev-log:${organizationId}:${anchor}:${index}`, 64),
      timestamp: iso(startMs + Math.min(durationMs, 25)),
      observed_timestamp: iso(startMs + Math.min(durationMs, 30)),
      severity_number: severity[0],
      severity_text: severity[1],
      severity_level: severity[2],
      body: isError
        ? `Request ${requestId} failed because the payment provider timed out`
        : `${method} ${route} completed with status ${status}`,
      event_name: isError ? "request.failed" : "request.completed",
      trace_id: traceId,
      span_id: rootSpanId,
      flags: 1,
      service_name: service.name,
      service_namespace: "outray-development",
      service_version: service.version,
      environment: "development",
      region: "eu-west-1",
      scope_name: "console",
      scope_version: "1.0.0",
      resource_attributes: resource,
      log_attributes: { "http.route": route, "http.request.method": method, "http.response.status_code": String(status), "request.id": requestId },
      scope_attributes: {},
    });
  }

  const metricDefinitions = [
    ["http.server.request.duration", "HTTP server request duration", "ms", "histogram"],
    ["http.server.active_requests", "Active HTTP server requests", "{request}", "gauge"],
    ["process.runtime.nodejs.memory.heap.used", "Node.js heap used", "By", "gauge"],
    ["process.cpu.utilization", "Process CPU utilization", "1", "gauge"],
    ["queue.depth", "Pending background jobs", "{job}", "gauge"],
    ["orders.processed", "Processed orders", "{order}", "sum"],
  ];
  for (let offset = 0; offset < metricPoints; offset += 1) {
    const point = metricStart + offset;
    const timestamp = anchor - Math.pow((metricTotal - 1 - point) / Math.max(1, metricTotal - 1), 2.4) * 29.5 * DAY_MS;
    for (const service of services) {
      for (const [name, description, unit, type] of metricDefinitions) {
        const identity = `${anchor}:${point}:${service.name}:${name}`;
        const base =
          name.includes("duration") ? service.baseMs :
          name.includes("memory") ? 180_000_000 :
          name.includes("cpu") ? 0.24 :
          name.includes("queue") ? (service.name === "payments-worker" ? 42 : 4) :
          name.includes("orders") ? 100 + point * 12 : 6;
        const value = base + seededNumber(identity, 0, Math.max(1, base * 0.35));
        const histogram = type === "histogram";
        metrics.push({
          organization_id: organizationId,
          retention_days: 90,
          ingested_at: ingestedAt,
          event_id: hex(`dev-metric:${organizationId}:${identity}`, 64),
          timestamp: iso(timestamp),
          start_timestamp: type === "gauge" ? null : iso(anchor - 30 * DAY_MS),
          metric_name: name,
          metric_description: description,
          metric_unit: unit,
          metric_type: type,
          aggregation_temporality: type === "gauge" ? 0 : 2,
          is_monotonic: type === "sum" ? 1 : 0,
          value: histogram ? null : value,
          value_int: null,
          count: histogram ? "24" : "0",
          sum: histogram ? value * 24 : null,
          min: histogram ? value * 0.2 : null,
          max: histogram ? value * 2.4 : null,
          bucket_counts: histogram ? ["2", "8", "10", "4"] : [],
          explicit_bounds: histogram ? [100, 300, 750] : [],
          scale: 0,
          zero_count: "0",
          zero_threshold: 0,
          positive_offset: 0,
          positive_bucket_counts: [],
          negative_offset: 0,
          negative_bucket_counts: [],
          quantiles: [],
          quantile_values: [],
          flags: 0,
          service_name: service.name,
          service_namespace: "outray-development",
          service_version: service.version,
          environment: "development",
          region: "eu-west-1",
          resource_attributes: baseResource(service.name, service.version),
          attributes: { "deployment.environment.name": "development", "service.instance.id": `${service.name}-dev-01` },
          scope_name: "@outray/observability",
          scope_version: "0.1.3",
          scope_attributes: {},
          resource_schema_url: "https://opentelemetry.io/schemas/1.27.0",
          scope_schema_url: "",
        });
      }
    }
  }
  return { spans, logs, metrics };
}

async function tinybirdAppend(apiHost, token, dataSource, records) {
  for (const batch of chunked(records, 1_000)) {
    const response = await fetch(`${apiHost}/v0/events?name=${encodeURIComponent(dataSource)}&wait=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-ndjson" },
      body: batch.map((record) => JSON.stringify(record)).join("\n"),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`${dataSource} ingestion failed (${response.status}): ${body.slice(0, 500)}`);
    const result = JSON.parse(body);
    if (Number(result.quarantined_rows || 0) > 0) {
      throw new Error(`${dataSource} quarantined ${result.quarantined_rows} rows: ${body.slice(0, 500)}`);
    }
  }
}

async function seedTinybird(organizationId) {
  if (process.env.TINYBIRD_BRANCH !== EXPECTED_TINYBIRD_BRANCH) {
    throw new Error(
      `TINYBIRD_BRANCH must be ${EXPECTED_TINYBIRD_BRANCH}; got ${process.env.TINYBIRD_BRANCH || "<unset>"}`,
    );
  }
  const apiHost = required("TINYBIRD_API_HOST").replace(/\/$/, "");
  const ingestToken = required("TINYBIRD_INGEST_TOKEN");
  const { spans, logs, metrics } = buildTinybirdRecords(organizationId);
  const tunnelRecords = buildTunnelTinybirdRecords(organizationId);
  await tinybirdAppend(apiHost, ingestToken, "otel_spans", spans);
  await tinybirdAppend(apiHost, ingestToken, "otel_logs", logs);
  await tinybirdAppend(apiHost, ingestToken, "otel_metrics", metrics);
  for (const [source, records] of Object.entries(tunnelRecords)) {
    await tinybirdAppend(apiHost, ingestToken, source, records);
  }
  return { spans: spans.length, logs: logs.length, metrics: metrics.length,
    requests: tunnelRecords.tunnel_events.length, captures: tunnelRecords.tunnel_request_captures.length,
    protocolEvents: tunnelRecords.tunnel_protocol_events.length };
}

async function verifyTinybird(organizationId) {
  const apiHost = required("TINYBIRD_API_HOST").replace(/\/$/, "");
  const token = required("TINYBIRD_QUERY_TOKEN");
  const url = new URL(`${apiHost}/v0/pipes/service_catalog.json`);
  url.searchParams.set("organization_id", organizationId);
  url.searchParams.set("hours", "24");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Tinybird verification failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const result = await response.json();
  return result.data || [];
}

async function main() {
  assertDevelopmentConfiguration();
  const database = new pg.Client(pgOptions("DATABASE_URL"));
  const redisUrl = parsedUrl("REDIS_URL");
  assertDevelopmentTarget("REDIS_URL", redisUrl);
  const redis = new Redis(redisUrl.toString(), { lazyConnect: true, maxRetriesPerRequest: 2 });

  await Promise.all([database.connect(), redis.connect()]);
  try {
    const organizationResult = await database.query(
      `SELECT id, slug, name FROM organizations WHERE slug = $1 LIMIT 1`,
      [TARGET_ORG_SLUG],
    );
    const organization = organizationResult.rows[0];
    if (!organization) throw new Error(`Organization ${TARGET_ORG_SLUG} does not exist`);
    const userResult = await database.query(
      `SELECT users.id, users.email
       FROM members JOIN users ON users.id = members.user_id
       WHERE members.organization_id = $1
       ORDER BY CASE members.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
       LIMIT 1`,
      [organization.id],
    );
    const user = userResult.rows[0];
    if (!user) throw new Error(`Organization ${TARGET_ORG_SLUG} has no member to own seeded resources`);

    await assertFixtureOwnership(database, organization.id);
    await verifyTinybird(organization.id);
    console.log(`Seeding development data for ${organization.name} (${organization.slug})...`);
    await retryDeadlocks(() => seedPrimaryDatabase(database, organization, user));
    const onlineTunnels = await seedRedis(redis, organization, user);
    const tinybirdResult = await seedTinybird(organization.id);
    const services = await verifyTinybird(organization.id);

    console.log("Development seed complete:");
    console.log(`  PostgreSQL: ${TUNNELS.length} tunnels, ${SUBDOMAINS.length} subdomains, ${DOMAINS.length} domains, 3 disabled demo alerts, 2 incidents`);
    console.log(`  Redis: ${onlineTunnels} demo tunnels marked online (not real connections)`);
    console.log(`  Tunnel analytics (Tinybird): ${tinybirdResult.requests} requests, ${tinybirdResult.captures} captures, ${tinybirdResult.protocolEvents} protocol events`);
    console.log(`  Tinybird (${EXPECTED_TINYBIRD_BRANCH}): ${tinybirdResult.spans} spans, ${tinybirdResult.logs} logs, ${tinybirdResult.metrics} metric points`);
    console.log(`  Verified services: ${services.map((service) => service.name).join(", ")}`);
  } finally {
    await Promise.allSettled([database.end(), redis.quit()]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Development seed failed:", error);
    process.exitCode = 1;
  });
}
