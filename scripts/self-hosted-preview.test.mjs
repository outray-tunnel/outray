import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { initialEnvironment } from "./self-hosted.mjs";
import { configurationFrom, serviceDefinitions, labelsFor, project } from "./self-hosted-rehearsal.mjs";
import { assertPreviewEnvironment, caddyImage, egressNetwork, gatewayArguments, previewOptions, safeGatewayContainer, safeWebContainer } from "./self-hosted-preview.mjs";
import { approvedConsoleEmails, approvedTinybirdReadConfiguration, consoleContainerArguments, consoleDefinition, consoleEgressArguments, consoleLabels, consoleModesFromContainer, consoleOptions, containerEnvironment, githubLabel, previewConfigurationLabel, safeMaintenanceGateway, tinybirdLabel, webEgressNetwork } from "./self-hosted-preview-web.mjs";
import { createHash } from "node:crypto";

const config = () => configurationFrom(parseEnv(initialEnvironment("ops.outray.dev", "owner@example.net")));
const environment = () => serviceDefinitions(config()).web.env;

test("preview mode is explicit, maintenance by default and never uses provider credentials", () => {
  assert.equal(previewOptions(["--file", "private-fresh.env", "--email", "owner@example.net"]).enableProxy, false);
  assert.equal(previewOptions(["--file", "private-fresh.env", "--email", "owner@example.net", "--enable-proxy", "--image", "patched-preview:local"]).enableProxy, true);
  for (const args of [[], ["--file", "fresh", "--email", "bad\nemail"], ["--file", "fresh", "--email", "owner@example.net", "--enable-proxy"], ["--file", "fresh", "--email", "owner@example.net", "--image", "old-image"], ["--file", "fresh", "--email", "owner@example.net", "--unknown", "x"]]) assert.throws(() => previewOptions(args));
  assertPreviewEnvironment(environment());
  for (const changed of [{ GOOGLE_CLIENT_ID: "provider" }, { TINYBIRD_QUERY_TOKEN: "telemetry" }, { OUTRAY_SIGNUP_ALLOWED_DOMAINS: "example.net" }, { HUGEICONS_LICENSE_KEY: "private-key" }, { APP_URL: "https://other.example.net" }, { UPTIME_EGRESS_POLICY_READY: "true" }]) assert.throws(() => assertPreviewEnvironment({ ...environment(), ...changed }));
});

const githubSource = () => ({ GITHUB_CLIENT_ID: "test-client-id", GITHUB_CLIENT_SECRET: "test-client-secret", OUTRAY_SIGNUP_ALLOWED_EMAILS: "One@example.net, Two@example.net", OUTRAY_SIGNUP_ALLOWED_DOMAINS: "" });
const tinybirdSource = () => ({ TINYBIRD_API_HOST: "https://api.example.net", TINYBIRD_QUERY_TOKEN: "test-query-token-that-is-not-a-real-secret" });
const consoleMetadata = (configuration, definition, modes) => ({
  Image: "sha256:expected", Config: { User: "node", Cmd: definition.command, Labels: consoleLabels(configuration, "sha256:expected", definition, modes), Env: Object.entries(definition.env).map(([key, value]) => `${key}=${value}`) },
  HostConfig: { ReadonlyRootfs: true, NetworkMode: project, PortBindings: {}, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"] },
  NetworkSettings: { Networks: { [project]: {}, ...(modes.enableGithub || modes.enableTinybird ? { [webEgressNetwork]: {} } : {}) } }, Mounts: [{ Type: "tmpfs" }],
});

test("GitHub-only console requires explicit flags and exactly two normalized emails", () => {
  assert.equal(consoleOptions(["--file", "private-fresh.env", "--image", "patched:local"]).enableGithub, false);
  assert.equal(consoleOptions(["--file", "private-fresh.env", "--image", "patched:local", "--enable-github", "--replace-owned"]).replaceOwned, true);
  assert.equal(previewOptions(["--file", "fresh", "--email", "owner@example.net", "--image", "patched:local", "--enable-proxy", "--enable-github"]).enableGithub, true);
  assert.throws(() => previewOptions(["--file", "fresh", "--email", "owner@example.net", "--enable-github"]));
  assert.throws(() => consoleOptions(["--file", "private-fresh.env", "--image", "patched:local", "--enable-github", "--enable-github"]));
  assert.equal(approvedConsoleEmails(" One@Example.NET , TWO@example.net "), "one@example.net,two@example.net");
  for (const value of ["", "one@example.net", "one@example.net,ONE@example.net", "one@example.net,two@example.net,three@example.net", "one@example.net,bad", "one@example.net,", "one@example.net,two@example.net,"]) assert.throws(() => approvedConsoleEmails(value));
  const source = { ...githubSource(), DATABASE_URL: "postgresql://not-authorized/db", GOOGLE_CLIENT_SECRET: "do-not-copy-google", TINYBIRD_INGEST_TOKEN: "do-not-copy-tinybird", ZEPTO_API_KEY: "do-not-copy-email", HUGEICONS_LICENSE_KEY: "do-not-copy-license", POLAR_WEBHOOK_SECRET: "do-not-copy-webhook" };
  const configuration = config(), closed = consoleDefinition(configuration, source), signed = consoleDefinition(configuration, source, { enableGithub: true });
  assert.deepEqual(closed, serviceDefinitions(configuration).web);
  assert.equal(closed.env.GITHUB_CLIENT_SECRET, "");
  assert.equal(closed.env.OUTRAY_SIGNUP_ALLOWED_EMAILS, "");
  assert.equal(signed.env.GITHUB_CLIENT_SECRET, "test-client-secret");
  assert.equal(signed.env.OUTRAY_SIGNUP_ALLOWED_EMAILS, "one@example.net,two@example.net");
  assert.equal(signed.env.OUTRAY_SIGNUP_ALLOWED_DOMAINS, "");
  for (const value of ["not-authorized", "do-not-copy-google", "do-not-copy-tinybird", "do-not-copy-email", "do-not-copy-license", "do-not-copy-webhook"]) assert.ok(!JSON.stringify(signed).includes(value));
  for (const change of [{ GITHUB_CLIENT_SECRET: "" }, { GITHUB_CLIENT_ID: "bad\nclient" }, { OUTRAY_SIGNUP_ALLOWED_DOMAINS: "example.net" }, { OUTRAY_SIGNUP_ALLOWED_EMAILS: "one@example.net" }]) assert.throws(() => consoleDefinition(config(), { ...githubSource(), ...change }, { enableGithub: true }));
  assertPreviewEnvironment(signed.env, { enableGithub: true });
  assert.throws(() => assertPreviewEnvironment(signed.env));
  for (const change of [{ GOOGLE_CLIENT_ID: "google" }, { TINYBIRD_API_HOST: "https://api.example.net" }, { POLAR_WEBHOOK_SECRET: "webhook" }, { UPTIME_NOTIFICATIONS_ENABLED: "true" }]) assert.throws(() => assertPreviewEnvironment({ ...signed.env, ...change }, { enableGithub: true }));
});

test("GitHub console adds only a separate web egress and passes secrets by environment names", () => {
  const configuration = config(), definition = consoleDefinition(configuration, githubSource(), { enableGithub: true });
  const labels = consoleLabels(configuration, "sha256:expected", definition, { enableGithub: true });
  assert.equal(labels[githubLabel], "true");
  const metadata = { Image: "sha256:expected", Config: { User: "node", Cmd: definition.command, Labels: labels, Env: Object.entries(definition.env).map(([key, value]) => `${key}=${value}`) }, HostConfig: { ReadonlyRootfs: true, NetworkMode: project, PortBindings: {}, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"] }, NetworkSettings: { Networks: { [project]: {}, [webEgressNetwork]: {} } }, Mounts: [{ Type: "tmpfs" }] };
  assert.equal(safeWebContainer(metadata, "sha256:expected", labels, definition.env, { enableGithub: true }), true);
  assert.equal(safeWebContainer(metadata, "sha256:expected", labels, definition.env), false);
  for (const networks of [{ [project]: {} }, { [project]: {}, [egressNetwork]: {} }, { [project]: {}, [webEgressNetwork]: {}, [egressNetwork]: {} }]) assert.equal(safeWebContainer({ ...metadata, NetworkSettings: { Networks: networks } }, "sha256:expected", labels, definition.env, { enableGithub: true }), false);
  assert.equal(safeWebContainer({ ...metadata, Config: { ...metadata.Config, Cmd: ["sh"] } }, "sha256:expected", labels, definition.env, { enableGithub: true }), false);
  assert.equal(safeWebContainer(metadata, "sha256:expected", labels, { ...definition.env, GITHUB_CLIENT_SECRET: "different-secret" }, { enableGithub: true }), false);
  const args = consoleContainerArguments(definition, "patched:local", labels);
  assert.equal(args[0], "create");
  assert.ok(!args.includes("--detach"));
  assert.equal(args[args.indexOf("--network") + 1], project);
  assert.equal(args[args.indexOf("--restart") + 1], "unless-stopped");
  assert.deepEqual(consoleEgressArguments("exact-container-id"), ["network", "connect", "--gw-priority", "1", webEgressNetwork, "exact-container-id"]);
  for (const value of ["test-client-secret", "one@example.net", configuration.POSTGRES_PASSWORD]) assert.ok(!args.join(" ").includes(value));
  for (const forbidden of ["--publish", "--publish-all", "--privileged", "--env-file", "--volumes-from"]) assert.ok(!args.includes(forbidden));
});

test("Tinybird READ-only preview and GitHub modes are independent explicit opt-ins", () => {
  const configuration = config();
  const source = { ...githubSource(), ...tinybirdSource(), TINYBIRD_INGEST_TOKEN: "never-copy-append-token", TINYBIRD_TUNNEL_INGEST_TOKEN: "never-copy-tunnel-append-token", GOOGLE_CLIENT_ID: "never-copy-google", DATABASE_URL: "never-copy-database", XAI_API_KEY: "never-copy-ai" };
  for (const modes of [{ enableGithub: false, enableTinybird: false }, { enableGithub: true, enableTinybird: false }, { enableGithub: false, enableTinybird: true }, { enableGithub: true, enableTinybird: true }]) {
    const flags = [...(modes.enableGithub ? ["--enable-github"] : []), ...(modes.enableTinybird ? ["--enable-tinybird"] : [])];
    const webOptions = consoleOptions(["--file", "fresh-private.env", "--image", "patched:local", ...flags]);
    const gatewayOptions = previewOptions(["--file", "fresh-private.env", "--email", "owner@example.net", "--image", "patched:local", "--enable-proxy", ...flags]);
    for (const key of ["enableGithub", "enableTinybird"]) { assert.equal(webOptions[key], modes[key]); assert.equal(gatewayOptions[key], modes[key]); }
    const definition = consoleDefinition(configuration, source, modes);
    assert.equal(definition.env.TINYBIRD_API_HOST, modes.enableTinybird ? source.TINYBIRD_API_HOST : "");
    assert.equal(definition.env.TINYBIRD_QUERY_TOKEN, modes.enableTinybird ? source.TINYBIRD_QUERY_TOKEN : "");
    assert.equal(definition.env.TINYBIRD_INGEST_TOKEN, "");
    assert.equal(definition.env.TINYBIRD_TUNNEL_INGEST_TOKEN, "");
    assert.equal(definition.env.GITHUB_CLIENT_ID, modes.enableGithub ? source.GITHUB_CLIENT_ID : "");
    assert.equal(definition.env.OUTRAY_SIGNUP_ALLOWED_EMAILS, modes.enableGithub ? "one@example.net,two@example.net" : "");
    assertPreviewEnvironment(definition.env, modes);
    for (const value of ["never-copy-append-token", "never-copy-tunnel-append-token", "never-copy-google", "never-copy-database", "never-copy-ai"]) assert.ok(!JSON.stringify(definition).includes(value));
    const metadata = consoleMetadata(configuration, definition, modes);
    assert.equal(metadata.Config.Labels[tinybirdLabel], modes.enableTinybird ? "true" : undefined);
    assert.equal(metadata.Config.Labels[githubLabel], modes.enableGithub ? "true" : undefined);
    assert.equal(safeWebContainer(metadata, metadata.Image, metadata.Config.Labels, definition.env, modes), true);
    assert.deepEqual(Object.keys(metadata.NetworkSettings.Networks).sort(), [project, ...(modes.enableGithub || modes.enableTinybird ? [webEgressNetwork] : [])].sort());
    for (const key of ["TINYBIRD_INGEST_TOKEN", "TINYBIRD_TUNNEL_INGEST_TOKEN"]) assert.throws(() => assertPreviewEnvironment({ ...definition.env, [key]: "forbidden-append-credential" }, modes));
  }
  for (const args of [["--file", "fresh", "--email", "owner@example.net", "--enable-tinybird"], ["--file", "fresh", "--email", "owner@example.net", "--image", "patched:local", "--enable-proxy", "--enable-tinybird", "--enable-tinybird"]]) assert.throws(() => previewOptions(args));
  assert.throws(() => consoleOptions(["--file", "fresh", "--image", "patched:local", "--enable-tinybird", "--enable-tinybird"]));
  const internalSource = parseEnv(initialEnvironment("ops.outray.dev", "owner@example.net"));
  assert.deepEqual(labelsFor(configurationFrom({ ...internalSource, ...source })), labelsFor(configurationFrom(internalSource)), "External credentials must be absent from the selected rehearsal configuration");
});

test("Tinybird READ mode validates private configuration without admitting partial or unsafe origins", () => {
  assert.deepEqual(approvedTinybirdReadConfiguration(tinybirdSource()), tinybirdSource());
  for (const change of [{ TINYBIRD_API_HOST: "" }, { TINYBIRD_API_HOST: "http://api.example.net" }, { TINYBIRD_API_HOST: "https://api.example.net/path" }, { TINYBIRD_API_HOST: "https://user:password@api.example.net" }, { TINYBIRD_API_HOST: "https://api.example.net?token=value" }, { TINYBIRD_API_HOST: "https://api.example.net#fragment" }, { TINYBIRD_API_HOST: "https://api.example.net/" }, { TINYBIRD_QUERY_TOKEN: "" }, { TINYBIRD_QUERY_TOKEN: "short" }, { TINYBIRD_QUERY_TOKEN: "query-token-with\nnewline" }, { TINYBIRD_QUERY_TOKEN: "query token with spaces" }]) {
    assert.throws(() => approvedTinybirdReadConfiguration({ ...tinybirdSource(), ...change }));
    assert.throws(() => consoleDefinition(config(), { ...tinybirdSource(), ...change }, { enableTinybird: true }));
  }
  const definition = consoleDefinition(config(), tinybirdSource(), { enableTinybird: true });
  assert.throws(() => assertPreviewEnvironment(definition.env));
  assert.throws(() => assertPreviewEnvironment(definition.env, { enableGithub: true }));
  const args = consoleContainerArguments(definition, "patched:local", {});
  assert.ok(args.includes("TINYBIRD_API_HOST"));
  assert.ok(args.includes("TINYBIRD_QUERY_TOKEN"));
  for (const value of Object.values(tinybirdSource())) assert.ok(!args.includes(value));
});

test("Tinybird container reuse requires exact READ environment, modes and web-only egress", () => {
  const configuration = config(), modes = { enableGithub: true, enableTinybird: true }, definition = consoleDefinition(configuration, { ...githubSource(), ...tinybirdSource() }, modes);
  const metadata = consoleMetadata(configuration, definition, modes), labels = metadata.Config.Labels;
  assert.equal(safeWebContainer(metadata, metadata.Image, labels, { ...definition.env, TINYBIRD_QUERY_TOKEN: "different-read-only-query-token" }, modes), false);
  assert.equal(safeWebContainer(metadata, metadata.Image, labels, { ...definition.env, TINYBIRD_API_HOST: "https://other.example.net" }, modes), false);
  for (const selected of [{}, { enableGithub: true }, { enableTinybird: true }]) assert.equal(safeWebContainer(metadata, metadata.Image, labels, definition.env, selected), false);
  for (const networks of [{ [project]: {} }, { [project]: {}, [egressNetwork]: {} }, { [project]: {}, [webEgressNetwork]: {}, [egressNetwork]: {} }]) assert.equal(safeWebContainer({ ...metadata, NetworkSettings: { Networks: networks } }, metadata.Image, labels, definition.env, modes), false);
  for (const key of ["TINYBIRD_INGEST_TOKEN", "TINYBIRD_TUNNEL_INGEST_TOKEN"]) {
    const injected = { ...metadata, Config: { ...metadata.Config, Env: metadata.Config.Env.filter((entry) => !entry.startsWith(`${key}=`)).concat(`${key}=forbidden-append-token`) } };
    assert.equal(safeWebContainer(injected, metadata.Image, labels, definition.env, modes), false);
  }
  const wrongLabel = { ...metadata, Config: { ...metadata.Config, Labels: { ...labels, [tinybirdLabel]: "false" } } };
  assert.equal(safeWebContainer(wrongLabel, metadata.Image, wrongLabel.Config.Labels, definition.env, modes), false);
  const closed = consoleDefinition(configuration), falselyLabelled = consoleMetadata(configuration, closed, {});
  falselyLabelled.Config.Labels[tinybirdLabel] = "true";
  assert.equal(safeWebContainer(falselyLabelled, falselyLabelled.Image, falselyLabelled.Config.Labels, closed.env), false);
});

test("owned replacement reconstructs prior independent modes and credentials, not the new config", () => {
  const configuration = config();
  for (const modes of [{ enableGithub: false, enableTinybird: false }, { enableGithub: true, enableTinybird: false }, { enableGithub: false, enableTinybird: true }, { enableGithub: true, enableTinybird: true }]) {
    const definition = consoleDefinition(configuration, { ...githubSource(), ...tinybirdSource() }, modes), metadata = consoleMetadata(configuration, definition, modes);
    const previousModes = consoleModesFromContainer(metadata);
    assert.deepEqual(previousModes, modes);
    const previousDefinition = consoleDefinition(configuration, containerEnvironment(metadata), previousModes);
    const previousLabels = consoleLabels(configuration, metadata.Image, previousDefinition, previousModes);
    assert.equal(safeWebContainer(metadata, metadata.Image, previousLabels, previousDefinition.env, previousModes), true);
    const altered = { ...metadata, Config: { ...metadata.Config, Labels: { ...metadata.Config.Labels, [previewConfigurationLabel]: "not-the-prior-config-fingerprint" } } };
    assert.equal(safeWebContainer(altered, metadata.Image, previousLabels, previousDefinition.env, previousModes), false);
    if (modes.enableTinybird) {
      const newDefinition = consoleDefinition(configuration, { ...githubSource(), ...tinybirdSource(), TINYBIRD_QUERY_TOKEN: "replacement-read-only-query-token" }, modes);
      assert.notEqual(consoleLabels(configuration, metadata.Image, newDefinition, modes)[previewConfigurationLabel], previousLabels[previewConfigurationLabel]);
      assert.equal(safeWebContainer(metadata, metadata.Image, consoleLabels(configuration, metadata.Image, newDefinition, modes), newDefinition.env, modes), false);
    }
  }
  const webCode = readFileSync(new URL("./self-hosted-preview-web.mjs", import.meta.url), "utf8");
  assert.match(webCode, /const previousModes = consoleModesFromContainer\(existing\)/);
  assert.match(webCode, /\(!existing && requiresWebEgress\)/);
  assert.ok(webCode.indexOf("safeMaintenanceGateway(maintenance") < webCode.indexOf('required(["stop", "--time", "10", existing.Id])'));
  const gatewayCode = readFileSync(new URL("./self-hosted-preview.mjs", import.meta.url), "utf8");
  assert.match(gatewayCode, /if \(options\.enableGithub \|\| options\.enableTinybird\)/);
});

test("owned console upgrades require the exact running maintenance config and never delete volumes", () => {
  const configuration = config(), directory = resolve("deploy/self-hosted/preview"), email = "owner@example.net", image = "sha256:pinned";
  const fingerprint = createHash("sha256").update(JSON.stringify({ mode: "maintenance", image, email, config: readFileSync(resolve(directory, "Caddyfile"), "utf8") })).digest("hex");
  const labels = { ...labelsFor(configuration), "com.outray.preview.managed": "true", "com.outray.preview.mode": "maintenance", "com.outray.preview.configuration": fingerprint };
  const metadata = { Image: image, State: { Status: "running" }, Config: { Labels: labels, Env: [`CADDY_EMAIL=${email}`], Cmd: ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"] }, HostConfig: { ReadonlyRootfs: true, NetworkMode: egressNetwork, CapDrop: ["ALL"], CapAdd: ["CAP_NET_BIND_SERVICE"], SecurityOpt: ["no-new-privileges:true"], PortBindings: { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "80" }], "443/tcp": [{ HostIp: "::", HostPort: "443" }] } }, NetworkSettings: { Networks: { [project]: {}, [egressNetwork]: {} } }, Mounts: [{ Type: "bind", Source: directory, Destination: "/etc/caddy", RW: false }, { Type: "volume", Name: "outray-ops-preview-caddy-data", Destination: "/data" }, { Type: "volume", Name: "outray-ops-preview-caddy-config", Destination: "/config" }] };
  assert.equal(safeMaintenanceGateway(metadata, image, labelsFor(configuration)), true);
  for (const changed of [{ State: { Status: "exited" } }, { Image: "sha256:other" }, { Config: { ...metadata.Config, Cmd: ["caddy", "run", "--config", "/etc/caddy/Caddyfile.proxy", "--adapter", "caddyfile"] } }, { Config: { ...metadata.Config, Labels: { ...labels, "com.outray.preview.mode": "proxy" } } }, { Config: { ...metadata.Config, Labels: { ...labels, "com.outray.preview.configuration": "wrong" } } }]) assert.equal(safeMaintenanceGateway({ ...metadata, ...changed }, image, labelsFor(configuration)), false);
  const code = readFileSync(new URL("./self-hosted-preview-web.mjs", import.meta.url), "utf8");
  assert.ok(code.indexOf("safeMaintenanceGateway(maintenance") < code.indexOf('required(["stop", "--time", "10", existing.Id])'));
  assert.ok(code.indexOf('options.image, "node", "-e", previewRuntimeAudit') < code.indexOf('required(["stop", "--time", "10", existing.Id])'));
  assert.match(code, /required\(\["rm", existing\.Id\]\)/);
  assert.ok(!code.includes('"--volumes"'));
});

test("gateway publishes only TCP80/443 and grants egress only to itself", () => {
  const args = gatewayArguments("maintenance", { owner: "public-label" }, "/source/preview");
  assert.equal(args[args.indexOf("--network") + 1], egressNetwork);
  assert.deepEqual(args.flatMap((value, index) => value === "--publish" ? [args[index + 1]] : []), ["80:80/tcp", "443:443/tcp"]);
  assert.deepEqual(args.flatMap((value, index) => value === "-e" ? [args[index + 1]] : []), ["CADDY_EMAIL"]);
  assert.equal(args[args.indexOf("--cap-drop") + 1], "ALL");
  assert.equal(args[args.indexOf("--cap-add") + 1], "NET_BIND_SERVICE");
  assert.ok(args.includes("--read-only"));
  assert.match(caddyImage, /^caddy:2\.11\.7-alpine@sha256:[a-f0-9]{64}$/);
  for (const forbidden of ["--privileged", "--publish-all", "--env-file", "--volumes-from", "--rm"]) assert.ok(!args.includes(forbidden));
  assert.throws(() => gatewayArguments("proxy", {}, "/unsafe,source"));
  const script = readFileSync(new URL("./self-hosted-preview.mjs", import.meta.url), "utf8");
  assert.match(script, /"--network", "none", "--read-only", "--cap-drop", "ALL", "--cap-add", "NET_BIND_SERVICE"/);
});

test("public web must be the labelled standalone image with closed policy and one private network", () => {
  const labels = { ...labelsFor(config()), "com.outray.console-preview": "true" };
  const env = environment();
  const metadata = { Image: "sha256:expected", Config: { User: "node", Cmd: ["node", "apps/web/.output/server/index.mjs"], Labels: labels, Env: Object.entries(env).map(([key, value]) => `${key}=${value}`) }, HostConfig: { ReadonlyRootfs: true, NetworkMode: project, PortBindings: {}, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"] }, NetworkSettings: { Networks: { [project]: {} } }, Mounts: [{ Type: "tmpfs" }] };
  assert.equal(safeWebContainer(metadata, "sha256:expected", labels, env), true);
  for (const change of [{ Image: "sha256:old" }, { NetworkSettings: { Networks: { [project]: {}, [egressNetwork]: {} } } }, { HostConfig: { ...metadata.HostConfig, PortBindings: { "6767/tcp": [{ HostPort: "6767" }] } } }, { Mounts: [{ Type: "bind" }] }, { Config: { ...metadata.Config, User: "root" } }]) assert.equal(safeWebContainer({ ...metadata, ...change }, "sha256:expected", labels, env), false);
  assert.equal(safeWebContainer(metadata, "sha256:expected", { ...labels, unrelated: "owner" }, env), false);
  assert.equal(safeWebContainer(metadata, "sha256:expected", labels, { ...env, DATABASE_URL: "postgresql://other/db" }), false);
});

test("gateway refuses unrelated ownership, extra ports/networks and writable source mounts", () => {
  const labels = { owner: "ours", "com.outray.preview.mode": "maintenance" }, directory = "/source/preview";
  const metadata = { Image: "sha256:pinned", Config: { Labels: labels, Cmd: ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"] }, HostConfig: { ReadonlyRootfs: true, NetworkMode: egressNetwork, CapDrop: ["ALL"], CapAdd: ["NET_BIND_SERVICE"], SecurityOpt: ["no-new-privileges:true"], PortBindings: { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "80" }], "443/tcp": [{ HostIp: "::", HostPort: "443" }] } }, NetworkSettings: { Networks: { [project]: {}, [egressNetwork]: {} } }, Mounts: [{ Type: "bind", Source: directory, Destination: "/etc/caddy", RW: false }, { Type: "volume", Name: "outray-ops-preview-caddy-data", Destination: "/data" }, { Type: "volume", Name: "outray-ops-preview-caddy-config", Destination: "/config" }] };
  assert.equal(safeGatewayContainer(metadata, "sha256:pinned", labels, directory), true);
  assert.equal(safeGatewayContainer({ ...metadata, HostConfig: { ...metadata.HostConfig, CapAdd: ["CAP_NET_BIND_SERVICE"] } }, "sha256:pinned", labels, directory), true);
  for (const grants of [["NET_BIND_SERVICE", "CAP_NET_BIND_SERVICE"], ["CAP_NET_ADMIN"], ["NET_BIND_SERVICE", "NET_ADMIN"], []]) assert.equal(safeGatewayContainer({ ...metadata, HostConfig: { ...metadata.HostConfig, CapAdd: grants } }, "sha256:pinned", labels, directory), false);
  assert.equal(safeGatewayContainer(metadata, "sha256:pinned", { ...labels, owner: "theirs" }, directory), false);
  for (const change of [{ Image: "sha256:other" }, { Config: { ...metadata.Config, Cmd: ["sh"] } }, { NetworkSettings: { Networks: { [project]: {}, [egressNetwork]: {}, other: {} } } }, { HostConfig: { ...metadata.HostConfig, PortBindings: { ...metadata.HostConfig.PortBindings, "2019/tcp": [{ HostPort: "2019" }] } } }, { Mounts: metadata.Mounts.map((mount) => ({ ...mount, RW: true })) }]) assert.equal(safeGatewayContainer({ ...metadata, ...change }, "sha256:pinned", labels, directory), false);
});

test("standalone image verifies all artifacts but copies only audited Nitro output into runtime", () => {
  const file = readFileSync(new URL("../deploy/self-hosted/Dockerfile.preview", import.meta.url), "utf8");
  const runtime = file.split(" AS runtime\n")[1];
  assert.match(file, /self-hosted-artifacts\.mjs verify/);
  assert.match(runtime, /LABEL com\.outray\.console-preview="true"/);
  assert.match(runtime, /USER node/);
  assert.match(runtime, /\.self-hosted-artifacts\/apps\/web\/\.output/);
  assert.equal((runtime.match(/^COPY /gm) || []).length, 2);
  assert.ok(!/npm ci|COPY.*\/app\/node_modules|COPY.*\/app\/packages|COPY \. /m.test(runtime));
  const ignore = readFileSync(new URL("../deploy/self-hosted/Dockerfile.preview.dockerignore", import.meta.url), "utf8");
  for (const rule of ["**/node_modules", "!.self-hosted-artifacts/**", "**/.env*", "**/*.pem", "**/*.key"]) assert.ok(ignore.includes(rule));
});

test("Caddy adaptation proves hostname restriction, rejection and no wildcard/on-demand TLS", (t) => {
  const version = spawnSync("caddy", ["version"], { encoding: "utf8" });
  if (version.error?.code === "ENOENT") return t.skip("Local Caddy unavailable; pinned image also validates at setup.");
  assert.equal(version.status, 0);
  for (const mode of ["maintenance", "proxy"]) {
    const file = resolve("deploy/self-hosted/preview", mode === "proxy" ? "Caddyfile.proxy" : "Caddyfile");
    const adapted = spawnSync("caddy", ["adapt", "--config", file, "--adapter", "caddyfile"], { encoding: "utf8", env: { PATH: process.env.PATH, CADDY_EMAIL: "owner@example.net" }, timeout: 10_000 });
    assert.equal(adapted.status, 0, adapted.stderr);
    const json = JSON.parse(adapted.stdout), text = JSON.stringify(json);
    assert.equal(json.admin.listen, "localhost:2019");
    const servers = Object.values(json.apps.http.servers);
    assert.deepEqual(servers.flatMap((server) => server.listen).sort(), [":443", ":80"].sort());
    for (const server of servers) { assert.equal(server.strict_sni_host, true); assert.deepEqual(server.protocols, ["h1", "h2"]); assert.ok(JSON.stringify(server.routes).includes('"status_code":421')); }
    assert.ok(!/on_demand|fallback_sni|default_sni|\*\.outray|internal-check/.test(text));
    const tlsServer = servers.find((server) => server.listen.includes(":443"));
    assert.deepEqual(tlsServer.routes[0].match, [{ host: ["ops.outray.dev"] }]);
    if (mode === "maintenance") { assert.ok(!text.includes('"reverse_proxy"')); assert.ok(text.includes('"status_code":503')); }
    else assert.ok(text.includes('"dial":"outray-ops-public-web:6767"'));
  }
});
