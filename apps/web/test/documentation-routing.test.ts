import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { getDocumentationAlias, parseOrganizationRouteParams } from "../src/lib/documentation-routing";
import instancePolicy from "../../../shared/instance-config";

const routing = { getDocumentationAlias, parseOrganizationRouteParams };
const instance = { products: ["tunnels", "observability", "secrets", "uptime"], billingEnabled: true };

/** Execute the actual route configuration without importing auth, pools, or MDX bundles. */
async function loadRouteOptions(file: string, modules: Record<string, unknown> = {}) {
  const source = (await readFile(new URL(`../src/routes/${file}`, import.meta.url), "utf8"))
    .replace("import.meta.env.PUBLIC_SITE_URL", "undefined");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} as { Route: { options: any } } };
  runInNewContext(compiled, {
    module, exports: module.exports, URL, React,
    require(specifier: string) {
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (options: unknown) => ({ options }), notFound, redirect };
      if (specifier === "@/lib/documentation-routing") return routing;
      if (specifier === "react/jsx-runtime") return jsxRuntime;
      if (specifier === "react") return React;
      if (Object.hasOwn(modules, specifier)) return modules[specifier];
      return {};
    },
  });
  return module.exports.Route.options;
}

async function docsRoutes(path: string, available = true) {
  const requests: string[][] = [];
  const preloads: string[] = [];
  const orgOptions = await loadRouteOptions("$orgSlug.tsx", {
    "../../../../shared/instance-config": instancePolicy,
  });
  const docsOptions = await loadRouteOptions("docs/$.tsx", {
    "@tanstack/react-start": {
      createServerFn: () => ({ inputValidator: () => ({ handler: (handler: ({ data }: { data: string[] }) => unknown) => handler }) }),
    },
    "@/lib/source": {
      source: {
        getPage(slugs: string[]) {
          requests.push(Array.from(slugs));
          return available ? { path: `${slugs.join("/") || "index"}.mdx`, data: { title: "A public guide", description: "Documentation" } } : undefined;
        },
        getPageTree: () => ({ children: [] }),
        serializePageTree: async (tree: unknown) => tree,
      },
    },
    "fumadocs-mdx:collections/browser": {
      default: { docs: { createClientLoader: () => ({ preload: async (file: string) => { preloads.push(file); } }) } },
    },
  });
  const root = createRootRoute({ beforeLoad: () => ({ instance }) });
  const docs = createRoute({ ...docsOptions, getParentRoute: () => root, path: "docs/$" });
  const org = createRoute({ ...orgOptions, getParentRoute: () => root, path: "$orgSlug" });
  const tunnel = createRoute({ getParentRoute: () => org, path: "tunnel" });
  const tunnelList = createRoute({ getParentRoute: () => tunnel, path: "tunnels" });
  const tunnelDetail = createRoute({ getParentRoute: () => tunnel, path: "tunnels/$tunnelId" });
  const observability = createRoute({ getParentRoute: () => org, path: "observability" });
  const services = createRoute({ getParentRoute: () => observability, path: "services" });
  const uptime = createRoute({ getParentRoute: () => org, path: "uptime" });
  const incidents = createRoute({ getParentRoute: () => uptime, path: "incidents" });
  const secrets = createRoute({ getParentRoute: () => org, path: "secrets" });
  const vaults = createRoute({ getParentRoute: () => secrets, path: "vaults" });
  const router = createRouter({
    routeTree: root.addChildren([
      docs,
      org.addChildren([
        tunnel.addChildren([tunnelList, tunnelDetail]),
        observability.addChildren([services]),
        uptime.addChildren([incidents]),
        secrets.addChildren([vaults]),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
  });
  return { router, docsOptions, orgOptions, requests, preloads };
}

test("actual organization route skips docs before matching deeper exact product routes", async () => {
  const { router, orgOptions } = await docsRoutes("/docs");
  assert.equal(orgOptions.params.parse({ orgSlug: "docs" }), false);
  for (const path of ["/docs/tunnel/tunnels", "/docs/tunnel/tunnels/id", "/docs/observability/services", "/docs/uptime/incidents", "/docs/secrets/vaults", "/docs/missing", "/docs", "/docs/"]) {
    const matches = router.matchRoutes(path);
    assert.equal(matches.at(-1)?.routeId, "/docs/$", path);
    assert.ok(matches.every((match) => !match.routeId.includes("$orgSlug")), path);
    assert.equal(matches.at(-1)?.params.orgSlug, undefined, path);
  }
});

test("valid colliding guides run the documentation loader and preload their MDX", async () => {
  for (const path of ["/docs/uptime/incidents", "/docs/observability/services", "/docs/tunnels"]) {
    const { router, requests, preloads } = await docsRoutes(path);
    await router.load();
    assert.equal(router.state.matches.at(-1)?.routeId, "/docs/$", path);
    assert.equal(router.state.matches.at(-1)?.status, "success", path);
    assert.deepEqual(requests, [path.slice("/docs/".length).split("/")], path);
    assert.deepEqual(preloads, [`${path.slice("/docs/".length)}.mdx`], path);
  }
});

test("missing colliding guides stay public documentation 404s, not organization errors", async () => {
  const { router, docsOptions, preloads } = await docsRoutes("/docs/secrets/vaults", false);
  await router.load();
  assert.equal(router.state.matches.at(-1)?.status, "notFound");
  assert.ok(router.state.matches.every((match) => !match.routeId.includes("$orgSlug")));
  assert.deepEqual(preloads, []);
  const html = renderToStaticMarkup(React.createElement(docsOptions.notFoundComponent));
  assert.match(html, /Documentation page not found/);
  assert.match(html, /href="\/docs"/);
  assert.doesNotMatch(html, /Organization not found|onboarding|Loading organizations/);
});

test("ordinary and unknown organization URLs still match their protected workspace branch", async () => {
  const { router, orgOptions } = await docsRoutes("/docs");
  for (const slug of ["acme", "unknown-org", "my-docs", "documentation", "select"]) {
    const match = router.matchRoutes(`/${slug}/tunnel/tunnels`).at(-1);
    assert.equal(match?.routeId, "/$orgSlug/tunnel/tunnels");
    assert.equal(match?.params.orgSlug, slug);
    const params = { orgSlug: slug };
    assert.equal(orgOptions.params.parse(params), params, "accepted params are returned unchanged");
  }
  assert.equal(orgOptions.params.parse({ orgSlug: "DOCS" }), false);
  assert.throws(() => orgOptions.beforeLoad({ context: { instance: { products: ["secrets"], billingEnabled: true } }, location: { pathname: "/acme/tunnel" } }), () => true, "existing product restrictions remain enforced");
});

test("only the reported legacy docs link redirects, preserving raw query and fragment", async () => {
  const suffix = "?unknown=one&unknown=two&plus=a+b&empty=#connection%2F1#part";
  for (const slash of ["", "/"]) {
    assert.equal(getDocumentationAlias(`/docs/tunnel/tunnels${slash}${suffix}`), `/docs/tunnels${suffix}`);
  }
  for (const path of ["/docs/tunnels", "/docs/tunnel/unknown", "/docs/tunnel/tunnels/id", "/acme/tunnel/tunnels", "https://evil.example/docs/tunnel/tunnels", "//docs/tunnel/tunnels", "/docs/tunnel//tunnels"]) {
    assert.equal(getDocumentationAlias(path), null, path);
  }
  const { docsOptions } = await docsRoutes("/docs");
  assert.throws(() => docsOptions.beforeLoad({ location: { publicHref: `/docs/tunnel/tunnels${suffix}` } }), (error: unknown) => {
    assert.ok(isRedirect(error));
    assert.equal(error.headers.get("Location"), `/docs/tunnels${suffix}`);
    assert.equal(error.options.replace, true);
    assert.equal(error.options.reloadDocument, true);
    assert.equal(error.status, 308);
    return true;
  });
});
