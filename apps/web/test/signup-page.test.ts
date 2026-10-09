import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { AuthPage } from "../src/components/auth/auth-page";
import { Button, type ButtonProps } from "../src/components/arc/button/button";
import type { LoginProvider } from "../src/lib/login";

Object.assign(globalThis, { React });
type PageProps = React.ComponentProps<typeof AuthPage>;
const defaults: PageProps = { mode: "signup", loading: null, sessionPending: false, error: null, onLogin: () => {} };

function renderSignup(overrides: Partial<PageProps> = {}) {
  const root = createRootRoute();
  const signup = createRoute({ getParentRoute: () => root, path: "signup" });
  const router = createRouter({ routeTree: root.addChildren([signup]), history: createMemoryHistory({ initialEntries: ["/signup"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router, children: React.createElement(AuthPage, { ...defaults, ...overrides }),
  }));
}

const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>/g)].map(([button]) => button);
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as React.ReactNode)];
}

test("signup uses the shared auth layout with correct headings, accessible group and Arc provider variants", () => {
  const html = renderSignup();
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<h1 id="signup-title">Create your account<\/h1>/);
  assert.match(html, /aria-labelledby="signup-title"/);
  assert.match(html, /Start building with OutRay\./);
  assert.match(html, /role="group" aria-label="Sign-up options" aria-busy="false"/);
  assert.doesNotMatch(html, /Welcome back|Sign-in options|<input|type="password"|<form/);
  const options = buttons(html);
  assert.equal(options.length, 2);
  assert.match(options[0], /class="[^"]*\bprimary\b[^"]*\blg\b/);
  assert.match(options[0], /aria-label="Continue with GitHub"/);
  assert.match(options[1], /class="[^"]*\bsecondary\b[^"]*\blg\b/);
  assert.match(options[1], /aria-label="Continue with Google"/);
  for (const option of options) {
    assert.match(option, /type="button"/);
    assert.doesNotMatch(option, /(?:^|\s)disabled=|aria-disabled="true"/);
  }
  assert.match(html, /class="page outray-arc"/);
  assert.doesNotMatch(html, /font-sans/);
});

test("session loading and provider loading announce signup progress without dropping focus", () => {
  const pending = renderSignup({ sessionPending: true });
  for (const button of buttons(pending)) assert.match(button, /disabled=""/);
  assert.match(pending, /role="status" aria-live="polite" aria-atomic="true">Checking your session…<\/p>/);
  for (const provider of ["github", "google"] as const) {
    const html = renderSignup({ loading: provider });
    const options = buttons(html);
    const active = options[provider === "github" ? 0 : 1];
    const other = options[provider === "github" ? 1 : 0];
    assert.match(active, /aria-busy="true"/);
    assert.match(active, /aria-disabled="true"/);
    assert.doesNotMatch(active, /(?:^|\s)disabled=/);
    assert.match(other, /disabled=""/);
    assert.match(html, new RegExp(`Taking you to ${provider === "github" ? "GitHub" : "Google"}…`));
    assert.match(html, /role="group" aria-label="Sign-up options" aria-busy="true"/);
  }
});

test("signup view forwards exact provider actions only when not busy", () => {
  const calls: LoginProvider[] = [];
  const onLogin = (provider: LoginProvider) => { calls.push(provider); };
  for (const overrides of [{ sessionPending: true }, { loading: "github" as const }, { loading: "google" as const }]) {
    const options = elements(AuthPage({ ...defaults, ...overrides, onLogin })).filter((element) => element.type === Button);
    options.forEach((option) => { (option.props as ButtonProps).onClick?.({} as React.MouseEvent<HTMLButtonElement>); });
    assert.deepEqual(calls, []);
  }
  const options = elements(AuthPage({ ...defaults, onLogin })).filter((element) => element.type === Button);
  options.forEach((option) => { (option.props as ButtonProps).onClick?.({} as React.MouseEvent<HTMLButtonElement>); });
  assert.deepEqual(calls, ["github", "google"]);
});

test("the login switch link preserves invitation and CLI returns while defaulting to a clean login URL", () => {
  for (const redirect of [undefined, "/cli/login?code=one-time-code", "/invitations/accept?token=invite-id"]) {
    const html = renderSignup({ redirect });
    assert.match(html, /Already have an account\?/);
    const href = html.match(/<a[^>]*href="([^"]+)"[^>]*>Log in<\/a>/)?.[1];
    assert.ok(href);
    const url = new URL(href.replaceAll("&amp;", "&"), "https://outray.invalid");
    assert.equal(url.pathname, "/login");
    assert.equal(url.searchParams.get("redirect"), redirect ?? null);
    assert.doesNotMatch(html, /New to OutRay\?|>Get started<\/a>/);
  }
});

test("signup retains navigable legal, home and support links with decorative branding and product context", () => {
  const html = renderSignup();
  assert.match(html, /<a(?=[^>]*aria-label="OutRay home")(?=[^>]*href="\/")[^>]*>/);
  assert.match(html, /<img[^>]*src="\/logo\.png"[^>]*alt=""/);
  assert.match(html, /Back to home/);
  assert.match(html, /href="\/terms"[^>]*>Terms of Service<\/a>/);
  assert.match(html, /href="\/privacy"[^>]*>Privacy Policy<\/a>/);
  assert.match(html, /Need a hand getting started\?/);
  assert.match(html, /href="mailto:support@outray\.dev"[^>]*>Contact support<\/a>/);
  assert.match(html, /aria-labelledby="signup-products-title"/);
  for (const product of ["Tunnels", "Observability", "Secrets", "Uptime"]) assert.match(html, new RegExp(`<h3>${product}<\\/h3>`));
});

test("signup failures use a single escaped alert region", () => {
  const html = renderSignup({ error: 'Try again. <script>alert("private")</script>' });
  assert.equal((html.match(/role="alert"/g) ?? []).length, 1);
  assert.match(html, /Try again\. &lt;script&gt;alert\(&quot;private&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b/);
});

test("signup shares the existing responsive and reduced-motion auth stylesheet instead of duplicating login controls", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/components/auth/auth-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/auth/auth-page.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /import styles from "\.\/auth-page\.module\.css"/);
  assert.match(source, /mode = "login"/);
  assert.match(css, /@media \(max-width:\s*800px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width:\s*400px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
});
