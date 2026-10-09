import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
  redirect,
} from "@tanstack/react-router";
import {
  getLegacyTunnelPathname,
  getLegacyTunnelRedirect,
  legacyTunnelRedirectLocation,
} from "../src/lib/tunnel-legacy-redirect";
import { parseTunnelDetailSearch } from "../src/lib/tunnel-detail-search";

const pages = [
  { file: "index.tsx", legacy: "", routeId: "/$orgSlug/", to: "/$orgSlug/tunnel", canonical: "/tunnel" },
  { file: "tunnels/index.tsx", legacy: "/tunnels", routeId: "/$orgSlug/tunnels/", to: "/$orgSlug/tunnel/tunnels", canonical: "/tunnel/tunnels" },
  { file: "tunnels/$tunnelId.tsx", legacy: "/tunnels/tunnel-1", routeId: "/$orgSlug/tunnels/$tunnelId", to: "/$orgSlug/tunnel/tunnels/$tunnelId", canonical: "/tunnel/tunnels/tunnel-1", tunnelId: "tunnel-1" },
  { file: "requests.tsx", legacy: "/requests", routeId: "/$orgSlug/requests", to: "/$orgSlug/tunnel/requests", canonical: "/tunnel/requests" },
  { file: "subdomains.tsx", legacy: "/subdomains", routeId: "/$orgSlug/subdomains", to: "/$orgSlug/tunnel/subdomains", canonical: "/tunnel/subdomains" },
  { file: "domains.tsx", legacy: "/domains", routeId: "/$orgSlug/domains", to: "/$orgSlug/tunnel/domains", canonical: "/tunnel/domains" },
] as const;

type LegacyRoute = {
  routeId: string;
  options: {
    beforeLoad: (context: {
      params: { orgSlug: string; tunnelId?: string };
      context: { instance: { products: string[] } };
      location: { publicHref: string; href?: string; searchStr?: string; hash?: string; search: Record<string, unknown> };
    }) => never;
    component?: unknown;
    loader?: unknown;
    validateSearch?: unknown;
  };
};

/** Load the real stubs with only router and redirect helpers. Query modules are
 * deliberately unavailable, so a retired URL cannot import a product view. */
async function loadLegacyRoute(file: string): Promise<LegacyRoute> {
  const path = new URL(`../src/routes/$orgSlug/${file}`, import.meta.url);
  const source = await readFile(path, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} as { Route: LegacyRoute } };
  runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name: string) => {
      if (name === "@tanstack/react-router") {
        return { createFileRoute: (routeId: string) => (options: LegacyRoute["options"]) => ({ routeId, options }), redirect };
      }
      if (name === "@/lib/tunnel-legacy-redirect") return { legacyTunnelRedirectLocation };
      if (name === "@/lib/tunnel-detail-search") return { parseTunnelDetailSearch };
      throw new Error(`Legacy route imports a non-redirect module: ${name}`);
    },
  }, { filename: String(path) });
  return module.exports.Route;
}

function thrownRedirect(route: LegacyRoute, orgSlug: string, publicHref: string, tunnelId?: string) {
  let thrown: unknown;
  try {
    route.options.beforeLoad({
      params: { orgSlug, ...(tunnelId ? { tunnelId } : {}) },
      context: { instance: { products: ["tunnels", "observability", "secrets", "uptime"] } },
      // These normalized values must never replace the original query/hash.
      location: { publicHref, href: "/wrong-org/requests?lost=true", searchStr: "?lost=true", hash: "wrong", search: { tab: "requests", range: "7d" } },
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(isRedirect(thrown), "beforeLoad throws the real TanStack redirect Response");
  return thrown;
}

test("every retired Tunnel page redirects to its canonical organization-scoped route", async () => {
  for (const page of pages) {
    const route = await loadLegacyRoute(page.file);
    assert.equal(route.routeId, page.routeId);
    assert.equal(route.options.component, undefined);
    assert.equal(route.options.loader, undefined);
    assert.equal(route.options.validateSearch, undefined);
    for (const orgSlug of ["acme", "other-org"]) {
      for (const trailingSlash of ["", "/"]) {
        const tunnelId = "tunnelId" in page ? page.tunnelId : undefined;
        const result = thrownRedirect(route, orgSlug, `/${orgSlug}${page.legacy}${trailingSlash}`, tunnelId);
        assert.equal(result.options.to, page.to);
        assert.equal(result.options.params.orgSlug, orgSlug);
        if (tunnelId) assert.equal(result.options.params.tunnelId, tunnelId);
        if (tunnelId) assert.deepEqual(result.options.search, { tab: "requests", range: "7d" });
        assert.equal(result.options.href, `/${orgSlug}${page.canonical}`);
        assert.equal(result.options.publicHref, result.options.href);
        assert.equal(result.options.replace, true);
        assert.equal(result.options.reloadDocument, true);
        assert.equal(result.headers.get("Location"), result.options.href);
      }
    }
  }
});

test("all old routes preserve duplicate, unknown, empty, encoded query values and the raw fragment", async () => {
  const suffix = "?tab=requests&range=7d&unknown=one&unknown=two&empty=&plus=a+b&encoded=%2F%23%25#trace%2F1#part";
  for (const page of pages) {
    const route = await loadLegacyRoute(page.file);
    const tunnelId = "tunnelId" in page ? page.tunnelId : undefined;
    const result = thrownRedirect(route, "acme", `/acme${page.legacy}${suffix}`, tunnelId);
    assert.equal(result.options.href, `/acme${page.canonical}${suffix}`);
    assert.equal(result.headers.get("Location"), `/acme${page.canonical}${suffix}`);
  }
  for (const suffix of ["", "?", "#", "#fragment", "?unknown=true", "#fragment?not-a-query"]) {
    assert.equal(getLegacyTunnelRedirect(`/acme/tunnels${suffix}`)?.href, `/acme/tunnel/tunnels${suffix}`);
  }
});

test("encoded organization and tunnel identifiers are retained exactly once", async () => {
  const route = await loadLegacyRoute("tunnels/$tunnelId.tsx");
  const result = thrownRedirect(route, "org é", "/org%20%C3%A9/tunnels/id%2Fwith%20spaces%23%25?range=1h#request", "id/with spaces#%");
  assert.equal(result.options.params.orgSlug, "org é");
  assert.equal(result.options.params.tunnelId, "id/with spaces#%");
  assert.equal(result.options.href, "/org%20%C3%A9/tunnel/tunnels/id%2Fwith%20spaces%23%25?range=1h#request");
  assert.doesNotMatch(result.options.href!, /%252F|%2520|%2523|%2525/);
});

test("missing, unknown, canonical, other-product, and external paths are not legacy destinations", () => {
  for (const pathname of [
    "", "/", "//acme/tunnels", "/acme//tunnels", "/acme/tunnels/one/extra",
    "/acme/requests/unknown", "/acme/subdomains/unknown", "/acme/domains/unknown",
    "/acme/missing", "/acme/tunnel", "/acme/tunnel/requests", "/acme/uptime",
    "/acme/observability/requests", "/acme/secrets", "/acme/settings", "/api/acme/tunnels",
    "https://evil.example/acme/tunnels", "/\\evil.example/tunnels", "/../tunnels", "/acme/tunnels/..",
  ]) {
    assert.equal(getLegacyTunnelPathname(pathname), null, pathname);
    assert.equal(getLegacyTunnelRedirect(`${pathname}?keep=1#fragment`), null, pathname);
  }
  assert.throws(() => legacyTunnelRedirectLocation({ publicHref: "/acme/unknown" }), /Not a legacy Tunnel/);
});

test("actual router resolution and hard navigation retain the original suffix and replace history", async (t) => {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const tunnel = createRoute({ getParentRoute: () => org, path: "tunnel" });
  const requests = createRoute({ getParentRoute: () => tunnel, path: "requests" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([tunnel.addChildren([requests])])]),
    history: createMemoryHistory({ initialEntries: ["/stale-org/requests"] }),
  });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const replacements: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { replace: (href: string) => replacements.push(href) } } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  const route = await loadLegacyRoute("requests.tsx");
  const rawHref = "/acme/requests?unknown=one&unknown=two&plus=a+b#trace#part";
  const result = router.resolveRedirect(thrownRedirect(route, "acme", rawHref));
  const canonicalHref = "/acme/tunnel/requests?unknown=one&unknown=two&plus=a+b#trace#part";
  assert.equal(result.headers.get("Location"), canonicalHref);
  await router.navigate(result.options);
  assert.deepEqual(replacements, [canonicalHref]);
});
