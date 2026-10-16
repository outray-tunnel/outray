import assert from "node:assert/strict";
import test from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import type { LogRecord } from "@opentelemetry/api-logs";
import {
  captureConsoleLogs,
  createOutrayLogMethods,
  type OutrayConsoleTarget,
} from "../src/logging";

function testLogger(records: LogRecord[]) {
  return {
    emit(record: LogRecord) {
      records.push(record);
    },
  };
}

function testConsole(calls: Array<{ level: string; args: unknown[] }>) {
  const write = (level: string) => (...args: unknown[]) => {
    calls.push({ level, args });
  };
  return {
    debug: write("debug"),
    error: write("error"),
    info: write("info"),
    log: write("log"),
    warn: write("warn"),
  } satisfies OutrayConsoleTarget;
}

test("first-class logging preserves output, severity, errors, and trace-safe fields", () => {
  const records: LogRecord[] = [];
  const calls: Array<{ level: string; args: unknown[] }> = [];
  const logs = createOutrayLogMethods(testLogger(records), testConsole(calls));
  const error = new Error("checkout failed with token=do-not-export");

  logs.error("checkout failed", error, {
    orderId: "order_123",
    password: "do-not-export",
  });

  assert.deepEqual(calls, [
    {
      level: "error",
      args: [
        "checkout failed",
        error,
        { orderId: "order_123", password: "do-not-export" },
      ],
    },
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.severityNumber, 17);
  assert.equal(records[0]?.severityText, "ERROR");
  assert.equal(records[0]?.attributes?.orderId, "order_123");
  assert.equal(records[0]?.attributes?.password, "[REDACTED]");
  assert.equal(records[0]?.attributes?.["exception.type"], "Error");
  assert.doesNotMatch(String(records[0]?.body), /do-not-export/);
});

test("console capture exports every supported level once and restores safely", () => {
  const records: LogRecord[] = [];
  const calls: Array<{ level: string; args: unknown[] }> = [];
  const target = testConsole(calls);
  const original = { ...target };
  const restore = captureConsoleLogs(testLogger(records), target);

  target.debug("debug");
  target.info("info");
  target.log("log");
  target.warn("warn");
  target.error("error", { authorization: "Bearer do-not-export" });

  assert.deepEqual(
    calls.map((call) => call.level),
    ["debug", "info", "log", "warn", "error"],
  );
  assert.deepEqual(
    records.map((record) => record.severityText),
    ["DEBUG", "INFO", "INFO", "WARN", "ERROR"],
  );
  assert.doesNotMatch(String(records[4]?.body), /do-not-export/);

  restore();
  assert.equal(target.debug, original.debug);
  assert.equal(target.error, original.error);
  assert.equal(target.info, original.info);
  assert.equal(target.log, original.log);
  assert.equal(target.warn, original.warn);
  target.log("after restore");
  assert.equal(records.length, 5);
});

test("logging tolerates circular data and bounds oversized messages", () => {
  const records: LogRecord[] = [];
  const calls: Array<{ level: string; args: unknown[] }> = [];
  const logs = createOutrayLogMethods(testLogger(records), testConsole(calls));
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  logs.info("x".repeat(32 * 1024), circular);

  assert.equal(records.length, 1);
  assert.match(String(records[0]?.body), /\[Circular\]/);
  assert.ok(Buffer.byteLength(String(records[0]?.body)) <= 16 * 1024);
  assert.equal(records[0]?.attributes?.["outray.log.truncated"], true);
});

test("console context filters suppress every export while preserving local output and restoration", () => {
  for (const decision of ["allow", "block", "throw"] as const) {
    const records: LogRecord[] = [];
    const calls: Array<{ level: string; args: unknown[] }> = [];
    const target = testConsole(calls);
    const original = { ...target };
    let evaluations = 0;
    const restore = captureConsoleLogs(testLogger(records), target, () => {
      evaluations += 1;
      if (decision === "throw") throw new Error("filter failed");
      return decision === "allow";
    });
    for (const level of ["debug", "info", "log", "warn", "error"] as const) {
      target[level]("context-sensitive message", { orderId: "order_123" });
    }
    assert.equal(evaluations, 5);
    assert.equal(calls.length, 5);
    assert.equal(records.length, decision === "allow" ? 5 : 0);
    restore();
    assert.deepEqual(target, original);
    target.log("after restore");
    assert.equal(evaluations, 5);
    assert.equal(calls.length, 6);
    assert.equal(records.length, decision === "allow" ? 5 : 0);
  }
});

test("OutRay logger context filters allow, deny and fail closed without silencing the application", () => {
  for (const decision of ["allow", "block", "throw"] as const) {
    const records: LogRecord[] = [];
    const calls: Array<{ level: string; args: unknown[] }> = [];
    let evaluations = 0;
    const log = createOutrayLogMethods(testLogger(records), testConsole(calls), () => {
      evaluations += 1;
      if (decision === "throw") throw new Error("filter failed");
      return decision === "allow";
    });
    for (const level of ["debug", "info", "warn", "error"] as const) {
      log[level]("context-sensitive message");
    }
    assert.equal(evaluations, 4);
    assert.equal(calls.length, 4);
    assert.equal(records.length, decision === "allow" ? 4 : 0);
  }
});

test("console context filters are evaluated for each call and cannot recurse into export", () => {
  const records: LogRecord[] = [];
  const calls: Array<{ level: string; args: unknown[] }> = [];
  const target = testConsole(calls);
  let allowed = false;
  const restore = captureConsoleLogs(testLogger(records), target, () => {
    target.debug("filter diagnostic");
    return allowed;
  });
  target.info("blocked");
  allowed = true;
  target.info("allowed");
  allowed = false;
  target.info("blocked again");
  assert.equal(calls.length, 6);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.body, "allowed");
  restore();
});

test("credential field aliases are redacted in log bodies and attributes", () => {
  const records: LogRecord[] = [];
  const log = createOutrayLogMethods(testLogger(records), testConsole([]));
  log.info("credentials", {
    accessToken: "private-access",
    refreshToken: "private-refresh",
    clientSecret: "private-client",
    authKey: "private-auth",
    "x-auth-key": "private-header",
    nested: { apiKey: "private-nested", authorization: "private-authorization" },
    safe: "keep-this",
  });
  const record = records[0];
  assert.ok(record);
  assert.doesNotMatch(String(record.body), /private-/);
  for (const field of ["accessToken", "refreshToken", "clientSecret", "authKey", "x-auth-key"]) {
    assert.equal(record.attributes?.[field], "[REDACTED]");
  }
  assert.equal(record.attributes?.safe, "keep-this");
});

test("printf credential assignments are redacted after interpolation rather than appended", () => {
  const records: LogRecord[] = [];
  const log = createOutrayLogMethods(testLogger(records), testConsole([]));
  log.info("token=%s", "private-token");
  log.info('clientSecret="%s" done=%s', "private-client", "yes");
  log.info("auth_key: %s; accessToken=%s", "private-auth", "private-access");
  log.info("authorization=%s", "Bearer private-bearer");
  log.info("safe payload %j", { clientSecret: "private-json", safe: 42 });
  log.info("attempt=%d user=%s", 2, "Alice");
  log.info("token=%j", { sensitive: "private-object" });
  log.info("accessToken=%s safe=%s", { innocuous: "private-object-string" }, "keep");
  log.info('clientSecret="%o"', { innocuous: "private-object-inspect" });
  log.info("token=prefix-%s-%s done=%s", "private-part-one", "private-part-two", "yes");
  for (const record of records) assert.doesNotMatch(String(record.body), /private-/);
  assert.equal(records[0]?.body, "token=[REDACTED]");
  assert.equal(records[1]?.body, "clientSecret=[REDACTED] done=yes");
  assert.equal(records[2]?.body, "auth_key: [REDACTED]; accessToken=[REDACTED]");
  assert.equal(records[5]?.body, "attempt=2 user=Alice");
  assert.match(String(records[4]?.body), /"safe":42/);
  assert.equal(records[7]?.body, "accessToken=[REDACTED] safe=keep");
  assert.equal(records[7]?.attributes?.innocuous, undefined);
  assert.equal(records[8]?.attributes?.innocuous, undefined);
  assert.equal(records[9]?.body, "token=[REDACTED] done=yes");
});

test("auth URLs, encoded redirects, URL credentials, fragments, Basic and JWT credentials are redacted", () => {
  const records: LogRecord[] = [];
  const log = createOutrayLogMethods(testLogger(records), testConsole([]));
  const callback = "https://outray.test/api/auth/callback/github?code=private-oauth&state=private-state&error=access_denied";
  log.error("OAuth exchange failed", {
    callback,
    redirect: `https://auth.test/login?redirect=${encodeURIComponent(callback)}`,
    database: "postgresql://private-user:private-password@db.test:5432/outray?sslmode=require",
    share: "https://share.test/abc#private-share-key",
    basic: "Basic cHJpdmF0ZS1iYXNpYw==",
    jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.cHJpdmF0ZQ",
    code: "OAUTH_EXCHANGE_FAILED",
    status: 401,
  });
  const serialized = JSON.stringify(records[0]);
  assert.doesNotMatch(serialized, /private-|cHJpdmF0ZS1iYXNpYw|eyJhbGci/);
  assert.match(serialized, /access_denied/);
  assert.match(serialized, /sslmode=require/);
  assert.equal(records[0]?.attributes?.code, "OAUTH_EXCHANGE_FAILED");
  assert.equal(records[0]?.attributes?.status, 401);
});

test("Error causes keep useful diagnostics without SQL parameters, custom request configs or circular leakage", () => {
  const records: LogRecord[] = [];
  const log = createOutrayLogMethods(testLogger(records), testConsole([]));
  const database = Object.assign(new Error('column "missing_column" does not exist'), {
    code: "42703",
    statusCode: 500,
    query: "select private-sql",
    params: ["private-db-param"],
    config: { request: { innocuous: "private-request-config" } },
  });
  const outer = new Error("Failed query: select * from accounts where id=$1\nparams: private-raw-param", { cause: database });
  Object.assign(database, { cause: outer });
  log.error("Auth session lookup failed", outer);
  const body = String(records[0]?.body);
  assert.doesNotMatch(JSON.stringify(records[0]), /private-|select \*/);
  assert.match(body, /42703/);
  assert.match(body, /missing_column/);
  assert.match(body, /statusCode: 500/);
  assert.match(body, /\[Circular\]/);
  assert.match(String(records[0]?.attributes?.["exception.stacktrace"]), /at TestContext/);
});

test("additional log fields extend defaults for objects, JSON strings and printf arguments", () => {
  const records: LogRecord[] = [];
  const calls: Array<{ level: string; args: unknown[] }> = [];
  const target = testConsole(calls);
  const restore = captureConsoleLogs(testLogger(records), target, undefined, ["value", "body", "result"]);
  target.error("Secrets lookup failed", {
    value: "private-value",
    token: "private-default-token",
    result: { innocuous: "private-result" },
    code: "UPSTREAM_ERROR",
    status: 502,
  });
  target.log('{"body":{"nested":"private-body", "other":"private-tail"},"code":"SAFE_CODE"}');
  target.log("value=%o status=%d", { innocuous: "private-format" }, 500);
  target.log("https://oauth.test/callback?code=%s&state=%s&error=denied", { innocuous: "private-code" }, "private-state");
  target.log("postgresql://%s:%s@db.test/database", "private-user", "private-password");
  target.log("oauth_access_token=%s", "private-alias");
  restore();
  assert.equal(records.length, 6);
  for (const record of records) assert.doesNotMatch(JSON.stringify(record), /private-/);
  assert.equal(records[0]?.attributes?.code, "UPSTREAM_ERROR");
  assert.equal(records[0]?.attributes?.value, "[REDACTED]");
  assert.equal(records[2]?.attributes?.innocuous, undefined);
  assert.equal(records[3]?.attributes?.innocuous, undefined);
  assert.match(String(records[1]?.body), /SAFE_CODE/);
  assert.match(String(records[3]?.body), /error=denied/);
  // Sanitization never mutates the application's original console arguments.
  assert.equal((calls[0]?.args[1] as { value: string }).value, "private-value");
});

test("concurrent request contexts retain all permitted auth and secret logs without cross-request state", async () => {
  const records: LogRecord[] = [];
  const context = new AsyncLocalStorage<{ route: string }>();
  const log = createOutrayLogMethods(testLogger(records), testConsole([]), undefined, ["value"]);
  await Promise.all(["/api/auth/get-session", "/api/acme/secrets/reveal"].map((route) => context.run({ route }, async () => {
    await new Promise((resolve) => setImmediate(resolve));
    const detail = { route: context.getStore()?.route, value: `private-${route}` };
    log.error("Request failed", detail);
    log.info("Retrying request", detail);
  })));
  assert.equal(records.length, 4);
  assert.deepEqual(new Set(records.map((record) => record.attributes?.route)), new Set(["/api/auth/get-session", "/api/acme/secrets/reveal"]));
  assert.doesNotMatch(JSON.stringify(records), /private-/);
});

test("relative and deeply nested URLs, cookie headers and truncated private keys fail closed", () => {
  const records: LogRecord[] = [];
  const log = createOutrayLogMethods(testLogger(records), testConsole([]));
  let nested = "https://oauth.test/callback?code=private-deep-code&state=private-deep-state";
  for (let index = 0; index < 6; index += 1) nested = `https://oauth.test/login?redirect=${encodeURIComponent(nested)}`;
  log.error("Auth callback failed /api/auth/callback?code=private-relative-code&state=private-relative-state&error=denied");
  log.error(encodeURIComponent("https://oauth.test/callback?code=private-encoded-code&state=private-encoded-state"));
  log.error(nested);
  log.error("Cookie: sid=private-sid; other=private-cookie\nSet-Cookie: id=private-id; HttpOnly; Secure\nstatus=401");
  log.error(`-----BEGIN PRIVATE KEY-----\n${"private-key-material".repeat(1000)}`);
  log.error(Buffer.from("private-buffer"));
  assert.equal(records.length, 6);
  assert.doesNotMatch(JSON.stringify(records), /private-|cHJpdmF0ZS/);
  assert.match(String(records[0]?.body), /error=denied/);
  assert.match(String(records[3]?.body), /status=401/);
  assert.equal(records[4]?.attributes?.["outray.log.truncated"], true);
  assert.match(String(records[5]?.body), /Binary 14 bytes/);
});

test("standalone login/OTP codes and auth-context code/state/nonce are redacted without losing diagnostic codes", () => {
  const records: LogRecord[] = [];
  const log = createOutrayLogMethods(testLogger(records), testConsole([]));
  const cliCode = "bf58de03917074f92a7cd5932e01ee41e782d040e98743db15be5fa3e493def4";
  log.error("CLI login", { code: cliCode });
  log.error("OTP login", { code: "123456" });
  log.error("OAuth callback", { provider: "github", code: "short-auth-code", state: "short-auth-state", nonce: "private-nonce" });
  log.error(`{"code":"${cliCode}"}`);
  log.error("code=%s", cliCode);
  log.error("OTP", { code: 654321 });
  log.error("Diagnostic", { code: "INVALID_CREDENTIALS", state: "pending" });
  log.error("Diagnostic", { code: "invalid_grant", status: 401 });
  log.error(Object.assign(new Error("connection failed"), { code: "08006" }));
  log.info('{"code":200,"state":"up"}');
  log.error("relative /auth/callback#private-fragment");
  const doubleEncoded = encodeURIComponent(encodeURIComponent("https://outray.test/auth/callback?code=private-encoded&state=private-state"));
  log.error(`https://outray.test/login?redirect=${doubleEncoded}`);
  assert.equal(records.length, 12);
  for (const record of records) assert.doesNotMatch(JSON.stringify(record), /bf58de039|123456|654321|short-auth-|private-/);
  assert.equal(records[0]?.attributes?.code, "[REDACTED]");
  assert.equal(records[6]?.attributes?.code, "INVALID_CREDENTIALS");
  assert.equal(records[6]?.attributes?.state, "pending");
  assert.equal(records[7]?.attributes?.code, "invalid_grant");
  assert.equal(records[8]?.attributes?.["exception.code"], "08006");
  assert.match(String(records[9]?.body), /"code":200,"state":"up"/);
});
