const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  findNearestSecretsConfig,
  parseSecretsConfig,
  resolveSecretsTarget,
  saveNearestSecretsConfig,
} = require("../dist/secrets-config.js");
const { TomlConfigParser } = require("../dist/toml-config.js");

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outray-secrets-config-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("finds the nearest outray/config.toml and validates only [secrets]", (t) => {
  const root = temporaryDirectory(t);
  const nested = path.join(root, "apps", "api", "src");
  const configPath = path.join(root, "outray", "config.toml");
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    `[global]\norg = "acme"\n\n# Tunnel contents are irrelevant to Secrets validation.\n[tunnel.broken]\nlocal_port = "not-a-number"\n\n[secrets]\nproject = "api"\nenvironment = "dev"\n`,
  );

  const located = findNearestSecretsConfig(nested);
  assert.equal(located.path, configPath);
  assert.deepEqual(located.secrets, {
    org: undefined,
    project: "api",
    environment: "dev",
  });
  assert.equal(located.globalOrg, "acme");
});

test("updates only [secrets] while preserving tunnel text and comments", (t) => {
  const root = temporaryDirectory(t);
  const configPath = path.join(root, "outray", "config.toml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tunnelText = `# keep this comment\n[tunnel.web]\nprotocol = "http"\nlocal_port = 6767\n`;
  fs.writeFileSync(
    configPath,
    `${tunnelText}\n[secrets]\nproject = "old"\nenvironment = "dev"\n`,
  );

  const saved = saveNearestSecretsConfig(
    { project: "new", environment: undefined },
    { cwd: root },
  );
  const text = fs.readFileSync(configPath, "utf8");
  assert.ok(text.startsWith(tunnelText));
  assert.match(text, /project = "new"/);
  assert.match(text, /environment = "dev"/);
  assert.equal(saved.secrets.project, "new");
});

test("creates an explicit config and resolves flags over env over TOML", (t) => {
  const root = temporaryDirectory(t);
  const explicitPath = path.join(root, "custom", "config.toml");
  saveNearestSecretsConfig(
    { org: "file-org", project: "file-project", environment: "file-env" },
    { cwd: root, explicitPath },
  );

  const config = findNearestSecretsConfig(root, explicitPath);
  const target = resolveSecretsTarget({
    org: "flag-org",
    config,
    env: {
      OUTRAY_ORG: "env-org",
      OUTRAY_SECRETS_PROJECT: "env-project",
      OUTRAY_SECRETS_ENVIRONMENT: "env-env",
    },
  });
  assert.deepEqual(target, {
    organization: "flag-org",
    project: "env-project",
    environment: "env-env",
  });
});

test("rejects unknown Secrets options", () => {
  assert.throws(
    () => parseSecretsConfig("[secrets]\nproject='api'\nenvironment='dev'\ntoken='nope'\n"),
    /Unknown \[secrets\] option "token"/,
  );
});

test("the shared TOML parser accepts and returns a Secrets-only config", (t) => {
  const root = temporaryDirectory(t);
  const configPath = path.join(root, "config.toml");
  fs.writeFileSync(
    configPath,
    `[secrets]\norg = "acme"\nproject = "api"\nenvironment = "dev"\n`,
  );
  const parsed = TomlConfigParser.loadTomlConfig(configPath);
  assert.deepEqual(parsed.tunnels, []);
  assert.deepEqual(parsed.secrets, {
    org: "acme",
    project: "api",
    environment: "dev",
  });
});
