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
