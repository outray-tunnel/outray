import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { after, test } from "node:test";

const servers: Server[] = [];
after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return address.port;
}

test("status routing validates hosts and replaces forged edge credentials", async () => {
  const rendererPort = await listen(createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      host: request.headers.host,
      secret: request.headers["x-outray-edge-secret"],
      clientIp: request.headers["x-outray-client-ip"],
      path: request.url,
    }));
  }));
  process.env.UPTIME_ENABLED = "true";
  process.env.STATUS_EDGE_SECRET = "trusted-edge-secret";
  process.env.STATUS_PORT = String(rendererPort);
  const { normalizeHost, isStatusPlatformHost, proxyToStatus, isTrustedStatusProxyPeer } = await import("../src/lib/status-routing");

  assert.equal(isTrustedStatusProxyPeer("172.30.40.2", "172.30.40.2"), true);
  assert.equal(isTrustedStatusProxyPeer("::ffff:172.30.40.2", "172.30.40.2"), true);
  assert.equal(isTrustedStatusProxyPeer("172.30.40.3", "172.30.40.2"), false);
  assert.equal(isTrustedStatusProxyPeer("172.30.40.2", ""), false);
  assert.equal(isTrustedStatusProxyPeer("203.0.113.44", "0.0.0.0/0"), false);

  assert.equal(normalizeHost("STATUS.OUTRAY.APP:443"), "status.outray.app");
  assert.equal(isStatusPlatformHost(normalizeHost("status.outray.app")), true);
  assert.equal(isStatusPlatformHost(normalizeHost("my-page.status.outray.app")), true);
  // The entire namespace stays out of tunnel routing; the renderer rejects
  // names that are not exact one-label status-page hosts.
  assert.equal(isStatusPlatformHost(normalizeHost("nested.my-page.status.outray.app")), true);
  assert.equal(isStatusPlatformHost(normalizeHost("status.outray.app.evil.test")), false);
  for (const unsafe of ["127.0.0.1", "status.outray.app:65536", "evil.com@status.outray.app", "foo..example.com"]) {
    assert.equal(normalizeHost(unsafe), null);
  }

  const edgePort = await listen(createServer(proxyToStatus));
  for (const host of ["status.outray.app", "acme-status.status.outray.app"]) {
    const response = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const request = httpRequest({
        hostname: "127.0.0.1", port: edgePort, path: "/sample",
        headers: {
          Host: host,
          "X-Outray-Edge-Secret": "forged-secret",
          "X-Outray-Client-IP": "203.0.113.44",
        },
      }, (received) => {
        let body = "";
        received.setEncoding("utf8");
        received.on("data", (chunk) => { body += chunk; });
        received.on("end", () => resolve({ status: received.statusCode || 0, body: JSON.parse(body) }));
      });
      request.on("error", reject);
      request.end();
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      host,
      secret: "trusted-edge-secret",
      clientIp: "203.0.113.44",
      path: "/sample",
    });
  }
});
