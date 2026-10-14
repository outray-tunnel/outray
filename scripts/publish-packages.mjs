import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

export const REGISTRY = "https://registry.npmjs.org/";
// Explicit release surface: adding an internal workspace never publishes it.
export const PUBLIC_PACKAGES = Object.freeze([
  { name: "@outray/core", directory: "packages/core" },
  { name: "@outray/observability", directory: "packages/observability" },
  { name: "@outray/express", directory: "packages/express-plugin" },
  { name: "@outray/hono", directory: "packages/hono" },
  { name: "@outray/nest", directory: "packages/nestjs-plugin" },
  { name: "@outray/next", directory: "packages/next-plugin" },
  { name: "@outray/tanstack-start", directory: "packages/tanstack-start" },
  { name: "@outray/vite", directory: "packages/vite-plugin" },
  { name: "outray", directory: "apps/cli" },
]);
const dependencyFields = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
];
const localReference = /^(?:file:|link:|workspace:)/;
const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const fail = (message) => {
  throw new Error(message);
};

export function parseArguments(argv) {
  const options = {
    all: false,
    packages: [],
    dryRun: false,
    plan: false,
    allowDirty: false,
    tag: "latest",
    help: argv.length === 0,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = () => {
      const result = argv[++index];
      if (!result || result.startsWith("-"))
        fail(`Missing value for ${argument}.`);
      return result;
    };
    if (argument === "--all") options.all = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--plan") {
      options.plan = true;
      options.dryRun = true;
    } else if (argument === "--allow-dirty") options.allowDirty = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--tag") options.tag = value();
    else if (argument.startsWith("--tag=")) options.tag = argument.slice(6);
    else if (argument === "--package") options.packages.push(value());
    else if (argument.startsWith("-")) fail(`Unknown option: ${argument}.`);
    else options.packages.push(argument);
  }
  if (
    !/^[a-z][a-z0-9._-]*$/i.test(options.tag) ||
    semver.validRange(options.tag)
  )
    fail("Use a valid npm dist-tag, such as latest or next.");
  if (options.all && options.packages.length)
    fail("Choose --all or individual package names, not both.");
  const known = new Set(PUBLIC_PACKAGES.map(({ name }) => name));
  for (const name of options.packages)
    if (!known.has(name)) fail(`Unknown or private package: ${name}.`);
  options.packages = [...new Set(options.packages)];
  if (!options.help && !options.all && !options.packages.length)
    fail("Select --all or one or more public package names.");
  return options;
}

function dependencyNames(manifest) {
  return [
    ...new Set(
      dependencyFields.flatMap((field) => Object.keys(manifest[field] ?? {})),
    ),
  ];
}

export function orderPackages(workspaces) {
  const packages = workspaces.filter(
    ({ manifest }) => manifest.private !== true,
  );
  const byName = new Map(
    packages.map((workspace) => [workspace.manifest.name, workspace]),
  );
  if (byName.size !== packages.length) fail("Duplicate public package names.");
  const visiting = new Set(),
    visited = new Set(),
    result = [];
  const visit = (name) => {
    if (visiting.has(name)) fail(`Cyclic workspace dependency: ${name}.`);
    if (visited.has(name)) return;
    visiting.add(name);
    const workspace = byName.get(name);
    for (const dependency of dependencyNames(workspace.manifest).sort())
      if (byName.has(dependency)) visit(dependency);
    visiting.delete(name);
    visited.add(name);
    result.push(workspace);
  };
  for (const name of [...byName.keys()].sort()) visit(name);
  return result;
}

function releaseVersion(manifest, published, tag) {
  if (!semver.valid(manifest.version))
    fail(`Invalid version for ${manifest.name}.`);
  const versions = published?.versions ?? [];
  if (semver.prerelease(manifest.version)) {
    if (tag === "latest")
      fail(`Use an explicit non-latest tag for ${manifest.name}'s prerelease.`);
    const local = semver.parse(manifest.version);
    const sameTrack = versions
      .filter((version) => {
        const parsed = semver.parse(version);
        return (
          parsed &&
          parsed.major === local.major &&
          parsed.minor === local.minor &&
          parsed.patch === local.patch &&
          parsed.prerelease[0] === local.prerelease[0]
        );
      })
      .sort(semver.rcompare)[0];
    const candidate =
      versions.includes(manifest.version) ||
      (sameTrack && semver.gt(sameTrack, manifest.version))
        ? semver.inc(
            sameTrack && semver.gt(sameTrack, manifest.version)
              ? sameTrack
              : manifest.version,
            "prerelease",
          )
        : manifest.version;
    const currentTag = published?.distTags?.[tag];
    if (currentTag && semver.lt(candidate, currentTag))
      fail(`Synchronize ${manifest.name} with the newer ${tag} release first.`);
    return candidate;
  }
  const latest = versions
    .filter((version) => semver.valid(version) && !semver.prerelease(version))
    .sort(semver.rcompare)[0];
  if (latest && semver.major(latest) > semver.major(manifest.version))
    fail(
      `Synchronize ${manifest.name} with its newer published major version first.`,
    );
  if (
    !versions.includes(manifest.version) &&
    (!latest || semver.gt(manifest.version, latest))
  )
    return manifest.version;
  return semver.inc(
    latest && semver.gt(latest, manifest.version) ? latest : manifest.version,
    "patch",
  );
}

/** Pure release planning; private consumers can be updated but never released. */
export function createReleasePlan(
  workspaces,
  requestedNames,
  registry,
  changed,
  { tag = "latest" } = {},
) {
  const ordered = orderPackages(workspaces);
  const originals = new Map(
    workspaces.map((workspace) => [workspace.manifest.name, workspace]),
  );
  const manifests = new Map(
    workspaces.map(({ manifest }) => [
      manifest.name,
      structuredClone(manifest),
    ]),
  );
  const publicNames = new Set(ordered.map(({ manifest }) => manifest.name));
  const selected = new Set(),
    releases = new Map();
  const select = (name) => {
    if (!publicNames.has(name)) fail(`Unknown or private package: ${name}.`);
    if (selected.has(name)) return;
    selected.add(name);
    for (const dependency of dependencyNames(originals.get(name).manifest))
      if (publicNames.has(dependency)) select(dependency);
  };
  for (const name of requestedNames) select(name);

  let progress = true;
  while (progress) {
    progress = false;
    for (const name of [...selected]) {
      const original = originals.get(name).manifest;
      const manifest = manifests.get(name);
      if (semver.prerelease(original.version) && tag === "latest")
        fail(`Use an explicit non-latest tag for ${name}'s prerelease.`);
      const missing = !(registry.get(name)?.versions ?? []).includes(
        original.version,
      );
      const dependencyChanged = dependencyFields.some(
        (field) =>
          JSON.stringify(original[field]) !== JSON.stringify(manifest[field]),
      );
      if (
        !releases.has(name) &&
        (missing || changed.get(name)?.length || dependencyChanged)
      ) {
        manifest.version = releaseVersion(original, registry.get(name), tag);
        releases.set(name, {
          name,
          directory: originals.get(name).directory,
          fromVersion: original.version,
          version: manifest.version,
          manifest,
          reason: dependencyChanged
            ? "updated workspace dependency"
            : missing
              ? "unpublished version"
              : "changed package contents",
        });
        progress = true;
      }
    }
    // Only align public consumers that already have their own release. A new
    // shared API does not make untouched consumers require it: their existing
    // dependency version remains published and usable. Changed consumers still
    // need the minimum version they were built/tested against.
    for (const [name, manifest] of manifests) {
      if (publicNames.has(name) && !releases.has(name)) continue;
      for (const field of dependencyFields) {
        for (const [dependency, specification] of Object.entries(
          manifest[field] ?? {},
        )) {
          if (!publicNames.has(dependency)) continue;
          const dependencyVersion = manifests.get(dependency).version;
          if (
            !releases.has(dependency) &&
            !(selected.has(name) && selected.has(dependency))
          )
            continue;
          if (localReference.test(specification)) {
            if (publicNames.has(name) && field !== "devDependencies")
              fail(`${name} cannot publish a local ${dependency} reference.`);
            continue;
          }
          if (!semver.validRange(specification))
            fail(`Invalid ${dependency} range in ${name}.`);
          const minimum = semver.minVersion(specification);
          if (
            minimum &&
            semver.gte(minimum, dependencyVersion) &&
            semver.satisfies(dependencyVersion, specification)
          )
            continue;
          manifest[field][dependency] = semver.valid(specification)
            ? dependencyVersion
            : `${specification.startsWith("~") ? "~" : "^"}${dependencyVersion}`;
          progress = true;
        }
      }
    }
  }
  const updates = workspaces
    .filter(
      ({ manifest }) =>
        JSON.stringify(manifest) !==
        JSON.stringify(manifests.get(manifest.name)),
    )
    .map(({ directory, manifest }) => ({
      directory,
      manifest: manifests.get(manifest.name),
    }));
  return {
    releases: ordered
      .filter(({ manifest }) => releases.has(manifest.name))
      .map(({ manifest }) => releases.get(manifest.name)),
    updates,
    selected: ordered
      .filter(({ manifest }) => selected.has(manifest.name))
      .map(({ manifest }) => manifest.name),
  };
}

export function safeEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) =>
        !/^(?:NPMJS_TOKEN|NPM_TOKEN|NODE_AUTH_TOKEN)$/i.test(key) &&
        !/^npm_config_/i.test(key),
    ),
  );
}

export function validateArchive(workspace, archive) {
  const manifest = workspace.manifest;
  if (
    !archive ||
    archive.name !== manifest.name ||
    archive.version !== manifest.version ||
    !archive.filename ||
    basename(archive.filename) !== archive.filename
  )
    fail(`Invalid packed artifact for ${manifest.name}.`);
  if (
    !Array.isArray(archive.files) ||
    !archive.files.length ||
    !/^sha512-[A-Za-z0-9+/=]+$/.test(archive.integrity ?? "")
  )
    fail(`Incomplete packed artifact for ${manifest.name}.`);
  const paths = new Set(archive.files.map(({ path }) => path));
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      path.startsWith("/") ||
      path.split(/[\\/]/).includes("..") ||
      /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.git)(?:\/|$)|\.(?:pem|key|p12|pfx)$/i.test(
        path,
      )
    )
      fail(`Unsafe file in ${manifest.name}'s archive.`);
  }
  const targets = [];
  const collect = (value) => {
    if (typeof value === "string") targets.push(value.replace(/^\.\//, ""));
    else if (value && typeof value === "object")
      for (const child of Object.values(value)) collect(child);
  };
  for (const field of ["main", "module", "types", "bin", "exports"])
    collect(manifest[field]);
  if (
    !paths.has("package.json") ||
    targets.some((target) =>
      target.includes("*")
        ? ![...paths].some((path) => path.startsWith(target.split("*")[0]))
        : !paths.has(target),
    )
  )
    fail(`Missing built entry point in ${manifest.name}'s archive.`);
  return archive;
}

async function execute(command, args, options) {
  // npm run supplies npm_execpath; use its JS entry point on Windows too.
  if (command === "npm" && options.env.npm_execpath) {
    args = [options.env.npm_execpath, ...args];
    command = process.execPath;
  }
  return await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 16 * 1024 * 1024) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 16 * 1024 * 1024) child.kill();
    });
    child.on("error", reject);
    child.on("close", (code, signal) =>
      resolveResult({ code: code ?? 1, stdout, stderr, signal }),
    );
  });
}

const redact = (text, token) =>
  token ? String(text).split(token).join("[REDACTED]") : String(text);
const json = (text, label) => {
  try {
    return JSON.parse(text);
  } catch {
    fail(`Invalid JSON from ${label}.`);
  }
};

async function sourceFingerprint(root, workspaces) {
  const hash = createHash("sha256");
  const walk = async (directory) => {
    for (const entry of (
      await readdir(join(root, directory), { withFileTypes: true })
    ).sort((left, right) => left.name.localeCompare(right.name))) {
      if (
        [
          "dist",
          "bin",
          "node_modules",
          ".git",
          ".turbo",
          "package.json",
          ".npmrc",
        ].includes(entry.name) ||
        entry.name.startsWith(".env")
      )
        continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink())
        fail(`Release sources cannot contain symlinks: ${path}.`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile())
        hash
          .update(path)
          .update("\0")
          .update(
            createHash("sha256")
              .update(await readFile(join(root, path)))
              .digest(),
          );
    }
  };
  for (const { directory } of workspaces) await walk(directory);
  return hash.digest("hex");
}

export async function runPublish(
  options,
  {
    root = defaultRoot,
    environment = process.env,
    runCommand = execute,
    log = console.log,
  } = {},
) {
  const names = options.all
    ? PUBLIC_PACKAGES.map(({ name }) => name)
    : options.packages;
  const token = environment.NPMJS_TOKEN?.trim();
  if (!options.dryRun && (!token || /[\r\n\0]/.test(token)))
    fail(
      "Set NPMJS_TOKEN to an npm granular token with publishing permission and Bypass 2FA enabled.",
    );
  root = resolve(root);
  const workspaces = [],
    snapshots = new Map();
  for (const parent of ["apps", "packages"])
    for (const entry of await readdir(join(root, parent), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const directory = `${parent}/${entry.name}`,
        path = join(root, directory, "package.json");
      let bytes;
      try {
        bytes = await readFile(path);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      workspaces.push({ directory, manifest: json(bytes.toString(), path) });
      snapshots.set(path, bytes);
    }
  for (const filename of ["package.json", "package-lock.json"])
    snapshots.set(join(root, filename), await readFile(join(root, filename)));
  const publicWorkspaces = PUBLIC_PACKAGES.map(({ name, directory }) => {
    const workspace = workspaces.find((item) => item.directory === directory);
    if (
      !workspace ||
      workspace.manifest.name !== name ||
      workspace.manifest.private === true ||
      !workspace.manifest.scripts?.build ||
      !workspace.manifest.files?.length
    )
      fail(`Invalid public release workspace: ${name}.`);
    const config = workspace.manifest.publishConfig ?? {};
    if (
      (config.registry &&
        config.registry !== REGISTRY &&
        config.registry !== REGISTRY.slice(0, -1)) ||
      (config.access && config.access !== "public") ||
      Object.keys(config).some(
        (key) => !["registry", "access", "provenance"].includes(key),
      )
    )
      fail(
        `Conflicting publishConfig in ${name}; the release script controls the registry, access and tag.`,
      );
    return workspace;
  });
  const allowedNames = new Set(PUBLIC_PACKAGES.map(({ name }) => name));
  if (
    workspaces.some(
      ({ manifest }) =>
        manifest.private !== true && !allowedNames.has(manifest.name),
    )
  )
    fail("A new public workspace needs an explicit publisher allowlist entry.");
  const ordered = orderPackages(publicWorkspaces);
  if (options.plan) {
    const selected = createReleasePlan(
      workspaces,
      names,
      new Map(),
      new Map(),
      { tag: options.tag },
    );
    log(
      `Offline selection (no builds, registry calls, version changes or uploads): ${selected.selected.join(", ")}`,
    );
    return { selected: selected.selected, releases: [], dryRun: true };
  }

  const temporary = await mkdtemp(join(tmpdir(), "outray-npm-release-"));
  const publicConfig = join(temporary, "public.npmrc"),
    authConfig = join(temporary, "auth.npmrc"),
    globalConfig = join(temporary, "global.npmrc");
  const baseEnvironment = {
    ...safeEnvironment(environment),
    NPM_CONFIG_USERCONFIG: publicConfig,
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_CACHE: join(temporary, "cache"),
    NPM_CONFIG_REGISTRY: REGISTRY,
    NPM_CONFIG_LOGS_MAX: "0",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
  };
  const controller = new AbortController(),
    stop = () => controller.abort();
  const written = new Map(),
    published = [];
  const assertManifestsUnchanged = async () => {
    for (const [path, bytes] of snapshots)
      if (!(await readFile(path)).equals(written.get(path) ?? bytes))
        fail(`Release manifest or lockfile changed concurrently: ${path}.`);
  };
  let uploadAttempted = false;
  const command = async (
    binary,
    args,
    { cwd = root, authenticated = false, allowFailure = false } = {},
  ) => {
    const env = authenticated
      ? {
          ...baseEnvironment,
          NPM_CONFIG_USERCONFIG: authConfig,
          NPMJS_TOKEN: token,
        }
      : baseEnvironment;
    const result = await runCommand(binary, args, {
      cwd,
      env,
      signal: controller.signal,
    });
    if (result.code !== 0 && !allowFailure)
      fail(
        `${binary} ${args.slice(0, 2).join(" ")} failed.\n${redact((result.stderr || result.stdout || "No diagnostic output.").slice(-4000), token)}`,
      );
    return result;
  };
  const npm = (args, settings) => command("npm", args, settings);
  const registryFlags = [
    `--registry=${REGISTRY}`,
    "--ignore-scripts",
    "--fetch-retries=0",
    "--fetch-timeout=20000",
  ];
  const registryInfo = async (name) => {
    const result = await npm(
      ["view", name, "versions", "dist-tags", "--json", ...registryFlags],
      { cwd: temporary, allowFailure: true },
    );
    if (result.code !== 0) {
      let errorCode;
      try {
        errorCode = JSON.parse(result.stdout).error?.code;
      } catch {}
      if (errorCode === "E404") return { versions: [], distTags: {} };
      fail(
        `Registry lookup failed for ${name}; this is not treated as a new package.\n${redact(result.stderr || result.stdout, token).slice(-2000)}`,
      );
    }
    const value = json(result.stdout, `npm view ${name}`);
    if (!Array.isArray(value.versions))
      fail(`Missing version list for ${name}.`);
    return { versions: value.versions, distTags: value["dist-tags"] ?? {} };
  };
  const verify = async () => {
    for (const workspace of ordered) {
      const name = workspace.manifest.name;
      const dist = join(root, workspace.directory, "dist");
      let info;
      try {
        info = await lstat(dist);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (info && (!info.isDirectory() || info.isSymbolicLink()))
        fail(`Refusing to clean a non-directory build output for ${name}.`);
      // CLI's tsc does not clean obsolete generated files by itself.
      await rm(dist, { recursive: true, force: true });
      log(`Build ${name}`);
      await npm(["run", "build", `--workspace=${name}`, "--ignore-scripts"]);
      if (workspace.manifest.scripts.test) {
        log(`Test ${name}`);
        await npm(["test", `--workspace=${name}`, "--ignore-scripts"]);
      }
    }
  };
  const pack = async (workspace) => {
    const result = await npm([
      "pack",
      `--workspace=${workspace.manifest.name}`,
      "--json",
      "--ignore-scripts",
      `--pack-destination=${temporary}`,
    ]);
    const records = json(result.stdout, `npm pack ${workspace.manifest.name}`);
    if (!Array.isArray(records) || records.length !== 1)
      fail("Expected exactly one packed workspace.");
    const artifact = validateArchive(workspace, records[0]);
    const path = join(temporary, artifact.filename);
    const integrity = `sha512-${createHash("sha512")
      .update(await readFile(path))
      .digest("base64")}`;
    if (integrity !== artifact.integrity)
      fail(`Artifact integrity mismatch for ${workspace.manifest.name}.`);
    return { ...artifact, path };
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await writeFile(publicConfig, `registry=${REGISTRY}\n`, { mode: 0o600 });
    await writeFile(globalConfig, "", { mode: 0o600 });
    await writeFile(
      authConfig,
      `registry=${REGISTRY}\n//registry.npmjs.org/:_authToken=\${NPMJS_TOKEN}\n`,
      { mode: 0o600 },
    );
    if (!options.dryRun) {
      const status = await command("git", ["status", "--porcelain"]);
      if (status.stdout.trim() && !options.allowDirty)
        fail(
          "Commit or stash working-tree changes before publishing, or explicitly pass --allow-dirty.",
        );
      await npm(["whoami", ...registryFlags], {
        cwd: temporary,
        authenticated: true,
      });
      log("npm token authentication verified.");
    }
    const registry = new Map();
    for (const { name } of PUBLIC_PACKAGES)
      registry.set(name, await registryInfo(name));
    const sources = await sourceFingerprint(root, ordered);
    await verify();
    const changed = new Map(),
      archives = new Map();
    for (const workspace of ordered) {
      const { name, version } = workspace.manifest;
      const artifact = await pack(workspace);
      archives.set(name, artifact);
      if (!registry.get(name).versions.includes(version)) {
        changed.set(name, ["unpublished version"]);
        continue;
      }
      // Compare unpacked files, not archive timestamps or gzip metadata.
      const difference = await npm(
        [
          "diff",
          `--diff=${name}@${version}`,
          `--diff=${artifact.path}`,
          "--diff-name-only",
          ...registryFlags,
        ],
        { cwd: temporary },
      );
      changed.set(
        name,
        difference.stdout.trim() ? difference.stdout.trim().split(/\r?\n/) : [],
      );
    }
    await assertManifestsUnchanged();
    if ((await sourceFingerprint(root, ordered)) !== sources)
      fail(
        "Package sources changed during release verification; retry with a stable checkout.",
      );
    const plan = createReleasePlan(workspaces, names, registry, changed, {
      tag: options.tag,
    });
    for (const release of plan.releases)
      log(
        `${options.dryRun ? "Would publish" : "Release"} ${release.name}: ${release.fromVersion} → ${release.version} (${release.reason})`,
      );
    if (!plan.releases.length) {
      log(
        "All selected package contents are already published; nothing to release.",
      );
      return plan;
    }
    if (options.dryRun) {
      log(
        `Dry run complete. ${plan.updates.length} manifest update(s) planned; no manifests, lockfile or registry changed.`,
      );
      return plan;
    }

    const lockPath = join(root, "package-lock.json");
    for (const update of plan.updates) {
      const path = join(root, update.directory, "package.json");
      if (!(await readFile(path)).equals(snapshots.get(path)))
        fail(`Manifest changed during release: ${update.directory}.`);
      const bytes = Buffer.from(
        `${JSON.stringify(update.manifest, null, 2)}\n`,
      );
      await writeFile(path, bytes);
      written.set(path, bytes);
    }
    const refresh = await npm(
      [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      { allowFailure: true },
    );
    written.set(lockPath, await readFile(lockPath));
    if (refresh.code !== 0)
      fail(
        `Lockfile refresh failed.\n${redact(refresh.stderr || refresh.stdout, token).slice(-2000)}`,
      );
    await assertManifestsUnchanged();
    for (const workspace of ordered)
      workspace.manifest = json(
        (
          await readFile(join(root, workspace.directory, "package.json"))
        ).toString(),
        workspace.directory,
      );
    await verify();
    const finalArchives = new Map();
    for (const release of plan.releases) {
      const artifact = await pack(
        ordered.find(({ manifest }) => manifest.name === release.name),
      );
      if (
        artifact.name !== release.name ||
        artifact.version !== release.version
      )
        fail(
          `Final artifact does not match the planned release for ${release.name}.`,
        );
      finalArchives.set(release.name, artifact);
    }
    await assertManifestsUnchanged();
    if ((await sourceFingerprint(root, ordered)) !== sources)
      fail(
        "Package sources changed during release verification; retry with a stable checkout.",
      );

    for (const release of plan.releases) {
      const artifact = finalArchives.get(release.name);
      const fresh = await registryInfo(release.name);
      if (fresh.versions.includes(release.version))
        fail(
          `${release.name}@${release.version} appeared during this release; rerun to verify and resume safely.`,
        );
      const currentTag = fresh.distTags[options.tag];
      const latestStable = fresh.versions
        .filter(
          (version) => semver.valid(version) && !semver.prerelease(version),
        )
        .sort(semver.rcompare)[0];
      if (
        (currentTag && semver.gt(currentTag, release.version)) ||
        (!semver.prerelease(release.version) &&
          latestStable &&
          semver.gt(latestStable, release.version))
      )
        fail(
          `Registry advanced beyond ${release.name}@${release.version}; refusing to move ${options.tag} backwards.`,
        );
      await assertManifestsUnchanged();
      if ((await sourceFingerprint(root, ordered)) !== sources)
        fail(
          "Package sources changed before upload; retry with a stable checkout.",
        );
      if (
        `sha512-${createHash("sha512")
          .update(await readFile(artifact.path))
          .digest("base64")}` !== artifact.integrity
      )
        fail(`Artifact changed before upload: ${release.name}.`);
      log(`Publish ${release.name}@${release.version}`);
      // From this point registry state can be uncertain after a network failure.
      // Never roll versions back once an upload has been attempted.
      uploadAttempted = true;
      await npm(
        [
          "publish",
          artifact.path,
          "--access=public",
          `--tag=${options.tag}`,
          ...registryFlags,
        ],
        { cwd: temporary, authenticated: true },
      );
      published.push(`${release.name}@${release.version}`);
    }
    log(
      `Published ${published.length} package(s). Version and lockfile changes are left uncommitted; no Git tags or pushes were created.`,
    );
    return { ...plan, published };
  } catch (error) {
    if (!uploadAttempted) {
      for (const [path, bytes] of written) {
        if ((await readFile(path)).equals(bytes))
          await writeFile(path, snapshots.get(path));
        else log(`Preserved a concurrently modified file: ${path}`);
      }
    } else {
      log(
        `Publication stopped. Confirmed uploads: ${published.join(", ") || "none"}. An attempted upload may have succeeded; release versions remain for a safe rerun.`,
      );
      log(
        `Resume all prepared releases with: npm run packages:publish -- --all --allow-dirty --tag=${options.tag}`,
      );
    }
    throw new Error(redact(error.message, token), { cause: error });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await rm(temporary, { recursive: true, force: true });
  }
}

export const HELP = `Usage: npm run packages:publish -- --all [--dry-run]
       npm run packages:publish -- @outray/tanstack-start [--dry-run]
       npm run packages:publish -- outray [--dry-run]

Automatically patch-bumps changed public packages; untouched consumers stay unchanged.
--all           Check/release all eight SDKs and the CLI.
--package NAME  Select a package (repeatable; positional names also accepted).
--dry-run       Build, test, compare to npm and show bumps, without editing or uploading.
--plan          Offline selection only; no builds or registry calls.
--tag NAME      npm dist-tag (default: latest; prereleases require a different tag).
--allow-dirty   Explicitly permit publishing with uncommitted changes.

Live publishing requires NPMJS_TOKEN. No token is needed for a dry run.
Dependencies are checked; only consumers with their own changes get new dependency minima.
For a dependency-only fix, edit the consumer's dependency range explicitly first.
The script never commits, tags or pushes. Review breaking changes before releasing.`;

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) console.log(HELP);
    else await runPublish(options);
  } catch (error) {
    console.error(redact(error.message, process.env.NPMJS_TOKEN?.trim()));
    process.exitCode = 1;
  }
}
