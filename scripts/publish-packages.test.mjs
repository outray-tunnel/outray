import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  PUBLIC_PACKAGES,
  createReleasePlan,
  orderPackages,
  parseArguments,
  runPublish,
  safeEnvironment,
  validateArchive,
} from "./publish-packages.mjs";

const directories = new Map(PUBLIC_PACKAGES.map(({ name, directory }) => [name, directory]));

function workspace(name, extra = {}) {
  return {
    directory: directories.get(name) ?? `apps/${name}`,
    manifest: {
      name,
      version: name === "outray" ? "0.1.14" : "0.0.6",
      scripts: { build: "fixture-build", test: "fixture-test" },
      files: ["dist"],
      ...extra,
    },
  };
}

function published(workspaces) {
  return new Map(workspaces.filter(({ manifest }) => !manifest.private).map(({ manifest }) => [
    manifest.name,
    { versions: [manifest.version], distTags: { latest: manifest.version } },
  ]));
}

function releaseFor(plan, name) {
  return plan.releases.find((release) => release.name === name);
}

function updateFor(plan, name) {
  return plan.updates.find(({ manifest }) => manifest.name === name);
}

test("the release allowlist contains only the eight SDKs and the CLI", () => {
  assert.deepEqual(PUBLIC_PACKAGES.map(({ name }) => name).sort(), [
    "@outray/core",
    "@outray/express",
    "@outray/hono",
    "@outray/nest",
    "@outray/next",
    "@outray/observability",
    "@outray/tanstack-start",
    "@outray/vite",
    "outray",
  ].sort());
  assert.equal(directories.size, PUBLIC_PACKAGES.length);
  assert.ok(PUBLIC_PACKAGES.every(({ directory }) => /^(packages|apps)\/[a-z-]+$/.test(directory)));
});

test("argument parsing keeps the default npm tag stable and plan mode non-publishing", () => {
  const args = parseArguments(["--all", "--plan"]);
  assert.equal(args.plan, true);
  assert.equal(args.dryRun, true);
  assert.equal(args.allowDirty, false);
  assert.equal(args.tag, "latest");
  assert.deepEqual(args.packages, []);
  assert.equal(parseArguments([]).help, true);
});

test("argument parsing supports explicit packages and a dry run without accepting token arguments", () => {
  const args = parseArguments(["--package", "@outray/core", "--package", "@outray/hono", "--dry-run", "--allow-dirty", "--tag", "next"]);
  assert.deepEqual(args.packages, ["@outray/core", "@outray/hono"]);
  assert.equal(args.dryRun, true);
  assert.equal(args.allowDirty, true);
  assert.equal(args.tag, "next");
  assert.throws(() => parseArguments(["--token", "not-a-real-token"]));
});

test("invalid and incomplete CLI options fail before invoking npm", () => {
  for (const args of [["--unknown"], ["--package"], ["--tag"], ["--tag", "-bad"], ["--tag", "bad tag"]]) {
    assert.throws(() => parseArguments(args), `reject ${JSON.stringify(args)}`);
  }
  assert.equal(parseArguments(["--help"]).help, true);
  assert.throws(() => parseArguments(["--all", "@outray/core"]));
  assert.throws(() => parseArguments(["outray-web"]));
  assert.throws(() => parseArguments(["../../packages/core"]));
  assert.deepEqual(parseArguments(["@outray/hono"]).packages, ["@outray/hono"]);
  assert.equal(parseArguments(["--tag=next", "--all"]).tag, "next");
});

test("ordering is deterministic and puts shared runtime dependencies before adapters", () => {
  const core = workspace("@outray/core");
  const observability = workspace("@outray/observability", { dependencies: { "@outray/core": "^0.0.6" } });
  const hono = workspace("@outray/hono", { dependencies: { "@outray/observability": "^0.0.6" } });
  const vite = workspace("@outray/vite", { dependencies: { "@outray/core": "^0.0.6" } });
  const names = (items) => orderPackages(items).map(({ manifest }) => manifest.name);
  const ordered = names([hono, vite, observability, core]);
  assert.deepEqual(ordered, names([core, observability, vite, hono]));
  assert.ok(ordered.indexOf(core.manifest.name) < ordered.indexOf(observability.manifest.name));
  assert.ok(ordered.indexOf(observability.manifest.name) < ordered.indexOf(hono.manifest.name));
  assert.ok(ordered.indexOf(core.manifest.name) < ordered.indexOf(vite.manifest.name));
});

test("ordering detects dependency cycles rather than publishing partial graphs", () => {
  const core = workspace("@outray/core", { dependencies: { "@outray/observability": "^0.0.6" } });
  const observability = workspace("@outray/observability", { dependencies: { "@outray/core": "^0.0.6" } });
  assert.throws(() => orderPackages([core, observability]), /cycl/i);
});

test("unchanged packages with already-published versions are skipped", () => {
  const workspaces = [workspace("@outray/core"), workspace("@outray/hono")];
  const plan = createReleasePlan(workspaces, workspaces.map(({ manifest }) => manifest.name), published(workspaces), new Map());
  assert.deepEqual(plan.releases, []);
  assert.deepEqual(plan.updates, []);
});

test("changed published packages receive a patch bump", () => {
  const core = workspace("@outray/core");
  const plan = createReleasePlan([core], [core.manifest.name], published([core]), new Map([[core.manifest.name, ["dist/index.mjs"]]]));
  const release = releaseFor(plan, core.manifest.name);
  assert.equal(release.fromVersion, "0.0.6");
  assert.equal(release.version, "0.0.7");
  assert.equal(release.manifest.version, "0.0.7");
  assert.equal(release.directory, core.directory);
  assert.ok(release.reason);
});

test("core-only changes leave unchanged public consumers and their dependency ranges untouched", () => {
  const core = workspace("@outray/core");
  const observability = workspace("@outray/observability", { dependencies: { "@outray/core": "^0.0.6" } });
  const hono = workspace("@outray/hono", {
    dependencies: { "@outray/core": "^0.0.6", "@outray/observability": "^0.0.6" },
  });
  const cli = workspace("outray", { dependencies: { "@outray/core": "^0.0.6" } });
  const workspaces = [hono, cli, core, observability];
  for (const selected of [[core.manifest.name], workspaces.map(({ manifest }) => manifest.name)]) {
    const plan = createReleasePlan(workspaces, selected, published(workspaces), new Map([[core.manifest.name, ["dist/index.mjs"]]]));
    assert.deepEqual(plan.releases.map(({ name }) => name), [core.manifest.name]);
    for (const name of [observability.manifest.name, hono.manifest.name, cli.manifest.name]) {
      assert.equal(releaseFor(plan, name), undefined);
      assert.equal(updateFor(plan, name), undefined);
    }
    assert.equal(cli.manifest.version, "0.1.14");
    assert.equal(cli.manifest.dependencies[core.manifest.name], "^0.0.6");
  }
});

test("changed adapters align shared dependency minima while unchanged CLI stays skipped", () => {
  const core = workspace("@outray/core");
  const hono = workspace("@outray/hono", { dependencies: { "@outray/core": "^0.0.6" } });
  const cli = workspace("outray", { dependencies: { "@outray/core": "^0.0.6" } });
  const workspaces = [cli, hono, core];
  const changed = new Map([[core.manifest.name, ["dist/index.mjs"]], [hono.manifest.name, ["dist/index.mjs"]]]);
  for (const selected of [[core.manifest.name, hono.manifest.name], workspaces.map(({ manifest }) => manifest.name)]) {
    const plan = createReleasePlan(workspaces, selected, published(workspaces), changed);
    assert.deepEqual(plan.releases.map(({ name }) => name), [core.manifest.name, hono.manifest.name]);
    assert.equal(releaseFor(plan, hono.manifest.name).version, "0.0.7");
    assert.equal(releaseFor(plan, hono.manifest.name).manifest.dependencies[core.manifest.name], "^0.0.7");
    assert.equal(releaseFor(plan, cli.manifest.name), undefined);
    assert.equal(updateFor(plan, cli.manifest.name), undefined);
  }
  const targeted = createReleasePlan(workspaces, [core.manifest.name], published(workspaces), changed);
  assert.deepEqual(targeted.releases.map(({ name }) => name), [core.manifest.name], "outside-target changes do not expand the public release scope");
});

test("unchanged optional, peer, and development consumers are not bumped by core changes", () => {
  const core = workspace("@outray/core");
  const next = workspace("@outray/next", { optionalDependencies: { "@outray/core": "^0.0.6" } });
  const hono = workspace("@outray/hono", { peerDependencies: { "@outray/core": "^0.0.6" } });
  const vite = workspace("@outray/vite", { devDependencies: { "@outray/core": "^0.0.6" } });
  const workspaces = [next, hono, vite, core];
  const plan = createReleasePlan(workspaces, workspaces.map(({ manifest }) => manifest.name), published(workspaces), new Map([[core.manifest.name, ["dist/index.js"]]]));
  assert.deepEqual(plan.releases.map(({ name }) => name), [core.manifest.name]);
  for (const item of [next, hono, vite]) assert.equal(updateFor(plan, item.manifest.name), undefined);
});

test("changed optional and peer consumers align the shared dependency minima", () => {
  const core = workspace("@outray/core");
  const next = workspace("@outray/next", { optionalDependencies: { "@outray/core": "^0.0.6" } });
  const hono = workspace("@outray/hono", { peerDependencies: { "@outray/core": "^0.0.6" } });
  const workspaces = [next, hono, core];
  const changed = new Map(workspaces.map(({ manifest }) => [manifest.name, ["dist/index.js"]]));
  const plan = createReleasePlan(workspaces, workspaces.map(({ manifest }) => manifest.name), published(workspaces), changed);
  assert.equal(releaseFor(plan, next.manifest.name).manifest.optionalDependencies[core.manifest.name], "^0.0.7");
  assert.equal(releaseFor(plan, hono.manifest.name).manifest.peerDependencies[core.manifest.name], "^0.0.7");
});

test("an intentional dependency-only manifest change counts as a consumer's own change", () => {
  const core = workspace("@outray/core");
  const hono = workspace("@outray/hono", { dependencies: { "@outray/core": "^0.0.7" } });
  const cli = workspace("outray", { dependencies: { "@outray/core": "^0.0.6" } });
  const workspaces = [core, hono, cli];
  const changed = new Map([[core.manifest.name, ["dist/index.js"]], [hono.manifest.name, ["package.json"]]]);
  const plan = createReleasePlan(workspaces, workspaces.map(({ manifest }) => manifest.name), published(workspaces), changed);
  assert.deepEqual(plan.releases.map(({ name }) => name), [core.manifest.name, hono.manifest.name]);
  assert.equal(releaseFor(plan, hono.manifest.name).manifest.dependencies[core.manifest.name], "^0.0.7");
  assert.equal(updateFor(plan, cli.manifest.name), undefined);
});

test("private application dependency pins are updated without publishing or bumping the application", () => {
  const vite = workspace("@outray/vite");
  const web = workspace("outray-web", {
    private: true,
    version: "1.0.0",
    devDependencies: { "@outray/vite": "0.0.6" },
  });
  const plan = createReleasePlan([web, vite], [vite.manifest.name], published([web, vite]), new Map([[vite.manifest.name, ["dist/index.mjs"]]]));
  assert.deepEqual(plan.releases.map(({ name }) => name), [vite.manifest.name]);
  assert.equal(updateFor(plan, web.manifest.name).manifest.version, "1.0.0");
  assert.equal(updateFor(plan, web.manifest.name).manifest.devDependencies[vite.manifest.name], "0.0.7");
});

test("private file, link, and workspace dependencies remain local references", () => {
  const core = workspace("@outray/core");
  for (const reference of ["file:../../packages/core", "link:../../packages/core", "workspace:*"]) {
    const web = workspace("outray-web", { private: true, dependencies: { "@outray/core": reference } });
    const plan = createReleasePlan([core, web], [core.manifest.name], published([core, web]), new Map([[core.manifest.name, ["dist/index.js"]]]));
    const updated = updateFor(plan, web.manifest.name)?.manifest ?? web.manifest;
    assert.equal(updated.dependencies[core.manifest.name], reference);
    assert.ok(!releaseFor(plan, web.manifest.name));
  }
});

test("an unpublished pending version is reused instead of bumped again", () => {
  const core = workspace("@outray/core", { version: "0.0.7" });
  const registry = new Map([[core.manifest.name, { versions: ["0.0.6"], distTags: { latest: "0.0.6" } }]]);
  const plan = createReleasePlan([core], [core.manifest.name], registry, new Map([[core.manifest.name, ["dist/index.mjs"]]]));
  assert.equal(releaseFor(plan, core.manifest.name).version, "0.0.7");
});

test("pending adapter retries align its dependency without re-bumping an unchanged published CLI", () => {
  const core = workspace("@outray/core", { version: "0.0.7" });
  const hono = workspace("@outray/hono", { version: "0.0.7", dependencies: { "@outray/core": "^0.0.6" } });
  const cli = workspace("outray", { dependencies: { "@outray/core": "^0.0.6" } });
  const workspaces = [core, hono, cli];
  const registry = published(workspaces);
  registry.set(hono.manifest.name, { versions: ["0.0.6"], distTags: { latest: "0.0.6" } });
  const plan = createReleasePlan(workspaces, workspaces.map(({ manifest }) => manifest.name), registry, new Map());
  assert.deepEqual(plan.releases.map(({ name }) => name), [hono.manifest.name]);
  assert.equal(releaseFor(plan, hono.manifest.name).version, "0.0.7");
  assert.equal(releaseFor(plan, hono.manifest.name).manifest.dependencies[core.manifest.name], "^0.0.7");
  assert.equal(updateFor(plan, cli.manifest.name), undefined);
});

test("a reused pending dependency version still aligns private consumers without bumping public ones", () => {
  const core = workspace("@outray/core", { version: "0.0.7" });
  const web = workspace("outray-web", { private: true, dependencies: { "@outray/core": "^0.0.6" } });
  const cli = workspace("outray", { dependencies: { "@outray/core": "^0.0.6" } });
  const workspaces = [core, web, cli];
  const registry = published(workspaces);
  registry.set(core.manifest.name, { versions: ["0.0.6"], distTags: { latest: "0.0.6" } });
  const plan = createReleasePlan(workspaces, [core.manifest.name, cli.manifest.name], registry, new Map());
  assert.deepEqual(plan.releases.map(({ name }) => name), [core.manifest.name]);
  assert.equal(releaseFor(plan, core.manifest.name).version, "0.0.7");
  assert.equal(updateFor(plan, web.manifest.name).manifest.dependencies[core.manifest.name], "^0.0.7");
  assert.equal(updateFor(plan, web.manifest.name).manifest.version, web.manifest.version);
  assert.equal(updateFor(plan, cli.manifest.name), undefined);
});

test("a new package can publish its existing initial version", () => {
  const core = workspace("@outray/core");
  const plan = createReleasePlan([core], [core.manifest.name], new Map(), new Map());
  assert.equal(releaseFor(plan, core.manifest.name).version, "0.0.6");
});

test("a stale local version cannot move the stable release backwards", () => {
  const core = workspace("@outray/core", { version: "0.0.5" });
  const registry = new Map([[core.manifest.name, { versions: ["0.0.5", "0.0.6", "0.0.7"], distTags: { latest: "0.0.7" } }]]);
  const plan = createReleasePlan([core], [core.manifest.name], registry, new Map([[core.manifest.name, ["dist/index.mjs"]]]));
  assert.equal(releaseFor(plan, core.manifest.name).version, "0.0.8");
});

test("a missing stale version is bumped above the registry instead of reusing an old number", () => {
  const core = workspace("@outray/core", { version: "0.0.5" });
  const registry = new Map([[core.manifest.name, { versions: ["0.0.6", "0.0.7"], distTags: { latest: "0.0.7" } }]]);
  const plan = createReleasePlan([core], [core.manifest.name], registry, new Map());
  assert.equal(releaseFor(plan, core.manifest.name).version, "0.0.8");
});

test("prerelease versions cannot accidentally be published under latest", () => {
  const core = workspace("@outray/core", { version: "0.0.7-beta.1" });
  const registry = new Map([[core.manifest.name, { versions: ["0.0.6"], distTags: { latest: "0.0.6" } }]]);
  assert.throws(() => createReleasePlan([core], [core.manifest.name], registry, new Map(), { tag: "latest" }), /prerelease|stable|latest/i);
});

test("an explicitly selected prerelease tag increments an already published prerelease", () => {
  const core = workspace("@outray/core", { version: "0.0.7-beta.1" });
  const registry = new Map([[core.manifest.name, {
    versions: ["0.0.6", "0.0.7-beta.1"],
    distTags: { latest: "0.0.6", beta: "0.0.7-beta.1" },
  }]]);
  const plan = createReleasePlan([core], [core.manifest.name], registry, new Map([[core.manifest.name, ["dist/index.mjs"]]]), { tag: "beta" });
  assert.equal(releaseFor(plan, core.manifest.name).version, "0.0.7-beta.2");
});

test("prerelease bumps advance above the newest published version on the same track", () => {
  const core = workspace("@outray/core", { version: "0.0.7-beta.1" });
  const registry = new Map([[core.manifest.name, {
    versions: ["0.0.6", "0.0.7-beta.1", "0.0.7-beta.5", "0.0.7-alpha.10"],
    distTags: { latest: "0.0.6", beta: "0.0.7-beta.5" },
  }]]);
  const plan = createReleasePlan([core], [core.manifest.name], registry, new Map([[core.manifest.name, ["dist/index.mjs"]]]), { tag: "beta" });
  assert.equal(releaseFor(plan, core.manifest.name).version, "0.0.7-beta.6");
});

test("private, unknown, and unsafe package selections are rejected", () => {
  const core = workspace("@outray/core");
  const privateWeb = workspace("outray-web", { private: true });
  const privateCore = workspace("@outray/core", { private: true });
  for (const name of ["outray-web", "unlisted-package", "../packages/core", "@outray/core;echo unsafe"]) {
    assert.throws(() => createReleasePlan([core, privateWeb], [name], published([core]), new Map()), `reject ${name}`);
  }
  assert.throws(() => createReleasePlan([privateCore], [privateCore.manifest.name], new Map(), new Map()));
});

test("release planning never mutates source manifests, registry entries, or changed-file inputs", () => {
  const core = workspace("@outray/core");
  const hono = workspace("@outray/hono", { dependencies: { "@outray/core": "^0.0.6" } });
  const web = workspace("outray-web", { private: true, dependencies: { "@outray/hono": "0.0.6" } });
  const workspaces = [hono, web, core];
  const registry = published(workspaces);
  const changed = new Map([[core.manifest.name, ["dist/index.mjs"]], [hono.manifest.name, ["dist/index.mjs"]]]);
  const before = JSON.stringify({ workspaces, registry: [...registry], changed: [...changed] });
  const first = createReleasePlan(workspaces, [core.manifest.name, hono.manifest.name], registry, changed);
  const second = createReleasePlan(workspaces, [core.manifest.name, hono.manifest.name], registry, changed);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ workspaces, registry: [...registry], changed: [...changed] }), before);
  assert.notEqual(releaseFor(first, core.manifest.name).manifest, core.manifest);
  assert.notEqual(releaseFor(first, hono.manifest.name).manifest.dependencies, hono.manifest.dependencies);
});

test("child process environments remove npm credential and user-configuration overrides", () => {
  assert.deepEqual(safeEnvironment({
    PATH: "/fixture/bin",
    NPMJS_TOKEN: "fake-sensitive-token",
    NPM_TOKEN: "other-fake-token",
    NODE_AUTH_TOKEN: "third-fake-token",
    npm_config_userconfig: "/fixture/unsafe.npmrc",
    NPM_CONFIG_REGISTRY: "https://not-npm.example",
    SAFE_SETTING: "preserved",
  }), { PATH: "/fixture/bin", SAFE_SETTING: "preserved" });
});

test("archive validation rejects sensitive files, path traversal, and missing built entry points", () => {
  const core = workspace("@outray/core", { main: "dist/index.js" });
  const archive = {
    name: core.manifest.name,
    version: core.manifest.version,
    filename: "outray-core-0.0.6.tgz",
    integrity: "sha512-Zml4dHVyZQ==",
    files: [{ path: "package.json" }, { path: "dist/index.js" }],
  };
  assert.equal(validateArchive(core, archive), archive);
  for (const path of [".env", ".env.production", "nested/.npmrc", "certs/private.key", "../outside", "/absolute"]) {
    assert.throws(() => validateArchive(core, { ...archive, files: [...archive.files, { path }] }), `reject ${path}`);
  }
  assert.throws(() => validateArchive(core, { ...archive, files: [{ path: "package.json" }] }));
  assert.throws(() => validateArchive(core, { ...archive, filename: "../outside.tgz" }));
});

async function releaseFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "outray-publish-test-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const workspaces = PUBLIC_PACKAGES.map(({ name }) => workspace(name, {
    main: "dist/index.js",
    ...(name === "@outray/core" ? {} : { dependencies: { "@outray/core": "^0.0.6" } }),
  }));
  workspaces.push(workspace("outray-web", {
    private: true,
    version: "1.0.0",
    devDependencies: { "@outray/vite": "0.0.6" },
  }));
  const snapshots = new Map();
  const rootManifestPath = join(root, "package.json");
  const rootManifest = `${JSON.stringify({ name: "fixture", private: true, workspaces: ["apps/*", "packages/*"] }, null, 2)}\n`;
  await writeFile(rootManifestPath, rootManifest);
  snapshots.set(rootManifestPath, rootManifest);
  for (const item of workspaces) {
    const path = join(root, item.directory, "package.json");
    const content = `${JSON.stringify(item.manifest, null, 2)}\n`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    snapshots.set(path, content);
  }
  const lockPath = join(root, "package-lock.json");
  const lock = `${JSON.stringify({ name: "fixture", lockfileVersion: 3, packages: {} })}\n`;
  await writeFile(lockPath, lock);
  snapshots.set(lockPath, lock);
  return { root, workspaces, snapshots, lockPath };
}

async function assertFixtureUnchanged(fixture) {
  for (const [path, bytes] of fixture.snapshots) assert.equal(await readFile(path, "utf8"), bytes, path);
}

test("package publishConfig cannot override the registry, tag, auth config or lifecycle safety", async (t) => {
  const fixture = await releaseFixture(t);
  const path = join(fixture.root, "packages/core/package.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  for (const publishConfig of [
    { registry: "https://wrong.example/" }, { access: "restricted" }, { tag: "latest" },
    { userconfig: "/fixture/private.npmrc" }, { "ignore-scripts": false }, { dryRun: true },
  ]) {
    await writeFile(path, JSON.stringify({ ...manifest, publishConfig }));
    let calls = 0;
    await assert.rejects(runPublish(parseArguments(["--all", "--dry-run"]), {
      root: fixture.root, environment: {}, runCommand() { calls++; assert.fail("npm must not run"); }, log() {},
    }), /publishConfig/);
    assert.equal(calls, 0);
  }
});

function fakeNpm(fixture, { changedNames = ["@outray/core"], intercept } = {}) {
  const calls = [];
  const registry = published(fixture.workspaces);
  const byName = new Map(fixture.workspaces.map((item) => [item.manifest.name, item]));
  const archives = new Map();
  const success = (stdout = "") => ({ code: 0, stdout, stderr: "" });
  const runCommand = async (command, args, options) => {
    const call = { command, args, ...options };
    calls.push(call);
    const overridden = await intercept?.(call, calls);
    if (overridden !== undefined) return overridden;
    if (command === "git" && args[0] === "status") return success();
    assert.equal(command, "npm", "only simulated npm commands can execute");
    if (args[0] === "view") {
      const information = registry.get(args[1]);
      if (!information) return { code: 1, stdout: JSON.stringify({ error: { code: "E404" } }), stderr: "fixture package missing" };
      return success(JSON.stringify({ versions: information.versions, "dist-tags": information.distTags }));
    }
    if (args[0] === "run" || args[0] === "test") return success();
    if (args[0] === "whoami") return success("fixture-user\n");
    if (args[0] === "install") {
      await writeFile(fixture.lockPath, `${JSON.stringify({ name: "fixture", lockfileVersion: 3, updatedByFixture: true })}\n`);
      return success();
    }
    if (args[0] === "pack") {
      const name = args.find((argument) => argument.startsWith("--workspace=")).slice("--workspace=".length);
      const destination = args.find((argument) => argument.startsWith("--pack-destination=")).slice("--pack-destination=".length);
      const manifest = JSON.parse(await readFile(join(fixture.root, byName.get(name).directory, "package.json"), "utf8"));
      const filename = `${name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`;
      const bytes = Buffer.from(JSON.stringify({ fixture: true, manifest }));
      const archive = {
        name, version: manifest.version, filename,
        integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
        files: [{ path: "package.json" }, { path: "dist/index.js" }],
      };
      const path = join(destination, filename);
      await writeFile(path, bytes);
      archives.set(path, archive);
      return success(JSON.stringify([archive]));
    }
    if (args[0] === "diff") {
      const specification = args.find((argument) => argument.startsWith("--diff=")).slice("--diff=".length);
      const name = specification.slice(0, specification.lastIndexOf("@"));
      return success(changedNames.includes(name) ? "dist/index.js\n" : "");
    }
    if (args[0] === "publish") {
      const archive = archives.get(args[1]);
      assert.ok(archive, "publish uses an artifact produced by this fake pack");
      const information = registry.get(archive.name);
      information.versions.push(archive.version);
      information.distTags[args.find((argument) => argument.startsWith("--tag=")).slice("--tag=".length)] = archive.version;
      return success(`${archive.name}@${archive.version}\n`);
    }
    assert.fail(`Unexpected fake command: ${command} ${args.join(" ")}`);
  };
  return { calls, runCommand, registry };
}

test("offline plan never executes commands, requires credentials, or writes release files", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture);
  const result = await runPublish(parseArguments(["--all", "--plan"]), {
    root: fixture.root, environment: {}, runCommand: fake.runCommand, log() {},
  });
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.releases, []);
  assert.equal(fake.calls.length, 0);
  assert.equal(result.selected.length, PUBLIC_PACKAGES.length);
  await assertFixtureUnchanged(fixture);
});

test("dry run builds and tests dependency-first but never changes versions, authenticates, or uploads", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture);
  const logs = [];
  const result = await runPublish(parseArguments(["--all", "--dry-run"]), {
    root: fixture.root,
    environment: { PATH: "/fixture/bin", NPMJS_TOKEN: "fake-dry-run-secret", npm_config_registry: "https://wrong.example" },
    runCommand: fake.runCommand, log: (message) => logs.push(message),
  });
  assert.deepEqual(result.releases.map(({ name }) => name), ["@outray/core"]);
  const builds = fake.calls.filter(({ command, args }) => command === "npm" && args[0] === "run" && args[1] === "build");
  assert.equal(builds.length, PUBLIC_PACKAGES.length);
  assert.equal(builds[0].args[2], "--workspace=@outray/core");
  assert.equal(fake.calls.filter(({ args }) => args[0] === "test").length, PUBLIC_PACKAGES.length);
  assert.ok(fake.calls.every(({ args }) => !["whoami", "publish", "install"].includes(args[0])));
  assert.ok(fake.calls.every(({ env }) => env.NPMJS_TOKEN === undefined));
  assert.ok(fake.calls.every(({ env }) => env.npm_config_registry === undefined));
  assert.ok(fake.calls.every(({ env }) => env.NPM_CONFIG_USERCONFIG !== env.NPM_CONFIG_GLOBALCONFIG));
  assert.ok(logs.every((message) => !message.includes("fake-dry-run-secret")));
  await assertFixtureUnchanged(fixture);
  const temporary = dirname(fake.calls[0].env.NPM_CONFIG_USERCONFIG);
  await assert.rejects(stat(temporary), { code: "ENOENT" });
});

test("live publishing rejects missing or malformed NPMJS_TOKEN before any command or mutation", async (t) => {
  const fixture = await releaseFixture(t);
  for (const token of [undefined, "", "invalid\ninternal-line", "bad\0token"]) {
    const fake = fakeNpm(fixture);
    await assert.rejects(runPublish(parseArguments(["--all"]), {
      root: fixture.root, environment: { NPMJS_TOKEN: token }, runCommand: fake.runCommand, log() {},
    }), /NPMJS_TOKEN/);
    assert.equal(fake.calls.length, 0);
    await assertFixtureUnchanged(fixture);
  }
});

test("live publication isolates authentication and removes temporary configs afterward", async (t) => {
  const fixture = await releaseFixture(t);
  const token = "fake-integration-publish-token";
  const configPaths = [];
  const fake = fakeNpm(fixture, { changedNames: PUBLIC_PACKAGES.map(({ name }) => name), intercept: async (call) => {
    if (call.command === "npm" && ["whoami", "publish"].includes(call.args[0])) {
      assert.equal(call.env.NPMJS_TOKEN, token);
      assert.ok(call.args.every((argument) => !argument.includes(token)));
      const config = await readFile(call.env.NPM_CONFIG_USERCONFIG, "utf8");
      assert.ok(config.includes("${NPMJS_TOKEN}"));
      assert.ok(!config.includes(token));
      assert.equal((await stat(call.env.NPM_CONFIG_USERCONFIG)).mode & 0o777, 0o600);
      configPaths.push(call.env.NPM_CONFIG_USERCONFIG);
    } else assert.equal(call.env.NPMJS_TOKEN, undefined, "other subprocesses never inherit the publishing credential");
  } });
  const logs = [];
  const result = await runPublish(parseArguments(["--all"]), {
    root: fixture.root,
    environment: { NPMJS_TOKEN: token, NPM_TOKEN: "fake-other-token", NODE_AUTH_TOKEN: "fake-third-token" },
    runCommand: fake.runCommand, log: (message) => logs.push(message),
  });
  assert.equal(result.published.length, PUBLIC_PACKAGES.length);
  assert.equal(fake.calls.filter(({ args }) => args[0] === "publish").length, PUBLIC_PACKAGES.length);
  assert.equal(fake.calls.filter(({ args }) => args[0] === "whoami").length, 1);
  assert.equal(JSON.parse(await readFile(join(fixture.root, "packages/core/package.json"), "utf8")).version, "0.0.7");
  assert.equal(JSON.parse(await readFile(join(fixture.root, "apps/outray-web/package.json"), "utf8")).devDependencies["@outray/vite"], "0.0.7");
  assert.ok(logs.every((message) => !message.includes(token)));
  assert.ok(fake.calls.every(({ env }) => env.NPM_TOKEN === undefined && env.NODE_AUTH_TOKEN === undefined));
  for (const path of configPaths) await assert.rejects(stat(path), { code: "ENOENT" });
});

test("a core-only live --all release leaves the unchanged CLI and every other public manifest byte-identical", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture);
  const result = await runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  });
  assert.deepEqual(result.published, ["@outray/core@0.0.7"]);
  assert.equal(fake.calls.filter(({ args }) => args[0] === "publish").length, 1);
  for (const item of fixture.workspaces) {
    if (item.manifest.name === "@outray/core") continue;
    const path = join(fixture.root, item.directory, "package.json");
    assert.equal(await readFile(path, "utf8"), fixture.snapshots.get(path), `${item.manifest.name} remains unchanged`);
  }
});

test("a live core and Hono change releases only those two and raises Hono's core minimum", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture, { changedNames: ["@outray/core", "@outray/hono"] });
  const result = await runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  });
  assert.deepEqual(result.published, ["@outray/core@0.0.7", "@outray/hono@0.0.7"]);
  const hono = JSON.parse(await readFile(join(fixture.root, "packages/hono/package.json"), "utf8"));
  assert.equal(hono.dependencies["@outray/core"], "^0.0.7");
  const cliPath = join(fixture.root, "apps/cli/package.json");
  assert.equal(await readFile(cliPath, "utf8"), fixture.snapshots.get(cliPath));
  assert.ok(fake.calls.filter(({ args }) => args[0] === "publish").every(({ args }) => !args[1].includes("outray-0.1.15")));
});

test("pre-upload verification failure rolls back manifest and lockfile changes", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture, { intercept: async (call, calls) => {
    if (call.command === "npm" && call.args[0] === "run" && calls.filter(({ args }) => args[0] === "install").length) {
      return { code: 1, stdout: "", stderr: "fixture build failed" };
    }
  } });
  await assert.rejects(runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  }), /fixture build failed/);
  assert.ok(fake.calls.some(({ args }) => args[0] === "install"));
  assert.ok(fake.calls.every(({ args }) => args[0] !== "publish"));
  await assertFixtureUnchanged(fixture);
});

test("an uncertain upload retains pending versions for a safe retry and redacts npm errors", async (t) => {
  const fixture = await releaseFixture(t);
  const token = "fake-secret-never-in-error";
  const fake = fakeNpm(fixture, { intercept: async (call) => {
    if (call.command === "npm" && call.args[0] === "publish") return { code: 1, stdout: "", stderr: `fixture timeout ${token}` };
  } });
  const logs = [];
  await assert.rejects(runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: token }, runCommand: fake.runCommand, log: (message) => logs.push(message),
  }), (error) => {
    assert.ok(error.message.includes("[REDACTED]"));
    assert.ok(!error.message.includes(token));
    return true;
  });
  assert.equal(fake.calls.filter(({ args }) => args[0] === "publish").length, 1);
  assert.equal(JSON.parse(await readFile(join(fixture.root, "packages/core/package.json"), "utf8")).version, "0.0.7");
  assert.ok(logs.some((message) => message.includes("versions remain")));
  assert.ok(logs.some((message) => message.includes("--all --allow-dirty --tag=latest")));
  assert.ok(logs.every((message) => !message.includes(token)));
});

test("registry permission and network failures are never treated as unpublished packages", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture, { intercept: async (call) => {
    if (call.command === "npm" && call.args[0] === "view") {
      return { code: 1, stdout: JSON.stringify({ error: { code: "E403" } }), stderr: "fixture forbidden" };
    }
  } });
  await assert.rejects(runPublish(parseArguments(["--all", "--dry-run"]), {
    root: fixture.root, environment: {}, runCommand: fake.runCommand, log() {},
  }), /Registry lookup failed/);
  assert.ok(fake.calls.every(({ args }) => !["publish", "install", "pack", "run"].includes(args[0])));
  await assertFixtureUnchanged(fixture);
});

test("the dirty-tree guard refuses publication before authenticating or changing versions", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture, { intercept: async (call) => {
    if (call.command === "git") return { code: 0, stdout: " M packages/core/package.json\n", stderr: "" };
  } });
  await assert.rejects(runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  }), /Commit or stash/);
  assert.equal(fake.calls.length, 1);
  await assertFixtureUnchanged(fixture);
});

test("a concurrent registry publication fails before uploading and restores pending local changes", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture, { intercept: async (call, calls) => {
    if (call.command === "npm" && call.args[0] === "view" && call.args[1] === "@outray/core") {
      const attempts = calls.filter(({ args }) => args[0] === "view" && args[1] === "@outray/core").length;
      if (attempts === 2) return {
        code: 0, stderr: "",
        stdout: JSON.stringify({ versions: ["0.0.6", "0.0.7"], "dist-tags": { latest: "0.0.7" } }),
      };
    }
  } });
  await assert.rejects(runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  }), /appeared during this release/);
  assert.ok(fake.calls.every(({ args }) => args[0] !== "publish"));
  await assertFixtureUnchanged(fixture);
});

test("a live no-change run never edits manifests or refreshes the lockfile", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture, { changedNames: [] });
  const result = await runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  });
  assert.deepEqual(result.releases, []);
  assert.ok(fake.calls.every(({ args }) => !["publish", "install"].includes(args[0])));
  await assertFixtureUnchanged(fixture);
});

test("fresh registry tag advancement cannot move latest backwards", async (t) => {
  const fixture = await releaseFixture(t);
  const fake = fakeNpm(fixture, { intercept: async (call, calls) => {
    if (call.command === "npm" && call.args[0] === "view" && call.args[1] === "@outray/core") {
      const attempts = calls.filter(({ args }) => args[0] === "view" && args[1] === "@outray/core").length;
      if (attempts === 2) return {
        code: 0, stderr: "",
        stdout: JSON.stringify({ versions: ["0.0.6", "0.0.9"], "dist-tags": { latest: "0.0.9" } }),
      };
    }
  } });
  await assert.rejects(runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  }), /Registry advanced|move latest backwards/);
  assert.ok(fake.calls.every(({ args }) => args[0] !== "publish"));
  await assertFixtureUnchanged(fixture);
});

test("concurrent edits to an unwritten pending-version manifest abort publication without discarding the edit", async (t) => {
  const fixture = await releaseFixture(t);
  const core = fixture.workspaces.find(({ manifest }) => manifest.name === "@outray/core");
  const corePath = join(fixture.root, core.directory, "package.json");
  core.manifest.version = "0.0.7";
  const original = `${JSON.stringify(core.manifest, null, 2)}\n`;
  await writeFile(corePath, original);
  fixture.snapshots.set(corePath, original);
  let concurrent;
  const fake = fakeNpm(fixture, { intercept: async (call) => {
    if (call.command === "npm" && call.args[0] === "install") {
      const manifest = JSON.parse(await readFile(corePath, "utf8"));
      manifest.description = "Concurrent edit that must be preserved";
      concurrent = `${JSON.stringify(manifest, null, 2)}\n`;
      await writeFile(corePath, concurrent);
    }
  } });
  fake.registry.set(core.manifest.name, { versions: ["0.0.6"], distTags: { latest: "0.0.6" } });
  await assert.rejects(runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  }), /manifest or lockfile changed concurrently/);
  assert.ok(fake.calls.every(({ args }) => args[0] !== "publish"));
  assert.ok(concurrent);
  assert.equal(await readFile(corePath, "utf8"), concurrent);
  for (const [path, bytes] of fixture.snapshots) if (path !== corePath) assert.equal(await readFile(path, "utf8"), bytes, path);
});

test("source edits during initial verification stop before version updates", async (t) => {
  const fixture = await releaseFixture(t);
  const sourcePath = join(fixture.root, "packages/core/src/index.js");
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "export const original = true;\n");
  let changed = false;
  const fake = fakeNpm(fixture, { intercept: async (call) => {
    if (!changed && call.command === "npm" && call.args[0] === "pack") {
      await writeFile(sourcePath, "export const concurrent = true;\n");
      changed = true;
    }
  } });
  await assert.rejects(runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  }), /Package sources changed/);
  assert.ok(fake.calls.every(({ args }) => !["publish", "install"].includes(args[0])));
  assert.equal(await readFile(sourcePath, "utf8"), "export const concurrent = true;\n");
  await assertFixtureUnchanged(fixture);
});

test("source edits immediately before an upload fail closed and roll back release files", async (t) => {
  const fixture = await releaseFixture(t);
  const sourcePath = join(fixture.root, "packages/core/src/index.js");
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "export const original = true;\n");
  const fake = fakeNpm(fixture, { intercept: async (call, calls) => {
    if (call.command === "npm" && call.args[0] === "view" && call.args[1] === "@outray/core") {
      const attempts = calls.filter(({ args }) => args[0] === "view" && args[1] === "@outray/core").length;
      if (attempts === 2) await writeFile(sourcePath, "export const concurrent = true;\n");
    }
  } });
  await assert.rejects(runPublish(parseArguments(["--all"]), {
    root: fixture.root, environment: { NPMJS_TOKEN: "fake-test-token" }, runCommand: fake.runCommand, log() {},
  }), /Package sources changed before upload/);
  assert.ok(fake.calls.every(({ args }) => args[0] !== "publish"));
  assert.equal(await readFile(sourcePath, "utf8"), "export const concurrent = true;\n");
  await assertFixtureUnchanged(fixture);
});

test("generated build cleanup refuses symlinked dist directories without touching their targets", async (t) => {
  const fixture = await releaseFixture(t);
  const target = join(fixture.root, "build-target-to-preserve");
  const sentinel = join(target, "sentinel.txt");
  await mkdir(target);
  await writeFile(sentinel, "must remain\n");
  await symlink(target, join(fixture.root, "packages/core/dist"), "dir");
  const fake = fakeNpm(fixture);
  await assert.rejects(runPublish(parseArguments(["--all", "--dry-run"]), {
    root: fixture.root, environment: {}, runCommand: fake.runCommand, log() {},
  }), /Refusing to clean a non-directory/);
  assert.equal(await readFile(sentinel, "utf8"), "must remain\n");
  assert.ok(fake.calls.every(({ args }) => !["run", "test", "pack", "publish", "install"].includes(args[0])));
  await assertFixtureUnchanged(fixture);
});
