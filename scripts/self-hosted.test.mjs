import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseEnv } from "node:util";
import { initialEnvironment, initialize, checkEnvironment, validHostname } from "./self-hosted.mjs";

function configured() {
  return { ...parseEnv(initialEnvironment("ops.example.net", "owner@example.net")),
    GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-oauth-secret",
    TINYBIRD_INGEST_TOKEN: "test-append-token", TINYBIRD_QUERY_TOKEN: "test-read-token", HUGEICONS_LICENSE_KEY: "test-build-secret" };
}

test("initializer generates independent instance keys and a narrow email allowlist", () => {
  const first = parseEnv(initialEnvironment("ops.example.net", "owner@example.net"));
  const second = parseEnv(initialEnvironment("ops.example.net", "owner@example.net"));
  assert.equal(first.OUTRAY_DEPLOYMENT_MODE, "self-hosted");
  assert.equal(first.OUTRAY_PRODUCTS, "tunnels,observability,secrets,uptime");
  assert.equal(first.OUTRAY_APP_HOST, "ops.example.net");
  assert.equal(first.OUTRAY_STATUS_HOST, "status.ops.example.net");
  assert.equal(first.OUTRAY_SIGNUP_ALLOWED_EMAILS, "owner@example.net");
  assert.equal(first.OUTRAY_SIGNUP_ALLOWED_DOMAINS, "");
  assert.equal(first.TINYBIRD_INGEST_TOKEN, "");
  const keys = ["POSTGRES_PASSWORD", "SHARE_DATABASE_PASSWORD", "BETTER_AUTH_SECRET", "ADMIN_PASSPHRASE", "INTERNAL_API_SECRET", "STATUS_EDGE_SECRET", "UPTIME_RATE_LIMIT_SECRET", "UPTIME_UNSUBSCRIBE_SECRET", "SHARE_RATE_LIMIT_SECRET"];
  assert.equal(new Set(keys.map((key) => first[key])).size, keys.length);
  for (const key of keys) { assert.match(first[key], /^[a-f0-9]{64}$/); assert.notEqual(first[key], second[key]); }
  assert.equal(Buffer.from(first.OUTRAY_SECRETS_ACTIVE_MASTER_KEY, "base64").length, 32);
});

test("initializer writes a private file and never overwrites master keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "outray-self-host-test-"));
  const file = join(directory, ".env.self-hosted");
  try {
    initialize(file, "ops.example.net", "owner@example.net");
    const before = readFileSync(file, "utf8");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.throws(() => initialize(file, "other.example.net", "owner@example.net"), { code: "EEXIST" });
    assert.equal(readFileSync(file, "utf8"), before);
  } finally { unlinkSync(file); rmdirSync(directory); }
});

test("preflight passes configured OAuth/Tinybird installation without connecting to services", () => {
  const result = checkEnvironment(configured());
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes("disabled")));
});

test("free and auto preflight need no Hugeicons license; Pro is explicit", () => {
  const env = configured(); env.HUGEICONS_LICENSE_KEY = "";
  assert.deepEqual(checkEnvironment(env).errors, []);
  env.OUTRAY_ICON_MODE = "free";
  assert.deepEqual(checkEnvironment(env).errors, []);
  env.OUTRAY_ICON_MODE = "pro";
  assert.ok(checkEnvironment(env).errors.some((error) => error.includes("HUGEICONS_LICENSE_KEY")));
  env.HUGEICONS_LICENSE_KEY = "test-build-secret";
  assert.deepEqual(checkEnvironment(env).errors, []);
  env.OUTRAY_ICON_MODE = "typo";
  assert.ok(checkEnvironment(env).errors.some((error) => error.includes("OUTRAY_ICON_MODE")));
});

test("preflight fails closed on empty signup/OAuth configuration and reused credentials", () => {
  const env = configured();
  env.OUTRAY_SIGNUP_ALLOWED_EMAILS = "";
  env.GITHUB_CLIENT_SECRET = "";
  env.STATUS_EDGE_SECRET = env.BETTER_AUTH_SECRET;
  env.TINYBIRD_QUERY_TOKEN = env.TINYBIRD_INGEST_TOKEN;
  const { errors } = checkEnvironment(env);
  assert.ok(errors.some((error) => error.includes("allowlist")));
  assert.ok(errors.some((error) => error.includes("OAuth")));
  assert.ok(errors.some((error) => error.includes("distinct")));
  assert.ok(errors.some((error) => error.includes("separate APPEND")));
});

test("preflight never bypasses production probe egress policy or email configuration", () => {
  const env = configured(); env.UPTIME_PROBES_ENABLED = "true";
  assert.ok(checkEnvironment(env).errors.some((error) => error.includes("egress")));
  env.UPTIME_EGRESS_POLICY_READY = "true"; env.UPTIME_NOTIFICATIONS_ENABLED = "true";
  assert.ok(checkEnvironment(env).errors.some((error) => error.includes("ZEPTO")));
  env.ZEPTO_API_KEY = "test-email-secret"; env.ZEPTO_FROM_EMAIL = "notify@example.net";
  assert.deepEqual(checkEnvironment(env).errors, []);
});

test("preflight checks host collisions, quotas, keyring and port allocation", () => {
  const env = configured();
  env.OUTRAY_EDGE_HOST = `edge.${env.OUTRAY_STATUS_HOST}`;
  env.OUTRAY_MAX_MEMBERS = "0"; env.OUTRAY_RETENTION_DAYS = "91";
  env.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS = "[]"; env.TCP_PORT_RANGE_MAX = "80";
  const { errors } = checkEnvironment(env);
  for (const word of ["namespace", "MEMBERS", "RETENTION", "keyring", "TCP"]) assert.ok(errors.some((error) => error.includes(word)));
  for (const host of ["localhost", "127.0.0.1", "https://example.net", "*.example.net", "../example.net", "example.net/path", "a..example.net"]) assert.equal(validHostname(host), false);
});

test("preflight error messages do not include configured secret values", () => {
  const env = configured(); env.BETTER_AUTH_SECRET = "private-test-secret-not-for-output";
  assert.ok(checkEnvironment(env).errors.length);
  assert.ok(!JSON.stringify(checkEnvironment(env)).includes(env.BETTER_AUTH_SECRET));
});

test("domain-only allowlists are explicit and worker flags require the enabled product", () => {
  const env = configured(); env.OUTRAY_SIGNUP_ALLOWED_EMAILS = ""; env.OUTRAY_SIGNUP_ALLOWED_DOMAINS = "example.net";
  assert.deepEqual(checkEnvironment(env).errors, []);
  env.OUTRAY_PRODUCTS = "tunnels"; env.UPTIME_NOTIFICATIONS_ENABLED = "true";
  assert.ok(checkEnvironment(env).errors.some((error) => error.includes("Uptime product")));
});

test("proxy trust IP must be a usable address in a private Docker network", () => {
  for (const [subnet, ip] of [["172.30.40.0/24", "172.30.41.2"], ["172.30.40.0/24", "172.30.40.0"], ["172.30.40.0/24", "172.30.40.1"], ["172.30.40.0/24", "172.30.40.255"], ["8.8.8.0/24", "8.8.8.2"], ["172.30.40.2/24", "172.30.40.3"], ["999.1.1.0/24", "172.30.40.2"]]) {
    const env = configured(); env.OUTRAY_DOCKER_SUBNET = subnet; env.OUTRAY_CADDY_PRIVATE_IP = ip;
    assert.ok(checkEnvironment(env).errors.some((error) => error.includes("private IPv4")));
  }
  const env = configured(); env.OUTRAY_DOCKER_SUBNET = "10.42.0.0/16"; env.OUTRAY_CADDY_PRIVATE_IP = "10.42.0.2";
  assert.deepEqual(checkEnvironment(env).errors, []);
});

test("preflight rejects unusable or duplicate key IDs and whitespace OAuth credentials", () => {
  const key = configured().OUTRAY_SECRETS_ACTIVE_MASTER_KEY;
  for (const previous of [{ "": key }, { v1: key }, { old: key, " old ": key }]) {
    const env = configured(); env.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS = JSON.stringify(previous);
    assert.ok(checkEnvironment(env).errors.some((error) => error.includes("keyring")));
  }
  const env = configured(); env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID = "   "; env.GITHUB_CLIENT_ID = "   "; env.GITHUB_CLIENT_SECRET = "   ";
  assert.ok(checkEnvironment(env).errors.some((error) => error.includes("key ID")));
  assert.ok(checkEnvironment(env).errors.some((error) => error.includes("OAuth")));
});
