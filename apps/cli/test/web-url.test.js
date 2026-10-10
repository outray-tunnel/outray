const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { canonicalConsoleOrigin } = require("../dist/config.js");

// Evaluate the built CLI's URL initializers without importing its main entry,
// which would start commands, read local credentials, or contact the network.
const entry = fs.readFileSync(
  path.resolve(__dirname, "../dist/index.js"),
  "utf8",
);
const isDevDeclaration = entry.match(/^\s*const isDev =[^;]+;/m)?.[0];
const serverUrlDeclaration = entry.match(/^\s*const serverUrl =\s*process\.env\.OUTRAY_SERVER_URL[^;]+;/m)?.[0];
const webUrlDeclaration = entry.match(/^\s*const webUrl =[^;]+;/m)?.[0];
assert.ok(isDevDeclaration, "CLI must expose its development-mode initializer");
assert.ok(serverUrlDeclaration, "CLI must expose its tunnel URL initializer");
assert.ok(webUrlDeclaration, "CLI must expose its console URL initializer");
const initializer = new vm.Script(
  `const args = process.argv.slice(2);\n${isDevDeclaration}\n${webUrlDeclaration}\nwebUrl;`,
);
const serverInitializer = new vm.Script(
  `const args = process.argv.slice(2);\n${isDevDeclaration}\n${serverUrlDeclaration}\nserverUrl;`,
);

function webUrl(env = {}, args = []) {
  return initializer.runInNewContext({
    process: { env, argv: ["node", "outray", ...args] },
    config_1: { canonicalConsoleOrigin },
  });
}

function serverUrl(env = {}, args = []) {
  return serverInitializer.runInNewContext({
    process: { env, argv: ["node", "outray", ...args] },
  });
}

test("production CLI uses connect.outray.co for tunnels while browser auth stays on outray.dev", () => {
  assert.equal(serverUrl(), "wss://connect.outray.co/");
  assert.equal(serverUrl({ NODE_ENV: "production" }), "wss://connect.outray.co/");
  assert.equal(webUrl(), "https://outray.dev");
});

test("development and dev-flag tunnel connections keep the local server", () => {
  assert.equal(serverUrl({ NODE_ENV: "development" }), "ws://localhost:3547");
  assert.equal(serverUrl({ NODE_ENV: "production" }, ["--dev"]), "ws://localhost:3547");
});

test("OUTRAY_SERVER_URL retains custom and legacy endpoint overrides", () => {
  for (const override of ["wss://api.outray.dev/", "wss://tunnel.example.test/"]) {
    assert.equal(serverUrl({ OUTRAY_SERVER_URL: override }), override);
    assert.equal(serverUrl({ NODE_ENV: "development", OUTRAY_SERVER_URL: override }), override);
    assert.equal(serverUrl({ OUTRAY_SERVER_URL: override }, ["--dev"]), override);
  }
  assert.equal(serverUrl({ OUTRAY_SERVER_URL: "" }), "wss://connect.outray.co/");
});

test("production CLI uses outray.dev for the console", () => {
  assert.equal(webUrl(), "https://outray.dev");
  assert.equal(webUrl({ NODE_ENV: "production" }), "https://outray.dev");
});

test("development environment keeps the local console URL", () => {
  assert.equal(webUrl({ NODE_ENV: "development" }), "http://localhost:6767");
});

test("the dev flag keeps the local console URL", () => {
  assert.equal(webUrl({ NODE_ENV: "production" }, ["--dev"]), "http://localhost:6767");
});

test("OUTRAY_WEB_URL overrides the production and development defaults", () => {
  const override = "https://console.example.test";
  assert.equal(webUrl({ OUTRAY_WEB_URL: override }), override);
  assert.equal(
    webUrl({ NODE_ENV: "development", OUTRAY_WEB_URL: override }),
    override,
  );
  assert.equal(webUrl({ OUTRAY_WEB_URL: override }, ["--dev"]), override);
});

test("an empty override falls back to the environment's console URL", () => {
  assert.equal(webUrl({ OUTRAY_WEB_URL: "" }), "https://outray.dev");
  assert.equal(
    webUrl({ NODE_ENV: "development", OUTRAY_WEB_URL: "" }),
    "http://localhost:6767",
  );
});

test("custom console URL is normalized and unsafe origins fail before loading credentials", () => {
  assert.equal(webUrl({ OUTRAY_WEB_URL: "https://CONSOLE.EXAMPLE.TEST:443/" }), "https://console.example.test");
  for (const override of ["http://console.example.test", "https://user:password@console.example.test", "https://console.example.test/path", "https://console.example.test/?query=1", "https://console.example.test/#key"]) {
    assert.throws(() => webUrl({ OUTRAY_WEB_URL: override }), /OUTRAY_WEB_URL/);
  }
});
