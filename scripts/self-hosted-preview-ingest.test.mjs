import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { initialEnvironment } from "./self-hosted.mjs";
import { configurationFrom, labelsFor, project } from "./self-hosted-rehearsal.mjs";
import { gatewayArguments, egressNetwork, previewOptions, safeGatewayContainer } from "./self-hosted-preview.mjs";
import { gatewayConfigurationFingerprint, gatewayStatusLabel, gatewayIngestLabel, gatewayTemplate, safeMaintenanceGateway } from "./self-hosted-preview-web.mjs";

const directory = resolve("deploy/self-hosted/preview"), image = "sha256:pinned", email = "owner@example.net";
const configuration = () => configurationFrom(parseEnv(initialEnvironment("ops.outray.dev", email)));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const otlpPaths = ["/v1/traces", "/v1/logs", "/v1/metrics", "/api/otlp/v1/traces", "/api/otlp/v1/logs", "/api/otlp/v1/metrics"];

function metadata(config, mode) {
  const labels = { ...labelsFor(config), "com.outray.preview.managed": "true", "com.outray.preview.mode": mode,
    [gatewayStatusLabel]: "true", [gatewayIngestLabel]: "true",
    "com.outray.preview.configuration": gatewayConfigurationFingerprint(mode, image, email, true, config.STATUS_EDGE_SECRET, directory, true) };
  return { Image: image, State: { Status: "running" }, Config: { Labels: labels, Env: [`CADDY_EMAIL=${email}`, `STATUS_EDGE_SECRET=${config.STATUS_EDGE_SECRET}`],
    Cmd: ["caddy", "run", "--config", `/etc/caddy/${gatewayTemplate(mode, true, true)}`, "--adapter", "caddyfile"] },
    HostConfig: { ReadonlyRootfs: true, NetworkMode: egressNetwork, CapDrop: ["ALL"], CapAdd: ["NET_BIND_SERVICE"], SecurityOpt: ["no-new-privileges:true"],
      PortBindings: { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "80" }], "443/tcp": [{ HostIp: "::", HostPort: "443" }] } },
    NetworkSettings: { Networks: { [project]: {}, [egressNetwork]: {} } },
    Mounts: [{ Type: "bind", Source: directory, Destination: "/etc/caddy", RW: false },
      { Type: "volume", Name: "outray-ops-preview-caddy-data", Destination: "/data" }, { Type: "volume", Name: "outray-ops-preview-caddy-config", Destination: "/config" }] };
}

function adaptedFor(mode, t) {
  const version = spawnSync("caddy", ["version"], { encoding: "utf8" });
  if (version.error?.code === "ENOENT") { t.skip("Local Caddy unavailable; deployment still validates with the pinned image."); return null; }
  assert.equal(version.status, 0);
  const result = spawnSync("caddy", ["adapt", "--config", resolve(directory, gatewayTemplate(mode, true, true)), "--adapter", "caddyfile"], {
    encoding: "utf8", env: { PATH: process.env.PATH, CADDY_EMAIL: email }, timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("ingestion requires an explicit unique opt-in and retains status in both maintenance and proxy modes", () => {
  const args = ["--file", "fresh-private.env", "--email", email];
  assert.equal(previewOptions(args).enableIngest, false);
  assert.equal(previewOptions([...args, "--enable-status", "--enable-ingest"]).enableIngest, true);
  assert.equal(previewOptions([...args, "--enable-status", "--enable-ingest"]).enableProxy, false);
  assert.equal(previewOptions([...args, "--enable-status", "--enable-ingest", "--enable-proxy", "--image", "patched:local"]).enableIngest, true);
  assert.throws(() => previewOptions([...args, "--enable-ingest"]));
  assert.throws(() => previewOptions([...args, "--enable-status", "--enable-ingest", "--enable-ingest"]));
  assert.equal(gatewayTemplate("maintenance", true, true), "Caddyfile.status-ingest-maintenance");
  assert.equal(gatewayTemplate("proxy", true, true), "Caddyfile.status-ingest");
  assert.throws(() => gatewayTemplate("proxy", false, true));
});

test("all historical fingerprints remain byte-compatible; ingestion includes its common imported configuration", () => {
  const config = configuration();
  for (const mode of ["maintenance", "proxy"]) {
    for (const enableStatus of [false, true]) {
      const shape = { mode, image, email, config: readFileSync(resolve(directory, gatewayTemplate(mode, enableStatus)), "utf8"),
        ...(enableStatus ? { statusEdgeSecretDigest: digest(config.STATUS_EDGE_SECRET) } : {}) };
      assert.equal(gatewayConfigurationFingerprint(mode, image, email, enableStatus, config.STATUS_EDGE_SECRET), digest(JSON.stringify(shape)));
    }
    const current = gatewayConfigurationFingerprint(mode, image, email, true, config.STATUS_EDGE_SECRET, directory, true);
    const temporary = mkdtempSync(resolve(tmpdir(), "outray-ingest-fingerprint-test-"));
    try {
      const wrapper = gatewayTemplate(mode, true, true), common = "Caddyfile.status-ingest-common";
      writeFileSync(resolve(temporary, wrapper), readFileSync(resolve(directory, wrapper), "utf8"));
      writeFileSync(resolve(temporary, common), readFileSync(resolve(directory, common), "utf8"));
      assert.equal(gatewayConfigurationFingerprint(mode, image, email, true, config.STATUS_EDGE_SECRET, temporary, true), current);
      writeFileSync(resolve(temporary, common), readFileSync(resolve(directory, common), "utf8") + "\n# Changed imported policy\n");
      assert.notEqual(gatewayConfigurationFingerprint(mode, image, email, true, config.STATUS_EDGE_SECRET, temporary, true), current);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
});

test("ingestion gateway construction exposes only TCP80/443 and named status credential, never raw values", () => {
  const config = configuration();
  for (const mode of ["maintenance", "proxy"]) {
    const value = metadata(config, mode), args = gatewayArguments(mode, value.Config.Labels, directory);
    assert.ok(args.includes(`/etc/caddy/${gatewayTemplate(mode, true, true)}`));
    assert.deepEqual(args.flatMap((value, index) => value === "--publish" ? [args[index + 1]] : []), ["80:80/tcp", "443:443/tcp"]);
    assert.deepEqual(args.flatMap((value, index) => value === "-e" ? [args[index + 1]] : []), ["CADDY_EMAIL", "STATUS_EDGE_SECRET"]);
    assert.ok(!args.join(" ").includes(config.STATUS_EDGE_SECRET));
    assert.ok(!JSON.stringify(value.Config.Labels).includes(config.STATUS_EDGE_SECRET));
    assert.equal(safeGatewayContainer(value, image, value.Config.Labels, directory), true);
  }
});

test("maintenance reuse retains ingestion and rejects foreign mode labels, command, mounts, ports and privileges", () => {
  const config = configuration();
  for (const mode of ["maintenance", "proxy"]) {
    const original = metadata(config, mode);
    if (mode === "maintenance") assert.equal(safeMaintenanceGateway(original, image, labelsFor(config), directory), true);
    for (const change of [
      (v) => v.Config.Labels[gatewayIngestLabel] = "false",
      (v) => delete v.Config.Labels[gatewayStatusLabel],
      (v) => v.Config.Labels["com.outray.preview.configuration"] = "wrong",
      (v) => v.Config.Cmd[3] = "/etc/caddy/Caddyfile.status",
      (v) => v.Config.Env[1] = `STATUS_EDGE_SECRET=${"f".repeat(64)}`,
      (v) => v.HostConfig.PortBindings["4318/tcp"] = [{ HostIp: "0.0.0.0", HostPort: "4318" }],
      (v) => v.HostConfig.PortBindings["443/tcp"][0].HostPort = "8443",
      (v) => v.HostConfig.PortBindings["443/tcp"][0].HostIp = "198.51.100.4",
      (v) => v.HostConfig.CapAdd.push("NET_ADMIN"),
      (v) => v.HostConfig.ReadonlyRootfs = false,
      (v) => v.Mounts[0].RW = true,
      (v) => v.NetworkSettings.Networks.foreign = {},
    ]) {
      const changed = structuredClone(original); change(changed);
      assert.equal(safeGatewayContainer(changed, image, original.Config.Labels, directory), false);
      if (mode === "maintenance") assert.equal(safeMaintenanceGateway(changed, image, labelsFor(config), directory), false);
    }
  }
});

test("gateway verifies healthy ingest before mutation and refuses silent ingestion removal during maintenance", () => {
  const source = readFileSync(new URL("./self-hosted-preview.mjs", import.meta.url), "utf8");
  const stop = source.indexOf('["stop", "--time", "10", existing.Id]');
  assert.ok(source.indexOf("safeIngestContainer(existingIngest") < stop);
  assert.ok(source.indexOf('"-e", ingestHealthScript]') < stop);
  assert.ok(source.indexOf("previousIngest && !options.enableIngest") < stop);
  assert.match(source, /gatewayLabels\(previousMode, previousStatus, previousValues, previousIngest\)/);
  assert.ok(!source.includes('"--volumes"'));
});

test("actual Caddy adaptation imports globals correctly, retains status TLS and confines ingestion paths", (t) => {
  for (const mode of ["maintenance", "proxy"]) {
    const json = adaptedFor(mode, t); if (!json) return;
    const text = JSON.stringify(json), servers = Object.values(json.apps.http.servers);
    assert.equal(json.admin.listen, "localhost:2019");
    assert.equal(json.apps.tls.automation.on_demand.permission.endpoint, "http://outray-ops-status-check:3344/internal/status-domain-check");
    assert.deepEqual(servers.flatMap((value) => value.listen).sort(), [":80", ":443"].sort());
    for (const server of servers) { assert.equal(server.strict_sni_host, true); assert.deepEqual(server.protocols, ["h1", "h2"]); }
    const secure = servers.find((value) => value.listen.includes(":443"));
    const ingest = secure.routes.find((route) => route.match?.some((match) => match.host?.includes("ingest.ops.outray.dev")));
    assert.ok(ingest);
    const routes = ingest.handle[0].routes;
    const otlp = routes.find((route) => route.match?.some((match) => match.method?.includes("POST")));
    assert.deepEqual(otlp.match[0].path.sort(), [...otlpPaths].sort());
    const handlers = otlp.handle[0].routes[0].handle, proxy = handlers.find((value) => value.handler === "reverse_proxy");
    assert.ok(handlers.some((value) => value.handler === "request_body" && value.max_size > 0 && value.max_size <= 8388608));
    assert.deepEqual(proxy.upstreams, [{ dial: "outray-ops-public-ingest:4318" }]);
    assert.ok(!JSON.stringify(proxy.headers).includes("Authorization"));
    const health = routes.find((route) => route.match?.some((match) => match.method?.includes("GET")));
    assert.deepEqual(health.match[0].path, ["/health"]);
    assert.ok(JSON.stringify(routes).includes('"status_code":404'));
    assert.ok(text.includes("{env.STATUS_EDGE_SECRET}"));
    assert.ok(!/fallback_sni|default_sni|outray-ops-rehearsal-tunnel|outray-ops-rehearsal-ingest/.test(text));
    if (mode === "maintenance") { assert.ok(!text.includes("outray-ops-public-web:6767")); assert.ok(text.includes('"status_code":503')); }
    else assert.ok(text.includes("outray-ops-public-web:6767"));
  }
});

test("real isolated Caddy routes exact OTLP POST and health, preserves bearer and retains ingestion during console maintenance", { timeout: 30000 }, async (t) => {
  const json = adaptedFor("maintenance", t); if (!json) return;
  const received = [], bearer = "Bearer synthetic-ingestion-token-for-routing-test", edge = "synthetic-status-secret-for-routing-test";
  const upstream = createServer((request, response) => {
    let body = ""; request.setEncoding("utf8"); request.on("data", (data) => { body += data; });
    request.on("end", () => {
      const url = new URL(request.url, "http://upstream.test");
      if (url.pathname === "/internal/status-domain-check") { response.writeHead(url.searchParams.get("domain") === "published.status.ops.outray.dev" ? 200 : 403); response.end(); return; }
      received.push({ method: request.method, url: request.url, headers: request.headers, body });
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((complete) => upstream.listen(0, "127.0.0.1", complete));
  t.after(async () => { upstream.closeAllConnections(); await new Promise((complete) => upstream.close(complete)); });
  const upstreamPort = upstream.address().port;
  const freePort = async () => { const holder = createServer(); await new Promise((complete) => holder.listen(0, "127.0.0.1", complete)); const port = holder.address().port; await new Promise((complete) => holder.close(complete)); return port; };
  const clearPort = await freePort(), securePort = await freePort();
  json.admin = { disabled: true }; delete json.apps.tls;
  for (const server of Object.values(json.apps.http.servers)) {
    server.listen = [`127.0.0.1:${server.listen.includes(":80") ? clearPort : securePort}`];
    server.automatic_https = { disable: true }; server.protocols = ["h1"];
  }
  const replace = (value) => { if (!value || typeof value !== "object") return; if (typeof value.dial === "string" && /^outray-ops-(public-ingest|public-status|status-check):/.test(value.dial)) value.dial = `127.0.0.1:${upstreamPort}`; for (const child of Object.values(value)) replace(child); };
  replace(json);
  const temporary = mkdtempSync(resolve(tmpdir(), "outray-ingest-gateway-test-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const child = spawn("caddy", ["run", "--config", "-"], { cwd: temporary,
    env: { PATH: process.env.PATH, STATUS_EDGE_SECRET: edge, XDG_CONFIG_HOME: temporary, XDG_DATA_HOME: temporary }, stdio: ["pipe", "ignore", "pipe"] });
  let diagnostics = ""; child.stderr.on("data", (data) => { diagnostics += data; });
  t.after(async () => { if (child.exitCode === null) { child.kill("SIGTERM"); await new Promise((complete) => child.once("close", complete)); } assert.ok(!diagnostics.includes(edge) && !diagnostics.includes(bearer)); });
  child.stdin.end(JSON.stringify(json));
  const request = (port, host, path = "/", method = "GET", headers = {}, body = "") => new Promise((complete, reject) => {
    const operation = httpRequest({ hostname: "127.0.0.1", port, path, method, headers: { Host: host, ...headers }, timeout: 3000 }, (response) => {
      response.resume(); response.on("end", () => complete({ status: response.statusCode, headers: response.headers }));
    });
    operation.on("error", reject); operation.on("timeout", () => operation.destroy(new Error("Request deadline"))); operation.end(body);
  });
  let ready = false;
  for (let i = 0; i < 50; i++) { try { if ((await request(securePort, "ingest.ops.outray.dev", "/missing")).status === 404) { ready = true; break; } } catch {} if (child.exitCode !== null) break; await delay(100); }
  assert.equal(ready, true, diagnostics);
  assert.equal((await request(securePort, "ops.outray.dev")).status, 503);
  for (const path of otlpPaths) {
    const response = await request(securePort, "ingest.ops.outray.dev", path, "POST", { Authorization: bearer, "Content-Type": "application/json", "X-Outray-Edge-Secret": "spoofed", "X-Outray-Client-IP": "198.51.100.4", "X-Forwarded-For": "198.51.100.4", "X-Real-IP": "198.51.100.4" }, '{"resourceSpans":[]}');
    assert.equal(response.status, 200);
    const item = received.at(-1); assert.equal(item.url, path); assert.equal(item.method, "POST"); assert.equal(item.headers.authorization, bearer); assert.equal(item.body, '{"resourceSpans":[]}');
    for (const name of ["x-outray-edge-secret", "x-outray-client-ip", "x-forwarded-for", "x-real-ip"]) assert.equal(item.headers[name], undefined);
  }
  assert.equal((await request(securePort, "ingest.ops.outray.dev", "/health")).status, 200);
  const expectedCount = received.length;
  for (const [method, path] of [["POST", "/health"], ["GET", "/health/deep"], ["GET", "/api/health"], ["GET", "/internal"], ["GET", "/metrics"], ["POST", "/v1/traces/"], ["POST", "/v1/traces/anything"], ["OPTIONS", "/v1/traces"], ...otlpPaths.map((path) => ["GET", path])])
    assert.equal((await request(securePort, "ingest.ops.outray.dev", path, method)).status, 404, `${method} ${path}`);
  assert.equal(received.length, expectedCount, "404s must not reach the worker");
  const redirect = await request(clearPort, "ingest.ops.outray.dev", "/v1/traces?q=1", "POST");
  assert.equal(redirect.status, 308); assert.equal(redirect.headers.location, "https://ingest.ops.outray.dev/v1/traces?q=1");
  assert.equal((await request(clearPort, "unknown.example.net")).status, 403);
  assert.equal((await request(securePort, "published.status.ops.outray.dev", "/health")).status, 404);
  assert.equal((await request(securePort, "published.status.ops.outray.dev", "/reports")).status, 200);
  assert.equal(received.at(-1).headers["x-outray-edge-secret"], edge);
});
