import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  createEmptySecretDraft,
  parseSecretPaste,
  populateSecretDraft,
  secretDraftValues,
  type SecretDraftRow,
} from "../src/components/onboarding/secrets-draft";
import { SecretsError } from "../src/lib/secrets/types";
import { MAX_ENV_TEXT_BYTES, MAX_SECRET_VALUE_BYTES } from "../src/lib/secrets/validation";

test("dotenv paste expands comments, export, quotes, multiline values, hashes, equals and empty values", () => {
  const text = [
    "\uFEFF# Application settings",
    "",
    "export api key = first",
    "URL=https://example.com?token=a=b#retained",
    "PLAIN=hello # ignored comment",
    "HASH='value # retained'",
    'ESCAPED="line one\\nline two\\t\\"quoted\\""',
    "CERTIFICATE='-----BEGIN-----",
    "line two",
    "-----END-----'",
    "EMPTY=",
  ].join("\r\n");
  const expected = [
    { key: "API_KEY", value: "first" },
    { key: "URL", value: "https://example.com?token=a=b#retained" },
    { key: "PLAIN", value: "hello" },
    { key: "HASH", value: "value # retained" },
    { key: "ESCAPED", value: 'line one\nline two\t"quoted"' },
    { key: "CERTIFICATE", value: "-----BEGIN-----\nline two\n-----END-----" },
    { key: "EMPTY", value: "" },
  ];
  assert.deepEqual(parseSecretPaste(text, "key"), expected);
  assert.deepEqual(parseSecretPaste(text, "value"), expected);
  assert.deepEqual(parseSecretPaste("export TOKEN=one=two", "key"), [{ key: "TOKEN", value: "one=two" }]);
});

test("ordinary pastes remain ordinary in keys and values", () => {
  for (const text of ["", "\n# just a comment", "ordinary value", "https://example.com?token=a=b", "a long\nmultiline value"]) {
    assert.equal(parseSecretPaste(text, "key"), null);
    assert.equal(parseSecretPaste(text, "value"), null);
  }
  assert.equal(parseSecretPaste("TOKEN=one=two", "value"), null);
  assert.equal(parseSecretPaste("TOKEN='line one\nANOTHER=part of this value'", "value"), null);
});

test("malformed and duplicate dotenv paste rejects before existing rows change", () => {
  const rows = [{ id: 4, key: "EXISTING", value: "keep this value" }, { id: 8, key: "", value: "" }];
  const before = structuredClone(rows);
  for (const text of ["GOOD=value\nnot an assignment", 'GOOD="missing closing quote\nSECOND=value', "api key=one\nAPI_KEY=two"]) {
    assert.throws(() => {
      const entries = parseSecretPaste(text, "key");
      if (entries) populateSecretDraft(rows, 8, entries);
    }, SecretsError);
    assert.deepEqual(rows, before);
  }
  assert.throws(() => populateSecretDraft(rows, 8, [{ key: "existing", value: "replace?" }]), /Duplicate environment key: EXISTING/);
  assert.deepEqual(rows, before);
});

test("population replaces its target while preserving surrounding rows and stable increasing ids", () => {
  assert.deepEqual(createEmptySecretDraft(), [{ id: 0, key: "", value: "" }]);
  const rows = [
    { id: 2, key: "BEFORE", value: "unchanged" },
    { id: 7, key: "REPLACED", value: "old" },
    { id: 10, key: "AFTER", value: "also unchanged" },
  ];
  const populated = populateSecretDraft(rows, 7, [
    { key: "replaced", value: "new" },
    { key: "EMPTY", value: "" },
  ]);
  assert.deepEqual(populated, [rows[0], { id: 7, key: "REPLACED", value: "new" }, { id: 11, key: "EMPTY", value: "" }, rows[2]]);
  assert.equal(populated[0], rows[0]);
  assert.equal(populated[3], rows[2]);
  assert.deepEqual(rows[1], { id: 7, key: "REPLACED", value: "old" });
  assert.equal(populateSecretDraft(rows, 99, [{ key: "KEY", value: "value" }]), rows);
  assert.equal(populateSecretDraft(rows, 7, []), rows);
  assert.throws(() => populateSecretDraft(rows, 7, [{ key: "new key", value: "a" }, { key: "NEW_KEY", value: "b" }]), /Duplicate environment key/);
});

test("draft values ignore empty rows, normalize keys, and preserve empty and whitespace values", () => {
  assert.deepEqual(secretDraftValues([
    { id: 0, key: " ", value: "" },
    { id: 1, key: "api key", value: "  unchanged \nvalue\t " },
    { id: 2, key: "EMPTY", value: "" },
  ]), { API_KEY: "  unchanged \nvalue\t ", EMPTY: "" });
});

test("draft validation rejects missing, invalid, duplicate and oversized rows before saving", () => {
  const invalidRows: SecretDraftRow[][] = [
    createEmptySecretDraft(),
    [{ id: 0, key: "", value: "orphan value" }],
    [{ id: 0, key: "1_BAD", value: "value" }],
    [{ id: 0, key: "BAD-KEY", value: "value" }],
    [{ id: 0, key: "api key", value: "one" }, { id: 1, key: "API_KEY", value: "two" }],
    [{ id: 0, key: "LONG", value: "é".repeat(MAX_SECRET_VALUE_BYTES / 2 + 1) }],
  ];
  for (const rows of invalidRows) assert.throws(() => secretDraftValues(rows), SecretsError);
  const largeRows = Array.from({ length: 17 }, (_, id) => ({ id, key: `KEY_${id}`, value: "x".repeat(MAX_SECRET_VALUE_BYTES) }));
  assert.throws(() => secretDraftValues(largeRows), (error) => error instanceof SecretsError && error.status === 413 && error.field === "values");
});

test("shared UTF-8 validation and dotenv parsing run in a browser without Buffer", async () => {
  const source = await readFile(new URL("../src/lib/secrets/validation.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, (...args: any[]) => any> };
  const sandbox = { module, exports: module.exports, TextEncoder, require: () => ({ SecretsError }) };
  runInNewContext(compiled, sandbox);
  assert.equal(runInNewContext("typeof Buffer", sandbox), "undefined");
  const exact = "é".repeat(MAX_SECRET_VALUE_BYTES / 2);
  assert.equal(module.exports.validateSecretValue(exact), exact);
  assert.throws(() => module.exports.validateSecretValue(`${exact}é`), (error) => error instanceof SecretsError && error.status === 413);
  assert.equal(module.exports.parseEnvText(`KEY=${exact}`).values.KEY, exact);
  assert.throws(() => module.exports.parseEnvText(`#${"é".repeat(MAX_ENV_TEXT_BYTES / 2)}`), (error) => error instanceof SecretsError && error.status === 413);
  const values = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`KEY_${index}`, exact]));
  assert.throws(() => module.exports.validateSecretImportSize(values), (error) => error instanceof SecretsError && error.status === 413);
});
