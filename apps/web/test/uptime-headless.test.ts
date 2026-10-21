import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import headlessPolicy from "../../../shared/status-headless";
import { statusPageOrigin, statusPagePreviewUrl } from "../src/lib/uptime/status-url";

const pageId = "acdcc15f-16a4-51cc-a6b9-5f6161706284";
function compile<T>(path: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}, replacements: Record<string, string> = {}): T {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, Date, URL, Request, Response, React, console,
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; }, ...globals });
  return module.exports as T;
}

function apiHarness(role = "owner", environment = "production") {
  const writes: Array<Record<string, unknown>> = [];
  let selected = false;
  const route = compile<{ Route: { server: { handlers: { PATCH: (args: { request: Request; params: { orgSlug: string } }) => Promise<Response> } } } }>("../src/routes/api/$orgSlug/uptime/page.ts", {
    "@tanstack/react-router": { createFileRoute: () => (config: unknown) => config },
    "drizzle-orm": { eq: (field: string, value: unknown) => ({ field, value }) },
    "@/db": { db: { update: () => ({ set: (values: Record<string, unknown>) => ({ where: (condition: { field: string; value: string }) => {
      assert.ok(selected); assert.equal(condition.value, pageId); writes.push(values);
      return { returning: async () => [{ id: pageId, ...values }] };
    } }) }) } },
    "@/db/uptime-schema": { uptimeStatusPages: { id: "pages.id" } },
    "@/lib/uptime/api": {
      requireUptimeManager: async () => ["owner", "admin"].includes(role) ? { organization: { id: "right-org" } } : { error: Response.json({ error: "Forbidden" }, { status: 403 }) },
      jsonBody: (request: Request) => request.json(),
      badInput: (error: string, field: string) => Response.json({ error, field }, { status: 400 }),
      notFound: () => Response.json({ error: "Not found" }, { status: 404 }),
      findStatusPage: async (org: string, request: Request) => { assert.equal(org, "right-org"); selected = new URL(request.url).searchParams.get("pageId") === pageId; return selected ? { id: pageId } : null; },
    },
    "@/lib/uptime/validation": {}, "@/lib/observability/alert-validation": {},
    "@/lib/organization-entitlements.server": {}, "@/lib/uptime/status-domain-provider.server": {},
    "../../../../../../../shared/status-headless": { default: headlessPolicy },
  }, { process: { env: { NODE_ENV: environment } } });
  return { writes, patch: (analyticsOrigins: unknown, target = pageId) => route.Route.server.handlers.PATCH({
    request: new Request(`https://console.example/api/acme/uptime/page?pageId=${target}`, { method: "PATCH", body: JSON.stringify({ analyticsOrigins }) }), params: { orgSlug: "acme" },
  }) };
}

test("only owners/admins update exact origins on the explicitly selected same-org page", async () => {
  for (const role of ["owner", "admin"]) {
    const h = apiHarness(role); const response = await h.patch(["https://EXAMPLE.com/"]);
    assert.equal(response.status, 200); assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].analyticsOrigins)), ["https://example.com"]);
    assert.equal((await h.patch([], "other-org-page")).status, 404); assert.equal(h.writes.length, 1);
  }
  const member = apiHarness("member"); assert.equal((await member.patch(["https://example.com"])).status, 403); assert.equal(member.writes.length, 0);
});

test("origin setting validates HTTPS, exact origin shape, count and localhost development policy", async () => {
  const h = apiHarness();
  for (const value of ["https://example.com", ["http://localhost:3000"], ["https://*.example.com"], ["https://example.com/path"], ["https://u:p@example.com"], ["https://example.com?key=secret"], Array(11).fill("https://example.com")]) {
    assert.equal((await h.patch(value)).status, 400);
  }
  assert.equal(h.writes.length, 0);
  assert.equal((await apiHarness("owner", "development").patch(["http://localhost:3000"])).status, 200);
  assert.equal((await h.patch([])).status, 200);
});

function headlessView(paid: boolean, canManage: boolean, origin = "https://status.selfhost.example") {
  const element = (tag: string) => ({ children, ...props }: any) => React.createElement(tag, props, children);
  const view = compile<{ StatusPageHeadless: () => React.ReactNode }>("../src/components/uptime/status-page-headless.tsx", {
    react: React,
    "@tanstack/react-router": { Link: ({ children, to }: any) => React.createElement("a", { href: to }, children) },
    "lucide-react": { Code2: () => null, LockKeyhole: () => null },
    "@/components/arc/button/button": { Button: ({ children, loading: _loading, size: _size, ...props }: any) => React.createElement("button", props, children) },
    "@/components/arc/copy-button/copy-button": { CopyButton: ({ label }: any) => React.createElement("button", { "aria-label": label }) },
    "@/components/ui/workspace-input": { WorkspaceTextarea: element("textarea") },
    "@/lib/uptime/status-url": { statusPageOrigin, statusPagePreviewUrl },
    "../../../../../shared/status-headless": { default: headlessPolicy },
    "./status-page-editor-context": { useStatusPageEditor: () => ({ orgSlug: "acme", canManage, analyticsAvailable: paid, reload() {}, page: { id: pageId, slug: "acme", published: true, analyticsOrigins: ["https://custom.example"] } }) },
    "./uptime-client": {}, "./uptime-ui": { UptimePanel: element("section"), UptimeError: () => null, primaryButton: "button" },
  }, {}, { "import.meta.env.VITE_OUTRAY_STATUS_URL": JSON.stringify(origin), "import.meta.env.DEV": "false" });
  return renderToStaticMarkup(React.createElement(view.StatusPageHeadless));
}

test("Free retains public API instructions, while analytics setup is paid and manager-only", () => {
  const free = headlessView(false, true);
  assert.ok(free.includes(`https://status.selfhost.example/api/v1/pages/${pageId}`));
  assert.ok(free.includes("Explore plans")); assert.ok(!free.includes('id="headless-origins"'));
  const paid = headlessView(true, true);
  assert.ok(paid.includes('id="headless-origins"')); assert.ok(paid.includes("status-tracker.v1.js")); assert.ok(paid.includes("Save websites"));
  assert.ok(!paid.includes("https://status.outray.app"));
  const member = headlessView(true, false);
  assert.match(member, /<textarea[^>]*readOnly=""/i); assert.ok(!member.includes("Save websites"));
});
