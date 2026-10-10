import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory, createRootRouteWithContext, createRoute, createRouter,
  Outlet, redirect, RouterProvider,
} from "@tanstack/react-router";
import ts from "typescript";
import { getCachedAuthSession } from "../src/lib/auth-session-cache";

Object.assign(globalThis, { React });
type InstanceContext = { instance: { selfHosted: boolean } };

async function homeFixture(selfHosted: boolean, destination: () => Promise<"/login" | "/select">) {
  const source = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source.replaceAll("import.meta.env", "importMetaEnv"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let landingRenders = 0;
  const LandingPage = () => { landingRenders++; return React.createElement("main", null, "Hosted landing page"); };
  const module = { exports: {} as { Route: { options: {
    beforeLoad: (args: { context: InstanceContext }) => Promise<void>;
    component: typeof LandingPage;
  } } } };
  runInNewContext(compiled, {
    module, exports: module.exports, URL, importMetaEnv: { PUBLIC_SITE_URL: "https://instance.test" },
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (options: unknown) => ({ options }), redirect };
      if (specifier === "@/landing/LandingPage") return { LandingPage };
      if (specifier === "@/lib/self-hosted-home") return { getSelfHostedHomeDestination: destination };
      if (specifier === "@/landing/landing.css?url") return { default: "/landing.css" };
      throw new Error(`Unexpected root dependency: ${specifier}`);
    },
  });
  const root = createRootRouteWithContext<InstanceContext>()({ component: Outlet });
  const home = createRoute({ getParentRoute: () => root, path: "/", ...module.exports.Route.options });
  const login = createRoute({ getParentRoute: () => root, path: "login", component: () => React.createElement("p", null, "Sign in") });
  const select = createRoute({ getParentRoute: () => root, path: "select", component: () => React.createElement("p", null, "Choose workspace") });
  const router = createRouter({
    routeTree: root.addChildren([home, login, select]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { instance: { selfHosted } }, isServer: true,
  });
  return { router, landingRenders: () => landingRenders };
}

test("self-hosted root redirects before rendering for anonymous and authenticated sessions", async () => {
  for (const destination of ["/login", "/select"] as const) {
    let calls = 0;
    const fixture = await homeFixture(true, async () => { calls++; return destination; });
    await fixture.router.load();
    assert.equal(calls, 1);
    assert.equal(fixture.router.state.redirect?.options.to, destination);
    assert.equal(fixture.router.state.redirect?.options.replace, true);
    const html = renderToStaticMarkup(React.createElement(RouterProvider, { router: fixture.router }));
    assert.doesNotMatch(html, /Hosted landing page/);
    assert.equal(fixture.landingRenders(), 0);
  }
});

test("hosted root still renders the landing page without resolving a session", async () => {
  const fixture = await homeFixture(false, async () => { throw new Error("Hosted root must not perform an auth lookup"); });
  await fixture.router.load();
  assert.equal(fixture.router.state.redirect, undefined);
  const html = renderToStaticMarkup(React.createElement(RouterProvider, { router: fixture.router }));
  assert.match(html, /Hosted landing page/);
  assert.equal(fixture.landingRenders(), 1);
});

test("self-hosted root does not render the landing page while the session lookup is pending", async () => {
  let finish!: (destination: "/login") => void;
  const fixture = await homeFixture(true, () => new Promise((resolve) => { finish = resolve; }));
  const loading = fixture.router.load();
  await new Promise((resolve) => setImmediate(resolve));
  const html = renderToStaticMarkup(React.createElement(RouterProvider, { router: fixture.router }));
  assert.doesNotMatch(html, /Hosted landing page/);
  assert.equal(fixture.landingRenders(), 0);
  finish("/login");
  await loading;
  assert.equal(fixture.router.state.redirect?.options.to, "/login");
});

test("the GET destination helper forwards request credentials through the existing server-session helper and returns no session data", async () => {
  const source = await readFile(new URL("../src/lib/self-hosted-home.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const session of [null, { user: { id: "test-user", email: "private@example.test" } }]) {
    const request = new Request("https://instance.test/", { headers: { cookie: `home-fixture-${session ? "signed-in" : "anonymous"}=test` } });
    let calls = 0;
    const module = { exports: {} as { getSelfHostedHomeDestination: () => Promise<string> } };
    runInNewContext(compiled, {
      module, exports: module.exports,
      require: (specifier: string) => {
        if (specifier === "@tanstack/react-start") return { createServerFn: (options: { method: string }) => {
          assert.equal(options.method, "GET"); return { handler: (handler: unknown) => handler };
        } };
        if (specifier === "@tanstack/react-start/server") return { getRequest: () => request };
        if (specifier === "./auth-session-cache") return { getCachedAuthSession };
        if (specifier === "./auth") return { auth: { api: { getSession: async ({ headers }: { headers: Headers }) => {
          calls++; assert.equal(headers, request.headers); return session;
        } } } };
        throw new Error(`Unexpected destination helper dependency: ${specifier}`);
      },
    });
    assert.equal(await module.exports.getSelfHostedHomeDestination(), session ? "/select" : "/login");
    assert.equal(calls, 1);
  }
});
