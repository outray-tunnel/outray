import assert from "node:assert/strict";
import { test } from "node:test";
import { SecretsError } from "../src/lib/secrets/types";
import {
  isProductionEnvironment,
  MAX_ENV_TEXT_BYTES,
  MAX_SECRET_VALUE_BYTES,
  parseEnvText,
  readExpectedEnvironmentRevisions,
  readExpectedSecretVersions,
  requireProductionConfirmation,
  serializeEnvText,
  validateSecretImportSize,
  validateSecretKey,
  validateSecretValue,
} from "../src/lib/secrets/validation";

test("secret keys are trimmed, whitespace-normalized, and uppercased", () => {
  assert.equal(validateSecretKey("  database url  "), "DATABASE_URL");
  assert.equal(validateSecretKey("_internal  token"), "_INTERNAL_TOKEN");
  assert.equal(validateSecretKey("already_valid_2"), "ALREADY_VALID_2");

  for (const invalid of ["DATABASE.URL", "DATABASE-URL", "2FA_TOKEN", ""]) {
    assert.throws(
      () => validateSecretKey(invalid),
      (error) =>
        error instanceof SecretsError &&
        error.code === "VALIDATION_ERROR" &&
        error.field === "key",
    );
  }
});

test("dotenv parsing rejects duplicate keys after canonical normalization", () => {
  assert.throws(
    () => parseEnvText("api key=first\nAPI_KEY=second\n"),
    (error) =>
      error instanceof SecretsError &&
      error.code === "DUPLICATE_ENV_KEYS" &&
      error.status === 400 &&
      error.field === "envText" &&
      assert.deepEqual(error.details?.duplicates, ["API_KEY"]) === undefined,
  );
});

test("quoted multiline dotenv values parse and serialize without data loss", () => {
  const parsed = parseEnvText([
    "export CERTIFICATE='-----BEGIN-----",
    "line two",
    "-----END-----'",
    'JSON_VALUE="{\\"enabled\\":true}"',
    "EMPTY_VALUE=\"\"",
    "HASH_VALUE='value # retained'",
    "PLAIN_VALUE=value # discarded comment",
  ].join("\n"));

  assert.deepEqual(parsed, {
    values: {
      CERTIFICATE: "-----BEGIN-----\nline two\n-----END-----",
      JSON_VALUE: '{"enabled":true}',
      EMPTY_VALUE: "",
      HASH_VALUE: "value # retained",
      PLAIN_VALUE: "value",
    },
    duplicates: [],
  });

  const serialized = serializeEnvText(parsed.values);
  assert.equal(serialized.endsWith("\n"), true);
  assert.deepEqual(parseEnvText(serialized).values, parsed.values);
});

test("secret values enforce the 64 KiB UTF-8 byte boundary", () => {
  const exactAscii = "a".repeat(MAX_SECRET_VALUE_BYTES);
  const exactMultibyte = "é".repeat(MAX_SECRET_VALUE_BYTES / 2);

  assert.equal(validateSecretValue(exactAscii), exactAscii);
  assert.equal(validateSecretValue(exactMultibyte), exactMultibyte);
  assert.throws(
    () => validateSecretValue(`${exactAscii}a`),
    (error) =>
      error instanceof SecretsError &&
      error.status === 413 &&
      error.field === "value",
  );
  assert.throws(
    () => validateSecretValue(`${exactMultibyte}é`),
    (error) => error instanceof SecretsError && error.status === 413,
  );
});

test("aggregate JSON imports enforce the 1 MiB byte boundary", () => {
  const values: Record<string, string> = {};
  const keys = Array.from({ length: 16 }, (_, index) => `K${index}`);
  const framingBytes = keys.reduce(
    (total, key) => total + Buffer.byteLength(key, "utf8") + 2,
    0,
  );
  const valueBudget = MAX_ENV_TEXT_BYTES - framingBytes;

  for (const key of keys.slice(0, -1)) {
    values[key] = "x".repeat(MAX_SECRET_VALUE_BYTES);
  }
  const usedBytes = MAX_SECRET_VALUE_BYTES * (keys.length - 1);
  values[keys.at(-1)!] = "x".repeat(valueBudget - usedBytes);

  assert.doesNotThrow(() => validateSecretImportSize(values));
  assert.doesNotThrow(() => {
    for (const value of Object.values(values)) validateSecretValue(value);
  });
  assert.throws(
    () =>
      validateSecretImportSize({
        ...values,
        [keys.at(-1)!]: `${values[keys.at(-1)!]}x`,
      }),
    (error) =>
      error instanceof SecretsError &&
      error.code === "VALIDATION_ERROR" &&
      error.status === 413 &&
      error.field === "values",
  );
});

test("production detection is persisted and mutations require an exact boolean confirmation", () => {
  assert.equal(isProductionEnvironment({ slug: "production" }), true);
  assert.equal(isProductionEnvironment({ slug: "safe", name: "LIVE" }), true);
  assert.equal(isProductionEnvironment({ slug: "prod-preview" }), false);

  assert.throws(
    () => requireProductionConfirmation({ isProduction: true }, undefined),
    (error) =>
      error instanceof SecretsError &&
      error.code === "PRODUCTION_CONFIRMATION_REQUIRED" &&
      error.status === 409 &&
      error.field === "confirmProduction",
  );
  assert.throws(
    () => requireProductionConfirmation({ isProduction: true }, "true"),
    (error) =>
      error instanceof SecretsError &&
      error.code === "PRODUCTION_CONFIRMATION_REQUIRED",
  );
  assert.doesNotThrow(() =>
    requireProductionConfirmation({ isProduction: true }, true),
  );
  assert.doesNotThrow(() =>
    requireProductionConfirmation({ isProduction: false }, undefined),
  );
});

test("CLI mutation preconditions cover every normalized secret key", () => {
  assert.deepEqual(
    readExpectedSecretVersions(
      { "api key": 3, NEW_KEY: null },
      ["API_KEY", "new key"],
    ),
    { API_KEY: 3, NEW_KEY: null },
  );
  assert.throws(
    () => readExpectedSecretVersions({ API_KEY: 3 }, ["API_KEY", "NEW_KEY"]),
    (error) =>
      error instanceof SecretsError &&
      error.code === "VALIDATION_ERROR" &&
      error.field === "expectedVersions",
  );
  assert.throws(
    () => readExpectedSecretVersions({ API_KEY: 0 }, ["API_KEY"]),
    (error) =>
      error instanceof SecretsError &&
      error.field === "expectedVersions.API_KEY",
  );
});

test("multi-environment revisions cover every normalized selected environment", () => {
  assert.deepEqual(
    readExpectedEnvironmentRevisions(
      { Development: 4, staging: 0 },
      ["development", "staging"],
    ),
    { development: 4, staging: 0 },
  );
  assert.throws(
    () =>
      readExpectedEnvironmentRevisions(
        { development: 4 },
        ["development", "staging"],
      ),
    (error) =>
      error instanceof SecretsError &&
      error.code === "VALIDATION_ERROR" &&
      error.field === "expectedRevisions",
  );
  assert.throws(
    () =>
      readExpectedEnvironmentRevisions(
        { development: -1 },
        ["development"],
      ),
    (error) =>
      error instanceof SecretsError &&
      error.field === "expectedRevisions.development",
  );
});
