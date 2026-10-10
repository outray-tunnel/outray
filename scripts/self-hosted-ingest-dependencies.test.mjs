import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyIngestDependencies } from "./self-hosted-ingest-dependencies.mjs";

function dependencyFixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), "outray-ingest-deps-")), modules = join(directory, "node_modules"), target = join(directory, "runtime-modules");
  mkdirSync(modules);
  const add = (name, dependencies = {}, optionalDependencies = {}, base = modules) => {
    const path = join(base, name); mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js", dependencies, optionalDependencies }));
    writeFileSync(join(path, "index.js"), "module.exports={};\n"); return path;
  };
  add("pg", { "pg-helper": "1.0.0" }); add("pg-helper");
  add("ioredis", { "@ioredis/commands": "1.0.0" }); add("@ioredis/commands");
  add("protobufjs", { "@protobufjs/base64": "1.0.0" }, { "absent-optional": "1.0.0" }); add("@protobufjs/base64");
  try { callback({ directory, modules, target, add }); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("dependency closure includes scoped pure-JS packages and never unrelated workspace modules", () => {
  dependencyFixture(({ modules, target, add }) => {
    add("react"); add("other-private");
    assert.deepEqual(copyIngestDependencies(modules, target), ["@ioredis/commands", "@protobufjs/base64", "ioredis", "pg", "pg-helper", "protobufjs"]);
    assert.equal(JSON.parse(readFileSync(join(target, "@ioredis/commands/package.json"))).name, "@ioredis/commands");
    assert.ok(!existsSync(join(target, "react"))); assert.ok(!existsSync(join(target, "other-private")));
    assert.throws(() => copyIngestDependencies(modules, target), /already exists/);
  });
});

test("closure rejects symlinks, native payloads and configuration files before creating output", () => {
  for (const unsafe of ["native.node", "private.pem", "private.key", ".env", ".npmrc", "symlink"]) {
    dependencyFixture(({ modules, target }) => {
      const path = join(modules, "pg", unsafe);
      if (unsafe === "symlink") symlinkSync("index.js", path); else writeFileSync(path, "unsafe fixture");
      assert.throws(() => copyIngestDependencies(modules, target), /Non-JS or configuration/);
      assert.ok(!existsSync(target));
    });
  }
});

test("closure refuses dependency escape and conflicting nested versions", () => {
  dependencyFixture(({ modules, target, directory }) => {
    const outside = join(directory, "external-package"); mkdirSync(outside);
    writeFileSync(join(outside, "package.json"), JSON.stringify({ name: "pg-helper", main: "index.js" })); writeFileSync(join(outside, "index.js"), "module.exports={};");
    rmSync(join(modules, "pg-helper"), { recursive: true }); symlinkSync(outside, join(modules, "pg-helper"));
    assert.throws(() => copyIngestDependencies(modules, target), /escaped/); assert.ok(!existsSync(target));
  });
  dependencyFixture(({ modules, target, add }) => {
    add("ioredis", { "pg-helper": "1.0.0" });
    add("pg-helper", {}, {}, join(modules, "ioredis/node_modules"));
    assert.throws(() => copyIngestDependencies(modules, target), /Multiple dependency versions/); assert.ok(!existsSync(target));
  });
});
