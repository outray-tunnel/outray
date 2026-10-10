import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fromJSON, toJSON } from "seroval";

test("the Seroval security override and every locked copy stay on the verified patched release", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../../../package-lock.json", import.meta.url), "utf8"));
  assert.equal(manifest.overrides.seroval, "1.6.3");
  const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith("node_modules/seroval"));
  assert.ok(copies.length > 0, "Seroval must be present in the production dependency graph");
  for (const [path, entry] of copies) {
    assert.equal((entry as { version: string }).version, "1.6.3", path);
  }
  const installed = JSON.parse(await readFile(new URL("../../../node_modules/seroval/package.json", import.meta.url), "utf8"));
  assert.equal(installed.version, "1.6.3", "clean installs must select the patched release");
});

test("patched Seroval preserves structured server-context serialization", () => {
  const context = {
    organizationId: "test-org",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    flags: new Map([["enabled", true]]),
    values: [null, undefined, 42n, new Uint8Array([1, 2, 3])],
  };
  assert.deepEqual(fromJSON(toJSON(context)), context);
});
