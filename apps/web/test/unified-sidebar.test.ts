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
  RouterContextProvider,
} from "@tanstack/react-router";
import {
  mobileItemIsActive,
  mobileProductForPath,
  mobileProducts,
} from "../src/components/mobile-navigation";
import {
  filterSidebarProducts,
  initialProductOpenState,
  normalizeProductNavigationPath,
  openProductForPath,
  toggleProductOpen,
} from "../src/components/sidebar/product-navigation-state";
import {
  ProductNavigation,
  type ProductNavigationProps,
} from "../src/components/sidebar/product-navigation";
import { NavItem } from "../src/components/sidebar/nav-item";
import { ActiveTunnelBadge } from "../src/components/sidebar/active-tunnel-badge";
import ts from "typescript";

// The Node test runner uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

const closedProducts = {
  tunnels: false,
  observability: false,
  secrets: false,
  uptime: false,
};

function renderNavigation(overrides: Partial<ProductNavigationProps> = {}) {
  const props: ProductNavigationProps = {
    orgSlug: "acme",
    pathname: "/acme/tunnel/requests/request-1",
    isCollapsed: false,
    searchQuery: "",
    canManageShares: true,
    ...overrides,
  };
  return renderWithRouter(React.createElement(ProductNavigation, props), props.pathname);
}

function renderWithRouter(children: React.ReactNode, pathname: string) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const index = createRoute({ getParentRoute: () => org, path: "/" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([index, rest])]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  // Render the component directly: full route matching can canonical-redirect a
  // trailing-slash fixture before the navigation itself gets a chance to render.
  return renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router,
    children,
  }));
}

function elements(html: string, tag: "a" | "button") {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "g"))]
    .map(([element]) => element);
}

function label(element: string) {
  return element.replace(/<[^>]*>/g, "").trim();
}

function activeBadges(html: string) {
  return [...html.matchAll(/<span\b[^>]*aria-label="[^"]* active tunnels?"[^>]*>[\s\S]*?<\/span>/g)]
    .map(([badge]) => badge);
}

test("unified navigation keeps all four products and their existing pages", () => {
  const products = filterSidebarProducts("", true);
  assert.deepEqual(products.map(({ key, label }) => [key, label]), [
    ["tunnels", "Tunnels"],
    ["observability", "Observability"],
    ["secrets", "Secrets"],
    ["uptime", "Uptime"],
  ]);
  assert.deepEqual(products.map(({ pages }) => pages.map(({ label }) => label)), [
    ["Overview", "Active tunnels", "Requests", "Subdomains", "Domains"],
    ["Overview", "Services", "Requests", "Metrics", "Logs", "Traces", "Alerts"],
    ["Overview", "Vaults", "Shares", "Trash", "Audit log"],
    ["Overview", "Monitors", "Incidents", "Notifications", "Status page"],
  ]);
});

test("product and page activation uses exact overviews and segment-safe nested routes", () => {
  for (const [pathname, productKey, pageLabel] of [
    ["/acme/tunnel", "tunnels", "Overview"],
    ["/acme/tunnel/tunnels/tunnel-1", "tunnels", "Active tunnels"],
    ["/acme/tunnel/requests/request-1", "tunnels", "Requests"],
    ["/acme/tunnel/subdomains/example", "tunnels", "Subdomains"],
    ["/acme/tunnel/domains/example", "tunnels", "Domains"],
    ["/acme/observability", "observability", "Overview"],
    ["/acme/observability/services/service-1", "observability", "Services"],
    ["/acme/observability/alerts/rule-1", "observability", "Alerts"],
    ["/acme/secrets", "secrets", "Overview"],
    ["/acme/secrets/vaults/vault-1", "secrets", "Vaults"],
    ["/acme/secrets/shares/share-1", "secrets", "Shares"],
    ["/acme/uptime", "uptime", "Overview"],
    ["/acme/uptime/incidents/incident-1", "uptime", "Incidents"],
  ]) {
    const product = mobileProductForPath(pathname, "acme");
    assert.equal(product?.key, productKey, pathname);
    assert.deepEqual(
      product?.pages.filter((page) => mobileItemIsActive(page, pathname, "acme"))
        .map(({ label }) => label),
      [pageLabel],
      pathname,
    );
  }
});

test("standalone workspace pages and lookalike tenant/product prefixes do not activate a product", () => {
  for (const pathname of [
    "/acme", "/acme/", "/acme/tunnels/tunnel-1", "/acme/requests/request-1",
    "/acme/subdomains/example", "/acme/domains/example",
    "/acme/members", "/acme/tokens", "/acme/billing", "/acme/settings",
    "/acme/observability-old", "/acme/secretsauce", "/acme/tunnels-archive", "/acme/tunnel-old",
    "/acme2/secrets", "/other/secrets", "/acme2/tunnel", "/other/tunnel/tunnels",
  ]) {
    assert.equal(mobileProductForPath(pathname, "acme"), null, pathname);
    assert.ok(mobileProducts.every(({ pages }) =>
      pages.every((page) => !mobileItemIsActive(page, pathname, "acme"))), pathname);
    assert.deepEqual(initialProductOpenState(pathname, "acme"), closedProducts);
  }
});

test("tunnel child lookalikes open the product without activating a different page", () => {
  const tunnels = mobileProducts[0];
  for (const pathname of [
    "/acme/tunnel/tunnels-archive", "/acme/tunnel/requests-old",
    "/acme/tunnel/subdomains-old", "/acme/tunnel/domains-old",
  ]) {
    assert.equal(mobileProductForPath(pathname, "acme")?.key, "tunnels", pathname);
    assert.ok(tunnels.pages.every((page) => !mobileItemIsActive(page, pathname, "acme")), pathname);
    assert.deepEqual(initialProductOpenState(pathname, "acme"), { ...closedProducts, tunnels: true });
  }
});

test("the desktop adapter normalizes trailing slashes without changing the mobile helpers", () => {
  assert.equal(normalizeProductNavigationPath("/"), "/");
  assert.equal(normalizeProductNavigationPath("/acme///"), "/acme");
  assert.equal(normalizeProductNavigationPath("/acme/secrets/"), "/acme/secrets");
  assert.equal(normalizeProductNavigationPath("/acme/tunnel///"), "/acme/tunnel");
  assert.deepEqual(initialProductOpenState("/acme/tunnel/", "acme"), { ...closedProducts, tunnels: true });
  assert.deepEqual(initialProductOpenState("/acme/", "acme"), closedProducts);
  assert.deepEqual(initialProductOpenState("/acme/secrets/", "acme"), { ...closedProducts, secrets: true });
  assert.equal(mobileProductForPath("/acme/", "acme"), null);
  assert.equal(mobileItemIsActive(mobileProducts[0].pages[0], "/acme/tunnel/", "acme"), false);
  assert.equal(mobileItemIsActive(mobileProducts[2].pages[0], "/acme/secrets/", "acme"), false);
});

test("denied Shares is excluded before product-name and page-label searches", () => {
  for (const query of ["", "secrets", " SECRETS "]) {
    const products = filterSidebarProducts(query, false);
    const secrets = products.find(({ key }) => key === "secrets");
    assert.ok(secrets);
    assert.deepEqual(secrets.pages.map(({ label }) => label), ["Overview", "Vaults", "Trash", "Audit log"]);
  }
  for (const query of ["share", " SHARES "]) {
    assert.deepEqual(filterSidebarProducts(query, false), []);
    assert.deepEqual(filterSidebarProducts(query, true).map(({ key, pages }) => ({
      key, pages: pages.map(({ label }) => label),
    })), [{ key: "secrets", pages: ["Shares"] }]);
  }
  assert.ok(mobileProducts.find(({ key }) => key === "secrets")?.pages
    .some(({ label }) => label === "Shares"), "permission filtering does not mutate shared route definitions");
});

test("search trims and case-folds page matches across products without requiring navigation", () => {
  assert.deepEqual(filterSidebarProducts(" ReQuEsTs ", false).map(({ key, pages }) => ({
    key, pages: pages.map(({ label }) => label),
  })), [
    { key: "tunnels", pages: ["Requests"] },
    { key: "observability", pages: ["Requests"] },
  ]);
  assert.deepEqual(filterSidebarProducts("status", false).map(({ key, pages }) => ({
    key, pages: pages.map(({ label }) => label),
  })), [{ key: "uptime", pages: ["Status page"] }]);
  assert.deepEqual(filterSidebarProducts("   ", true), filterSidebarProducts("", true));
  assert.deepEqual(filterSidebarProducts("not-a-dashboard-page", true), []);
});

test("restored product choices accept only known boolean values and always reveal the active product", () => {
  const saved = { tunnels: true, observability: false, secrets: "true", uptime: true, unrelated: true };
  const original = { ...saved };
  assert.deepEqual(initialProductOpenState("/acme/observability/logs", "acme", saved), {
    tunnels: true, observability: true, secrets: false, uptime: true,
  });
  assert.deepEqual(saved, original);
  for (const invalid of [null, "true", 1, [], [true, false]]) {
    assert.deepEqual(initialProductOpenState("/acme/secrets/vaults/vault-1", "acme", invalid), {
      ...closedProducts, secrets: true,
    });
  }
});

test("product disclosures toggle independently and navigation opens the destination without closing choices", () => {
  const state = initialProductOpenState("/acme/tunnel/tunnels/tunnel-1", "acme");
  const original = { ...state };
  const expanded = toggleProductOpen(state, "secrets");
  assert.deepEqual(expanded, { ...closedProducts, tunnels: true, secrets: true });
  assert.deepEqual(state, original);
  const collapsed = toggleProductOpen(expanded, "tunnels");
  assert.deepEqual(collapsed, { ...closedProducts, secrets: true });
  assert.deepEqual(openProductForPath(collapsed, "/acme/uptime/monitors/monitor-1", "acme"), {
    ...closedProducts, secrets: true, uptime: true,
  });
  assert.deepEqual(openProductForPath(collapsed, "/acme/members", "acme"), collapsed);
});

test("expanded navigation connects four disclosures to panels and highlights only the nested current page", async () => {
  const html = await renderNavigation({ pathname: "/acme/observability/services/service-1" });
  const buttons = elements(html, "button");
  assert.deepEqual(buttons.map(label), ["Tunnels", "Observability", "Secrets", "Uptime"]);
  const panelIds: string[] = [];
  for (const button of buttons) {
    const id = button.match(/\bid="([^"]+)"/)?.[1];
    const panelId = button.match(/aria-controls="([^"]+)"/)?.[1];
    assert.ok(id);
    assert.ok(panelId);
    panelIds.push(panelId);
    const panel = [...html.matchAll(/<div\b[^>]*>/g)]
      .map(([tag]) => tag).find((tag) => tag.includes(`id="${panelId}"`));
    assert.ok(panel);
    assert.ok(panel.includes(`aria-labelledby="${id}"`));
    if (label(button) === "Observability") {
      assert.match(button, /aria-expanded="true"/);
      assert.match(panel, /aria-hidden="false"/);
      assert.doesNotMatch(panel, /\binert=/);
    } else {
      assert.match(button, /aria-expanded="false"/);
      assert.match(panel, /aria-hidden="true"/);
      assert.match(panel, /\binert=""/);
    }
  }
  assert.equal(new Set(panelIds).size, 4);
  const links = elements(html, "a");
  const active = links.filter((link) => link.includes('aria-current="page"'));
  assert.equal(active.length, 1);
  assert.match(active[0], /href="\/acme\/observability\/services"/);
  assert.equal(label(active[0]), "Services");
  assert.doesNotMatch(active[0], /tabindex="-1"/);
  const hiddenRequest = links.find((link) => link.includes('href="/acme/tunnel/requests"'))!;
  assert.match(hiddenRequest, /tabindex="-1"/);
});

test("collapsed navigation has four named product links and no second-level controls", async () => {
  const html = await renderNavigation({ pathname: "/acme/secrets/vaults/vault-1", isCollapsed: true });
  const links = elements(html, "a");
  assert.equal(links.length, 4);
  for (const [index, product] of mobileProducts.entries()) {
    assert.ok(links[index].includes(`href="${product.to.replace("/$orgSlug", "/acme")}"`));
    assert.ok(links[index].includes(`aria-label="${product.label}"`));
  }
  assert.equal(elements(html, "button").length, 0);
  const active = links.filter((link) => link.includes('aria-current="page"'));
  assert.equal(active.length, 1);
  assert.match(active[0], /aria-label="Secrets"/);
});

test("positive tunnel counts appear only on the Active tunnels child link, never product disclosures", () => {
  const html = renderNavigation({ pathname: "/acme/tunnel/tunnels/tunnel-1", activeTunnelsCount: 123 });
  assert.equal(activeBadges(html).length, 1);
  const buttons = elements(html, "button");
  assert.deepEqual(buttons.map(label), ["Tunnels", "Observability", "Secrets", "Uptime"]);
  assert.ok(buttons.every((button) => activeBadges(button).length === 0));
  const links = elements(html, "a");
  const activeTunnels = links.find((link) => link.includes('href="/acme/tunnel/tunnels"'));
  assert.ok(activeTunnels);
  assert.match(activeTunnels, /aria-current="page"/);
  assert.equal(activeBadges(activeTunnels).length, 1);
  assert.match(activeBadges(activeTunnels)[0], /aria-label="123 active tunnels"/);
  assert.equal(label(activeBadges(activeTunnels)[0]), "123");
  assert.ok(links.filter((link) => link !== activeTunnels).every((link) => activeBadges(link).length === 0));
});

test("the collapsed product rail stays badge-free with normal product names even for positive counts", () => {
  const html = renderNavigation({ pathname: "/acme/tunnel/tunnels/tunnel-1", isCollapsed: true, activeTunnelsCount: 123 });
  assert.equal(activeBadges(html).length, 0);
  const links = elements(html, "a");
  assert.equal(links.length, 4);
  assert.ok(links[0].match(/<a\b[^>]*>/)?.[0].includes('aria-label="Tunnels"'));
  assert.ok(links[0].match(/<a\b[^>]*>/)?.[0].includes('title="Tunnels"'));
  assert.doesNotMatch(html, /Tunnels, 123 active tunnels/);
});

test("legacy Active tunnels child links receive the normal count badge beside their visible label", () => {
  for (const count of [1, 123]) {
    const html = renderWithRouter(React.createElement(NavItem, {
      to: "/$orgSlug/tunnel/tunnels",
      params: { orgSlug: "acme" },
      label: "Active tunnels",
      icon: mobileProducts[0].pages[1].icon,
      isCollapsed: false,
      isActive: true,
      badge: React.createElement(ActiveTunnelBadge, { count }),
    }), "/acme/tunnel/tunnels");
    const link = elements(html, "a")[0];
    const openingTag = link.match(/<a\b[^>]*>/)?.[0];
    assert.ok(openingTag);
    assert.match(openingTag, /href="\/acme\/tunnel\/tunnels"/);
    assert.match(link, />Active tunnels<\/span>/);
    assert.equal(activeBadges(link).length, 1);
    assert.equal(label(activeBadges(link)[0]), count.toLocaleString());
  }
});

test("zero, unknown, and invalid tunnel counts do not produce product badges", () => {
  for (const activeTunnelsCount of [undefined, 0, -1, 1.5, NaN]) {
    for (const isCollapsed of [false, true]) {
      assert.equal(activeBadges(renderNavigation({ activeTunnelsCount, isCollapsed })).length, 0);
    }
  }
});

test("search shows a count only when the Active tunnels child is among the expanded results", () => {
  for (const isCollapsed of [false, true]) {
    for (const searchQuery of ["tunnels", " AcTiVe ", "active tunnels"]) {
      const html = renderNavigation({ isCollapsed, searchQuery, activeTunnelsCount: 8 });
      assert.equal(activeBadges(html).length, isCollapsed ? 0 : 1);
      assert.ok(elements(html, "button").every((button) => activeBadges(button).length === 0));
      if (!isCollapsed) {
        const child = elements(html, "a").find((link) => link.includes('href="/acme/tunnel/tunnels"'));
        assert.ok(child);
        assert.equal(activeBadges(child).length, 1);
      }
    }
    for (const searchQuery of [" ReQuEsTs ", "logs", "secrets", "shares", "not-a-dashboard-page"]) {
      const html = renderNavigation({ isCollapsed, searchQuery, activeTunnelsCount: 8, canManageShares: false });
      assert.equal(activeBadges(html).length, 0);
    }
  }
});

test("unified and legacy child badges share a tenant-scoped query without primary-row count badges", async () => {
  const [primary, legacy] = await Promise.all([
    readFile(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/product-sub-sidebar.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of [primary, legacy]) {
    assert.match(source, /queryKey:\s*\["tunnels", orgSlug\]/);
    assert.match(source, /appClient\.tunnels\.list\(orgSlug\)/);
    assert.match(source, /refetchInterval:\s*30_000/);
    assert.match(source, /refetchIntervalInBackground:\s*false/);
    assert.doesNotMatch(source, /placeholderData/);
    assert.match(source, /const activeTunnelsCount = tunnelsError\s*\? undefined\s*:\s*tunnelsData\?\.tunnels\.length/);
  }
  assert.match(primary, /enabled:\s*!!orgSlug && unified/);
  assert.match(primary, /<ProductNavigation\b[\s\S]*?activeTunnelsCount=\{activeTunnelsCount\}/);
  assert.doesNotMatch(primary, /\bActiveTunnelBadge\b|\bactiveTunnelCountLabel\b|\bbadge=|\bariaLabel=/);
  assert.match(legacy, /enabled:\s*!!orgSlug && isTunnelRoute/);
  assert.match(legacy, /badge=\{\s*item\.to === "\/\$orgSlug\/tunnel\/tunnels"\s*\? \([\s\S]*?<ActiveTunnelBadge\b[\s\S]*?count=\{activeTunnelsCount\}/);
});

test("the legacy tunnel sidebar uses canonical links, exact overviews and segment-safe product matching", async () => {
  const source = await readFile(new URL("../src/components/product-sub-sidebar.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as { ProductSubSidebar: () => React.ReactNode } };
  const queries: { enabled: boolean }[] = [];
  let pathname = "/acme/tunnel";
  const Item = () => null;
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-router") return {
        useParams: () => ({ orgSlug: "acme" }), useLocation: () => ({ pathname }),
      };
      if (specifier === "@tanstack/react-query") return { useQuery: (options: { enabled: boolean }) => {
        queries.push(options); return { data: { tunnels: [{ id: "active" }] }, isError: false };
      } };
      if (specifier === "@/lib/auth-client") return { usePermission: () => ({ data: true }) };
      if (specifier === "@/lib/app-client") return { appClient: { tunnels: { list: () => {} } } };
      if (specifier === "./sidebar/nav-item") return { NavItem: Item };
      if (specifier === "./sidebar/active-tunnel-badge") return { ActiveTunnelBadge };
      if (specifier.startsWith("@outray/icons/")) return { __esModule: true, default: [] };
      throw new Error(`Unexpected legacy sidebar dependency: ${specifier}`);
    },
  });
  function items(node: React.ReactNode): React.ReactElement<{ children?: React.ReactNode; to: string; isActive: boolean }>[] {
    if (Array.isArray(node)) return node.flatMap(items);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<{ children?: React.ReactNode; to: string; isActive: boolean }>;
    return [...(element.type === Item ? [element] : []), ...items(element.props.children)];
  }
  for (const [path, activeTo] of [
    ["/acme/tunnel", "/$orgSlug/tunnel"],
    ["/acme/tunnel/tunnels/tunnel-1", "/$orgSlug/tunnel/tunnels"],
    ["/acme/tunnel/requests/request-1", "/$orgSlug/tunnel/requests"],
    ["/acme/tunnel/requests-old", null],
  ]) {
    pathname = path!;
    const links = items(module.exports.ProductSubSidebar());
    assert.deepEqual(links.map((item) => item.props.to), [
      "/$orgSlug/tunnel", "/$orgSlug/tunnel/tunnels", "/$orgSlug/tunnel/requests",
      "/$orgSlug/tunnel/subdomains", "/$orgSlug/tunnel/domains",
    ]);
    assert.deepEqual(links.filter((item) => item.props.isActive).map((item) => item.props.to), activeTo ? [activeTo] : [], path!);
    assert.equal(queries.at(-1)?.enabled, true);
  }
  for (const path of ["/acme", "/acme/tunnels", "/acme/requests", "/acme/tunnel-old", "/acme2/tunnel", "/other/tunnel"]) {
    pathname = path;
    assert.equal(module.exports.ProductSubSidebar(), null, path);
    assert.equal(queries.at(-1)?.enabled, false, path);
  }
});

test("a standalone workspace path leaves all product panels closed and no product link current", async () => {
  const html = await renderNavigation({ pathname: "/acme/members" });
  const buttons = elements(html, "button");
  assert.equal(buttons.length, 4);
  assert.ok(buttons.every((button) => button.includes('aria-expanded="false"')));
  assert.doesNotMatch(html, /aria-current="page"/);
  assert.ok(elements(html, "a").every((link) => link.includes('tabindex="-1"')));
});

test("search reveals page matches across products without writable disclosure choices", async () => {
  const html = await renderNavigation({ pathname: "/acme/members", searchQuery: " ReQuEsTs " });
  const buttons = elements(html, "button");
  assert.deepEqual(buttons.map(label), ["Tunnels", "Observability"]);
  assert.ok(buttons.every((button) => button.includes('aria-expanded="true"') && button.includes('disabled=""')));
  const links = elements(html, "a");
  assert.deepEqual(links.map((link) => link.match(/href="([^"]+)"/)?.[1]), [
    "/acme/tunnel/requests", "/acme/observability/requests",
  ]);
  assert.ok(links.every((link) => !link.includes('tabindex="-1"')));
  assert.equal(await renderNavigation({ searchQuery: "not-a-dashboard-page" }), "");
});

test("the rendered sidebar never exposes Shares when permission is denied, including search", async () => {
  for (const searchQuery of ["", "secrets", "shares"]) {
    const html = await renderNavigation({
      pathname: "/acme/secrets/vaults/vault-1", searchQuery, canManageShares: false,
    });
    assert.doesNotMatch(html, /href="\/acme\/secrets\/shares"|>Shares<\/span>/);
  }
  const allowed = await renderNavigation({ pathname: "/acme/secrets", searchQuery: "shares" });
  assert.match(allowed, /href="\/acme\/secrets\/shares"/);
});

test("trailing-slash product roots reveal and highlight their exact Overview page", async () => {
  for (const pathname of ["/acme/tunnel/", "/acme/secrets/"]) {
    const html = await renderNavigation({ pathname });
    assert.match(html, /aria-label="Products"/, `${pathname}: navigation should render before checking activity`);
    const active = elements(html, "a").filter((link) => link.includes('aria-current="page"'));
    assert.equal(active.length, 1, pathname);
    assert.equal(label(active[0]), "Overview");
    assert.doesNotMatch(active[0], /tabindex="-1"/);
  }
});

test("the layout uses one flag decision for unified primary navigation and the legacy second column", async () => {
  const layout = await readFile(new URL("../src/routes/$orgSlug.tsx", import.meta.url), "utf8");
  assert.match(layout, /const unifiedSidebar = useFeatureFlag\("unified_sidebar"\)/);
  assert.match(layout, /<Sidebar\b[^>]*unified=\{unifiedSidebar\}/);
  assert.match(layout, /\{!unifiedSidebar && <ProductSubSidebar\s*\/>\}/);
});
