import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const identity = { id: "profile-a", email: "admin@example.com", name: "Admin", isAdmin: true };

async function layout(options: {
  session?: { user: typeof identity } | null;
  pending?: boolean;
  sessionError?: unknown;
  access?: { user: typeof identity } | { error: string };
  checking?: boolean;
  signOutFails?: boolean;
} = {}) {
  const source = await readFile(new URL("../src/routes/admin.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText;
  const queryOptions: Array<Record<string, unknown>> = [];
  const removed: unknown[] = [];
  const navigations: unknown[] = [];
  const values: unknown[] = [];
  let index = 0;
  let childRenders = 0;
  let signOuts = 0;
  let cacheClears = 0;
  const Navigate = () => null;
  const Sidebar = () => null;
  const Outlet = () => { childRenders += 1; return React.createElement("p", null, "Private admin data"); };
  const module = { exports: {} as { Route: { component: () => React.ReactElement<Record<string, unknown>> } } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return {
        useState(initial: unknown) {
          const slot = index++;
          if (!(slot in values)) values[slot] = initial;
          return [values[slot], (value: unknown) => { values[slot] = value; }];
        },
        useEffect() {},
      };
      if (specifier === "@tanstack/react-router") return {
        createFileRoute: () => (configuration: unknown) => configuration,
        useLocation: () => ({ pathname: "/admin/users/profile-a", searchStr: "?tab=sessions&source=admin" }),
        useRouter: () => ({ navigate: async (navigation: unknown) => { navigations.push(navigation); } }),
        Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children),
        Navigate, Outlet,
      };
      if (specifier === "@tanstack/react-query") return {
        useQuery(configuration: Record<string, unknown>) {
          queryOptions.push(configuration);
          return { data: options.access, isPending: options.checking ?? !options.access, refetch: async () => {} };
        },
        useQueryClient: () => ({
          cancelQueries: async () => {}, removeQueries: (key: unknown) => { removed.push(key); },
          clear: () => { cacheClears += 1; },
        }),
      };
      if (specifier === "@/lib/auth-client") return { authClient: {
        useSession: () => ({ data: options.session ?? null, isPending: !!options.pending, error: options.sessionError, refetch() {} }),
        signOut: async () => { signOuts += 1; return { error: options.signOutFails ? { message: "Unavailable" } : null }; },
      } };
      if (specifier === "@/lib/app-client") return { appClient: { admin: { session: async () => options.access } } };
      if (specifier === "@/components/admin/admin-sidebar") return { AdminSidebar: Sidebar };
      if (specifier.startsWith("@/components/admin/") || specifier === "recharts" || specifier === "lucide-react") return {};
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
  });
  const render = () => { index = 0; return module.exports.Route.component(); };
  return {
    render, Navigate, Sidebar, queryOptions, removed, navigations,
    html: () => renderToStaticMarkup(render()),
    counts: () => ({ childRenders, signOuts, cacheClears }),
  };
}

test("signed-out admin visits use the existing OAuth login and preserve the nested path and query", async () => {
  const h = await layout();
  const tree = h.render();
  assert.equal(tree.type, h.Navigate);
  assert.equal(tree.props.to, "/login");
  assert.deepEqual(JSON.parse(JSON.stringify(tree.props.search)), { redirect: "/admin/users/profile-a?tab=sessions&source=admin" });
  assert.equal(h.queryOptions[0].enabled, false);
  assert.equal(h.counts().childRenders, 0);
});

test("session and server-access checks never mount admin child pages", async () => {
  for (const state of [{ pending: true }, { session: { user: identity }, checking: true }]) {
    const h = await layout(state);
    assert.match(h.html(), /Checking admin access/);
    assert.equal(h.counts().childRenders, 0);
  }
});

test("a cached profile admin flag cannot bypass a denied server access check", async () => {
  const h = await layout({ session: { user: identity }, access: { error: "Forbidden" } });
  const html = h.html();
  assert.match(html, /Admin access required/);
  assert.match(html, /does not have platform admin access/);
  assert.doesNotMatch(html, /Private admin data|Passphrase|Unlock Dashboard/);
  assert.equal(h.counts().childRenders, 0);
});

test("admin children require a matching server-authorized profile", async () => {
  const accepted = await layout({ session: { user: identity }, access: { user: identity } });
  assert.match(accepted.html(), /Private admin data/);
  assert.equal(accepted.counts().childRenders, 1);
  assert.equal(accepted.queryOptions[0].gcTime, 0, "do not retain an admin grant after unmount");
  assert.equal(accepted.queryOptions[0].refetchOnWindowFocus, "always");
  for (const user of [{ ...identity, id: "someone-else" }, { ...identity, isAdmin: false }]) {
    const denied = await layout({ session: { user: identity }, access: { user } });
    assert.doesNotMatch(denied.html(), /Private admin data/);
    assert.equal(denied.counts().childRenders, 0);
  }
});

test("signing out uses the OAuth session, clears private queries and returns to the same admin destination", async () => {
  const h = await layout({ session: { user: identity }, access: { user: identity } });
  const tree = h.render();
  const sidebar = (tree.props.children as React.ReactElement<Record<string, unknown>>[])[0];
  assert.equal(sidebar.type, h.Sidebar);
  (sidebar.props.onLogout as () => void)();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.counts().signOuts, 1);
  assert.equal(h.counts().cacheClears, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.navigations)), [{
    to: "/login", search: { redirect: "/admin/users/profile-a?tab=sessions&source=admin" }, replace: true,
  }]);
});

test("a failed sign-out never clears the authenticated session or hides its error", async () => {
  const h = await layout({ session: { user: identity }, access: { user: identity }, signOutFails: true });
  const tree = h.render();
  const sidebar = (tree.props.children as React.ReactElement<Record<string, unknown>>[])[0];
  (sidebar.props.onLogout as () => void)();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.counts().cacheClears, 0);
  assert.deepEqual(h.navigations, []);
  assert.match(h.html(), /role="alert"[^>]*>Could not sign out/);
});
