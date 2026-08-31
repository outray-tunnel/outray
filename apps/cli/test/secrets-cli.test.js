const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

const { runSecretsCommand } = require("../dist/secrets-cli.js");

function outputBuffer() {
  let text = "";
  return {
    stream: { write(chunk) { text += String(chunk); return true; } },
    value: () => text,
  };
}

test("uses OUTRAY_TOKEN before OUTRAY_API_KEY and lists metadata only", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(
      JSON.stringify({
        organization: {}, project: {}, environment: {},
        secrets: [{ id: "1", key: "API_KEY", version: 2, updatedAt: "2026-01-01" }],
      }),
      { headers: { "content-type": "application/json" } },
    );
  };
  const output = outputBuffer();
  const code = await runSecretsCommand(
    ["list", "--org", "acme", "--project", "api", "--env", "dev"],
    {
      webUrl: "https://outray.test",
      env: { OUTRAY_TOKEN: "primary", OUTRAY_API_KEY: "compat" },
      stdout: output.stream,
    },
  );
  assert.equal(code, 0);
  assert.equal(request.init.headers.Authorization, "Bearer primary");
  assert.equal(new URL(request.url).searchParams.get("values"), "false");
  assert.match(output.value(), /API_KEY\t2\t2026-01-01/);
});

test("requires explicit production confirmation for value access", async () => {
  await assert.rejects(
    () => runSecretsCommand(
      ["pull", "--org", "acme", "--project", "api", "--env", "prod"],
      { webUrl: "https://outray.test", env: { OUTRAY_TOKEN: "token" } },
    ),
    /--confirm-production/,
  );
});

test("permits confirmed production reads and falls back to browser org auth", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  let authorization;
  global.fetch = async (url, init) => {
    request = { url: String(url), init };
    authorization = init.headers.Authorization;
    return new Response(
      JSON.stringify({ organization: {}, project: {}, environment: {}, secrets: [] }),
      { headers: { "content-type": "application/json" } },
    );
  };
  let requestedOrganization;
  const output = outputBuffer();
  const code = await runSecretsCommand(
    [
      "pull",
      "--org",
      "acme",
      "--project",
      "api",
      "--env",
      "production",
      "--confirm-production",
    ],
    {
      webUrl: "https://outray.test",
      env: {},
      stdout: output.stream,
      resolveBrowserToken: async (organization) => {
        requestedOrganization = organization;
        return "browser-org-token";
      },
    },
  );
  assert.equal(code, 0);
  assert.equal(requestedOrganization, "acme");
  assert.equal(authorization, "Bearer browser-org-token");
  assert.equal(
    new URL(request.url).searchParams.get("confirmProduction"),
    "true",
  );
  assert.equal(output.value(), "\n");
});

test("list --values explicitly reveals values with production confirmation", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(
      JSON.stringify({
        organization: {}, project: {}, environment: {},
        secrets: [
          { id: "1", key: "API_KEY", value: "super-secret", version: 2, updatedAt: "now" },
        ],
      }),
      { headers: { "content-type": "application/json" } },
    );
  };
  const output = outputBuffer();
  const code = await runSecretsCommand(
    [
      "list",
      "--values",
      "--org", "acme",
      "--project", "api",
      "--env", "prod",
      "--confirm-production",
    ],
    {
      webUrl: "https://outray.test",
      env: { OUTRAY_TOKEN: "machine" },
      stdout: output.stream,
    },
  );
  assert.equal(code, 0);
  const url = new URL(request.url);
  assert.equal(request.init.method, "POST");
  assert.equal(url.searchParams.get("values"), null);
  assert.equal(url.searchParams.get("confirmProduction"), "true");
  assert.deepEqual(JSON.parse(request.init.body), {
    confirmProduction: true,
  });
  assert.equal(output.value(), "API_KEY=super-secret\n");
});

test("keeps OUTRAY_API_KEY as the machine-token compatibility fallback", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let authorization;
  global.fetch = async (_url, init) => {
    authorization = init.headers.Authorization;
    return new Response(
      JSON.stringify({ organization: {}, project: {}, environment: {}, secrets: [] }),
      { headers: { "content-type": "application/json" } },
    );
  };
  await runSecretsCommand(
    ["list", "--org", "acme", "--project", "api", "--env", "dev"],
    {
      webUrl: "https://outray.test",
      env: { OUTRAY_API_KEY: "legacy-machine-token" },
      stdout: outputBuffer().stream,
    },
  );
  assert.equal(authorization, "Bearer legacy-machine-token");
});

test("does not accept raw Secrets tokens on argv", async () => {
  await assert.rejects(
    () => runSecretsCommand(
      ["list", "--token", "raw", "--org", "acme", "--project", "api", "--env", "dev"],
      { webUrl: "https://outray.test", env: {} },
    ),
    /Unknown option: --token/,
  );
});

test("secrets use creates the nearest config without disturbing tunnel settings", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outray-secret-cli-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const nested = path.join(directory, "apps", "api");
  const configPath = path.join(directory, "outray", "config.toml");
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, "# tunnel\n[tunnel.web]\nprotocol='http'\nlocal_port=3000\n");
  const output = outputBuffer();
  await runSecretsCommand(
    ["use", "--org", "acme", "--project", "api", "--env", "dev"],
    { webUrl: "https://outray.test", cwd: nested, stdout: output.stream },
  );
  const text = fs.readFileSync(configPath, "utf8");
  assert.match(text, /# tunnel/);
  assert.match(text, /\[tunnel\.web\]/);
  assert.match(text, /\[secrets\]/);
  assert.match(text, /org = "acme"/);
});

test("secrets use discovers and persists a singleton target", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outray-secret-picker-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let request;
  global.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(
      JSON.stringify({
        organizations: [{
          id: "org-1", name: "Acme", slug: "acme",
          projects: [{
            id: "project-1", name: "API", slug: "api",
            environments: [{
              id: "env-1", name: "Development", slug: "dev", isProduction: false,
            }],
          }],
        }],
      }),
      { headers: { "content-type": "application/json" } },
    );
  };

  await runSecretsCommand(["use"], {
    cwd: directory,
    webUrl: "https://outray.test",
    env: { OUTRAY_TOKEN: "machine" },
    stdin: { isTTY: false },
    stdout: outputBuffer().stream,
  });
  assert.equal(request.url, "https://outray.test/api/cli/secrets/targets");
  assert.equal(request.init.headers.Authorization, "Bearer machine");
  const config = fs.readFileSync(
    path.join(directory, "outray", "config.toml"),
    "utf8",
  );
  assert.match(config, /org = "acme"/);
  assert.match(config, /project = "api"/);
  assert.match(config, /environment = "dev"/);
});

test("the target picker requires flags for ambiguous non-interactive choices", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response(
    JSON.stringify({
      organizations: [
        { id: "1", name: "Acme", slug: "acme", projects: [] },
        { id: "2", name: "Other", slug: "other", projects: [] },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
  await assert.rejects(
    () => runSecretsCommand(["use"], {
      webUrl: "https://outray.test",
      env: { OUTRAY_TOKEN: "machine" },
      stdin: { isTTY: false },
      stdout: outputBuffer().stream,
    }),
    /Pass --org in non-interactive environments/,
  );
});

test("set normalizes its key and reads the value from --value-stdin", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const requests = [];
  global.fetch = async (url, init) => {
    const request = { url: String(url), init };
    requests.push(request);
    if (request.url.includes("/revision")) {
      return new Response(
        JSON.stringify({ revision: 7, count: 1, updatedAt: "now" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (!init.method || init.method === "GET") {
      return new Response(
        JSON.stringify({
          organization: {}, project: {}, environment: {},
          secrets: [{ id: "1", key: "API_KEY", version: 2, updatedAt: "now" }],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ created: 0, updated: 1, unchanged: 0, revision: 8 }),
      { headers: { "content-type": "application/json" } },
    );
  };
  const stdin = Readable.from(["value with newline\n"]);
  const code = await runSecretsCommand(
    [
      "set", " api key ", "--value-stdin",
      "--org", "acme", "--project", "api", "--env", "dev",
    ],
    {
      webUrl: "https://outray.test",
      env: { OUTRAY_TOKEN: "machine" },
      stdin,
      stdout: outputBuffer().stream,
    },
  );
  assert.equal(code, 0);
  const request = requests.at(-1);
  assert.equal(request.init.method, "PUT");
  assert.deepEqual(JSON.parse(request.init.body), {
    secrets: { API_KEY: "value with newline" },
    expectedRevision: 7,
    expectedVersions: { API_KEY: 2 },
  });
  assert.equal(request.url.includes("value with newline"), false);
});

test("import snapshots revision and per-key versions before sending values", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const requests = [];
  global.fetch = async (url, init) => {
    const request = { url: String(url), init };
    requests.push(request);
    if (request.url.includes("/revision")) {
      return new Response(
        JSON.stringify({ revision: 11, count: 1, updatedAt: "now" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (!init.method || init.method === "GET") {
      return new Response(
        JSON.stringify({
          organization: {}, project: {}, environment: {},
          secrets: [{ id: "1", key: "EXISTING", version: 4, updatedAt: "now" }],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ created: 1, updated: 1, unchanged: 0, revision: 12 }),
      { headers: { "content-type": "application/json" } },
    );
  };

  await runSecretsCommand(
    [
      "import", "--from", "-",
      "--org", "acme", "--project", "api", "--env", "dev",
    ],
    {
      webUrl: "https://outray.test",
      env: { OUTRAY_TOKEN: "machine" },
      stdin: Readable.from(["EXISTING=changed\nNEW_KEY=new-value\n"]),
      stdout: outputBuffer().stream,
    },
  );

  const request = requests.at(-1);
  assert.equal(request.init.method, "PUT");
  assert.deepEqual(JSON.parse(request.init.body), {
    secrets: { EXISTING: "changed", NEW_KEY: "new-value" },
    expectedRevision: 11,
    expectedVersions: { EXISTING: 4, NEW_KEY: null },
  });
  assert.equal(request.url.includes("new-value"), false);
});

test("delete and rollback pass caller-held revision and current version", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const mutationRequests = [];
  global.fetch = async (url, init) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/revision")) {
      return new Response(
        JSON.stringify({ revision: 21, count: 1, updatedAt: "now" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (!init.method || init.method === "GET") {
      return new Response(
        JSON.stringify({
          organization: {}, project: {}, environment: {},
          secrets: [{ id: "secret-1", key: "API_KEY", version: 6, updatedAt: "now" }],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    mutationRequests.push({ url: requestUrl, init });
    return new Response(
      JSON.stringify(
        init.method === "DELETE"
          ? { deleted: 1, revision: 22 }
          : {
              secret: { id: "secret-1", key: "API_KEY", version: 7, updatedAt: "now" },
              revision: 22,
            },
      ),
      { headers: { "content-type": "application/json" } },
    );
  };
  const context = {
    webUrl: "https://outray.test",
    env: { OUTRAY_TOKEN: "machine" },
    stdout: outputBuffer().stream,
  };

  await runSecretsCommand(
    [
      "delete", "API_KEY", "--yes",
      "--org", "acme", "--project", "api", "--env", "dev",
    ],
    context,
  );
  await runSecretsCommand(
    [
      "rollback", "API_KEY", "--version", "2", "--yes",
      "--org", "acme", "--project", "api", "--env", "dev",
    ],
    context,
  );

  assert.equal(mutationRequests[0].init.method, "DELETE");
  assert.deepEqual(JSON.parse(mutationRequests[0].init.body), {
    expectedRevision: 21,
    expectedVersion: 6,
  });
  assert.match(mutationRequests[1].url, /\/api\/cli\/secrets\/rollback\?/);
  assert.deepEqual(JSON.parse(mutationRequests[1].init.body), {
    secretId: "secret-1",
    version: 2,
    expectedRevision: 21,
    expectedVersion: 6,
  });
});

test("pull --force replaces an existing output with private permissions", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outray-secret-pull-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, ".env");
  fs.writeFileSync(outputPath, "OLD=value\n", { mode: 0o644 });
  global.fetch = async () => new Response(
    JSON.stringify({
      organization: {}, project: {}, environment: {},
      secrets: [
        { id: "1", key: "NEW", value: "value", version: 1, updatedAt: "now" },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );

  await runSecretsCommand(
    [
      "pull", "--force", "--out", ".env",
      "--org", "acme", "--project", "api", "--env", "dev",
    ],
    {
      cwd: directory,
      webUrl: "https://outray.test",
      env: { OUTRAY_TOKEN: "machine" },
      stdout: outputBuffer().stream,
    },
  );
  assert.equal(fs.readFileSync(outputPath, "utf8"), "NEW=value\n");
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
});
