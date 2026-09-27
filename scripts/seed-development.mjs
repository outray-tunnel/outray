import { createHash } from "node:crypto";

import Redis from "ioredis";
import pg from "pg";

const TARGET_ORG_SLUG = process.env.OUTRAY_SEED_ORG?.trim() || "outray-tunnel";
const EXPECTED_TINYBIRD_BRANCH = "development";
const DAY_MS = 86_400_000;

const TUNNELS = [
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

function assertDevelopmentTarget(name, url) {
  const host = url.hostname.toLowerCase();
  if (!/(^localhost$|^127\.0\.0\.1$|dev|development)/.test(host)) {
    throw new Error(
      `${name} points at ${host}, which does not look like a development service. Refusing to seed.`,
    );
  }
}

function pgOptions(name) {
  const url = parsedUrl(name);
  assertDevelopmentTarget(name, url);
  const sslMode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl:
      sslMode || process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false"
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

async function insertJson(client, table, columns, records) {
  if (!records.length) return;
  const definitions = columns.map(([name, type]) => `${name} ${type}`).join(", ");
  const names = columns.map(([name]) => name).join(", ");
  for (const batch of chunked(records, 500)) {
    await client.query(
      `INSERT INTO ${table} (${names}) SELECT ${names} FROM jsonb_to_recordset($1::jsonb) AS row(${definitions})`,
      [JSON.stringify(batch)],
    );
  }
}

async function seedPrimaryDatabase(client, organization, user) {
  await client.query("BEGIN");
  try {
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
          updated_at = NOW()`,
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
       VALUES ('seed-dev-org-settings', $1, true, NOW(), NOW())
       ON CONFLICT (organization_id) DO UPDATE SET
        full_capture_enabled = true,
        updated_at = NOW()`,
      [organization.id],
    );

    await client.query(
      `INSERT INTO subscriptions
        (id, organization_id, plan, status, billing_interval, current_period_end, cancel_at_period_end, created_at, updated_at)
       VALUES ('seed-dev-subscription', $1, 'pulse', 'active', 'month', NOW() + INTERVAL '30 days', false, NOW(), NOW())
       ON CONFLICT (organization_id) DO UPDATE SET
        plan = 'pulse',
        status = 'active',
        current_period_end = NOW() + INTERVAL '30 days',
        cancel_at_period_end = false,
        updated_at = NOW()`,
      [organization.id],
    );

    const subdomains = ["outray-dev-api", "outray-dev-webhooks"];
    for (const [index, subdomain] of subdomains.entries()) {
      await client.query(
        `INSERT INTO subdomains (id, subdomain, organization_id, user_id, created_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '30 days')
         ON CONFLICT (subdomain) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          user_id = EXCLUDED.user_id`,
        [`seed-dev-subdomain-${index + 1}`, subdomain, organization.id, user.id],
      );
    }

    const domains = [
      ["api.dev.outray.test", "active"],
      ["hooks.dev.outray.test", "pending"],
      ["old.dev.outray.test", "failed"],
    ];
    for (const [index, [domain, status]] of domains.entries()) {
      await client.query(
        `INSERT INTO domains
          (id, domain, organization_id, user_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '20 days', NOW())
         ON CONFLICT (domain) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          user_id = EXCLUDED.user_id,
          status = EXCLUDED.status,
          updated_at = NOW()`,
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
           2, 2, 5, 'no_data', $10, true, $11, $12, $13,
           $14, $15, NOW() - INTERVAL '1 minute', NOW() - INTERVAL '25 minutes',
           NOW() + INTERVAL '1 hour', NOW() - INTERVAL '14 days', NOW())
         ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          service = EXCLUDED.service,
          underlying_state = EXCLUDED.underlying_state,
          current_value = EXCLUDED.current_value,
          sample_count = EXCLUDED.sample_count,
          last_evaluated_at = EXCLUDED.last_evaluated_at,
          next_evaluation_at = EXCLUDED.next_evaluation_at,
          updated_at = NOW()`,
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
          user.email,
          alert.state,
          alert.value,
          alert.samples,
          alert.state === "firing" ? 3 : 0,
          alert.state === "healthy" ? 4 : 0,
        ],
      );

      await client.query(
        `DELETE FROM observability_alert_evaluations WHERE id LIKE $1`,
        [`${alert.id}:%`],
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

    await client.query(`DELETE FROM notifications WHERE id LIKE 'seed-dev-notification-%'`);
    await client.query(`DELETE FROM incidents WHERE id LIKE 'seed-dev-incident-%'`);

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
          user.email,
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

function buildTunnelEvents(organizationId) {
  const events = [];
  const captures = [];
  const now = Date.now();
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

  for (let index = 0; index < 1_440; index += 1) {
    const tunnel = TUNNELS[index % 2];
    const ageRatio = index / 1_439;
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
    const captured = index % 6 === 0;

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
      captures.push({
        id: requestId,
        timestamp,
        tunnel_id: tunnel.id,
        organization_id: organizationId,
        retention_days: 90,
        request_headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          authorization: "[REDACTED]",
        },
        request_body: JSON.stringify({ quantity: (index % 5) + 1, source: "development-seed" }, null, 2),
        request_body_size: bytesIn,
        response_headers: { "content-type": "application/json", "x-powered-by": "OutRay" },
        response_body: JSON.stringify(responseBody, null, 2),
        response_body_size: bytesOut,
      });
    }
  }

  return { events, captures };
}

function buildProtocolEvents(organizationId) {
  const records = [];
  const now = Date.now();
  for (let index = 0; index < 320; index += 1) {
    const tunnel = TUNNELS[index % 2 === 0 ? 2 : 3];
    const protocol = tunnel.protocol;
    const timestamp = new Date(now - Math.pow(index / 319, 2) * 14 * DAY_MS);
    records.push({
      timestamp,
      tunnel_id: tunnel.id,
      organization_id: organizationId,
      retention_days: 90,
      protocol,
      event_type: protocol === "tcp" ? ["connection", "data", "data", "close"][index % 4] : "packet",
      connection_id: protocol === "tcp" ? `conn-${Math.floor(index / 4)}` : "",
      client_ip: `198.51.100.${(index % 220) + 1}`,
      client_port: 20_000 + (index % 20_000),
      bytes_in: Math.round(seededNumber(`protocol-in:${index}`, 40, 32_000)),
      bytes_out: Math.round(seededNumber(`protocol-out:${index}`, 40, 48_000)),
      duration_ms: protocol === "tcp" ? Math.round(seededNumber(`protocol-duration:${index}`, 20, 18_000)) : 0,
    });
  }
  return records;
}

async function seedTimescale(client, organizationId) {
  const tunnelIds = TUNNELS.map((tunnel) => tunnel.id);
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM request_captures WHERE tunnel_id = ANY($1::text[])", [tunnelIds]);
    await client.query("DELETE FROM tunnel_events WHERE tunnel_id = ANY($1::text[])", [tunnelIds]);
    await client.query("DELETE FROM protocol_events WHERE tunnel_id = ANY($1::text[])", [tunnelIds]);

    const { events, captures } = buildTunnelEvents(organizationId);
    const protocolEvents = buildProtocolEvents(organizationId);
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
    );
    await client.query("COMMIT");
    return { requests: events.length, captures: captures.length, protocolEvents: protocolEvents.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function seedRedis(redis, organization, user) {
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

function buildTinybirdRecords(organizationId) {
  const anchor = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const ingestedAt = iso(Date.now());
  const services = [
    { name: "storefront-web", version: "1.8.0", baseMs: 180, errorEvery: 200 },
    { name: "checkout-api", version: "2.4.1", baseMs: 680, errorEvery: 29 },
    { name: "payments-worker", version: "1.3.2", baseMs: 1_350, errorEvery: 13 },
  ];
  const routes = ["/", "/products", "/api/orders", "/api/checkout", "/api/customers/:customerId", "/health"];
  const methods = ["GET", "GET", "GET", "POST", "PATCH", "GET"];
  const spans = [];
  const logs = [];
  const metrics = [];

  for (let index = 0; index < 216; index += 1) {
    const service = services[index % services.length];
    const startMs = anchor - (215 - index) * 6.5 * 60_000;
    const traceId = hex(`dev-trace:${anchor}:${index}`, 32);
    const rootSpanId = hex(`dev-root:${anchor}:${index}`, 16);
    const isError = index % service.errorEvery === 0;
    const route = routes[index % routes.length];
    const method = methods[index % methods.length];
    const durationMs = Math.round(service.baseMs + seededNumber(`trace-duration:${anchor}:${index}`, 20, service.baseMs * 0.75));
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
        span_id: hex(`dev-child:${anchor}:${index}:${childIndex}`, 16),
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
      event_id: hex(`dev-log:${anchor}:${index}`, 64),
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
  for (let point = 0; point < 96; point += 1) {
    const timestamp = anchor - (95 - point) * 15 * 60_000;
    for (const service of services) {
      for (const [metricIndex, [name, description, unit, type]] of metricDefinitions.entries()) {
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
          event_id: hex(`dev-metric:${identity}`, 64),
          timestamp: iso(timestamp),
          start_timestamp: type === "gauge" ? null : iso(anchor - 24 * 60 * 60_000),
          metric_name: name,
          metric_description: description,
          metric_unit: unit,
          metric_type: type,
          aggregation_temporality: type === "gauge" ? 0 : 2,
          is_monotonic: type === "sum" ? 1 : 0,
          value: histogram ? null : value,
          value_int: null,
          count: histogram ? String(20 + (point % 12)) : "0",
          sum: histogram ? value * (20 + (point % 12)) : null,
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
  await tinybirdAppend(apiHost, ingestToken, "otel_spans", spans);
  await tinybirdAppend(apiHost, ingestToken, "otel_logs", logs);
  await tinybirdAppend(apiHost, ingestToken, "otel_metrics", metrics);
  return { spans: spans.length, logs: logs.length, metrics: metrics.length };
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
  const database = new pg.Client(pgOptions("DATABASE_URL"));
  const timescale = new pg.Client(pgOptions("TIMESCALE_URL"));
  const redisUrl = parsedUrl("REDIS_URL");
  assertDevelopmentTarget("REDIS_URL", redisUrl);
  const redis = new Redis(redisUrl.toString(), { lazyConnect: true, maxRetriesPerRequest: 2 });

  await Promise.all([database.connect(), timescale.connect(), redis.connect()]);
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

    console.log(`Seeding development data for ${organization.name} (${organization.slug})...`);
    await retryDeadlocks(() => seedPrimaryDatabase(database, organization, user));
    const timescaleResult = await seedTimescale(timescale, organization.id);
    const onlineTunnels = await seedRedis(redis, organization, user);
    const tinybirdResult = await seedTinybird(organization.id);
    const services = await verifyTinybird(organization.id);

    console.log("Development seed complete:");
    console.log(`  PostgreSQL: ${TUNNELS.length} tunnels, 3 alerts, 2 incidents`);
    console.log(`  Redis: ${onlineTunnels} tunnels marked online`);
    console.log(`  Timescale: ${timescaleResult.requests} requests, ${timescaleResult.captures} captures, ${timescaleResult.protocolEvents} protocol events`);
    console.log(`  Tinybird (${EXPECTED_TINYBIRD_BRANCH}): ${tinybirdResult.spans} spans, ${tinybirdResult.logs} logs, ${tinybirdResult.metrics} metric points`);
    console.log(`  Verified services: ${services.map((service) => service.name).join(", ")}`);
  } finally {
    await Promise.allSettled([database.end(), timescale.end(), redis.quit()]);
  }
}

main().catch((error) => {
  console.error("Development seed failed:", error);
  process.exitCode = 1;
});
