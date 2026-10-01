import assert from "node:assert/strict";
import { test } from "node:test";
import { isEnvPasteCandidate, mergeEnvEntries, parseEnvPaste } from "../src/lib/env-paste";

test("recognizes and parses dotenv blocks without losing equals signs", () => {
  const text = '\uFEFF# application secrets\r\nexport API_KEY = abc=123#keep\r\nEMPTY=\r\nNOTE="hello\\nworld" # comment\r\n';
  assert.equal(isEnvPasteCandidate(text), true);
  assert.deepEqual(parseEnvPaste(text), [
    { key: "API_KEY", value: "abc=123#keep" },
    { key: "EMPTY", value: "" },
    { key: "NOTE", value: "hello\nworld" },
  ]);
});

test("keeps multiline quoted values together", () => {
  assert.deepEqual(parseEnvPaste('PRIVATE_KEY="-----BEGIN KEY-----\nabc=123\n-----END KEY-----"\nTOKEN=next'), [
    { key: "PRIVATE_KEY", value: "-----BEGIN KEY-----\nabc=123\n-----END KEY-----" },
    { key: "TOKEN", value: "next" },
  ]);
});

test("rejects malformed dotenv blocks without echoing their contents", () => {
  assert.equal(isEnvPasteCandidate("just a value=with equals"), false);
  assert.throws(() => parseEnvPaste("GOOD=secret\nnot an assignment"), /Line 2 must be in KEY=VALUE format/);
  assert.throws(() => parseEnvPaste('GOOD="unfinished secret'), /Line 1 has an unfinished quoted value/);
});

test("fills an empty row but preserves populated rows when importing", () => {
  const imported = parseEnvPaste("API_KEY=first\nTOKEN=second");
  assert.deepEqual(mergeEnvEntries([{ key: "", value: "" }], 0, imported, 50), imported);
  assert.deepEqual(mergeEnvEntries([{ key: "EXISTING", value: "keep" }], 0, imported, 50), [
    { key: "EXISTING", value: "keep" }, ...imported,
  ]);
});

test("rejects duplicate names and imports beyond the share limit", () => {
  const imported = parseEnvPaste("TOKEN=new");
  assert.throws(() => mergeEnvEntries([{ key: "TOKEN", value: "old" }], 0, imported, 50), /Secret names must be unique/);
  assert.throws(() => mergeEnvEntries([{ key: "OTHER", value: "keep" }], 0, imported, 1), /at most 1 named secret/);
});
