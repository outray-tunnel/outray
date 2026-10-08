import pg from "pg";

const targetDatabase = process.env.DATABASE_URL || "";
const targetOrgSlug = process.env.OUTRAY_SEED_ORG?.trim() || "outray-tunnel";
const userCount = Number(process.env.OUTRAY_LOAD_USERS || 10_000);
const tunnelCount = Number(process.env.OUTRAY_LOAD_TUNNELS || 1_000);
const remoteStageSeed =
  process.env.OUTRAY_ALLOW_REMOTE_LOAD_SEED === "true" &&
  process.env.OUTRAY_LOAD_SEED_TARGET === "outray.co";

function assertLocalTarget() {
  if (process.env.NODE_ENV === "production") {
    if (!remoteStageSeed) {
      throw new Error("Refusing to seed load data with NODE_ENV=production");
    }
  }
  const url = new URL(targetDatabase);
  const localTarget = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  if (!localTarget && !remoteStageSeed) {
    throw new Error(`Load seed requires local Postgres; got ${url.hostname}`);
  }
  if (!Number.isInteger(userCount) || userCount < 1 || userCount > 100_000) {
    throw new Error("OUTRAY_LOAD_USERS must be an integer between 1 and 100000");
  }
  if (!Number.isInteger(tunnelCount) || tunnelCount < 1 || tunnelCount > 10_000) {
    throw new Error("OUTRAY_LOAD_TUNNELS must be an integer between 1 and 10000");
  }
}

async function main() {
  assertLocalTarget();
  const client = new pg.Client({ connectionString: targetDatabase, ssl: false });
  await client.connect();
  try {
    await client.query("BEGIN");
    const organization = await client.query(
      "SELECT id FROM organizations WHERE slug = $1 LIMIT 1",
      [targetOrgSlug],
    );
    if (!organization.rows[0]) throw new Error(`Organization ${targetOrgSlug} does not exist`);
    const organizationId = organization.rows[0].id;
    const owner = await client.query(
      `SELECT user_id FROM members
       WHERE organization_id = $1
       ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
       LIMIT 1`,
      [organizationId],
    );
    if (!owner.rows[0]) throw new Error(`Organization ${targetOrgSlug} has no member`);

    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       SELECT 'load-user-' || lpad(i::text, 5, '0'),
              'Load Test User ' || i,
              'load-user-' || lpad(i::text, 5, '0') || '@load.example.invalid',
              true,
              NOW() - ((i % 365) || ' days')::interval,
              NOW()
       FROM generate_series(1, $1::int) AS series(i)
       ON CONFLICT (id) DO NOTHING`,
      [userCount],
    );
    await client.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at)
       SELECT 'load-member-' || lpad(i::text, 5, '0'), $1,
              'load-user-' || lpad(i::text, 5, '0'),
              CASE WHEN i = 1 THEN 'admin' ELSE 'member' END,
              NOW() - ((i % 365) || ' days')::interval
       FROM generate_series(1, $2::int) AS series(i)
       ON CONFLICT (id) DO NOTHING`,
      [organizationId, userCount],
    );
    await client.query(
      `INSERT INTO tunnels
         (id, url, name, protocol, remote_port, user_id, organization_id, last_seen_at, created_at, updated_at)
       SELECT 'load-tunnel-' || lpad(i::text, 5, '0'),
              'https://load-tunnel-' || lpad(i::text, 5, '0') || '.example.invalid',
              'Load Tunnel ' || i,
              'http',
              NULL,
              'load-user-' || lpad((((i - 1) % $2::int) + 1)::text, 5, '0'),
              $1,
              CASE WHEN i % 10 = 0 THEN NULL ELSE NOW() - ((i % 300) || ' seconds')::interval END,
              NOW() - ((i % 365) || ' days')::interval,
              NOW()
       FROM generate_series(1, $3::int) AS series(i)
       ON CONFLICT (id) DO NOTHING`,
      [organizationId, userCount, tunnelCount],
    );
    await client.query(
      `INSERT INTO subdomains (id, subdomain, organization_id, user_id, created_at)
       SELECT 'load-subdomain-' || lpad(i::text, 5, '0'),
              'load-' || lpad(i::text, 5, '0') || '.dev.outray.test',
              $1,
              'load-user-' || lpad((((i - 1) % $2::int) + 1)::text, 5, '0'),
              NOW() - ((i % 365) || ' days')::interval
       FROM generate_series(1, $3::int) AS series(i)
       ON CONFLICT (id) DO NOTHING`,
      [organizationId, userCount, tunnelCount],
    );
    await client.query(
      `INSERT INTO domains
         (id, domain, organization_id, user_id, status, created_at, updated_at)
       SELECT 'load-domain-' || lpad(i::text, 5, '0'),
              'load-' || lpad(i::text, 5, '0') || '.dev.outray.test',
              $1,
              'load-user-' || lpad((((i - 1) % $2::int) + 1)::text, 5, '0'),
              CASE i % 4 WHEN 0 THEN 'pending' WHEN 1 THEN 'failed' ELSE 'active' END,
              NOW() - ((i % 365) || ' days')::interval,
              NOW()
       FROM generate_series(1, $3::int) AS series(i)
       ON CONFLICT (id) DO NOTHING`,
      [organizationId, userCount, tunnelCount],
    );
    await client.query("COMMIT");
    console.log(JSON.stringify({ organization: targetOrgSlug, users: userCount, members: userCount, tunnels: tunnelCount, subdomains: tunnelCount, domains: tunnelCount }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Load seed failed: ${error.message}`);
  process.exitCode = 1;
});
