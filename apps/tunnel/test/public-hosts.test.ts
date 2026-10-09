import assert from "node:assert/strict";
import { test } from "node:test";
import publicHosts from "../../../shared/public-hosts";

test("hosted defaults and the legacy root redirect are preserved", () => {
  assert.equal(publicHosts.canonicalStatusHostname({}), "status.outray.app");
  assert.equal(publicHosts.tunnelBaseDomain({}), "outray.app");
  assert.equal(publicHosts.tunnelRootRedirect("outray.app", "outray.app", "/docs?source=edge", {}), "https://outray.dev/docs?source=edge");
  assert.equal(publicHosts.tunnelRootRedirect("api.outray.app", "outray.app", "/", {}), null);
});

test("self-hosted public hosts and root redirects never send users to OutRay", () => {
  const env = { OUTRAY_DEPLOYMENT_MODE: "self-hosted", BASE_DOMAIN: "tunnels.example.net", STATUS_PUBLIC_URL: "https://health.example.net", APP_URL: "https://console.example.net" };
  assert.equal(publicHosts.canonicalStatusHostname(env), "health.example.net");
  assert.equal(publicHosts.tunnelRootRedirect("tunnels.example.net", env.BASE_DOMAIN, "//attacker.test/path", env), "https://console.example.net//attacker.test/path");
  assert.equal(publicHosts.tunnelRootRedirect("www.tunnels.example.net", env.BASE_DOMAIN, "/", env), "https://console.example.net/");
  assert.equal(publicHosts.infrastructureHostnames(env).includes("api.outray.dev"), false);
  assert.equal(publicHosts.tunnelRootRedirect("outray.app", "outray.app", "/", { OUTRAY_DEPLOYMENT_MODE: "self-hosted" }), null);
});

test("public origin configuration rejects credentials, paths and unsafe protocols", () => {
  for (const url of ["javascript:alert(1)", "https://user:password@example.net", "https://example.net/path", "https://example.net/?query=1", "https://example.net/#key", "https://-bad.example.net"]) {
    assert.throws(() => publicHosts.statusPublicOrigin({ STATUS_PUBLIC_URL: url }));
  }
  assert.throws(() => publicHosts.tunnelBaseDomain({ BASE_DOMAIN: "https://example.net" }), /BASE_DOMAIN/);
  assert.equal(publicHosts.canonicalStatusHostname({ OUTRAY_STATUS_URL: "https://legacy.example.net", STATUS_PUBLIC_URL: "https://new.example.net" }), "legacy.example.net");
});

test("configured edge host receives CLI control WebSockets without capturing other customer API hosts", () => {
  const env = { OUTRAY_DEPLOYMENT_MODE: "self-hosted", BASE_DOMAIN: "tunnels.example.net", TUNNEL_PUBLIC_URL: "https://edge.example.net" };
  assert.equal(publicHosts.isTunnelControlHost("edge.example.net", env.BASE_DOMAIN, env), true);
  assert.equal(publicHosts.isTunnelControlHost("tunnels.example.net", env.BASE_DOMAIN, env), true);
  assert.equal(publicHosts.isTunnelControlHost("api.tunnels.example.net", env.BASE_DOMAIN, env), true);
  assert.equal(publicHosts.isTunnelControlHost("api.customer.test", env.BASE_DOMAIN, env), false);
  assert.equal(publicHosts.isTunnelControlHost("edge.example.net.attacker.test", env.BASE_DOMAIN, env), false);
  assert.equal(publicHosts.isTunnelControlHost("api.outray.dev", "outray.app", {}), true);
  assert.equal(publicHosts.infrastructureHostnames(env).includes("edge.example.net"), true);
});
