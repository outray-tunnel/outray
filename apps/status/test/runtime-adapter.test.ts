import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getStatusRuntime, statusEnvironment, withStatusRuntime, type StatusWorkerEnv } from "../src/lib/runtime";
import { snapshotResponse, type StatusSnapshotBucket } from "../src/lib/snapshots";

function loadModule<T>(path: string, imports: Record<string, unknown>): T {
  const module = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
    .replaceAll("import.meta.env.PROD", "true");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    module, exports: module.exports, URL, Request, Response,
    require(specifier: string) {
      if (!(specifier in imports)) throw new Error(`Unexpected import: ${specifier}`);
      return imports[specifier];
    },
  });
  return module.exports as T;
}

test("Worker entry passes Astro 7 handler arguments within an isolated runtime and cleans up", async () => {
  type Context = { waitUntil(promise: Promise<unknown>): void };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const cleaned: string[] = [];
  const worker = loadModule<{
    default: { fetch(request: Request, env: StatusWorkerEnv, ctx: Context): Promise<Response> };
  }>("../src/worker.ts", {
    "./lib/runtime": { withStatusRuntime },
    "@astrojs/cloudflare/handler": {
      async handle(...args: [Request, StatusWorkerEnv, Context]) {
        assert.equal(args.length, 3);
        const [request, env, ctx] = args;
        const runtime = getStatusRuntime();
        assert.equal(runtime?.request, request);
        assert.equal(runtime?.env, env);
        assert.equal(statusEnvironment().OUTRAY_STATUS_URL, env.OUTRAY_STATUS_URL);
        const background = Promise.resolve();
        runtime?.waitUntil(background);
        assert.equal(backgrounds.get(ctx), background);
        runtime?.onCleanup(() => { cleaned.push(request.url); });
        await gate;
        assert.equal(getStatusRuntime(), runtime);
        return new Response("ok");
      },
    },
  }).default;
  const backgrounds = new Map<Context, Promise<unknown>>();
  const context = (): Context => {
    const ctx = { waitUntil(promise: Promise<unknown>) { backgrounds.set(ctx, promise); } };
    return ctx;
  };
  const requests = [new Request("https://one.example.test/"), new Request("https://two.example.test/")];
  const pending = requests.map((request, index) => worker.fetch(request, {
    OUTRAY_STATUS_URL: `https://${index}.example.test/`,
  }, context()));
  assert.equal(getStatusRuntime(), undefined);
  release();
  const responses = await Promise.all(pending);
  assert.deepEqual(await Promise.all(responses.map((response) => response.text())), ["ok", "ok"]);
  assert.deepEqual(cleaned.sort(), requests.map((request) => request.url).sort());
  assert.equal(getStatusRuntime(), undefined);
});

type MiddlewareContext = { request: Request; url: URL; locals: Record<string, unknown> };
type Middleware = (context: MiddlewareContext, next: () => Promise<Response>) => Promise<Response>;

function middleware(): Middleware {
  return loadModule<{ onRequest: Middleware }>("../src/middleware.ts", {
    "astro:middleware": { defineMiddleware: (handler: Middleware) => handler },
    "./lib/runtime": { getStatusRuntime },
    "./lib/snapshots": { snapshotResponse },
  }).onRequest;
}

test("Worker snapshots use the entry runtime without removed Astro locals.runtime", async () => {
  const saved: string[] = [];
  const pending: Promise<unknown>[] = [];
  const bucket: StatusSnapshotBucket = {
    async get() { return null; },
    async put(_key, value) { saved.push(value); },
    async delete() {},
  };
  const request = new Request("https://health.example.test/");
  const policy = "default-src 'none'; script-src 'self' 'sha256-test'";
  const response = await withStatusRuntime({
    request, env: { STATUS_SNAPSHOTS: bucket }, waitUntil: (promise) => { pending.push(promise); },
  }, () => middleware()({ request, url: new URL(request.url), locals: {} }, async () => new Response(
    "<!doctype html><html><body>All systems operational</body></html>",
    { headers: { "Content-Type": "text/html", "Content-Security-Policy": policy } },
  )));
  await Promise.all(pending);
  assert.equal(saved.length, 1);
  assert.match(saved[0], /All systems operational/);
  assert.equal(response.headers.get("Content-Security-Policy"), `${policy}; frame-ancestors 'none'`);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("Node middleware remains a pass-through without a trusted Worker entry runtime", async () => {
  const request = new Request("https://health.example.test/");
  let rendered = 0;
  const response = await middleware()({
    request, url: new URL(request.url),
    locals: { runtime: { env: { STATUS_SNAPSHOTS: {} }, ctx: { waitUntil() {} } } },
  }, async () => { rendered++; return new Response("Node response"); });
  assert.equal(rendered, 1);
  assert.equal(await response.text(), "Node response");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
});

test("image optimizer remains unavailable before either runtime renders a route", async () => {
  const request = new Request("https://health.example.test/_image?href=https://example.test/a.png");
  let rendered = false;
  const response = await middleware()({ request, url: new URL(request.url), locals: {} }, async () => {
    rendered = true;
    return new Response("unexpected");
  });
  assert.equal(response.status, 404);
  assert.equal(rendered, false);
});
