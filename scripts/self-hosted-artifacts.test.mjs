import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applicationOutputs, assertNoProDependencies, auditOutputs, dependencyOutputs, nativeBinary, publicOrigins, sourceManifest, stageArtifacts, verifyArtifacts } from "./self-hosted-artifacts.mjs";

const origins = { APP_PUBLIC_URL: "https://ops.example.net", STATUS_PUBLIC_URL: "https://status.ops.example.net", SHARE_PUBLIC_URL: "https://share.ops.example.net", EDGE_PUBLIC_URL: "wss://edge.ops.example.net", INGEST_PUBLIC_URL: "https://ingest.ops.example.net" };
const entrypoints = { web: "server/index.mjs", tunnel: "server.js", "internal-check": "index.js", ingest: "server.js", cron: "index.js", status: "server/entry.mjs", "secrets-share": "server/entry.mjs", "uptime-probe": "index.js" };

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "outray-artifact-test-")), source = join(directory, "source");
  mkdirSync(source);
  const put = (path, contents) => { mkdirSync(join(source, path, ".."), { recursive: true }); writeFileSync(join(source, path), contents); };
  for (const name of ["package.json", "package-lock.json", "turbo.json"]) put(name, "{}\n");
  put(".npmrc", "registry=https://registry.npmjs.org/\n");
  put("shared/policy.mjs", "export const mode = 'self-hosted';\n");
  put("scripts/self-hosted-share-role.mjs", "// committed bootstrap source\n");
  put("packages/icons/prepare.mjs", "// source\n");
  put("packages/icons/generated/mode.json", '{"mode":"free"}\n');
  for (const [name, path] of Object.entries(applicationOutputs)) put(`${path}/${entrypoints[name]}`, "// runtime JavaScript\n");
  for (const path of Object.values(dependencyOutputs)) put(`${path}/index.js`, "// dependency JavaScript\n");
  put("apps/web/.output/public/origins.js", JSON.stringify(origins));
  put("apps/web/.output/server/node_modules/example/index.js", "module.exports = {};\n");
  return { directory, source, put, stage: join(directory, "staged") };
}

test("native artifact detection covers ELF, Mach-O/fat and Windows binaries", () => {
  for (const value of ["7f454c46", "feedface", "cefaedfe", "feedfacf", "cffaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca", "4d5a0000"]) assert.equal(nativeBinary(Buffer.from(value, "hex")), true, value);
  assert.equal(nativeBinary(Buffer.from("export default {};")), false);
  assert.equal(nativeBinary(Buffer.from("89504e47", "hex")), false, "static PNG assets are allowed");
});

test("staging preserves exact internal Nitro symlinks and binds sources, free mode and origins", () => {
  const task = fixture();
  try {
    symlinkSync("example", join(task.source, "apps/web/.output/server/node_modules/linked-example"));
    const manifest = stageArtifacts(task.source, task.stage, origins);
    assert.equal(manifest.iconMode, "free");
    assert.equal(Object.keys(manifest.applicationOutputs).length, 8);
    assert.deepEqual(verifyArtifacts(task.source, task.stage, origins), manifest);
    assert.throws(() => stageArtifacts(task.source, task.stage, origins), /refusing to overwrite/);
    assert.throws(() => verifyArtifacts(task.source, task.stage, { ...origins, APP_PUBLIC_URL: "https://other.example.net" }), /origins/);
    task.put("shared/policy.mjs", "// changed build source\n");
    assert.throws(() => verifyArtifacts(task.source, task.stage, origins), /source digest/);
  } finally { rmSync(task.directory, { recursive: true, force: true }); }
});

test("artifact audit rejects native extensions/magic, Pro imports, workspace deps and escaping symlinks", () => {
  for (const [path, content] of [["apps/tunnel/dist/native.node", "text"], ["apps/tunnel/dist/unknown", Buffer.from("7f454c46", "hex")], ["apps/web/.output/server/pro.mjs", "import '@hugeicons-pro/core-solid-rounded';"], ["apps/cron/dist/node_modules/host-package/index.js", "// copied host dependency"]]) {
    const task = fixture();
    try { task.put(path, content); assert.throws(() => auditOutputs(task.source), /Artifacts|artifacts|node_modules/); }
    finally { rmSync(task.directory, { recursive: true, force: true }); }
  }
  const task = fixture();
  try {
    symlinkSync(task.source, join(task.source, "apps/web/.output/server/node_modules/escape"));
    assert.throws(() => auditOutputs(task.source), /symlinks/);
  } finally { rmSync(task.directory, { recursive: true, force: true }); }
});

test("source fingerprint skips env files, generated outputs, docs and tests but catches code changes", () => {
  const task = fixture();
  try {
    const first = sourceManifest(task.source);
    task.put("apps/web/.env.prod", "DO_NOT_READ=private\n");
    task.put("apps/web/README.md", "documentation changed\n");
    task.put("apps/web/test/example.test.ts", "// test-only change\n");
    task.put("packages/icons/generated/mode.json", '{"mode":"pro"}\n');
    assert.deepEqual(sourceManifest(task.source), first);
    assert.throws(() => stageArtifacts(task.source, task.stage, origins), /free-mode/);
    task.put("shared/policy.mjs", "// changed\n");
    assert.notEqual(sourceManifest(task.source).sha256, first.sha256);
  } finally { rmSync(task.directory, { recursive: true, force: true }); }
});

test("tampered artifact contents and absent client origins fail verification", () => {
  const task = fixture();
  try {
    stageArtifacts(task.source, task.stage, origins);
    writeFileSync(join(task.stage, "apps/tunnel/dist/server.js"), "// changed artifact\n");
    assert.throws(() => verifyArtifacts(task.source, task.stage, origins), /changed after staging/);
    task.put("apps/web/.output/public/origins.js", "// no origins\n");
    assert.throws(() => stageArtifacts(task.source, join(task.directory, "another-stage"), origins), /origin is absent/);
    task.put("node_modules/@hugeicons-pro/core-solid-rounded/package.json", "{}\n");
    assert.throws(() => assertNoProDependencies(task.source), /Pro packs/);
  } finally { rmSync(task.directory, { recursive: true, force: true }); }
});

test("prebuilt Docker path is separate, free-only, target-platform and non-root", () => {
  const dockerfile = readFileSync(new URL("../deploy/self-hosted/Dockerfile.prebuilt", import.meta.url), "utf8");
  assert.match(dockerfile, /npm ci --ignore-scripts/);
  assert.match(dockerfile, /assert-free-deps/);
  assert.match(dockerfile, /OUTRAY_ICON_MODE=free node packages\/icons\/prepare.mjs/);
  assert.match(dockerfile, /USER node/);
  assert.doesNotMatch(dockerfile, /mount=type=secret|npm run build|ARG.*LICENSE/);
  const normalIgnore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");
  assert.match(normalIgnore, /^\.self-hosted-artifacts$/m);
  const prebuiltIgnore = readFileSync(new URL("../deploy/self-hosted/Dockerfile.prebuilt.dockerignore", import.meta.url), "utf8");
  assert.match(prebuiltIgnore, /^!\.self-hosted-artifacts\/\*\*$/m);
  assert.ok(prebuiltIgnore.indexOf("**/.env*") > prebuiltIgnore.indexOf("!.self-hosted-artifacts/**"));
  assert.throws(() => publicOrigins({ ...origins, APP_PUBLIC_URL: "https://user:password@ops.example.net" }), /credentials/);
});
