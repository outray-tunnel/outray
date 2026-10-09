import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  AddressEmptyState,
  AddressListPanel,
  AddressListSkeleton,
} from "../src/components/tunnel-addresses/address-page";
import { SubdomainHeader } from "../src/components/subdomains/subdomain-header";
import { DomainHeader } from "../src/components/domains/domain-header";
import {
  filterDomains,
  filterSubdomains,
  isDomainStatusFilter,
  requireAddressResult,
} from "../src/components/tunnel-addresses/address-list-state";
import type { Domain, Subdomain } from "../src/lib/app-client";

Object.assign(globalThis, { React });

const date = new Date("2026-10-04T12:00:00Z");
const subdomain: Subdomain = {
  id: "sub-1",
  subdomain: "preview",
  createdAt: date,
  userId: "user",
  organizationId: "acme",
};
const domain: Domain = {
  id: "domain-1",
  domain: "api.example.com",
  status: "pending",
  createdAt: date,
  updatedAt: date,
  userId: "user",
  organizationId: "acme",
};

test("refreshed address and active tunnel search fields opt into the shared compact input", async () => {
  for (const page of ["domains.tsx", "subdomains.tsx", "tunnels/index.tsx"]) {
    const source = await readFile(new URL(`../src/routes/$orgSlug/tunnel/${page}`, import.meta.url), "utf8");
    const searches = [...source.matchAll(/<SearchField\b[\s\S]*?\/>/g)];
    assert.equal(searches.length, 1);
    assert.match(searches[0][0], /appearance="workspace"/);
    assert.match(searches[0][0], /onValueChange=/, "existing filtering callback is preserved");
  }
});

test("address search trims and matches names or complete addresses without changing quotas or source order", () => {
  const items = [subdomain, { ...subdomain, id: "sub-2", subdomain: "docs" }];
  assert.deepEqual(
    filterSubdomains(items, " PREVIEW.outray.app ").map((item) => item.id),
    ["sub-1"],
  );
  assert.deepEqual(
    filterSubdomains(items, "docs").map((item) => item.id),
    ["sub-2"],
  );
  assert.equal(filterSubdomains(items, "  "), items);
  assert.equal(filterSubdomains(items, "missing").length, 0);
  assert.equal(items.length, 2);
});

test("domain search and status filtering combine and include every existing state", () => {
  const items: Domain[] = [
    domain,
    { ...domain, id: "active", status: "active" },
    { ...domain, id: "failed", status: "failed", domain: "docs.example.com" },
  ];
  assert.deepEqual(
    filterDomains(items, " API.EXAMPLE ", "active").map((item) => item.id),
    ["active"],
  );
  assert.deepEqual(
    filterDomains(items, "", "pending").map((item) => item.id),
    ["domain-1"],
  );
  assert.deepEqual(
    filterDomains(items, "DOCS", "failed").map((item) => item.id),
    ["failed"],
  );
  assert.equal(filterDomains(items, "", "all").length, 3);
  assert.equal(filterDomains(items, "api", "failed").length, 0);
  for (const status of ["all", "pending", "active", "failed"])
    assert.equal(isDomainStatusFilter(status), true);
  for (const status of ["", "unknown", "operational"])
    assert.equal(isDomainStatusFilter(status), false);
});

test("API errors reject before confirmations close; a successful domain deletion message stays valid", () => {
  assert.throws(
    () => requireAddressResult({ error: "Cannot release this address" }),
    /Cannot release this address/,
  );
  const result = { message: "Domain deleted successfully" };
  assert.equal(requireAddressResult(result), result);
  assert.deepEqual(requireAddressResult({ success: true }), { success: true });
});

test("both headers share small typography, full action labels, and clickable plan-limit guidance", () => {
  for (const [component, props, label] of [
    [
      SubdomainHeader,
      { currentSubdomainCount: 5, subdomainLimit: 5 },
      "Reserve subdomain",
    ],
    [DomainHeader, { currentDomainCount: 5, domainLimit: 5 }, "Add domain"],
  ] as const) {
    const html = renderToStaticMarkup(
      React.createElement(component as React.ComponentType<any>, {
        ...props,
        isUnlimited: false,
        isAtLimit: true,
        onAddClick: () => {},
      }),
    );
    assert.match(html, /text-\[20px\] font-normal/);
    assert.match(html, /aria-haspopup="dialog"/);
    const button = html.match(/<button\b[^>]*>/)?.[0];
    assert.ok(button);
    assert.match(button, /class="[^"]*\bmd\b/);
    assert.ok(html.includes(`aria-label="${label} (plan limit reached)"`));
    assert.match(html, /5<\/span> of 5 used/);
    assert.doesNotMatch(html, /disabled=""|text-2xl|rounded-full/);
  }
});

test("unknown plan limits show a placeholder and prevent premature creation", () => {
  const html = renderToStaticMarkup(
    React.createElement(DomainHeader, {
      currentDomainCount: 0,
      domainLimit: 0,
      isUnlimited: false,
      isAtLimit: false,
      isReady: false,
      onAddClick: () => {},
    }),
  );
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /of 0 used/);
  const unlimited = renderToStaticMarkup(
    React.createElement(DomainHeader, {
      currentDomainCount: 3,
      domainLimit: 999999999,
      isUnlimited: true,
      isAtLimit: false,
      onAddClick: () => {},
    }),
  );
  assert.match(unlimited, /3<\/span> in this workspace/);
  assert.doesNotMatch(unlimited, /999999999/);
});

test("address panels and skeletons retain the same compact rows with reduced-motion support", () => {
  const html = renderToStaticMarkup(
    React.createElement(AddressListPanel, {
      label: "Custom domains",
      toolbar: "Search",
      children: React.createElement(AddressListSkeleton, {
        label: "Loading domains",
      }),
    }),
  );
  assert.match(html, /<section aria-label="Custom domains"/);
  assert.match(html, /overflow-hidden rounded-xl/);
  assert.match(html, /aria-label="Loading domains" aria-busy="true"/);
  assert.equal((html.match(/min-h-20/g) ?? []).length, 3);
  assert.match(html, /motion-reduce:animate-none/);
});

test("failed requests and empty histories have distinct accessible actions", () => {
  const error = renderToStaticMarkup(
    React.createElement(AddressEmptyState, {
      isError: true,
      title: "Could not load domains",
      description: "Try again",
      action: "Retry",
      onAction: () => {},
    }),
  );
  assert.match(error, /role="alert"/);
  assert.match(error, /Could not load domains/);
  const empty = renderToStaticMarkup(
    React.createElement(AddressEmptyState, {
      title: "No matching domains",
      description: "Clear your filters",
      action: "Clear filters",
      onAction: () => {},
    }),
  );
  assert.doesNotMatch(empty, /role="alert"/);
  assert.match(empty, /No matching domains|Clear filters/);
});

test("empty address creation uses md while retry and clear actions stay compact", () => {
  for (const actionSize of ["md", "sm"] as const) {
    const html = renderToStaticMarkup(React.createElement(AddressEmptyState, {
      title: "No addresses", description: "Add an address", action: "Add domain",
      actionSize, onAction() {},
    }));
    assert.ok(html.match(/<button\b[^>]*>/)?.[0].includes(` ${actionSize} `));
  }
});

type Mutation = {
  mutationFn: (value: string) => Promise<any>;
  onSuccess: (value: any, id?: string) => void;
};

/** Execute the real page's query/mutation wiring with no network, auth, or database dependencies. */
async function loadPage(resource: "domains" | "subdomains") {
  const source = await readFile(
    new URL(`../src/routes/$orgSlug/tunnel/${resource}.tsx`, import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const queries: { queryFn: () => Promise<any>; queryKey: string[] }[] = [];
  const mutations: Mutation[] = [];
  const cache = new Map<string, any>([
    [resource, { [resource]: [resource === "domains" ? domain : subdomain] }],
  ]);
  const invalidated: string[][] = [];
  let response: any = { error: "Server rejected the action" };
  const client = {
    subscriptions: { get: async () => response },
    [resource]: {
      list: async () => response,
      create: async () => response,
      delete: async () => response,
      verify: async () => response,
    },
  };
  const module = {
    exports: {} as { Route: { component: () => React.ReactElement<any> } },
  };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    React,
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-router")
        return {
          createFileRoute: () => (options: object) => ({
            ...options,
            useParams: () => ({ orgSlug: "acme" }),
          }),
        };
      if (specifier === "react")
        return {
          useRef: () => ({ current: null }),
          useState: (initial: unknown) => [initial, () => {}],
        };
      if (specifier === "@tanstack/react-query")
        return {
          useQueryClient: () => ({
            setQueryData: (key: string[], update: (current: any) => any) =>
              cache.set(key[0], update(cache.get(key[0]))),
            invalidateQueries: ({ queryKey }: { queryKey: string[] }) => {
              invalidated.push(Array.from(queryKey));
            },
          }),
          useQuery: (options: (typeof queries)[number]) => {
            queries.push(options);
            return {
              data:
                options.queryKey[0] === "subscription"
                  ? { subscription: { plan: "ray" } }
                  : cache.get(resource),
            };
          },
          useMutation: (options: Mutation) => {
            mutations.push(options);
            return {
              isPending: false,
              reset: () => {},
              mutate: () => {},
              mutateAsync: () => {},
            };
          },
        };
      if (specifier === "@/lib/app-client") return { appClient: client };
      if (specifier === "@/lib/subscription-plans")
        return {
          getPlanLimits: () => ({ maxDomains: 5, maxSubdomains: 5 }),
          isUnlimitedPlanLimit: () => false,
        };
      if (specifier.endsWith("address-list-state"))
        return {
          filterDomains,
          filterSubdomains,
          requireAddressResult,
          isDomainStatusFilter,
          domainStatusOptions: [],
        };
      if (specifier.startsWith("@/components/"))
        return new Proxy({}, { get: () => () => null });
      throw new Error(`Unexpected dependency ${specifier}`);
    },
  });
  const page = module.exports.Route.component();
  assert.equal(
    page.key,
    "acme",
    "changing workspace resets the forms and row-local interaction state",
  );
  (page.type as React.FunctionComponent<any>)(page.props);
  return {
    queries,
    mutations,
    cache,
    invalidated,
    respond: (value: any) => {
      response = value;
    },
    source,
  };
}

for (const resource of ["subdomains", "domains"] as const) {
  test(`${resource} query and mutation wiring surfaces rejected API values`, async () => {
    const page = await loadPage(resource);
    for (const query of page.queries)
      await assert.rejects(query.queryFn(), /Server rejected the action/);
    for (const mutation of page.mutations)
      await assert.rejects(
        mutation.mutationFn("address-id"),
        /Server rejected the action/,
      );
    assert.match(page.source, /deleteMutation\.mutateAsync\(id\)/);
    assert.match(page.source, /createMutation\.reset\(\)/);
    assert.match(page.source, /triggerRef=\{createTrigger\}/);
  });

  test(`${resource} creation and deletion update only their workspace cache immediately`, async () => {
    const page = await loadPage(resource);
    const created =
      resource === "domains"
        ? { ...domain, id: "domain-2" }
        : { ...subdomain, id: "sub-2" };
    const singular = resource === "domains" ? "domain" : "subdomain";
    page.mutations[0].onSuccess({ [singular]: created });
    assert.deepEqual(
      Array.from(page.cache.get(resource)[resource], (item: any) => item.id),
      [created.id, resource === "domains" ? domain.id : subdomain.id],
    );
    page.mutations[1].onSuccess({ success: true }, created.id);
    assert.equal(page.cache.get(resource)[resource].length, 1);
    assert.deepEqual(page.invalidated, [
      [resource, "acme"],
      [resource, "acme"],
    ]);
  });
}

test("domain verification rejects false success and only changes the originating row", async () => {
  const page = await loadPage("domains");
  page.respond({ verified: false, message: "TXT record missing" });
  await assert.rejects(
    page.mutations[2].mutationFn(domain.id),
    /TXT record missing/,
  );
  page.respond({ verified: true });
  assert.equal((await page.mutations[2].mutationFn(domain.id)).verified, true);
  page.mutations[2].onSuccess({ verified: true }, domain.id);
  assert.equal(page.cache.get("domains").domains[0].status, "active");
  assert.deepEqual(page.invalidated, [["domains", "acme"]]);
  assert.match(page.source, /verifyMutation\.variables === domain\.id/);
  assert.match(
    page.source,
    /defaultExpanded=\{createdDomainId === domain\.id\}/,
  );
});
