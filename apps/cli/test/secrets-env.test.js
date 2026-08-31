const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  exportEnvText,
  normalizeSecretKey,
  parseEnvText,
  secretsToJson,
  stripSingleTrailingLineBreak,
  writePrivateFileExclusiveAtomic,
} = require("../dist/secrets-env.js");

test("parses and exports deterministic dotenv and JSON values", () => {
  const values = parseEnvText(
    `# ignored\nexport DATABASE_URL="postgres://local db"\nAPI_KEY=abc\nMULTILINE="one\\ntwo"\n`,
  );
  assert.deepEqual(values, {
    DATABASE_URL: "postgres://local db",
    API_KEY: "abc",
    MULTILINE: "one\ntwo",
  });
  assert.equal(
    exportEnvText(values),
    `API_KEY=abc\nDATABASE_URL="postgres://local db"\nMULTILINE="one\\ntwo"\n`,
  );
  assert.equal(
    secretsToJson({ B: "2", A: "1" }),
    `{\n  "A": "1",\n  "B": "2"\n}\n`,
  );
});

test("rejects malformed dotenv input instead of silently dropping it", () => {
  const plaintext = "do-not-print-this-value";
  assert.throws(
    () => parseEnvText(`VALID=yes\nmalformed ${plaintext}\n`),
    (error) => {
      assert.match(error.message, /Invalid dotenv syntax on line 2/);
      assert.equal(error.message.includes(plaintext), false);
      return true;
    },
  );
});

test("normalizes keys, supports quoted multiline values, and rejects collisions", () => {
  assert.equal(normalizeSecretKey("  api key  "), "API_KEY");
  assert.throws(() => normalizeSecretKey("API-KEY"), /must match/);
  assert.throws(() => normalizeSecretKey("9lives"), /must match/);
  assert.throws(() => normalizeSecretKey(`A${"B".repeat(256)}`), /must match/);
  assert.deepEqual(
    parseEnvText(`api key="line one\nline two"\nSINGLE='first\nsecond'\n`),
    { API_KEY: "line one\nline two", SINGLE: "first\nsecond" },
  );
  assert.throws(
    () => parseEnvText("api key=one\nAPI_KEY=two\n"),
    /Duplicate secret key after normalization/,
  );
});

test("matches server dotenv escaping and inline-comment semantics", () => {
  assert.deepEqual(
    parseEnvText(String.raw`WINDOWS="C:\path"
URL=https://example.test/path # local endpoint
HASH=value#literal
`),
    {
      WINDOWS: String.raw`C:\path`,
      URL: "https://example.test/path",
      HASH: "value#literal",
    },
  );
});

test("writes private output atomically and refuses overwrites", (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "outray-secret-output-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, ".env");
  writePrivateFileExclusiveAtomic(output, "API_KEY=secret\n");
  assert.equal(fs.readFileSync(output, "utf8"), "API_KEY=secret\n");
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.throws(
    () => writePrivateFileExclusiveAtomic(output, "OVERWRITE=no\n"),
    /Refusing to overwrite/,
  );
  assert.equal(fs.readFileSync(output, "utf8"), "API_KEY=secret\n");
});

test("forced output replaces atomically and resets permissions to 0600", (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "outray-secret-force-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, ".env");
  fs.writeFileSync(output, "OLD=value\n", { mode: 0o644 });
  writePrivateFileExclusiveAtomic(output, "NEW=value\n", { force: true });
  assert.equal(fs.readFileSync(output, "utf8"), "NEW=value\n");
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.deepEqual(
    fs.readdirSync(directory).filter((entry) => entry.endsWith(".tmp")),
    [],
  );
});

test("stdin values lose only one terminal line break", () => {
  assert.equal(stripSingleTrailingLineBreak("secret\n"), "secret");
  assert.equal(stripSingleTrailingLineBreak("secret\n\n"), "secret\n");
  assert.equal(stripSingleTrailingLineBreak("secret\r\n"), "secret");
});
