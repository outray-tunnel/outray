import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createMiddleware, createStart } from "@tanstack/react-start";
import ts from "typescript";
import instancePolicy from "../../../shared/instance-config";

async function registeredOptions() {
  // Execute the source with real TanStack factories while isolating the shared
  // ESM/CJS import boundary, as the production bundler does.
  const source = await readFile(new URL("../src/start.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as {
    startInstance: { getOptions: () => Promise<{
      requestMiddleware: Array<{ options: { type: string; server: unknown } }>;
    }> };
  } };
  runInNewContext(compiled, {
    module, exports: module.exports, URL, Response,
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-start") return { createMiddleware, createStart };
      if (specifier === "../../../shared/instance-config") return instancePolicy;
      throw new Error(`Unexpected middleware dependency: ${specifier}`);
    },
  });
  return module.exports.startInstance.getOptions();
}

async function withPolicy<T>(mode: string, products: string, run: () => Promise<T>): Promise<T> {
  const values = { OUTRAY_DEPLOYMENT_MODE: mode, OUTRAY_PRODUCTS: products };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return await run(); }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

type RequestResult = { request: Request; context: object; response: Response };
type RuntimeRequestOptions = {
  request: Request;
  context: object;
  next: () => Promise<RequestResult>;
};

async function runRegisteredMiddleware(path: string) {
  const options = await registeredOptions();
  assert.equal(options.requestMiddleware?.length, 1);
  const registered = options.requestMiddleware[0];
  assert.equal(registered.options.type, "request");
  // The installed global request handler passes request/context/next, not pathname,
  // even though its RequestServerOptions declaration includes pathname.
  const server = registered.options.server as unknown as (
    options: RuntimeRequestOptions,
  ) => Response | RequestResult | Promise<Response | RequestResult>;
  const request = new Request(`https://instance.test${path}`);
  const context = Object.create(null);
  const downstream = { request, context, response: new Response("route reached") };
  let nextCalls = 0;
  const result = await server({
    request,
    context,
    next: async () => { nextCalls++; return downstream; },
  });
  return { result, downstream, nextCalls, response: result instanceof Response ? result : result.response };
}

test("registered request middleware accepts a Request without pathname for root and health routes", async () => {
  await withPolicy("self-hosted", "uptime,secrets", async () => {
    for (const path of ["/", "/health?check=ready", "/api/health?deep=true"]) {
      const { result, downstream, nextCalls } = await runRegisteredMiddleware(path);
      assert.equal(nextCalls, 1, path);
      assert.equal(result, downstream, path);
    }
  });
});

test("registered middleware blocks disabled product pages and APIs before downstream handlers", async () => {
  await withPolicy("self-hosted", "uptime,secrets", async () => {
    for (const path of ["/acme/tunnel?tab=active", "/api/tunnel/auth", "/api/acme/observability/alerts"]) {
      const { response, nextCalls } = await runRegisteredMiddleware(path);
      assert.equal(nextCalls, 0, path);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get("Cache-Control"), "no-store", path);
      assert.deepEqual(await response.json(), { error: "This feature is disabled on this installation" });
    }
  });
});

test("registered middleware lets enabled product pages and APIs continue exactly once", async () => {
  await withPolicy("self-hosted", "uptime,secrets", async () => {
    for (const path of ["/acme/uptime", "/api/acme/secrets/vaults?view=uptime", "/api/acme/uptime/monitors"]) {
      const { result, downstream, nextCalls } = await runRegisteredMiddleware(path);
      assert.equal(nextCalls, 1, path);
      assert.equal(result, downstream, path);
    }
  });
});

test("registered middleware denies self-hosted billing but preserves hosted billing", async () => {
  for (const mode of ["self-hosted", "hosted"]) {
    await withPolicy(mode, "tunnels,observability,secrets,uptime", async () => {
      for (const path of ["/acme/billing", "/api/checkout/polar"]) {
        const { response, nextCalls } = await runRegisteredMiddleware(path);
        assert.equal(response.status, mode === "self-hosted" ? 404 : 200, `${mode} ${path}`);
        assert.equal(nextCalls, mode === "self-hosted" ? 0 : 1, `${mode} ${path}`);
      }
    });
  }
});
