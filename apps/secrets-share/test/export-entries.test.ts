import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvPaste } from "../src/lib/env-paste";
import { entriesAsEnv, entriesAsJson } from "../src/lib/export-entries";

test("environment export preserves special characters and multiline values", () => {
  const entries = [
    { key: "API_KEY", value: 'a=b # keep "quotes" and \\slashes' },
    { key: "PRIVATE_KEY", value: "first line\nsecond line\tindented" },
    { key: "EMPTY", value: "" },
  ];
  assert.deepEqual(parseEnvPaste(entriesAsEnv(entries)), entries);
});

test("JSON export preserves names and values that are not valid env keys", () => {
  const entries = [{ key: "api-key", value: "one=two" }, { key: "__proto__", value: "safe" }];
  const json = JSON.parse(entriesAsJson(entries));
  assert.equal(json["api-key"], "one=two");
  assert.equal(Object.getOwnPropertyDescriptor(json, "__proto__")?.value, "safe");
  assert.throws(() => entriesAsEnv(entries), /Download JSON instead/);
});
