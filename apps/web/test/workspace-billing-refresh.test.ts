import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { BillingContent, BillingOverview, BillingPlanComparison, BillingSkeleton, BillingUsageMetric } from "../src/components/workspace/billing-content";
import { billingUsageSummary, formatBillingDate, formatBillingPrice, knownBillingPlan } from "../src/components/workspace/billing-state";
import { PaystackSubscriptionDetails } from "../src/components/paystack-subscription-modal";
import { SUBSCRIPTION_PLANS } from "../src/lib/subscription-plans";

Object.assign(globalThis, { React });
const noop = () => {};
const markup = (component: React.ElementType, props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(component, props));

test("prices remain the actual monthly and yearly USD/NGN plan definitions", () => {
  for (const plan of ["free", "ray", "beam", "pulse", "unlimited"] as const) {
    for (const interval of ["month", "year"] as const) {
      const config = SUBSCRIPTION_PLANS[plan];
      assert.equal(formatBillingPrice(plan, interval, "USD"), `$${(interval === "year" ? config.priceYearly : config.price).toLocaleString("en-US")}`);
      assert.equal(formatBillingPrice(plan, interval, "NGN"), `₦${(interval === "year" ? config.priceNGNYearly : config.priceNGN).toLocaleString("en-US")}`);
    }
  }
  assert.equal(knownBillingPlan("toString"), undefined);
  assert.equal(knownBillingPlan("unknown"), undefined);
  assert.equal(knownBillingPlan("unlimited"), "unlimited");
  assert.equal(formatBillingDate(null), "Not available");
  assert.equal(formatBillingDate("invalid"), "Not available");
});

test("usage distinguishes actual zero, unavailable values, zero capacity and unlimited plans", () => {
  assert.deepEqual(billingUsageSummary(0, 2, "free"), { actual: 0, unlimited: false, percentage: 0 });
  assert.deepEqual(billingUsageSummary(undefined, 2, "free"), { actual: undefined, unlimited: false, percentage: undefined });
  assert.deepEqual(billingUsageSummary(0, 0, "free"), { actual: 0, unlimited: false, percentage: undefined });
  assert.equal(billingUsageSummary(8, 5, "beam").percentage, 100);
  assert.equal(billingUsageSummary(2, -1, "pulse").unlimited, true);
  assert.equal(billingUsageSummary(2, 999999999, "unlimited").unlimited, true);
  const zero = markup(BillingUsageMetric, { label: "Domains", value: 0, limit: 0, plan: "free" });
  assert.match(zero, /Not included in this plan/);
  assert.doesNotMatch(zero, /NaN|Infinity|role="meter"/);
  const missing = markup(BillingUsageMetric, { label: "Members", limit: 5, plan: "beam" });
  assert.match(missing, /—/); assert.match(missing, /Usage unavailable/);
  const unlimited = markup(BillingUsageMetric, { label: "Members", value: 14, limit: -1, plan: "pulse" });
  assert.match(unlimited, /14/); assert.match(unlimited, /Unlimited/);
  assert.doesNotMatch(unlimited, /role="meter"|999999999/);
  const over = markup(BillingUsageMetric, { label: "Tunnels", value: 8, limit: 5, plan: "beam" });
  assert.match(over, /aria-valuenow="5"/); assert.match(over, /aria-valuetext="8 of 5"/);
});

test("overview shows actual renewal/provider/cancellation details without invented payment data", () => {
  const subscription = { plan: "beam", status: "active", billingInterval: "year", paymentProvider: "paystack", currentPeriodEnd: "2030-01-25T12:00:00Z", cancelAtPeriodEnd: true, paystackEmail: "billing@example.test" };
  const html = markup(BillingOverview, { subscription, usage: { tunnels: 2, domains: 1, subdomains: 8, members: 3 }, onManage: noop });
  assert.match(html, /₦210,000/); assert.match(html, /Cancels at period end/); assert.match(html, /Access until/); assert.match(html, /Jan 25, 2030/); assert.match(html, /Paystack · NGN/); assert.match(html, /Yearly/);
  assert.match(html, /Active tunnels usage/); assert.match(html, /aria-valuetext="2 of 5"/);
  assert.doesNotMatch(html, /Card ending|\*\*\*\*|Invoice|Bandwidth used/);
  const free = markup(BillingOverview, { subscription: null, usage: {}, onManage: noop });
  assert.match(free, /No payment method required/); assert.doesNotMatch(free, /Manage subscription|Next renewal/);
  const details = markup(PaystackSubscriptionDetails, { subscription });
  assert.match(details, /₦210,000/); assert.match(details, /billing@example.test/);
  assert.doesNotMatch(details, /Card ending|\*\*\*\*/);
});

test("plan comparison is grouped, includes every actual public plan limit, and hides the internal plan", () => {
  const html = markup(BillingPlanComparison, { currentPlan: "beam", currentInterval: "month", currency: "USD", interval: "month", onCheckout: noop });
  assert.equal((html.match(/<article/g) ?? []).length, 4);
  assert.match(html, /<caption[^>]*>Plan capacity and included features/);
  assert.match(html, /scope="colgroup">Capacity/); assert.match(html, /scope="colgroup">Included/);
  const row = (label: string) => html.match(new RegExp(`<tr><th[^>]*>${label}</th>([\\s\\S]*?)</tr>`))?.[1];
  assert.equal(row("Active tunnels")?.replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, " "), "2 3 5 20");
  assert.equal(row("Custom domains")?.replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, " "), "Not included 1 5 25");
  assert.equal(row("Subdomains")?.replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, " "), "1 5 20 200");
  assert.equal(row("Team members")?.replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, " "), "1 3 5 Unlimited");
  assert.equal(row("Monthly bandwidth")?.replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, " "), "2 GB 25 GB 100 GB 1 TB");
  assert.equal(row("Request retention")?.replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, " "), "3 days 14 days 30 days 90 days");
  assert.equal(row("Priority support")?.replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, " "), "Not included Not included Included Included");
  assert.match(html, /Downgrade to Ray/); assert.match(html, /Current plan/); assert.match(html, /Choose Pulse/);
  assert.doesNotMatch(html, /Choose Unlimited|999999999/);
});

test("Beam downgrades are enabled secondary actions without recommendation or highlight", () => {
  for (const currentPlan of ["pulse", "unlimited"]) {
    const html = markup(BillingPlanComparison, { currentPlan, currentInterval: "month", currency: "USD", interval: "month", onCheckout: noop });
    const articles = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];
    assert.doesNotMatch(html, /data-recommended|>Recommended<\/span>/);
    const beam = articles.find(article => /<h3[^>]*>Beam<\/h3>/.test(article));
    assert.ok(beam);
    const button = beam.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(button);
    assert.match(button, /class="[^"]*\bsecondary\b/);
    assert.doesNotMatch(button, /class="[^"]*\bprimary\b/);
    assert.match(button, /Downgrade to Beam/);
    assert.doesNotMatch(button, /\bdisabled=""|aria-disabled="true"|aria-busy="true"/);
  }
});

test("choosing Beam from a lower tier retains the sole highlighted recommendation and primary action", () => {
  for (const currentPlan of ["free", "ray"]) {
    const html = markup(BillingPlanComparison, { currentPlan, currentInterval: "month", currency: "USD", interval: "month", onCheckout: noop });
    const articles = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];
    const recommended = articles.filter(article => /^<article\b[^>]*data-recommended="true"/.test(article));
    assert.equal(recommended.length, 1);
    assert.match(recommended[0], /<h3[^>]*>Beam<\/h3>/);
    assert.match(recommended[0], />Recommended<\/span>/);
    const button = recommended[0].match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(button);
    assert.match(button, /class="[^"]*\bprimary\b/);
    assert.match(button, /Choose Beam/);
    assert.doesNotMatch(button, /\bdisabled=""|aria-disabled="true"|aria-busy="true"/);
  }
});

test("Beam actions still respect current-plan and checkout guards", () => {
  const beamButton = (props: Record<string, unknown>) => {
    const html = markup(BillingPlanComparison, { currentPlan: "pulse", currentInterval: "month", currency: "USD", interval: "month", onCheckout: noop, ...props });
    const beam = (html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? []).find(article => /<h3[^>]*>Beam<\/h3>/.test(article));
    assert.ok(beam);
    const button = beam.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(button);
    return button;
  };
  const current = beamButton({ currentPlan: "beam" });
  assert.match(current, /disabled=""/);
  assert.match(current, /Current plan/);
  const otherCheckout = beamButton({ checkoutPlan: "pulse" });
  assert.match(otherCheckout, /disabled=""/);
  const beamCheckout = beamButton({ checkoutPlan: "beam" });
  assert.match(beamCheckout, /aria-disabled="true"/);
  assert.match(beamCheckout, /aria-busy="true"/);
  assert.match(beamCheckout, /Opening checkout…/);
  assert.match(beamButton({ checkoutDisabled: true }), /disabled=""/);
});

test("the recommended plan has a distinct card surface and outline", async () => {
  const css = await readFile(new URL("../src/components/workspace/billing-content.module.css", import.meta.url), "utf8");
  const recommended = css.match(/\.planOption\[data-recommended\]\s*\{([^}]+)\}/)?.[1];
  assert.ok(recommended);
  assert.match(recommended, /background:/);
  assert.match(recommended, /box-shadow:\s*inset/);
});

test("active subscriptions lock animated billing controls and loading disables other plan actions", () => {
  const html = markup(BillingContent, { subscription: { plan: "ray", status: "active", paymentProvider: "paystack", billingInterval: "year" }, currency: "NGN", interval: "year", showPaystack: true, checkoutPlan: "beam", onCurrencyChange: noop, onIntervalChange: noop, onCheckout: noop, onManage: noop });
  assert.match(html, /<fieldset[^>]*disabled=""[^>]*aria-label="Billing options"/);
  assert.match(html, /aria-describedby="billing-options-locked"/);
  assert.match(html, /Your active subscription uses NGN and yearly billing/);
  assert.match(html, /aria-label="Billing interval"/); assert.match(html, /aria-label="Billing currency"/);
  assert.match(html, /aria-busy="true"/);
  const skeleton = markup(BillingSkeleton, {});
  assert.match(skeleton, /aria-label="Loading billing" aria-busy="true"/);
});

interface RawElement { type: unknown; props: Record<string, any>; }
function elements(node: unknown): RawElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as unknown as RawElement;
  return [element, ...elements(element.props.children)];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

// Run the route with isolated hooks and stubbed payment/geolocation dependencies.
// Every request is an in-memory function; this harness cannot make a real charge.
async function routeHarness(options: { orgSlug?: string; data?: unknown; error?: boolean; pending?: boolean; permission?: boolean; permissionPending?: boolean; sessionPending?: boolean; signedIn?: boolean; currency?: string; showPaystack?: boolean; showManageModal?: boolean; checkout?: (...args: unknown[]) => Promise<string>; fetch?: (...args: any[]) => Promise<unknown>; geolocation?: Promise<boolean> } = {}) {
  const source = await readFile(new URL("../src/routes/$orgSlug/billing.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  // Capture this event boundary even when the permission branch hides its button.
  const captured = { manage: undefined as (() => void) | undefined };
  const isolated = compiled.replace("const handleManageSubscription = () => {", "const handleManageSubscription = captured.manage = () => {");
  const marker = (name: string) => Object.assign(() => null, { displayName: name });
  const components = Object.fromEntries(["BillingContent", "BillingSkeleton", "WorkspacePageHeader", "WorkspaceEmptyState", "WorkspaceNotice", "PaystackSubscriptionModal", "Button"].map(name => [name, marker(name)]));
  const stateUpdates: { index: number; value: unknown }[] = [];
  const initialState = [options.showPaystack ?? false, options.currency ?? "USD", "month", null, options.showManageModal ?? false, null];
  let stateIndex = 0;
  const effects: (() => void | (() => void))[] = [];
  let refetches = 0;
  const invalidations: unknown[] = [];
  const query = { data: options.data, isError: options.error ?? false, isPending: options.pending ?? false, isFetching: false, refetch: async () => { refetches++; } };
  const window = { location: { href: "" } };
  let popup: { onSuccess: () => Promise<void>; onCancel: () => void } | undefined;
  const module = { exports: {} as { Route: { component: () => React.ReactNode } } };
  runInNewContext(isolated, {
    React, module, exports: module.exports, window, captured,
    fetch: options.fetch ?? (() => { throw new Error("Unexpected request: all requests must be mocked"); }),
    require: (specifier: string) => {
      if (specifier === "react") return { ...React, useState: () => { const index = stateIndex++; return [initialState[index], (value: unknown) => stateUpdates.push({ index, value })]; }, useRef: (value: unknown) => ({ current: value }), useEffect: (effect: () => void | (() => void)) => effects.push(effect) };
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (config: unknown) => ({ ...config as object, useParams: () => ({ orgSlug: options.orgSlug ?? "acme" }), useSearch: () => ({}) }) };
      if (specifier === "@tanstack/react-query") return { useQuery: () => query, useQueryClient: () => ({ invalidateQueries: (key: unknown) => invalidations.push(key) }) };
      if (specifier === "lucide-react") return { CreditCard: marker("CreditCard"), RefreshCw: marker("RefreshCw") };
      if (specifier === "@/lib/auth-client") return { usePermission: () => ({ data: options.permission ?? true, isPending: options.permissionPending ?? false }), authClient: { useListOrganizations: () => ({ data: [{ id: "acme-id", slug: "acme" }, { id: "research-id", slug: "research" }], isPending: false }), useSession: () => ({ data: options.signedIn === false ? null : { user: { email: "owner@example.test", name: "Owner" } }, isPending: options.sessionPending ?? false }) } };
      if (specifier === "@/lib/polar") return { POLAR_PRODUCT_IDS: { ray: "ray-month", ray_yearly: "ray-year", beam: "beam-month", beam_yearly: "beam-year" }, initiateCheckout: options.checkout ?? (async () => "/mock-checkout") };
      if (specifier === "@/lib/geolocation") return { isNigerianUser: () => options.geolocation ?? Promise.resolve(false) };
      if (specifier === "@/lib/app-client") return { appClient: { subscriptions: { get: () => { throw new Error("Unexpected subscription request"); } } } };
      if (specifier === "@paystack/inline-js") return { __esModule: true, default: class { resumeTransaction(_code: unknown, callbacks: typeof popup) { popup = callbacks; } } };
      if (specifier.startsWith("@/components/")) return components;
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
  });
  const workspace = module.exports.Route.component() as React.ReactElement<{ orgSlug: string }>;
  const controller = workspace.type as (props: { orgSlug: string }) => React.ReactNode;
  const nodes = elements(controller(workspace.props));
  const find = (name: string) => nodes.find(node => node.type === components[name]);
  return { workspace, nodes, find, effects, stateUpdates, window, manage: () => captured.manage!(), getPopup: () => popup, getRefetches: () => refetches, invalidations };
}

test("workspace keys isolate state and old checkout completion cannot navigate the new organization", async () => {
  const oldCheckout = deferred<string>();
  const previous = await routeHarness({ orgSlug: "acme", currency: "NGN", showPaystack: true, showManageModal: true, data: { subscription: { plan: "ray", status: "active", paymentProvider: "polar" } }, checkout: () => oldCheckout.promise });
  assert.equal(previous.workspace.key, "acme");
  assert.equal(previous.workspace.props.orgSlug, "acme");
  previous.find("BillingContent")!.props.onCheckout("beam");
  const cleanups = previous.effects.map(effect => effect());
  cleanups.forEach(cleanup => { if (typeof cleanup === "function") cleanup(); });

  const calls: unknown[][] = [];
  const nextCheckout = deferred<string>();
  const next = await routeHarness({ orgSlug: "research", data: { subscription: null }, checkout: (...args) => { calls.push(args); return nextCheckout.promise; } });
  assert.equal(next.workspace.key, "research");
  assert.equal(next.workspace.props.orgSlug, "research");
  assert.notEqual(previous.workspace.key, next.workspace.key);
  const content = next.find("BillingContent")!;
  assert.equal(content.props.currency, "USD");
  assert.equal(content.props.showPaystack, false);
  assert.equal(content.props.checkoutPlan, null);
  assert.equal(next.find("PaystackSubscriptionModal")!.props.isOpen, false);
  content.props.onCheckout("beam");
  assert.deepEqual(calls, [["beam-month", "research-id", "owner@example.test", "Owner"]]);

  oldCheckout.resolve("/old-org-checkout"); await flush();
  assert.equal(previous.window.location.href, "");
  assert.equal(next.window.location.href, "");
  nextCheckout.resolve("/research-checkout"); await flush();
  assert.equal(next.window.location.href, "/research-checkout");
});

test("subscription management rechecks role, pending access, and session before either provider", async () => {
  for (const provider of ["polar", "paystack"]) {
    for (const authority of [{ permission: false }, { permissionPending: true }, { sessionPending: true }, { signedIn: false }]) {
      const harness = await routeHarness({ ...authority, data: { subscription: { plan: "ray", paymentProvider: provider } }, showManageModal: true });
      harness.manage();
      assert.equal(harness.window.location.href, "");
      assert.equal(harness.stateUpdates.some(update => update.index === 4 && update.value === true), false);
      assert.equal(harness.find("PaystackSubscriptionModal")!.props.isOpen, false);
      assert.equal(harness.stateUpdates.some(update => update.index === 5), true, "the event boundary reports why management is unavailable");
    }
  }
  const paystack = await routeHarness({ data: { subscription: { plan: "ray", paymentProvider: "paystack" } } });
  paystack.manage();
  assert.equal(paystack.stateUpdates.some(update => update.index === 4 && update.value === true), true);
});

test("initial request failure renders a retry state, not a fabricated free subscription", async () => {
  const harness = await routeHarness({ error: true });
  assert.equal(harness.find("BillingContent"), undefined);
  assert.equal(harness.find("WorkspaceEmptyState")?.props.title, "Couldn't load billing");
  harness.find("WorkspaceEmptyState")?.props.action.props.onClick();
  assert.equal(harness.getRefetches(), 1);
});

test("failed refresh keeps the last loaded subscription visible and disables checkout", async () => {
  const data = { subscription: { plan: "beam", status: "active", paymentProvider: "polar", billingInterval: "year" }, usage: { members: 4 } };
  const harness = await routeHarness({ data, error: true });
  const content = harness.find("BillingContent")!;
  assert.equal(content.props.subscription, data.subscription);
  assert.equal(content.props.usage, data.usage);
  assert.equal(content.props.checkoutDisabled, true);
  assert.equal(content.props.interval, "year");
  assert.match(harness.find("WorkspaceNotice")?.props.message, /last loaded details are still shown/);
  harness.find("WorkspaceNotice")?.props.action.props.onClick();
  assert.equal(harness.getRefetches(), 1);
});

test("restricted billing has an actionable access check and no subscription content", async () => {
  const harness = await routeHarness({ permission: false });
  assert.equal(harness.find("BillingContent"), undefined);
  assert.equal(harness.find("WorkspaceEmptyState")?.props.title, "Billing access required");
  harness.find("WorkspaceEmptyState")?.props.action.props.onClick();
  assert.equal(harness.invalidations.length, 1);
});

test("Polar checkout uses the existing yearly product and blocks duplicate mocked clicks", async () => {
  const pending = deferred<string>();
  const calls: unknown[][] = [];
  const harness = await routeHarness({ data: { subscription: { plan: "ray", status: "active", paymentProvider: "polar", billingInterval: "year" } }, checkout: (...args) => { calls.push(args); return pending.promise; } });
  const select = harness.find("BillingContent")!.props.onCheckout;
  select("beam"); select("beam");
  assert.deepEqual(calls, [["beam-year", "acme-id", "owner@example.test", "Owner"]]);
  pending.resolve("/mock-polar-checkout"); await flush();
  assert.equal(harness.window.location.href, "/mock-polar-checkout");
  select("beam"); assert.equal(calls.length, 1);
  const portal = await routeHarness({ data: { subscription: { plan: "ray", paymentProvider: "polar" } } });
  portal.find("BillingContent")!.props.onManage();
  assert.equal(portal.window.location.href, "/api/acme/portal/polar");
});

test("Paystack's mocked popup keeps the guard through verification and uses unchanged API contracts", async () => {
  const verify = deferred<unknown>();
  const calls: { url: string; options?: { method: string; body: string } }[] = [];
  const harness = await routeHarness({ data: { subscription: { plan: "ray", status: "active", paymentProvider: "paystack", billingInterval: "year" } }, fetch: async (url, options) => {
    calls.push({ url, options });
    if (url === "/api/checkout/paystack-verify") return verify.promise;
    return { ok: true, json: async () => ({ success: true, accessCode: "mock-code", reference: "mock-reference" }) };
  } });
  const select = harness.find("BillingContent")!.props.onCheckout;
  select("beam"); select("beam"); await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/checkout/paystack?plan=beam&orgSlug=acme&interval=year");
  const completed = harness.getPopup()!.onSuccess();
  select("beam"); assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "/api/checkout/paystack-verify");
  assert.equal(calls[1].options?.method, "POST");
  assert.equal(calls[1].options?.body, JSON.stringify({ reference: "mock-reference" }));
  verify.resolve({ ok: true, json: async () => ({ success: true }) });
  await completed;
  assert.equal(harness.window.location.href, "/acme/billing?success=true");
});

test("async geolocation cannot update state after the effect is cleaned up", async () => {
  const geo = deferred<boolean>();
  const harness = await routeHarness({ data: { subscription: null }, geolocation: geo.promise });
  const cleanups = harness.effects.map(effect => effect());
  cleanups.forEach(cleanup => { if (typeof cleanup === "function") cleanup(); });
  geo.resolve(true); await flush();
  assert.deepEqual(harness.stateUpdates, []);
});

test("billing refresh uses actual Arc components and a recoverable shared dialog", async () => {
  const route = await readFile(new URL("../src/routes/$orgSlug/billing.tsx", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/components/paystack-subscription-modal.tsx", import.meta.url), "utf8");
  const content = await readFile(new URL("../src/components/workspace/billing-content.tsx", import.meta.url), "utf8");
  assert.match(route, /appearance="compact"/);
  for (const source of [route, modal, content]) assert.doesNotMatch(source, /from "@\/components\/ui"|SlidingToggle|AlertModal/);
  assert.match(content, /arc\/segmented-control\/segmented-control/);
  assert.match(modal, /WorkspaceDialog/); assert.match(modal, /busy=\{isLoading\}/);
  assert.match(modal, /if \(busy\.current/);
  assert.match(modal, /`\/api\/subscriptions\/\$\{orgSlug\}\/cancel`/);
  const css = await readFile(new URL("../src/components/workspace/billing-content.module.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /overflow-x: auto/);
});
