import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../../", import.meta.url));
const composePath = fileURLToPath(new URL("./compose.yaml", import.meta.url));
const caddyPath = fileURLToPath(new URL("./Caddyfile", import.meta.url));
const dockerfile = readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
const composeText = readFileSync(composePath, "utf8");
const compose = parse(composeText, { merge: true });
const proCompose = parse(readFileSync(new URL("./compose.pro-icons.yaml", import.meta.url), "utf8"), { merge: true });
const services = compose.services;
const appNames = ["web", "tunnel", "internal-check", "ingest", "cron", "status", "secrets-share", "uptime-probe"];
const fixtureEnvironment = {
  CADDY_EMAIL: "operator@example.com",
  OUTRAY_APP_HOST: "console.example.com",
  OUTRAY_TUNNEL_DOMAIN: "tunnels.example.com",
  OUTRAY_EDGE_HOST: "edge.example.com",
  OUTRAY_INGEST_HOST: "ingest.example.com",
  OUTRAY_STATUS_HOST: "status.example.com",
  OUTRAY_SHARE_HOST: "share.example.com",
  POSTGRES_PASSWORD: "fixture-owner-password",
  SHARE_DATABASE_PASSWORD: "fixture-share-password",
  OUTRAY_SECRETS_ACTIVE_MASTER_KEY: "fixture-key",
  UPTIME_RATE_LIMIT_SECRET: "fixture-rate-key",
  UPTIME_UNSUBSCRIBE_SECRET: "fixture-unsubscribe-key",
  STATUS_EDGE_SECRET: "fixture-edge-key",
  BETTER_AUTH_SECRET: "fixture-auth-key",
  INTERNAL_API_SECRET: "fixture-internal-key",
  SHARE_RATE_LIMIT_SECRET: "fixture-share-rate-key",
  ADMIN_PASSPHRASE: "fixture-admin-key",
  OUTRAY_SIGNUP_ALLOWED_EMAILS: "operator@example.com",
  TINYBIRD_API_HOST: "https://api.example.com",
  TINYBIRD_QUERY_TOKEN: "fixture-read-token",
  TINYBIRD_INGEST_TOKEN: "fixture-append-token",
  HUGEICONS_LICENSE_KEY: "fixture-build-key",
  BUILD_NODE_MAX_OLD_SPACE_SIZE: "1536",
  DASHBOARD_DB_POOL_MAX: "10",
  REDIS_MAX_MEMORY: "128mb",
};

test("one Node 22 artifact builds all eight services without baking credentials", () => {
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS builder/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS runtime/);
  for (const app of appNames) {
    const workspace = app === "secrets-share" ? "outray-secrets-share" : app === "uptime-probe" ? "outray-uptime-probe" : `outray-${app}`;
    assert.ok(dockerfile.includes(`--filter=${workspace}`), workspace);
    assert.equal(services[app].image, services.web.image);
    assert.deepEqual(services[app].build, services.web.build);
    assert.equal(services[app].command[0], "node");
    assert.equal(services[app].read_only, true);
    assert.deepEqual(services[app].cap_drop, ["ALL"]);
  }
  assert.match(dockerfile, /--mount=type=secret,id=hugeicons_license_key/);
  assert.doesNotMatch(dockerfile, /id=hugeicons_license_key,required=true/);
  assert.doesNotMatch(dockerfile, /^(?:ARG|ENV).*HUGEICONS_LICENSE_KEY/m);
  assert.equal(compose.secrets, undefined);
  assert.equal(services.web.build.secrets, undefined);
  assert.equal(proCompose.secrets.hugeicons_license_key.environment, "HUGEICONS_LICENSE_KEY");
  for (const name of [...appNames, "migrate"]) {
    assert.deepEqual(proCompose.services[name].build.secrets, ["hugeicons_license_key"]);
    assert.equal(proCompose.services[name].build.args.OUTRAY_ICON_MODE, "pro");
  }
  const ignored = readFileSync(new URL("../../.dockerignore", import.meta.url), "utf8");
  for (const pattern of ["**/.env*", "**/node_modules", ".git", "deploy/woodpecker/secrets"]) {
    assert.ok(ignored.includes(pattern));
  }
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /DATABASE_URL=postgresql:\/\/build:build@127\.0\.0\.1:1\/build\?sslmode=disable/);
  assert.match(dockerfile, /PUBLIC_OUTRAY_DEPLOYMENT_MODE=self-hosted/);
  for (const [variable, argument] of [["PUBLIC_DASHBOARD_URL", "APP_PUBLIC_URL"], ["VITE_TUNNEL_URL", "EDGE_PUBLIC_URL"], ["VITE_OUTRAY_INGEST_URL", "INGEST_PUBLIC_URL"]]) {
    assert.ok(dockerfile.includes(`${variable}=\${${argument}}`), variable);
  }
});

test("database and durable Redis are private, persistent, and not evicting queues", () => {
  assert.match(services.postgres.image, /^postgres:16-/);
  assert.match(services.redis.image, /^redis:7-/);
  assert.equal(services.postgres.ports, undefined);
  assert.equal(services.redis.ports, undefined);
  assert.deepEqual(services.postgres.networks, ["database"]);
  assert.deepEqual(services.redis.networks, ["database"]);
  assert.equal(compose.networks.database.internal, true);
  assert.ok(services.postgres.volumes.includes("postgres-data:/var/lib/postgresql/data"));
  assert.ok(services.redis.volumes.includes("redis-data:/data"));
  assert.ok(services.redis.command.includes("noeviction"));
  assert.ok(services.redis.command.includes("everysec"));
  for (const name of ["postgres-data", "redis-data", "caddy-data", "caddy-config"]) {
    assert.ok(name in compose.volumes);
  }
});

test("optional small-host controls preserve normal defaults and build heap validation", () => {
  assert.match(dockerfile, /^ARG BUILD_NODE_MAX_OLD_SPACE_SIZE$/m);
  assert.equal(services.web.build.args.BUILD_NODE_MAX_OLD_SPACE_SIZE, "${BUILD_NODE_MAX_OLD_SPACE_SIZE:-}");
  assert.equal(services.web.environment.DASHBOARD_DB_POOL_MAX, "${DASHBOARD_DB_POOL_MAX:-50}");
  assert.ok(services.redis.command.includes("${REDIS_MAX_MEMORY:-512mb}"));
  for (const name of appNames) assert.equal(services[name].environment.NODE_OPTIONS, undefined, name);
  const runtime = dockerfile.split("FROM node:22-bookworm-slim AS runtime")[1];
  assert.doesNotMatch(runtime, /BUILD_NODE_MAX_OLD_SPACE_SIZE|NODE_OPTIONS/);

  // Exercise the actual Dockerfile shell guard without building or installing anything.
  const buildRun = dockerfile.match(/^RUN --mount=type=secret,id=hugeicons_license_key [\s\S]*?BUILD_NODE_MAX_OLD_SPACE_SIZE[\s\S]*?(?=\n\nFROM )/m)?.[0];
  assert.ok(buildRun, "build RUN instruction exists");
  const command = buildRun.slice(buildRun.indexOf("    if [ -n \"$BUILD_NODE_MAX_OLD_SPACE_SIZE\""))
    .replace(/npm run build --[\s\S]*$/, "node -e 'console.log(process.env.NODE_OPTIONS || \"\")'");
  const run = (heap, options = "") => spawnSync("sh", ["-ec", command], {
    env: { PATH: process.env.PATH, BUILD_NODE_MAX_OLD_SPACE_SIZE: heap, NODE_OPTIONS: options },
    encoding: "utf8",
  });
  const unset = run("");
  assert.equal(unset.status, 0, unset.stderr);
  assert.equal(unset.stdout.trim(), "");
  const preserved = run("", "--stack-trace-limit=25");
  assert.equal(preserved.status, 0, preserved.stderr);
  assert.equal(preserved.stdout.trim(), "--stack-trace-limit=25");
  const capped = run("1536", "--stack-trace-limit=25");
  assert.equal(capped.status, 0, capped.stderr);
  assert.equal(capped.stdout.trim(), "--stack-trace-limit=25 --max-old-space-size=1536");
  for (const invalid of ["0", "00", "-1", "1.5", "1e3", "not-a-number"]) {
    const result = run(invalid);
    assert.notEqual(result.status, 0, invalid);
    assert.match(result.stderr, /BUILD_NODE_MAX_OLD_SPACE_SIZE must be a positive integer/);
    assert.equal(result.stdout, "");
  }

  const template = readFileSync(new URL("./.env.example", import.meta.url), "utf8");
  assert.match(template, /^BUILD_NODE_MAX_OLD_SPACE_SIZE=$/m);
  assert.match(template, /^DASHBOARD_DB_POOL_MAX=50$/m);
  assert.match(template, /^REDIS_MAX_MEMORY=512mb$/m);
});

test("default icon packaging is free and private geometry is never committed", () => {
  assert.equal(services.web.build.args.OUTRAY_ICON_MODE, "free");
  assert.match(dockerfile, /^ARG OUTRAY_ICON_MODE=free$/m);
  assert.match(dockerfile, /Docker OUTRAY_ICON_MODE must be free or pro/);
  assert.match(dockerfile, /if \[ "\$OUTRAY_ICON_MODE" = pro \] && \[ -f \/run\/secrets\/hugeicons_license_key \]/);
  const pkg = JSON.parse(readFileSync(new URL("../../packages/icons/package.json", import.meta.url), "utf8"));
  assert.ok(pkg.dependencies["@hugeicons/core-free-icons"]);
  for (const style of ["solid", "stroke"]) assert.ok(pkg.optionalDependencies[`@hugeicons-pro/core-${style}-rounded`]);
  const ignored = readFileSync(new URL("../../.gitignore", import.meta.url), "utf8");
  assert.ok(ignored.includes("packages/icons/generated/"));
  assert.ok(readFileSync(new URL("../../.dockerignore", import.meta.url), "utf8").includes("packages/icons/generated"));
  const turbo = JSON.parse(readFileSync(new URL("../../turbo.json", import.meta.url), "utf8"));
  assert.ok(turbo.globalDependencies.includes("packages/icons/generated/mode.json"));
});

test("committed migrations and restricted share role run before any readers", () => {
  assert.equal(services.migrate.restart, "no");
  assert.equal(services.migrate.working_dir, "/app/apps/web");
  assert.match(services.migrate.command.join(" "), /drizzle-kit\/bin.cjs migrate && node \/app\/scripts\/self-hosted-share-role.mjs/);
  assert.doesNotMatch(services.migrate.command.join(" "), /generate|push/);
  for (const name of appNames) {
    assert.equal(services[name].depends_on.migrate.condition, "service_completed_successfully");
  }
  const shareEnvironment = services["secrets-share"].environment;
  assert.match(shareEnvironment.SHARE_DATABASE_URL, /^postgresql:\/\/outray_share_app:/);
  for (const privateValue of ["DATABASE_URL", "REDIS_URL", "TINYBIRD_QUERY_TOKEN", "TINYBIRD_INGEST_TOKEN", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY"]) {
    assert.equal(shareEnvironment[privateValue], undefined, privateValue);
  }
  assert.match(services.web.environment.DATABASE_URL, /sslmode=disable$/);
});

test("Tinybird reader and append scopes are separated and Timescale is absent", () => {
  assert.doesNotMatch(composeText + dockerfile, /TIMESCALE|timescaledb/);
  assert.ok(services.web.environment.TINYBIRD_QUERY_TOKEN);
  assert.equal(services.web.environment.TINYBIRD_INGEST_TOKEN, undefined);
  for (const writer of ["tunnel", "ingest"]) {
    assert.ok(services[writer].environment.TINYBIRD_INGEST_TOKEN);
    assert.equal(services[writer].environment.TINYBIRD_QUERY_TOKEN, undefined);
  }
  assert.ok(services.cron.environment.TINYBIRD_QUERY_TOKEN);
  assert.ok(services.cron.environment.TINYBIRD_INGEST_TOKEN);
});

test("installation quotas, domain-only signup and email sender settings reach runtime", () => {
  for (const name of appNames.filter((name) => name !== "secrets-share")) {
    assert.equal(services[name].environment.OUTRAY_MAX_UPTIME_MONITORS, "${OUTRAY_MAX_UPTIME_MONITORS:-1000}");
    assert.equal(services[name].environment.OUTRAY_MAX_OBSERVABILITY_ALERTS, "${OUTRAY_MAX_OBSERVABILITY_ALERTS:-1000}");
  }
  assert.equal(services.web.environment.OUTRAY_SIGNUP_ALLOWED_EMAILS, "${OUTRAY_SIGNUP_ALLOWED_EMAILS:-}");
  assert.equal(services.web.environment.OUTRAY_SIGNUP_ALLOWED_DOMAINS, "${OUTRAY_SIGNUP_ALLOWED_DOMAINS:-}");
  for (const name of ["web", "cron", "status", "uptime-probe"]) {
    assert.equal(services[name].environment.ZEPTO_FROM_NAME, "${ZEPTO_FROM_NAME:-OutRay}");
  }
  for (const variable of ["TUNNEL_PUBLIC_URL", "INGEST_PUBLIC_URL", "SHARE_PUBLIC_URL"]) {
    assert.ok(services.web.environment[variable]);
    assert.equal(services.web.environment[variable], services["internal-check"].environment[variable]);
  }
});

test("exposed TCP and UDP ports match small explicit allocation ranges", () => {
  assert.deepEqual(services.tunnel.ports, [
    "${TCP_PORT_RANGE_MIN:-20000}-${TCP_PORT_RANGE_MAX:-20009}:${TCP_PORT_RANGE_MIN:-20000}-${TCP_PORT_RANGE_MAX:-20009}/tcp",
    "${UDP_PORT_RANGE_MIN:-30000}-${UDP_PORT_RANGE_MAX:-30009}:${UDP_PORT_RANGE_MIN:-30000}-${UDP_PORT_RANGE_MAX:-30009}/udp",
  ]);
  assert.deepEqual(services.caddy.ports, ["80:80", "443:443", "443:443/udp"]);
  for (const name of appNames.filter((name) => name !== "tunnel")) assert.equal(services[name].ports, undefined);
});

test("public Uptime probes require explicit worker opt-in and verified egress", () => {
  assert.deepEqual(services["uptime-probe"].profiles, ["uptime-worker"]);
  assert.equal(services["uptime-probe"].environment.UPTIME_PROBES_ENABLED, "${UPTIME_PROBES_ENABLED:-false}");
  assert.equal(services["uptime-probe"].environment.UPTIME_NOTIFICATIONS_ENABLED, "${UPTIME_NOTIFICATIONS_ENABLED:-false}");
  assert.equal(services["uptime-probe"].environment.UPTIME_EGRESS_POLICY_READY, "${UPTIME_EGRESS_POLICY_READY:-false}");
});

test("every service has a bounded health check and trusted IP forwarding stays private", () => {
  for (const [name, service] of Object.entries(services)) {
    if (name === "migrate") continue;
    assert.ok(service.healthcheck?.test?.length, name);
    assert.ok(service.healthcheck.timeout, name);
    assert.ok(service.healthcheck.retries > 0, name);
  }
  assert.equal(services.tunnel.environment.STATUS_UPSTREAM_URL, "http://status:4323");
  const edgeProbe = services.tunnel.healthcheck.test.at(-1);
  assert.match(edgeProbe, /require\('node:http'\)/);
  assert.match(edgeProbe, /Host:process\.env\.BASE_DOMAIN/);
  assert.match(edgeProbe, /timeout:3000/);
  assert.doesNotMatch(edgeProbe, /fetch\(/);
  assert.ok(services.tunnel.environment.DATABASE_URL, "custom status-domain routing requires PostgreSQL");
  assert.equal(services.tunnel.environment.TUNNEL_PUBLIC_URL, "https://${OUTRAY_EDGE_HOST}");
  assert.equal(services.tunnel.environment.STATUS_TRUSTED_PROXY_IPS, services.caddy.networks.services.ipv4_address);
  assert.equal(services["secrets-share"].environment.SHARE_CLIENT_IP_HEADER, "X-Outray-Client-IP");
});

test("Caddy parses TLS authorization, host routes, status proxy and protected headers", (t) => {
  const result = spawnSync("caddy", ["adapt", "--config", caddyPath, "--adapter", "caddyfile"], {
    cwd: root,
    env: { ...process.env, ...fixtureEnvironment },
    encoding: "utf8",
  });
  if (result.error?.code === "ENOENT") return t.skip("Caddy CLI is not installed");
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.apps.tls.automation.on_demand.permission.endpoint, "http://internal-check:3344/internal/domain-check");
  assert.equal(config.apps.tls.automation.on_demand.permission.module, "http");
  const configText = JSON.stringify(config);
  for (const origin of Object.values(fixtureEnvironment).filter((value) => value.endsWith("example.com") && !value.includes("@"))) {
    if (origin.startsWith("https://")) continue;
    assert.ok(configText.includes(origin), origin);
  }
  for (const upstream of ["web:6767", "ingest:4318", "secrets-share:4324", "tunnel:3547"]) assert.ok(configText.includes(upstream), upstream);
  assert.ok(configText.includes("X-Outray-Client-Ip"));
  assert.ok(configText.includes("X-Outray-Edge-Secret"));
  assert.ok(Object.values(config.apps.http.servers).every((server) => server.strict_sni_host === true));
});

test("Docker Compose resolves the configuration without reading local secrets", (t) => {
  const version = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (version.error || version.status !== 0) return t.skip("Docker Compose plugin is not installed");
  const result = spawnSync("docker", ["compose", "--env-file", "/dev/null", "-f", composePath, "--profile", "uptime-worker", "config", "--format", "json"], {
    cwd: root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...fixtureEnvironment },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(Object.keys(config.services).length, 12);
  assert.ok(config.services.web.environment.DATABASE_URL.includes("fixture-owner-password"));
  assert.equal(config.services["secrets-share"].environment.DATABASE_URL, undefined);
  assert.deepEqual(config.services.migrate.depends_on.postgres.condition, "service_healthy");
  assert.equal(config.services.web.build.args.BUILD_NODE_MAX_OLD_SPACE_SIZE, "1536");
  assert.equal(config.services.web.environment.DASHBOARD_DB_POOL_MAX, "10");
  assert.ok(config.services.redis.command.includes("128mb"));
});
