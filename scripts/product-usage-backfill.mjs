import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";
import pg from "pg";
import postgresConfig from "../shared/postgres-ssl.ts";

export function backfillOptions(args) {
  const options = { target: null, organization: null, apply: false, allowProduction: false };
  for (const arg of args) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--allow-production") options.allowProduction = true;
    else if (arg.startsWith("--target=")) options.target = arg.slice(9);
    else if (arg.startsWith("--organization=")) options.organization = arg.slice(15);
    else throw new Error(`Unknown backfill option: ${arg}`);
  }
  if (!["development", "production"].includes(options.target)) throw new Error("Explicit --target=development or --target=production is required");
  if (options.target === "production" && options.apply && !options.allowProduction) throw new Error("Production apply requires separate approval and --allow-production");
  return options;
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
export function historicalTrafficSql(kind, organizationId, cutoff) {
  const org = quote(organizationId), boundary = quote(cutoff.slice(0, 10));
  if (kind === "status") return `SELECT toString(toDate(first_seen)) AS day,'uptime.status_views' AS metric,toString(count()) AS amount FROM (
    SELECT min(timestamp) AS first_seen FROM status_page_views FINAL WHERE organization_id=${org} AND toDate(timestamp)<toDate(${boundary}) GROUP BY page_id,event_id
  ) GROUP BY day ORDER BY day`;
  if (["spans", "logs", "metric_points"].includes(kind)) {
    const source = kind === "spans" ? "otel_spans" : kind === "logs" ? "otel_logs" : "otel_metrics";
    return `SELECT if(IngestedAt<toDateTime64('2000-01-01 00:00:00',9),'unknown',toString(toDate(IngestedAt))) AS day,
      'observability.${kind}' AS metric,toString(count()) AS amount FROM ${source} FINAL
      WHERE OrganizationId=${org} AND toDate(IngestedAt)<toDate(${boundary}) GROUP BY day ORDER BY day`;
  }
  if (kind === "http") return `SELECT toString(toDate(timestamp)) AS day,metric,toString(sum(amount)) AS amount FROM (
    SELECT timestamp,arrayJoin([tuple('tunnels.http_requests',toUInt64(1)),tuple('tunnels.bytes.http.in',bytes_in),tuple('tunnels.bytes.http.out',bytes_out)]) AS pair,
      pair.1 AS metric,pair.2 AS amount FROM tunnel_events FINAL WHERE organization_id=${org} AND toDate(timestamp)<toDate(${boundary})
  ) GROUP BY day,metric ORDER BY day,metric`;
  if (kind === "protocol") return `SELECT toString(toDate(timestamp)) AS day,metric,toString(sum(amount)) AS amount FROM (
    SELECT timestamp,arrayJoin([
      tuple('tunnels.tcp_connections',toUInt64(protocol='tcp' AND event_type='connection')),
      tuple('tunnels.udp_datagrams.in',toUInt64(protocol='udp' AND event_type='packet' AND bytes_in>0)),
      tuple('tunnels.udp_datagrams.out',toUInt64(protocol='udp' AND event_type='packet' AND bytes_out>0)),
      tuple('tunnels.bytes.tcp.in',if(protocol='tcp' AND event_type='data',bytes_in,toUInt64(0))),
      tuple('tunnels.bytes.tcp.out',if(protocol='tcp' AND event_type='data',bytes_out,toUInt64(0))),
      tuple('tunnels.bytes.udp.in',if(protocol='udp' AND event_type='packet',bytes_in,toUInt64(0))),
      tuple('tunnels.bytes.udp.out',if(protocol='udp' AND event_type='packet',bytes_out,toUInt64(0)))]) AS pair,
      pair.1 AS metric,pair.2 AS amount FROM tunnel_protocol_events FINAL WHERE organization_id=${org} AND toDate(timestamp)<toDate(${boundary})
  ) GROUP BY day,metric ORDER BY day,metric`;
  throw new Error("Unknown history source");
}

const sources = ["secrets", "tunnel-registrations", "probe", "alerts", "agent", "telemetry", "tunnel-traffic", "status-views"];
const jobId = "permanent-product-usage-v1";
async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
async function baseline(client, organizationId, metric, period, amount) {
  if (BigInt(amount) <= 0n) return;
  const inserted = await client.query(`INSERT INTO organization_product_usage_baselines(organization_id,metric,period,value)
    VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING value`, [organizationId, metric, period, String(amount)]);
  if (inserted.rows.length) await client.query(`INSERT INTO platform_product_usage_baselines(metric,period,shard,value)
    VALUES($1,$2,get_byte(decode(md5($3),'hex'),0)%64,$4)
    ON CONFLICT(metric,period,shard) DO UPDATE SET value=platform_product_usage_baselines.value+EXCLUDED.value`, [metric, period, organizationId, String(amount)]);
}
async function record(client, org, source, id, at, deltas) {
  // Live source IDs take precedence. This also handles timestamp precision
  // differences in legacy receipts without replaying their accepted chunks.
  const exists = await client.query("SELECT 1 FROM product_usage_receipts WHERE organization_id=$1 AND source=$2 AND event_id=$3", [org, source, id]);
  if (!exists.rows.length) await client.query("SELECT record_product_usage($1,$2,$3,$4::timestamptz,$5::jsonb,true)", [org, source, id, at, JSON.stringify(deltas)]);
}

export async function runBackfill(options, dependencies = {}) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const env = parse(readFileSync(join(root, options.target === "development" ? ".env" : ".env.prod")));
  if (!env.DATABASE_URL) throw new Error("Target DATABASE_URL is missing");
  if (options.target === "development" && existsSync(join(root, ".env.prod"))) {
    const prod = parse(readFileSync(join(root, ".env.prod")));
    const identity = value => { const u = new URL(value); return `${u.hostname}:${u.port}${u.pathname}`; };
    if (prod.DATABASE_URL && identity(prod.DATABASE_URL) === identity(env.DATABASE_URL)) throw new Error("Development and production database targets must be distinct");
  }
  const pool = dependencies.pool ?? new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: postgresConfig.postgresSsl(env.DATABASE_URL, env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false") });
  const log = dependencies.log ?? console.log;
  const tinybird = dependencies.tinybird ?? (sql => {
    const local = join(homedir(), ".local/bin/tb");
    const executable = process.env.TINYBIRD_CLI || (existsSync(local) ? local : "tb");
    const destination = options.target === "development" ? ["--branch", "development"] : ["--cloud"];
    try {
      const output = execFileSync(executable, [...destination, "--no-version-warning", "--output", "json", "sql", sql, "--no-stats", "--rows-limit", "20000"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 });
      // The CLI emits an empty stdout (exit 0) for a successful empty query.
      if (!output.trim()) return [];
      const result = JSON.parse(output);
      if (!Array.isArray(result.data) || result.data.length >= 20000) throw new Error("History result exceeds bounded page");
      return result.data;
    } catch { throw new Error("Tinybird historical query failed; credentials and raw data were not logged. Resume the same job after fixing connectivity."); }
  });
  let jobLock;
  try {
    if (options.apply) {
      jobLock = await pool.connect();
      const acquired = await jobLock.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired", [jobId]);
      if (!acquired.rows[0]?.acquired) throw new Error("Another permanent-usage backfill is running");
    }
    const organizations = await pool.query("SELECT id,slug FROM organizations WHERE $1::text IS NULL OR id=$1 OR slug=$1 ORDER BY id", [options.organization]);
    if (!organizations.rows.length) throw new Error("No matching organizations");
    log(`${options.apply ? "APPLY" : "DRY RUN"}: ${options.target}; ${organizations.rows.length} organization(s); incomplete history will remain labeled.`);
    for (const org of organizations.rows) for (const source of sources) {
      const existing = (await pool.query("SELECT * FROM product_usage_backfill_checkpoints WHERE job_id=$1 AND source=$2 AND organization_id=$3", [jobId, source, org.id])).rows[0];
      if (existing?.status === "complete") { log(`${org.slug}/${source}: already complete; skipped`); continue; }
      if (existing && new Date(existing.updated_at).getTime() < Date.now() - 120 * 86400000) throw new Error("Backfill checkpoint exceeded the replay window; manual reconciliation is required");
      const coverage = (await pool.query("SELECT collection_started_at FROM product_usage_coverage WHERE source=$1", [source])).rows[0];
      const cutoff = existing?.cutoff_at ? new Date(existing.cutoff_at) : new Date();
      // Closed pre-collection days only for sources without historical batch
      // identities. The partial cutover day is intentionally not guessed.
      const historyEnd = new Date(Math.min(new Date(coverage?.collection_started_at ?? cutoff).getTime(), cutoff.getTime()));
      historyEnd.setUTCHours(0, 0, 0, 0);
      if (options.apply && !existing) await pool.query("INSERT INTO product_usage_backfill_checkpoints(job_id,source,organization_id,cutoff_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [jobId, source, org.id, cutoff]);
      let cursor = existing?.cursor ?? "";
      let count = 0;
      const save = async (client, next) => client.query("UPDATE product_usage_backfill_checkpoints SET cursor=$4,processed=processed+1,updated_at=now() WHERE job_id=$1 AND source=$2 AND organization_id=$3", [jobId, source, org.id, next]);
      if (["secrets", "tunnel-registrations", "alerts", "agent"].includes(source)) {
        const selects = {
          secrets: "SELECT id,created_at::text AS at,secret_product_usage_deltas(action,result,metadata) AS deltas FROM secret_audit_events WHERE organization_id=$1 AND created_at<$2 AND id>$3 ORDER BY id LIMIT 500",
          "tunnel-registrations": "SELECT id,(created_at AT TIME ZONE 'UTC')::text AS at,jsonb_build_object('tunnels.registrations.'||protocol,1) AS deltas FROM tunnels WHERE organization_id=$1 AND created_at<($2::timestamptz AT TIME ZONE 'UTC') AND id>$3 ORDER BY id LIMIT 500",
          alerts: "SELECT id,evaluated_at::text AS at,jsonb_build_object('observability.evaluations.'||status,1) AS deltas FROM observability_alert_evaluations WHERE organization_id=$1 AND evaluated_at<$2 AND id>$3 ORDER BY id LIMIT 500",
          agent: "SELECT r.id::text AS id,r.started_at::text AS at,r.status,r.input_tokens,r.output_tokens FROM agent_runs r JOIN agent_threads t ON t.id=r.thread_id WHERE t.organization_id=$1 AND r.started_at<$2 AND r.id::text>$3 ORDER BY r.id::text LIMIT 500",
        };
        while (true) {
          const page = (await pool.query(selects[source], [org.id, cutoff, cursor])).rows;
          if (!page.length) break;
          if (options.apply) await transaction(pool, async client => {
            if (source === "agent") {
              // Enrollment and the latest snapshot share the row lock. An old
              // running run cannot finish between our read and progress-row
              // creation while the live trigger is still waiting for enrollment.
              const current = await client.query(`SELECT r.id::text AS id,r.started_at::text AS at,r.status,r.input_tokens,r.output_tokens
                FROM agent_runs r JOIN agent_threads t ON t.id=r.thread_id
                WHERE t.organization_id=$1 AND r.id::text=ANY($2::text[]) ORDER BY r.id FOR UPDATE OF r`, [org.id, page.map(row => row.id)]);
              for (const row of current.rows) await client.query("SELECT record_agent_product_usage($1,$2,$3::timestamptz,$4,$5::bigint,$6::bigint,true)", [org.id, row.id, row.at, row.status, row.input_tokens, row.output_tokens]);
            }
            else await client.query(`SELECT record_product_usage($1,$2,r.id,r.at::timestamptz,r.deltas,true)
              FROM jsonb_to_recordset($3::jsonb) AS r(id text,at text,deltas jsonb)
              WHERE NOT EXISTS(SELECT 1 FROM product_usage_receipts p WHERE p.organization_id=$1 AND p.source=$2 AND p.event_id=r.id)
              ORDER BY r.id`, [org.id, source, JSON.stringify(page)]);
            await client.query("UPDATE product_usage_backfill_checkpoints SET cursor=$4,processed=processed+$5,updated_at=now() WHERE job_id=$1 AND source=$2 AND organization_id=$3", [jobId, source, org.id, page.at(-1).id, page.length]);
          });
          cursor = page.at(-1).id; count += page.length;
        }
      } else if (source === "probe") {
        const start = coverage.collection_started_at ?? cutoff;
        while (true) {
          const rows = (await pool.query(`SELECT * FROM (SELECT monitor_id||':'||day::text AS id,day::text AS at,jsonb_build_object('uptime.checks.success',successes,'uptime.checks.failure',checks-successes) AS deltas
          FROM uptime_daily_checks WHERE organization_id=$1 AND day<($2::timestamptz AT TIME ZONE 'UTC')::date
          UNION ALL SELECT id,checked_at::text,jsonb_build_object(CASE WHEN success THEN 'uptime.checks.success' ELSE 'uptime.checks.failure' END,1)
          FROM uptime_checks WHERE organization_id=$1 AND checked_at>=date_trunc('day',$2::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND checked_at<$2
          ) history WHERE id>$3 ORDER BY id LIMIT 500`, [org.id, start, cursor])).rows;
          if (!rows.length) break;
          if (options.apply) await transaction(pool, async client => {
            await client.query(`SELECT record_product_usage($1,'probe',r.id,r.at::timestamptz,r.deltas,true)
              FROM jsonb_to_recordset($2::jsonb) AS r(id text,at text,deltas jsonb)
              WHERE NOT EXISTS(SELECT 1 FROM product_usage_receipts p WHERE p.organization_id=$1 AND p.source='probe' AND p.event_id=r.id)
              ORDER BY r.id`, [org.id, JSON.stringify(rows)]);
            await client.query("UPDATE product_usage_backfill_checkpoints SET cursor=$4,processed=processed+$5,updated_at=now() WHERE job_id=$1 AND source=$2 AND organization_id=$3", [jobId, source, org.id, rows.at(-1).id, rows.length]);
          });
          cursor = rows.at(-1).id; count += rows.length;
        }
      } else {
        if (source === "telemetry") {
          // Prefix sorts before signal checkpoints, allowing restart recovery
          // without rescanning an unbounded receipt ledger.
          while (cursor < "1:") {
            const rows = (await pool.query("SELECT receipt_key,created_at::text AS at,bytes::text FROM organization_telemetry_receipts WHERE organization_id=$1 AND status='accepted' AND created_at<$2 AND receipt_key>$3 ORDER BY receipt_key LIMIT 500", [org.id, cutoff, cursor.startsWith("0:") ? cursor.slice(2) : ""])).rows;
            if (!rows.length) break;
            if (options.apply) await transaction(pool, async client => {
              for (const row of rows) await record(client, org.id, source, row.receipt_key, row.at, { "observability.telemetry_bytes": row.bytes });
              await client.query("UPDATE product_usage_backfill_checkpoints SET cursor=$4,processed=processed+$5,updated_at=now() WHERE job_id=$1 AND source=$2 AND organization_id=$3", [jobId, source, org.id, `0:${rows.at(-1).receipt_key}`, rows.length]);
            });
            cursor = `0:${rows.at(-1).receipt_key}`; count += rows.length;
          }
          if (options.apply) await transaction(pool, async client => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended('telemetry:'||$1::text,0))", [org.id]);
            const months = (await client.query(`SELECT u.month::text AS month,greatest(u.used-coalesce(d.amount,0),0)::text AS missing FROM organization_monthly_usage u
              LEFT JOIN (SELECT date_trunc('month',day)::date AS month,sum(value) AS amount FROM organization_product_usage_daily WHERE organization_id=$1 AND metric='observability.telemetry_bytes' GROUP BY 1) d ON d.month=u.month
              WHERE u.organization_id=$1 AND u.metric='telemetry_bytes'`, [org.id])).rows;
            for (const month of months) await baseline(client, org.id, "observability.telemetry_bytes", month.month, month.missing);
          });
        }
        const kinds = source === "telemetry" ? ["spans", "logs", "metric_points"] : source === "tunnel-traffic" ? ["http", "protocol"] : ["status"];
        for (const kind of kinds.sort()) {
          const rows = await tinybird(historicalTrafficSql(kind, org.id, historyEnd.toISOString()));
          const days = new Map();
          for (const row of rows) { if (!/^\d+$/.test(String(row.amount))) throw new Error("Invalid historical aggregate"); const deltas = days.get(row.day) ?? {}; deltas[row.metric] = String(row.amount); days.set(row.day, deltas); }
          for (const [day, deltas] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
            const next = `${kind}:${day}`;
            if (next <= cursor) continue;
            // Each independent kind has immutable receipt IDs; resumptions may
            // revisit it without adding its values again.
            if (options.apply) await transaction(pool, async client => {
              if (day === "unknown") for (const [metric, amount] of Object.entries(deltas)) await baseline(client, org.id, metric, `retained-unknown-day:${kind}`, amount);
              else await record(client, org.id, source, `backfill:${next}`, `${day}T00:00:00Z`, deltas);
              await save(client, next);
            });
            cursor = next;
            count++;
          }
        }
      }
      if (options.apply) await transaction(pool, async client => {
        await client.query("UPDATE product_usage_backfill_checkpoints SET status='complete',updated_at=now() WHERE job_id=$1 AND source=$2 AND organization_id=$3", [jobId, source, org.id]);
        await client.query("UPDATE product_usage_coverage SET backfill_status='partial',updated_at=now() WHERE source=$1", [source]);
      });
      log(`${org.slug}/${source}: ${count} source rows/buckets ${options.apply ? "processed" : "available"}; ${["telemetry", "tunnel-traffic", "status-views"].includes(source) ? "closed pre-collection days only; partial cutover day excluded" : "source IDs prevent duplicate counts"}`);
    }
  } finally {
    if (jobLock) {
      await jobLock.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [jobId]).catch(() => {});
      jobLock.release();
    }
    if (!dependencies.pool) await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runBackfill(backfillOptions(process.argv.slice(2))); }
  catch (error) { console.error(error instanceof Error ? error.message : "Usage backfill failed"); process.exitCode = 1; }
}
