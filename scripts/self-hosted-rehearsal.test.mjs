import assert from "node:assert/strict";
import test from "node:test";
import { parseEnv } from "node:util";
import { initialEnvironment } from "./self-hosted.mjs";
import { argumentsFor, configurationFrom, containerArguments, hostEnvironment, labelsFor, localDockerEndpoint, ownedResource, project, serviceDefinitions } from "./self-hosted-rehearsal.mjs";

const source = () => parseEnv(initialEnvironment("private.example.net", "owner@example.net"));

test("private rehearsal requires an explicit fresh file/image and a local Docker endpoint", () => {
  assert.equal(argumentsFor(["--file", "private-rehearsal.env", "--image", "outray-rehearsal:local"]).image, "outray-rehearsal:local");
  for (const args of [[], ["--file", "fresh.env"], ["--image", "x"], ["--file", ".env.prod", "--image", "x"], ["--file", ".env", "--image", "x"], ["--file", "fresh.env", "--image", "x", "--unknown", "y"], ["--file", "fresh.env", "--image", "x; echo unsafe"]]) assert.throws(() => argumentsFor(args));
  assert.equal(localDockerEndpoint("unix:///var/run/docker.sock"), "unix:///var/run/docker.sock");
  for (const endpoint of ["ssh://production", "tcp://production:2375", "unix:///var/run/docker.sock\nextra"]) assert.throws(() => localDockerEndpoint(endpoint));
});

test("private rehearsal configuration excludes all external and owner-supplied database URLs", () => {
  const env = { ...source(), DATABASE_URL: "postgresql://production/never-use", REDIS_URL: "redis://production", HUGEICONS_LICENSE_KEY: "private-build-key", TINYBIRD_INGEST_TOKEN: "private-append-key", TINYBIRD_QUERY_TOKEN: "private-read-key", GITHUB_CLIENT_SECRET: "private-oauth-key", ZEPTO_API_KEY: "private-email-key", XAI_API_KEY: "private-agent-key" };
  const config = configurationFrom(env);
  for (const key of ["DATABASE_URL", "REDIS_URL", "HUGEICONS_LICENSE_KEY", "TINYBIRD_INGEST_TOKEN", "TINYBIRD_QUERY_TOKEN", "GITHUB_CLIENT_SECRET", "ZEPTO_API_KEY", "XAI_API_KEY"]) assert.equal(config[key], undefined, key);
  const services = serviceDefinitions(config);
  for (const definition of Object.values(services)) {
    for (const credential of ["private-build-key", "private-append-key", "private-read-key", "private-oauth-key", "private-email-key", "private-agent-key", "postgresql://production/never-use", "redis://production"]) assert.ok(!JSON.stringify(definition).includes(credential));
    assert.equal(definition.env.HUGEICONS_LICENSE_KEY, undefined);
  }
  assert.equal(services.ingest.env.TINYBIRD_INGEST_TOKEN, "");
  assert.equal(services.ingest.expectedMissingTinybird, true);
  assert.equal(services.web.env.GITHUB_CLIENT_SECRET, "");
  assert.equal(services.web.env.OUTRAY_SIGNUP_ALLOWED_EMAILS, "");
  assert.equal(services.web.env.UPTIME_PROBES_ENABLED, "false");
  assert.equal(services["uptime-probe"], undefined);
  assert.equal(services.caddy, undefined);
  assert.equal(services["secrets-share"].env.DATABASE_URL, undefined);
  assert.equal(services["secrets-share"].env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY, undefined);
  assert.equal(services.sanity.env.DATABASE_URL, undefined);
  assert.equal(services.web.env.DASHBOARD_DB_POOL_MAX, "10");
  assert.ok(services.web.env.DATABASE_URL.includes(`@${project}-postgres:5432/`));
});

test("rehearsal rejects hosted mode, reused internal credentials and existing keyrings", () => {
  for (const change of [{ OUTRAY_DEPLOYMENT_MODE: "hosted" }, { POSTGRES_PASSWORD: "not-generated" }, { POSTGRES_USER: "outray_share_app" }, { OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS: '{"old":"existing-key"}' }, { OUTRAY_APP_HOST: "127.0.0.1" }]) assert.throws(() => configurationFrom({ ...source(), ...change }));
  const reused = source(); reused.SHARE_DATABASE_PASSWORD = reused.POSTGRES_PASSWORD;
  assert.throws(() => configurationFrom(reused));
});

test("Docker args have no published ports, credential values or destructive data operations", () => {
  const config = configurationFrom(source()), services = serviceDefinitions(config), labels = labelsFor(config);
  for (const [name, definition] of Object.entries(services)) {
    const temporary = ["migrate", "bootstrap", "sanity"].includes(name);
    const args = containerArguments(`${project}-${name}`, definition, "built-image:local", labels, temporary);
    assert.equal(args[0], "run");
    assert.equal(args[args.indexOf("--network") + 1], project);
    assert.equal(args.includes("--rm"), temporary);
    for (const forbidden of ["-p", "--publish", "-P", "--publish-all", "--privileged", "--env-file", "--volumes-from"]) assert.ok(!args.includes(forbidden), name);
    const imageIndex = args.indexOf(definition.image || "built-image:local");
    for (let index = 0; index < imageIndex; index++) if (args[index] === "-e") assert.match(args[index + 1], /^[A-Z][A-Z_0-9]*$/);
    for (const key of ["POSTGRES_PASSWORD", "SHARE_DATABASE_PASSWORD", "BETTER_AUTH_SECRET", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY"]) assert.ok(!args.join(" ").includes(config[key]), `${name}: ${key}`);
    if (!definition.image) {
      assert.ok(args.includes("--read-only"));
      assert.equal(args[args.indexOf("--user") + 1], "node");
      assert.equal(args[args.indexOf("--cap-drop") + 1], "ALL");
    }
    if (!temporary) assert.equal(args[args.indexOf("--restart") + 1], "no");
  }
  const sanity = services.sanity.command.join(" ");
  assert.match(sanity, /secret_share_rate_limits/);
  assert.match(sanity, /'users', 'accounts', 'secret_entries'/);
  assert.match(sanity, /42501/);
  assert.match(sanity, /ROLLBACK/);
  assert.doesNotMatch(services.migrate.command.join(" "), /generate|push/);
});

test("resource ownership is bound to the fresh keyset and host environment is tightly whitelisted", () => {
  const first = labelsFor(configurationFrom(source())), second = labelsFor(configurationFrom(source()));
  assert.notDeepEqual(first, second);
  assert.equal(ownedResource({ Labels: first }, first), true);
  assert.equal(ownedResource({ Labels: {} }, first), false);
  assert.equal(ownedResource({ Labels: second }, first), false);
  const env = hostEnvironment({ PATH: "/usr/bin", HOME: "/private-home", XDG_RUNTIME_DIR: "/run/user/1000", DOCKER_HOST: "ssh://production", DOCKER_CONTEXT: "production", HUGEICONS_LICENSE_KEY: "never-inherit", NODE_OPTIONS: "--require unsafe" });
  assert.deepEqual(env, { PATH: "/usr/bin", HOME: "/private-home", XDG_RUNTIME_DIR: "/run/user/1000" });
});
