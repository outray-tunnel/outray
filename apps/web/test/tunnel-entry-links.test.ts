import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterContextProvider,
} from "@tanstack/react-router";
import ts from "typescript";

Object.assign(globalThis, { React });

interface EntryState {
  session?: { user: { id: string } } | null;
  isPending?: boolean;
  organizations?: { id: string; slug: string }[];
  activeOrganization?: { id: string } | null;
  mobileMenuOpen?: boolean;
}

async function entryComponent(path: string, name: "Navigation" | "Navbar", state: EntryState) {
  const source = await readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as Record<string, React.ComponentType<any>> };
  let stateIndex = 0;
  const Placeholder = () => null;
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "@/lib/auth-client") return { authClient: {
        useSession: () => ({ data: state.session, isPending: state.isPending ?? false }),
        useActiveOrganization: () => ({ data: state.activeOrganization }),
        useListOrganizations: () => ({ data: state.organizations }),
      } };
      if (specifier === "react") return {
        useEffect: () => {}, useRef: () => ({ current: null }),
        useState: (initial: unknown) => [stateIndex++ === 1 ? state.mobileMenuOpen ?? initial : initial, () => {}],
      };
      if (specifier === "@tanstack/react-router") return { Link };
      if (specifier === "lucide-react" || specifier === "react-icons/si") return new Proxy({}, { get: () => Placeholder });
      if (specifier === "./ProductIcon") return { ProductIcon: Placeholder };
      if (specifier === "./github-button") return { GitHubButton: Placeholder };
      throw new Error(`Unexpected entry navigation dependency: ${specifier}`);
    },
  });
  return module.exports[name];
}

function renderEntry(Component: React.ComponentType<any>) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([rest])]),
    history: createMemoryHistory({ initialEntries: ["/pricing"] }),
  });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router,
    children: React.createElement(Component, {
      loginUrl: "/login", signupUrl: "/signup", docsUrl: "/docs", githubUrl: "https://github.com/outray",
    }),
  }));
}

function dashboardDestinations(html: string) {
  return [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
    .map(([link]) => link)
    .filter((link) => link.replace(/<[^>]*>/g, "").trim().startsWith("Dashboard"))
    .map((link) => link.match(/href="([^"]+)"/)?.[1]);
}

test("landing Dashboard actions enter the active organization's canonical Tunnel overview", async () => {
  const organizations = [{ id: "first", slug: "acme" }, { id: "active", slug: "team /?β" }];
  for (const [activeOrganization, destination] of [
    [{ id: "active" }, "/team%20%2F%3F%CE%B2/tunnel"],
    [{ id: "not-a-member" }, "/acme/tunnel"],
    [null, "/acme/tunnel"],
  ] as const) {
    const component = await entryComponent("landing/Navigation.tsx", "Navigation", {
      session: { user: { id: "signed-in" } }, organizations, activeOrganization,
    });
    assert.deepEqual(dashboardDestinations(renderEntry(component)), [destination, destination]);
  }
});

test("landing Dashboard actions retain organization selection when no membership is available", async () => {
  for (const organizations of [undefined, []]) {
    const component = await entryComponent("landing/Navigation.tsx", "Navigation", {
      session: { user: { id: "signed-in" } }, organizations,
    });
    assert.deepEqual(dashboardDestinations(renderEntry(component)), ["/select", "/select"]);
  }
  for (const state of [{ session: null }, { session: { user: { id: "signed-in" } }, isPending: true }]) {
    const component = await entryComponent("landing/Navigation.tsx", "Navigation", state);
    assert.deepEqual(dashboardDestinations(renderEntry(component)), []);
  }
});

test("the shared marketing navbar sends desktop and mobile Dashboard links directly to Tunnel overview", async () => {
  for (const [organizations, destination] of [
    [[{ id: "acme", slug: "acme" }], "/acme/tunnel"],
    [[], "/select"],
    [undefined, "/select"],
  ] as const) {
    const component = await entryComponent("components/landing/navbar.tsx", "Navbar", {
      session: { user: { id: "signed-in" } }, organizations: organizations ? [...organizations] : undefined,
      mobileMenuOpen: true,
    });
    assert.deepEqual(dashboardDestinations(renderEntry(component)), [destination, destination]);
  }
});
