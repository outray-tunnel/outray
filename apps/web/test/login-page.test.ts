import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { AuthPage, AuthPageView } from "../src/components/auth/auth-page";
import { Button, type ButtonProps } from "../src/components/arc/button/button";
import type { LoginProvider } from "../src/lib/login";

// Components use the project's classic JSX transform in Node tests.
Object.assign(globalThis, { React });

type PageProps = React.ComponentProps<typeof AuthPage>;
const defaults: PageProps = { loading: null, sessionPending: false, error: null, onLogin: () => {} };
const hostedInstance = { selfHosted: false, authProviders: ["github", "google"] as LoginProvider[] };

function renderLogin(overrides: Partial<PageProps> = {}) {
  const root = createRootRoute();
  const login = createRoute({ getParentRoute: () => root, path: "login" });
  const router = createRouter({ routeTree: root.addChildren([login]), history: createMemoryHistory({ initialEntries: ["/login"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router, children: React.createElement(AuthPage, { ...defaults, ...overrides }),
  }));
}

function buttons(html: string) {
  return [...html.matchAll(/<button\b[^>]*>/g)].map(([button]) => button);
}

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as React.ReactNode)];
}

test("login has one clear sign-in heading, two named OAuth options and genuine Arc button variants", () => {
  const html = renderLogin();
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<h1 id="login-title">Welcome back<\/h1>/);
  assert.match(html, /aria-labelledby="login-title"/);
  assert.match(html, /role="group" aria-label="Sign-in options" aria-busy="false"/);
  const options = buttons(html);
  assert.equal(options.length, 2);
  assert.match(options[0], /type="button"/);
  assert.match(options[0], /aria-label="Continue with GitHub"/);
  assert.match(options[0], /class="[^"]*\bprimary\b[^"]*\blg\b/);
  assert.match(options[1], /aria-label="Continue with Google"/);
  assert.match(options[1], /class="[^"]*\bsecondary\b[^"]*\blg\b/);
  for (const option of options) assert.doesNotMatch(option, /\bdisabled=|aria-disabled="true"/);
  assert.doesNotMatch(html, /<input|type="password"|<form/);
  assert.match(html, /outray-arc/);
  assert.doesNotMatch(html, /font-sans/);
});

test("session loading leaves both provider actions inert and announces a stable status", () => {
  const html = renderLogin({ sessionPending: true });
  assert.match(html, /aria-label="Sign-in options" aria-busy="true"/);
  for (const button of buttons(html)) assert.match(button, /disabled=""/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true">Checking your session…<\/p>/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("an active provider keeps focus while announcing progress and disables the other option", () => {
  for (const provider of ["github", "google"] as const) {
    const html = renderLogin({ loading: provider });
    const options = buttons(html);
    const active = options[provider === "github" ? 0 : 1];
    const other = options[provider === "github" ? 1 : 0];
    assert.match(active, /aria-busy="true"/);
    assert.match(active, /aria-disabled="true"/);
    assert.doesNotMatch(active, /(?:^|\s)disabled=/, "loading Arc buttons retain keyboard focus instead of becoming native-disabled");
    assert.match(other, /disabled=""/);
    assert.match(html, new RegExp(`Taking you to ${provider === "github" ? "GitHub" : "Google"}…`));
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  }
});

test("the real view forwards provider actions only at rest", () => {
  const calls: LoginProvider[] = [];
  const onLogin = (provider: LoginProvider) => { calls.push(provider); };
  const event = {} as React.MouseEvent<HTMLButtonElement>;
  for (const state of [{ sessionPending: true }, { loading: "github" as const }, { loading: "google" as const }]) {
    const options = elements(AuthPageView({ ...defaults, ...state, onLogin, instance: hostedInstance })).filter((element) => element.type === Button);
    assert.equal(options.length, 2);
    options.forEach((option) => { (option.props as ButtonProps).onClick?.(event); });
    assert.deepEqual(calls, []);
  }
  const options = elements(AuthPageView({ ...defaults, onLogin, instance: hostedInstance })).filter((element) => element.type === Button);
  options.forEach((option) => { (option.props as ButtonProps).onClick?.(event); });
  assert.deepEqual(calls, ["github", "google"]);
});

test("errors have an alert region and remain escaped text, not injected provider HTML", () => {
  const html = renderLogin({ error: 'Could not sign in. <script>alert("private")</script>' });
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not sign in\. &lt;script&gt;alert\(&quot;private&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b/);
  assert.equal((html.match(/role="alert"/g) ?? []).length, 1);
});

test("home, signup, legal and support links remain real navigable destinations", () => {
  const html = renderLogin();
  assert.match(html, /<a(?=[^>]*aria-label="OutRay home")(?=[^>]*href="\/")[^>]*>/);
  assert.match(html, /<img[^>]*src="\/logo\.png"[^>]*alt=""/);
  assert.match(html, /Back to home/);
  assert.match(html, /href="\/signup"[^>]*>Get started<\/a>/);
  assert.match(html, /href="\/terms"[^>]*>Terms of Service<\/a>/);
  assert.match(html, /href="\/privacy"[^>]*>Privacy Policy<\/a>/);
  assert.match(html, /href="mailto:support@outray\.dev"[^>]*>Contact support<\/a>/);
  assert.match(html, /aria-labelledby="login-products-title"/);
  for (const product of ["Tunnels", "Observability", "Secrets", "Uptime"]) assert.match(html, new RegExp(`<h3>${product}<\\/h3>`));
});

test("self-hosted auth keeps configured providers and administrator guidance without hosted marketing", () => {
  const root = createRootRoute();
  const login = createRoute({ getParentRoute: () => root, path: "login" });
  const router = createRouter({ routeTree: root.addChildren([login]), history: createMemoryHistory({ initialEntries: ["/login"] }) });
  for (const mode of ["login", "signup"] as const) {
    const html = renderToStaticMarkup(React.createElement(RouterContextProvider, {
      router, children: React.createElement(AuthPageView, {
        ...defaults, mode, instance: { selfHosted: true, authProviders: ["github"] },
      }),
    }));
    assert.match(html, /Continue with GitHub/);
    assert.doesNotMatch(html, /Continue with Google/);
    assert.match(html, /Use an approved account to access this installation/);
    assert.match(html, /contact your installation administrator/);
    assert.doesNotMatch(html, /Back to home|New to OutRay|Get started|href="\/signup"|href="\/terms"|href="\/privacy"|mailto:support|Everything behind your app|<aside/);
    assert.match(html, /class="main installation"/);
    assert.equal(buttons(html).length, 1);
  }
});

test("the sign-up link retains the full CLI or invitation destination including its query", () => {
  for (const redirect of ["/cli/login?code=one-time-code", "/invitations/accept?token=invite-id"]) {
    const html = renderLogin({ redirect });
    const href = html.match(/<a[^>]*href="([^"]+)"[^>]*>Get started<\/a>/)?.[1];
    assert.ok(href);
    const url = new URL(href.replaceAll("&amp;", "&"), "https://outray.invalid");
    assert.equal(url.pathname, "/signup");
    assert.equal(url.searchParams.get("redirect"), redirect);
  }
});

test("login CSS provides a bounded mobile column, visible focus states and reduced-motion fallback", async () => {
  const css = await readFile(new URL("../src/components/auth/auth-page.module.css", import.meta.url), "utf8");
  const buttonCss = await readFile(new URL("../src/components/arc/button/button.module.css", import.meta.url), "utf8");
  assert.match(css, /min-height:\s*100svh/);
  assert.match(css, /\.main\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width:\s*800px\)[\s\S]*?\.main\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width:\s*800px\)[\s\S]*?\.productIntro\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width:\s*400px\)/);
  assert.match(css, /\.provider:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /\.page :where\(a\):focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /\.status\s*\{[^}]*min-height:\s*20px/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
  assert.match(buttonCss, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.spinner\s*\{[^}]*animation-iteration-count:\s*1/);
});
