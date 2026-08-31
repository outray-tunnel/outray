import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOrganizationKey,
  decryptSecretValue,
  encryptSecretValue,
  nextOrganizationKeyVersion,
  readSecretsKeyring,
  unwrapOrganizationKey,
  wrapOrganizationKey,
  type EncryptedPayload,
  type MasterKey,
  type SecretsKeyring,
} from "../src/lib/secrets/crypto";
import { SecretsError } from "../src/lib/secrets/types";

const oldMaster: MasterKey = {
  id: "master-2025",
  key: Buffer.alloc(32, 0x15),
};
const activeMaster: MasterKey = {
  id: "master-2026",
  key: Buffer.alloc(32, 0x26),
};
const keyring: SecretsKeyring = {
  active: activeMaster,
  previous: [oldMaster],
};

const secretIdentity = {
  organizationId: "org-1",
  projectId: "project-1",
  environmentId: "environment-1",
  entryId: "entry-1",
  version: 3,
  keySnapshot: "DATABASE_URL",
  organizationKeyVersion: 2,
};

function assertAuthenticationFailure(error: unknown) {
  return (
    error instanceof SecretsError &&
    error.code === "SECRETS_DECRYPTION_FAILED" &&
    error.status === 500
  );
}

function flipFirstByte(value: string) {
  const bytes = Buffer.from(value, "base64");
  bytes[0] ^= 0x01;
  return bytes.toString("base64");
}

test("organization envelope encryption round-trips through a configured previous master key", () => {
  const organizationKey = createOrganizationKey();
  const wrapped = wrapOrganizationKey("org-1", 7, organizationKey, oldMaster);

  assert.equal(organizationKey.length, 32);
  assert.equal(wrapped.algorithm, "AES-256-GCM");
  assert.equal(wrapped.wrappingKeyId, oldMaster.id);
  assert.equal(wrapped.organizationKeyVersion, 7);
  assert.deepEqual(unwrapOrganizationKey("org-1", wrapped, keyring), organizationKey);
});

test("organization-key envelopes authenticate organization, key version, and master-key identity", () => {
  const wrapped = wrapOrganizationKey(
    "org-1",
    4,
    createOrganizationKey(),
    oldMaster,
  );

  assert.throws(
    () => unwrapOrganizationKey("org-2", wrapped, keyring),
    assertAuthenticationFailure,
  );
  assert.throws(
    () =>
      unwrapOrganizationKey(
        "org-1",
        { ...wrapped, organizationKeyVersion: 5 },
        keyring,
      ),
    assertAuthenticationFailure,
  );
  assert.throws(
    () =>
      unwrapOrganizationKey(
        "org-1",
        { ...wrapped, authTag: flipFirstByte(wrapped.authTag) },
        keyring,
      ),
    assertAuthenticationFailure,
  );

  const unknownMaster = { ...wrapped, wrappingKeyId: "missing-master" };
  assert.throws(
    () => unwrapOrganizationKey("org-1", unknownMaster, keyring),
    (error) =>
      error instanceof SecretsError &&
      error.code === "SECRETS_KEY_UNAVAILABLE" &&
      error.status === 503,
  );
});

test("organization keys can be rewrapped without changing the data key", () => {
  const organizationKey = createOrganizationKey();
  const oldEnvelope = wrapOrganizationKey("org-1", 9, organizationKey, oldMaster);
  const unwrapped = unwrapOrganizationKey("org-1", oldEnvelope, keyring);
  const newEnvelope = wrapOrganizationKey("org-1", 9, unwrapped, activeMaster);

  assert.equal(newEnvelope.wrappingKeyId, activeMaster.id);
  assert.equal(newEnvelope.organizationKeyVersion, 9);
  assert.notEqual(newEnvelope.ciphertext, oldEnvelope.ciphertext);
  assert.deepEqual(
    unwrapOrganizationKey("org-1", newEnvelope, {
      active: activeMaster,
      previous: [],
    }),
    organizationKey,
  );
});

test("organization-key versions increase monotonically and reject invalid history", () => {
  assert.equal(nextOrganizationKeyVersion([]), 1);
  assert.equal(nextOrganizationKeyVersion([1, 4, 2]), 5);
  assert.throws(
    () => nextOrganizationKeyVersion([1, 0]),
    (error) =>
      error instanceof SecretsError && error.code === "SECRETS_KEY_INVALID",
  );
  assert.throws(
    () => nextOrganizationKeyVersion([1, 2.5]),
    (error) =>
      error instanceof SecretsError && error.code === "SECRETS_KEY_INVALID",
  );
});

test("secret values round-trip and ciphertext or authentication-tag tampering is rejected", () => {
  const organizationKey = createOrganizationKey();
  const encrypted = encryptSecretValue(organizationKey, {
    ...secretIdentity,
    value: "postgres://user:p@ss@example.test/db\nsecond-line",
  });

  assert.equal(encrypted.algorithm, "AES-256-GCM");
  assert.equal(
    decryptSecretValue(organizationKey, { ...secretIdentity, ...encrypted }),
    "postgres://user:p@ss@example.test/db\nsecond-line",
  );

  for (const field of ["ciphertext", "authTag"] as const) {
    const tampered: EncryptedPayload = {
      ...encrypted,
      [field]: flipFirstByte(encrypted[field]),
    };
    assert.throws(
      () =>
        decryptSecretValue(organizationKey, {
          ...secretIdentity,
          ...tampered,
        }),
      assertAuthenticationFailure,
      `${field} must be authenticated`,
    );
  }
});

test("secret AAD binds every immutable identity and version field", () => {
  const organizationKey = createOrganizationKey();
  const encrypted = encryptSecretValue(organizationKey, {
    ...secretIdentity,
    value: "bound secret",
  });
  const mutations = [
    { organizationId: "org-2" },
    { projectId: "project-2" },
    { environmentId: "environment-2" },
    { entryId: "entry-2" },
    { version: secretIdentity.version + 1 },
    { keySnapshot: "RENAMED_KEY" },
    { organizationKeyVersion: secretIdentity.organizationKeyVersion + 1 },
  ];

  for (const mutation of mutations) {
    assert.throws(
      () =>
        decryptSecretValue(organizationKey, {
          ...secretIdentity,
          ...encrypted,
          ...mutation,
        }),
      assertAuthenticationFailure,
      `${Object.keys(mutation)[0]} must be authenticated`,
    );
  }
});

test("value digests are stable per organization key but unlinkable across organization keys", () => {
  const firstOrganizationKey = Buffer.alloc(32, 0xa1);
  const secondOrganizationKey = Buffer.alloc(32, 0xb2);
  const first = encryptSecretValue(firstOrganizationKey, {
    ...secretIdentity,
    value: "same plaintext",
  });
  const again = encryptSecretValue(firstOrganizationKey, {
    ...secretIdentity,
    value: "same plaintext",
  });
  const otherOrganization = encryptSecretValue(secondOrganizationKey, {
    ...secretIdentity,
    organizationId: "org-2",
    value: "same plaintext",
  });

  assert.equal(first.valueDigest, again.valueDigest);
  assert.notEqual(first.ciphertext, again.ciphertext);
  assert.notEqual(first.iv, again.iv);
  assert.notEqual(first.valueDigest, otherOrganization.valueDigest);
  assert.match(first.valueDigest, /^[a-f0-9]{64}$/);
});

test("master-key configuration loads active and previous key material by ID", () => {
  const loaded = readSecretsKeyring({
    OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID: activeMaster.id,
    OUTRAY_SECRETS_ACTIVE_MASTER_KEY: activeMaster.key.toString("base64"),
    OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS: JSON.stringify({
      [oldMaster.id]: oldMaster.key.toString("hex"),
    }),
  });

  assert.equal(loaded.active.id, activeMaster.id);
  assert.deepEqual(loaded.active.key, activeMaster.key);
  assert.equal(loaded.previous[0]?.id, oldMaster.id);
  assert.deepEqual(loaded.previous[0]?.key, oldMaster.key);
});
