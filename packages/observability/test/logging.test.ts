import assert from "node:assert/strict";
import test from "node:test";
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
