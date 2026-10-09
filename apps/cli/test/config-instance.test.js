const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ConfigManager, authConfigFilename, canonicalConsoleOrigin } = require("../dist/config.js");

function configDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outray-instance-auth-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("default constructor and hosted origins retain legacy auth filenames", () => {
  assert.equal(authConfigFilename(false), "config.json");
  assert.equal(authConfigFilename(true), "config.dev.json");
  for (const origin of ["https://outray.dev", "https://outray.co", "https://OUTRAY.DEV:443/", "https://outray.dev."]) {
    assert.equal(authConfigFilename(false, origin), "config.json");
    assert.equal(authConfigFilename(true, origin), "config.dev.json");
  }
  assert.equal(authConfigFilename(true, "http://localhost:6767"), "config.dev.json");
  assert.notEqual(authConfigFilename(false, "http://localhost:6767"), "config.json");
  assert.notEqual(authConfigFilename(true, "http://localhost:6768"), "config.dev.json");
});

test("custom console auth scope is a deterministic canonical-origin hash", () => {
  const filename = authConfigFilename(false, "https://console.example.test");
  assert.match(filename, /^config\.instance\.[a-f0-9]{64}\.json$/);
  assert.equal(authConfigFilename(true, "https://CONSOLE.EXAMPLE.TEST:443/"), filename);
  assert.notEqual(authConfigFilename(false, "https://other.example.test"), filename);
  assert.notEqual(authConfigFilename(false, "https://console.example.test:8443"), filename);
  assert.equal(path.basename(filename), filename);
});

test("hosted and multiple self-hosted tokens never share files or logout state", (t) => {
  const directory = configDirectory(t);
  const hosted = new ConfigManager(false, "https://outray.dev", directory);
  const first = new ConfigManager(false, "https://ops.example.test", directory);
  const second = new ConfigManager(false, "https://other.example.test", directory);
  hosted.save({ authType: "user", userToken: "hosted-user", orgToken: "hosted-org" });
  assert.equal(first.load(), null);
  assert.equal(second.load(), null);
  first.save({ authType: "user", userToken: "first-user", orgToken: "first-org" });
  second.save({ authType: "user", userToken: "second-user", orgToken: "second-org" });
  assert.equal(first.load().orgToken, "first-org");
  assert.equal(second.load().userToken, "second-user");
  first.clear();
  assert.equal(first.load(), null);
  assert.equal(second.load().orgToken, "second-org");
  assert.equal(hosted.load().userToken, "hosted-user");
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  for (const filename of fs.readdirSync(directory)) {
    assert.equal(fs.statSync(path.join(directory, filename)).mode & 0o777, 0o600);
  }
});

test("console origins require TLS except exact loopback addresses", () => {
  for (const origin of ["http://localhost:6767", "http://127.0.0.1:6767", "http://127.5.6.7:6767", "http://[::1]:6767"]) {
    assert.equal(canonicalConsoleOrigin(origin), new URL(origin).origin);
  }
  for (const origin of ["http://localhost.attacker.test", "http://192.168.1.5", "ftp://console.example.test", "https://name:secret@console.example.test", "https://console.example.test/path", "https://console.example.test/?query=1", "https://console.example.test/#key", "not-a-url"]) {
    assert.throws(() => canonicalConsoleOrigin(origin), /OUTRAY_WEB_URL/);
    assert.throws(() => authConfigFilename(false, origin), /OUTRAY_WEB_URL/);
  }
});
