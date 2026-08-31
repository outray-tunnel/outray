const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("global browser-auth config and its directory are private", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "outray-auth-config-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const modulePath = path.resolve(__dirname, "../dist/config.js");
  execFileSync(
    process.execPath,
    [
      "-e",
      `const {ConfigManager}=require(${JSON.stringify(modulePath)}); new ConfigManager(false).save({authType:'user',userToken:'secret'});`,
    ],
    { env: { ...process.env, HOME: home } },
  );
  assert.equal(fs.statSync(path.join(home, ".outray")).mode & 0o777, 0o700);
  assert.equal(
    fs.statSync(path.join(home, ".outray", "config.json")).mode & 0o777,
    0o600,
  );
});
