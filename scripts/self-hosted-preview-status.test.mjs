import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { parseEnv } from "node:util";
import { initialEnvironment } from "./self-hosted.mjs";
import { configurationFrom, labelsFor, project } from "./self-hosted-rehearsal.mjs";
import { gatewayArguments, egressNetwork, previewOptions, publicStatus, statusCheck, safeGatewayContainer, safePrivateStatusContainer, statusPreviewLabel } from "./self-hosted-preview.mjs";
import { gatewayConfigurationFingerprint, gatewayStatusLabel, gatewayTemplate, safeMaintenanceGateway } from "./self-hosted-preview-web.mjs";

const directory = resolve("deploy/self-hosted/preview");
const configuration = () => configurationFrom(parseEnv(initialEnvironment("ops.outray.dev", "owner@example.net")));
const digest = (value) => createHash("sha256").update(value).digest("hex");

function gatewayMetadata(config, mode, enableStatus) {
  const email = "owner@example.net", image = "sha256:pinned", secret = config.STATUS_EDGE_SECRET;
  const labels = { ...labelsFor(config), "com.outray.preview.managed": "true", "com.outray.preview.mode": mode,
    ...(enableStatus ? { [gatewayStatusLabel]: "true" } : {}),
    "com.outray.preview.configuration": gatewayConfigurationFingerprint(mode, image, email, enableStatus, secret, directory) };
  return { Image: image, State: { Status: "running" },
    Config: { Labels: labels, Env: [`CADDY_EMAIL=${email}`, ...(enableStatus ? [`STATUS_EDGE_SECRET=${secret}`] : [])], Cmd: ["caddy", "run", "--config", `/etc/caddy/${gatewayTemplate(mode, enableStatus)}`, "--adapter", "caddyfile"] },
    HostConfig: { ReadonlyRootfs: true, NetworkMode: egressNetwork, CapDrop: ["ALL"], CapAdd: ["NET_BIND_SERVICE"], SecurityOpt: ["no-new-privileges:true"], PortBindings: { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "80" }], "443/tcp": [{ HostIp: "::", HostPort: "443" }] } },
    NetworkSettings: { Networks: { [project]: {}, [egressNetwork]: {} } },
    Mounts: [{ Type: "bind", Source: directory, Destination: "/etc/caddy", RW: false }, { Type: "volume", Name: "outray-ops-preview-caddy-data", Destination: "/data" }, { Type: "volume", Name: "outray-ops-preview-caddy-config", Destination: "/config" }] };
}

test("public status is an explicit independent opt-in and remains available in maintenance", () => {
  const base = ["--file", "fresh-private.env", "--email", "owner@example.net"];
  assert.equal(previewOptions(base).enableStatus, false);
  assert.equal(previewOptions([...base, "--enable-status"]).enableStatus, true);
  assert.equal(previewOptions([...base, "--enable-status"]).enableProxy, false);
  const proxy = previewOptions([...base, "--enable-status", "--enable-proxy", "--image", "patched:local", "--enable-github", "--enable-tinybird"]);
  assert.equal(proxy.enableStatus, true);
  assert.equal(proxy.enableGithub, true);
  assert.equal(proxy.enableTinybird, true);
  assert.throws(() => previewOptions([...base, "--enable-status", "--enable-status"]));
  assert.equal(gatewayTemplate("maintenance", true), "Caddyfile.status-maintenance");
  assert.equal(gatewayTemplate("proxy", true), "Caddyfile.status");
  assert.throws(() => gatewayTemplate("unknown", true));
});

test("historical gateway fingerprints are retained and status labels contain only credential digests", () => {
  const config = configuration(), image = "sha256:pinned", email = "owner@example.net";
  for (const mode of ["maintenance", "proxy"]) {
    const expected = digest(JSON.stringify({ mode, image, email, config: readFileSync(resolve(directory, gatewayTemplate(mode)), "utf8") }));
    assert.equal(gatewayConfigurationFingerprint(mode, image, email), expected);
    const status = gatewayConfigurationFingerprint(mode, image, email, true, config.STATUS_EDGE_SECRET);
    assert.notEqual(status, expected);
    assert.notEqual(status, gatewayConfigurationFingerprint(mode, image, email, true, "f".repeat(64)));
    assert.throws(() => gatewayConfigurationFingerprint(mode, image, email, true, ""));
    const metadata = gatewayMetadata(config, mode, true);
    assert.ok(!JSON.stringify(metadata.Config.Labels).includes(config.STATUS_EDGE_SECRET));
    const args = gatewayArguments(mode, metadata.Config.Labels, directory);
    assert.deepEqual(args.flatMap((value, index) => value === "-e" ? [args[index + 1]] : []), ["CADDY_EMAIL", "STATUS_EDGE_SECRET"]);
    assert.ok(!args.join(" ").includes(config.STATUS_EDGE_SECRET));
    assert.deepEqual(args.flatMap((value, index) => value === "--publish" ? [args[index + 1]] : []), ["80:80/tcp", "443:443/tcp"]);
    assert.ok(args.includes(`/etc/caddy/${gatewayTemplate(mode, true)}`));
  }
});

test("status gateway reuse requires actual mode, exact independent secret and safe isolation", () => {
  const config = configuration();
  for (const mode of ["maintenance", "proxy"]) {
    const metadata = gatewayMetadata(config, mode, true), labels = metadata.Config.Labels;
    assert.equal(safeGatewayContainer(metadata, metadata.Image, labels, directory), true);
    assert.equal(safeGatewayContainer(metadata, metadata.Image, { ...labels, [gatewayStatusLabel]: undefined }, directory), false);
    for (const change of [
      { Config: { ...metadata.Config, Env: ["CADDY_EMAIL=owner@example.net", `STATUS_EDGE_SECRET=${"f".repeat(64)}`] } },
      { Config: { ...metadata.Config, Cmd: ["caddy", "run", "--config", "/etc/caddy/Caddyfile.proxy", "--adapter", "caddyfile"] } },
      { Config: { ...metadata.Config, Labels: { ...labels, [gatewayStatusLabel]: "false" } } },
      { HostConfig: { ...metadata.HostConfig, PortBindings: { ...metadata.HostConfig.PortBindings, "4323/tcp": [{ HostPort: "4323" }] } } },
      { NetworkSettings: { Networks: { [project]: {}, [egressNetwork]: {}, additional: {} } } },
    ]) assert.equal(safeGatewayContainer({ ...metadata, ...change }, metadata.Image, labels, directory), false);
  }
  const maintenance = gatewayMetadata(config, "maintenance", true);
  assert.equal(safeMaintenanceGateway(maintenance, maintenance.Image, labelsFor(config), directory), true);
  const mismatch = { ...maintenance, Config: { ...maintenance.Config, Env: ["CADDY_EMAIL=owner@example.net", `STATUS_EDGE_SECRET=${"f".repeat(64)}`] } };
  assert.equal(safeMaintenanceGateway(mismatch, mismatch.Image, labelsFor(config), directory), false);
  const old = gatewayMetadata(config, "maintenance", false);
  assert.equal(safeMaintenanceGateway(old, old.Image, labelsFor(config), directory), true);
});

test("public status services must be healthy owned non-root read-only and private", () => {
  const config = configuration(), rehearsalLabels = labelsFor(config);
  for (const name of [publicStatus, statusCheck]) {
    const metadata = { Name: `/${name}`, State: { Status: "running", Health: { Status: "healthy" } },
      Config: { User: "node", Labels: { ...rehearsalLabels, [statusPreviewLabel]: "true" },
        Env: [`STATUS_EDGE_SECRET=${config.STATUS_EDGE_SECRET}`, name === publicStatus ? "PORT=4323" : "INTERNAL_CHECK_PORT=3344"],
        Cmd: ["node", name === publicStatus ? "apps/status/dist/server/entry.mjs" : "apps/internal-check/dist/index.js"] },
      HostConfig: { ReadonlyRootfs: true, NetworkMode: project, PortBindings: {}, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"] }, NetworkSettings: { Networks: { [project]: {} } }, Mounts: [{ Type: "tmpfs" }] };
    assert.equal(safePrivateStatusContainer(metadata, name, rehearsalLabels, config.STATUS_EDGE_SECRET), true);
    assert.equal(safePrivateStatusContainer(metadata, name, rehearsalLabels, "f".repeat(64)), false);
    for (const change of [
      { Name: "/some-unrelated-service" }, { State: { Status: "running", Health: { Status: "unhealthy" } } },
      { Config: { ...metadata.Config, User: "root" } }, { Config: { ...metadata.Config, Labels: rehearsalLabels } },
      { HostConfig: { ...metadata.HostConfig, ReadonlyRootfs: false } },
      { HostConfig: { ...metadata.HostConfig, PortBindings: { "4323/tcp": [{ HostPort: "4323" }] } } },
      { NetworkSettings: { Networks: { [project]: {}, outbound: {} } } }, { Mounts: [{ Type: "bind" }] },
    ]) assert.equal(safePrivateStatusContainer({ ...metadata, ...change }, name, rehearsalLabels, config.STATUS_EDGE_SECRET), false);
  }
});

test("gateway upgrade validates the prior mode and refuses silent status removal before mutation", () => {
  const source = readFileSync(new URL("./self-hosted-preview.mjs", import.meta.url), "utf8");
  assert.match(source, /previousStatus && !options\.enableStatus/);
  assert.match(source, /gatewayLabels\(previousMode, previousStatus, previousValues\)/);
  assert.ok(source.indexOf("previousStatus && !options.enableStatus") < source.indexOf('["stop", "--time", "10", existing.Id]'));
  assert.ok(source.indexOf("safePrivateStatusContainer(await inspect") < source.indexOf('["stop", "--time", "10", existing.Id]'));
  assert.match(source, /\["rm", existing\.Id\]/);
  assert.ok(!source.includes('"--volumes"'));
});

test("Caddy status templates adapt without secrets and expose only status and the existing console", (t) => {
  const version = spawnSync("caddy", ["version"], { encoding: "utf8" });
  if (version.error?.code === "ENOENT") return t.skip("Local Caddy unavailable; the pinned image validates at setup.");
  assert.equal(version.status, 0);
  for (const mode of ["maintenance", "proxy"]) {
    const secret = "c".repeat(64), file = resolve(directory, gatewayTemplate(mode, true));
    const adapted = spawnSync("caddy", ["adapt", "--config", file, "--adapter", "caddyfile"], { encoding: "utf8", env: { PATH: process.env.PATH, CADDY_EMAIL: "owner@example.net", STATUS_EDGE_SECRET: secret }, timeout: 10_000 });
    assert.equal(adapted.status, 0, adapted.stderr);
    const json = JSON.parse(adapted.stdout), text = JSON.stringify(json), source = readFileSync(file, "utf8");
    assert.ok(!text.includes(secret));
    assert.ok(!source.includes("{$STATUS_EDGE_SECRET}"));
    assert.ok(text.includes("{env.STATUS_EDGE_SECRET}"));
    assert.equal(json.admin.listen, "localhost:2019");
    assert.equal(json.apps.tls.automation.on_demand.permission.endpoint, "http://outray-ops-status-check:3344/internal/status-domain-check");
    assert.equal(json.apps.tls.automation.policies.at(-1).on_demand, true);
    const servers = Object.values(json.apps.http.servers);
    assert.deepEqual(servers.flatMap((server) => server.listen).sort(), [":443", ":80"].sort());
    for (const server of servers) { assert.equal(server.strict_sni_host, true); assert.deepEqual(server.protocols, ["h1", "h2"]); }
    assert.ok(!/fallback_sni|default_sni|outray-ops-rehearsal-tunnel|outray-ops-rehearsal-ingest|outray-ops-rehearsal-secrets-share|\/internal\/domain-check/.test(text));
    const secure = servers.find((server) => server.listen.includes(":443"));
    const statusRoutes = secure.routes.filter((route) => !route.match || route.match[0].host.includes("status.ops.outray.dev"));
    assert.equal(statusRoutes.length, 2);
    for (const route of statusRoutes) {
      const handlers = route.handle[0].routes.flatMap((item) => item.handle);
      const proxy = handlers.find((handler) => handler.handler === "reverse_proxy");
      assert.deepEqual(proxy.upstreams, [{ dial: "outray-ops-public-status:4323" }]);
      assert.equal(proxy.headers.request.set["X-Outray-Edge-Secret"][0], "{env.STATUS_EDGE_SECRET}");
      assert.equal(proxy.headers.request.set["X-Outray-Client-Ip"][0], "{http.request.remote.host}");
      assert.ok(!proxy.headers.request.delete.includes("X-Outray-*"), "Caddy deletes after setting; do not delete trusted replacements");
      assert.ok(handlers.some((handler) => handler.handler === "headers" && handler.request.delete.includes("X-Outray-*")));
      assert.ok(route.handle[0].routes.some((item) => item.match?.[0]?.path?.includes("/health") && item.handle[0].status_code === 404));
    }
    const http = servers.find((server) => server.listen.includes(":80")), httpText = JSON.stringify(http.routes);
    assert.ok(httpText.indexOf("/internal/status-domain-check?domain=") < httpText.indexOf("https://{http.request.host}"), "Authorize a custom hostname before its redirect");
    if (mode === "maintenance") { assert.ok(!text.includes("outray-ops-public-web:6767")); assert.ok(text.includes('"status_code":503')); }
    else assert.ok(text.includes("outray-ops-public-web:6767"));
  }
});

test("isolated Caddy routing rejects unknown redirects, blocks internals and replaces spoofed headers", { timeout: 30_000 }, async (t) => {
  const version = spawnSync("caddy", ["version"], { encoding: "utf8" });
  if (version.error?.code === "ENOENT") return t.skip("Local Caddy unavailable; live pinned-image checks are still required.");
  const adapted = spawnSync("caddy", ["adapt", "--config", resolve(directory, "Caddyfile.status-maintenance"), "--adapter", "caddyfile"], { encoding: "utf8", env: { PATH: process.env.PATH, CADDY_EMAIL: "owner@example.net" } });
  assert.equal(adapted.status, 0, adapted.stderr);
  const syntheticSecret = "synthetic-status-edge-secret-only-for-test", received = [];
  const upstream = createServer((request, response) => {
    const url = new URL(request.url, "http://internal.test");
    if (url.pathname === "/internal/status-domain-check") {
      response.writeHead(["status.ops.outray.dev", "published.status.ops.outray.dev"].includes(url.searchParams.get("domain")) ? 200 : 403);
      response.end("Status hostname check");
      return;
    }
    received.push({ host: request.headers.host, headers: request.headers, url: request.url });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ host: request.headers.host, headers: request.headers }));
  });
  await new Promise((complete) => upstream.listen(0, "127.0.0.1", complete));
  t.after(async () => { upstream.closeAllConnections(); await new Promise((complete) => upstream.close(complete)); });
  const upstreamPort = upstream.address().port;
  const freePort = async () => {
    const holder = createServer();
    await new Promise((complete) => holder.listen(0, "127.0.0.1", complete));
    const port = holder.address().port;
    await new Promise((complete) => holder.close(complete));
    return port;
  };
  const clearPort = await freePort(), secureRoutePort = await freePort(), json = JSON.parse(adapted.stdout);
  // Test the actual adapted handler chain on ephemeral loopback HTTP listeners,
  // not public ports/certificates. Deployment verifies real SNI and ACME separately.
  json.admin = { disabled: true };
  delete json.apps.tls;
  for (const server of Object.values(json.apps.http.servers)) {
    const isClear = server.listen.includes(":80");
    server.listen = [`127.0.0.1:${isClear ? clearPort : secureRoutePort}`];
    server.automatic_https = { disable: true };
    server.protocols = ["h1"];
  }
  const replaceUpstreams = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.dial === "string" && /^outray-ops-(public-status|status-check):/.test(value.dial)) value.dial = `127.0.0.1:${upstreamPort}`;
    for (const child of Object.values(value)) replaceUpstreams(child);
  };
  replaceUpstreams(json);
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "outray-status-gateway-test-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const child = spawn("caddy", ["run", "--config", "-"], { cwd: temporaryDirectory, env: { PATH: process.env.PATH, STATUS_EDGE_SECRET: syntheticSecret, XDG_CONFIG_HOME: temporaryDirectory, XDG_DATA_HOME: temporaryDirectory }, stdio: ["pipe", "ignore", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (data) => { diagnostics += data; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill("SIGTERM"); await new Promise((complete) => child.once("close", complete)); }
    assert.ok(!diagnostics.includes(syntheticSecret), "The runtime credential must not appear in Caddy diagnostics");
  });
  child.stdin.end(JSON.stringify(json));
  const request = (port, host, path = "/", headers = {}) => new Promise((complete, reject) => {
    const operation = httpRequest({ hostname: "127.0.0.1", port, path, headers: { Host: host, ...headers } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (data) => { body += data; });
      response.on("end", () => complete({ status: response.statusCode, headers: { get: (name) => response.headers[name.toLowerCase()] }, json: async () => JSON.parse(body) }));
    });
    operation.on("error", reject);
    operation.end();
  });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await request(clearPort, "unknown.example.net")).status === 403) { ready = true; break; } } catch { /* Fresh private listener may not yet be ready. */ }
    if (child.exitCode !== null) break;
    await delay(100);
  }
  assert.equal(ready, true, diagnostics);
  assert.equal((await request(clearPort, "unknown.example.net")).status, 403);
  const redirect = await request(clearPort, "published.status.ops.outray.dev", "/reports/example?q=1");
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "https://published.status.ops.outray.dev/reports/example?q=1");
  const consoleRedirect = await request(clearPort, "ops.outray.dev", "/login");
  assert.equal(consoleRedirect.status, 308);
  assert.equal(consoleRedirect.headers.get("location"), "https://ops.outray.dev/login");
  assert.equal((await request(secureRoutePort, "ops.outray.dev")).status, 503);
  for (const path of ["/health", "/health/deep", "/internal/status-domain-check", "/api/health", "/metrics", "/_image", "/_image?href=https%3A%2F%2Fexample.net%2Fimage.png", "/_image/example"]) {
    assert.equal((await request(secureRoutePort, "published.status.ops.outray.dev", path)).status, 404);
  }
  assert.equal(received.length, 0);
  const response = await request(secureRoutePort, "published.status.ops.outray.dev", "/reports/example", {
    "X-Outray-Edge-Secret": "spoofed", "X-Outray-Client-IP": "198.51.100.50", "X-Outray-Other": "spoofed",
    "X-Forwarded-For": "198.51.100.50", "X-Forwarded-Host": "spoofed.example.net", "X-Forwarded-Proto": "http", "X-Real-IP": "198.51.100.50",
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.host, "published.status.ops.outray.dev");
  assert.equal(result.headers["x-outray-edge-secret"], syntheticSecret);
  assert.equal(result.headers["x-outray-client-ip"], "127.0.0.1");
  for (const name of ["x-outray-other", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip"]) assert.equal(result.headers[name], undefined);
});
