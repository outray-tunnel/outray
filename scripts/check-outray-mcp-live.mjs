import { validatePlugin } from "./outray-plugin.mjs";

const checked = await validatePlugin(undefined, { release: process.argv.includes("--release") });
const metadata = checked.manifest.extensions["com.openai"];
const origin = "https://outray.co";
let failed = false;
const checks = [
  ...["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"].map((key) => ({ name: key, url: metadata.interface[key], status: 200, type: "text/html" })),
  ...["mcp-logo.png", "mcp-logo-dark.png"].map((name) => ({ name: `MCP branding ${name}`, url: `${origin}/brand/${name}`, status: 200, type: "image/png", png: true })),
  ...["/api/mcp", "/api/mcp/openai"].map((path) => ({ name: path, url: `${origin}${path}`, status: 401, method: "POST", type: "application/json" })),
  ...["/api/mcp", "/api/mcp/openai"].map((path) => ({ name: `Resource metadata ${path}`, url: `${origin}/.well-known/oauth-protected-resource${path}`, status: 200, resource: `${origin}${path}`, type: "application/json" })),
  { name: "OAuth issuer", url: `${origin}/.well-known/oauth-authorization-server/api/auth`, status: 200, issuer: `${origin}/api/auth`, type: "application/json" },
  ...(metadata.review.demo_recording_url ? [{ name: "Demo recording", url: metadata.review.demo_recording_url, status: 200 }] : []),
];
for (const check of checks) {
  try {
    const response = await fetch(check.url, { method: check.method || "GET", redirect: "follow", signal: AbortSignal.timeout(15000),
      headers: { "user-agent": `OutRay-Plugin-Release-Check/${checked.manifest.version}`, ...(check.method ? { "content-type": "application/json", accept: "application/json, text/event-stream" } : {}) },
      ...(check.method ? { body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "release-check", version: checked.manifest.version } } }) } : {}) });
    if (response.status !== check.status) throw new Error(`expected HTTP ${check.status}, received ${response.status}`);
    if (check.type && !response.headers.get("content-type")?.includes(check.type)) throw new Error("unexpected content type");
    if (check.png) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 33 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== 680 || bytes.readUInt32BE(20) !== 680) throw new Error("expected the square OutRay branding asset");
    }
    if (check.method && !response.headers.get("www-authenticate")?.includes("resource_metadata=")) throw new Error("missing OAuth challenge");
    if (check.resource || check.issuer) {
      const body = await response.json();
      if (check.resource && body.resource !== check.resource) throw new Error("resource identifier mismatch");
      if (check.issuer && body.issuer !== check.issuer) throw new Error("issuer mismatch");
      if (check.resource?.endsWith("/openai") && body.scopes_supported?.includes("outray:secrets:values")) throw new Error("public metadata advertises private scope");
    }
    console.log(`PASS ${check.name}`);
  } catch (error) { failed = true; console.error(`FAIL ${check.name}: ${error instanceof Error ? error.message : "request failed"}`); }
}
for (const gap of checked.releaseGaps) console.log(`Release prerequisite: ${gap}`);
if (failed) process.exitCode = 1;
