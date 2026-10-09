import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { Button } from "../src/components/arc/button/button";
import { SearchField } from "../src/components/arc/search-field/search-field";
import type { SecretsTable } from "../src/components/secrets/secrets-table";
import type { SecretEnvironment, SecretMetadata } from "../src/lib/secrets-client";
import { formatRelativeDate, formatSecretDate } from "../src/components/secrets/utils";

Object.assign(globalThis, { React });
type TableProps = Parameters<typeof SecretsTable>[0];
type Props = { children?: React.ReactNode; [key: string]: any };
type Effect = { run: () => void | (() => void); deps: unknown[] };
const environment: SecretEnvironment = {
  id: "env-a", name: "Production", slug: "production", secretCount: 2, revision: 7, isProduction: true,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const secrets: SecretMetadata[] = [
  { id: "secret-a", key: "DATABASE_URL", version: 4, revision: 7, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" },
  { id: "secret-b", key: "API_KEY", version: 2, revision: 7, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z" },
];
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Exercise real table hooks, timers and handlers with isolated plaintext/clipboard doubles. */
async function controller(update: Partial<TableProps> = {}, canShare: boolean | null = true) {
  const source = await readFile(new URL("../src/components/secrets/secrets-table.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const values: any[] = [];
  const committed: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  const timers = new Map<number, { callback: () => void; delay: number; at: number; interval: boolean }>();
  let effects: Effect[] = [], index = 0, timerId = 0, dirty = false;
  let unmounted = false, writesAfterUnmount = 0, mutations = 0, adds = 0;
  let clock = Date.parse("2026-10-05T12:00:00Z");
  const clipboard: string[] = [];
  const calls: Array<{ action: string; orgSlug: string; projectSlug: string; environmentSlug: string; secretId: string; input: any }> = [];
  const permissionCalls: unknown[] = [];
  let revealResponse: () => Promise<{ value: string; expiresIn: number }> = async () => ({ value: "plaintext-test-value", expiresIn: 30 });
  let deleteResponse: () => Promise<void> = async () => undefined;
  let copyResponse: (value: string) => Promise<void> = async (value) => { clipboard.push(value); };
  const Editor = () => null, History = () => null, Confirm = () => null, Bulk = () => null;
  const Notice = (props: Props) => React.createElement("div", { role: props.tone === "success" ? "status" : "alert" }, props.message);
  const Icon = (props: Props) => React.createElement("svg", { "aria-hidden": props["aria-hidden"] ?? true });
  class FakeDate extends Date { static now() { return clock; } }
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports, Error, Date: FakeDate,
    navigator: { clipboard: { writeText: (value: string) => copyResponse(value) } },
    window: {
      setTimeout(callback: () => void, delay: number) { const id = ++timerId; timers.set(id, { callback, delay, at: clock + delay, interval: false }); return id; },
      clearTimeout(id: number) { timers.delete(id); },
      setInterval(callback: () => void, delay: number) { const id = ++timerId; timers.set(id, { callback, delay, at: clock + delay, interval: true }); return id; },
      clearInterval(id: number) { timers.delete(id); },
    },
    require: (specifier: string) => {
      if (specifier === "react") return {
        ...React,
        useState(initial: any) {
          const slot = index++;
          if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
          return [values[slot], (next: any) => {
            if (unmounted) writesAfterUnmount++;
            const value = typeof next === "function" ? next(values[slot]) : next;
            if (!Object.is(value, values[slot])) { values[slot] = value; dirty = true; }
          }];
        },
        useRef(initial: any) { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
        useMemo(calculate: () => unknown) { index++; return calculate(); },
        useEffect(run: Effect["run"], deps: unknown[]) { effects.push({ run, deps }); },
      };
      if (specifier === "lucide-react") return { Check: Icon, Minus: Icon, Plus: Icon, Search: Icon };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: Icon };
      if (specifier.startsWith("@outray/icons/")) return [];
      if (specifier === "../arc/button/button") return { Button };
      if (specifier === "../arc/search-field/search-field") return { SearchField };
      if (specifier === "./secret-dialogs") return { SecretEditorDialog: Editor, ConfirmSecretActionDialog: Confirm };
      if (specifier === "./secret-history-sheet") return { SecretHistorySheet: History };
      if (specifier === "./bulk-actions-dialog") return { BulkActionsDialog: Bulk };
      if (specifier === "./secrets-ui") return { SecretsNotice: Notice };
      if (specifier === "./utils") return { formatRelativeDate, formatSecretDate };
      if (specifier === "@/lib/auth-client") return { usePermission: (input: unknown) => { permissionCalls.push(input); return { data: canShare ?? undefined }; } };
      if (specifier.endsWith(".css")) return {};
      if (specifier === "@/lib/secrets-client") return { secretsClient: {
        revealSecret: async (orgSlug: string, projectSlug: string, environmentSlug: string, secretId: string, input: any) => {
          calls.push({ action: "reveal", orgSlug, projectSlug, environmentSlug, secretId, input: JSON.parse(JSON.stringify(input)) }); return revealResponse();
        },
        deleteSecret: async (orgSlug: string, projectSlug: string, environmentSlug: string, secretId: string, input: any) => {
          calls.push({ action: "delete", orgSlug, projectSlug, environmentSlug, secretId, input: JSON.parse(JSON.stringify(input)) }); return deleteResponse();
        },
      } };
      throw new Error(`Unexpected secret table dependency: ${specifier}`);
    },
  });
  const props: TableProps = {
    orgSlug: "acme", projectSlug: "payments-api", environment, environments: [environment], secrets, revision: 7,
    onMutated: () => { mutations++; }, onAdd: () => { adds++; }, ...update,
  };
  return {
    calls, clipboard, timers, permissionCalls,
    get mutations() { return mutations; }, get adds() { return adds; }, get writesAfterUnmount() { return writesAfterUnmount; },
    revealWith(response: typeof revealResponse) { revealResponse = response; },
    deleteWith(response: typeof deleteResponse) { deleteResponse = response; },
    copyWith(response: typeof copyResponse) { copyResponse = response; },
    advance(milliseconds: number) {
      clock += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.at > clock) continue;
        if (timer.interval) timer.at = clock + timer.delay; else timers.delete(id);
        timer.callback();
      }
    },
    render(next: Partial<TableProps> = {}) {
      assert.equal(unmounted, false);
      Object.assign(props, next);
      let root!: React.ReactElement<Props>;
      for (let pass = 0; pass < 10; pass++) {
        index = 0; dirty = false; effects = [];
        root = module.exports.SecretsTable(props);
        if (!dirty) effects.forEach((effect, slot) => {
          const previous = committed[slot];
          if (previous && previous.deps.length === effect.deps.length && previous.deps.every((value, dep) => Object.is(value, effect.deps[dep]))) return;
          previous?.cleanup?.(); committed[slot] = { deps: [...effect.deps], cleanup: effect.run() ?? undefined };
        });
        if (!dirty) break;
        assert.ok(pass < 9, "table state settles without a render loop");
      }
      const tree = elements(root);
      const action = (label: string) => {
        const element = tree.find((item) => item.type === Button && (item.props["aria-label"] === label || text(item.props.children) === label));
        assert.ok(element, `the ${label} action exists`); return element.props;
      };
      const checkbox = (label: string) => {
        const element = tree.find((item) => item.type === "input" && item.props["aria-label"] === label);
        assert.ok(element, `the ${label} checkbox exists`); return element.props;
      };
      const search = tree.find((item) => item.type === SearchField)?.props;
      return { root, tree, action, checkbox, search,
        rows: tree.filter((item) => item.props.role === "row" && "aria-selected" in item.props),
        toolbar: tree.find((item) => item.props.role === "toolbar")?.props,
        editor: tree.find((item) => item.type === Editor)?.props,
        history: tree.find((item) => item.type === History)?.props,
        confirm: tree.find((item) => item.type === Confirm)?.props,
        bulk: tree.find((item) => item.type === Bulk)?.props,
        notices: tree.filter((item) => item.type === Notice).map((item) => item.props),
        html: () => renderToStaticMarkup(root),
      };
    },
    dispose() { unmounted = true; committed.forEach((effect) => effect.cleanup?.()); },
  };
}

test("compact single responsive table stays masked, uses content-width breakpoints, and offers accessible Arc actions", async () => {
  const table = await controller();
  const view = table.render();
  assert.equal(view.rows.length, 2, "there is no separate duplicate mobile-card render");
  assert.match(view.root.props.className, /@container\/secret-table/);
  assert.match(view.root.props.className, /rounded-xl border/);
  assert.match(view.root.props.className, /ph-no-capture/);
  assert.equal(view.search?.label, "Search secret keys");
  assert.equal(view.search?.autoComplete, "off");
  for (const row of view.rows) {
    assert.match(row.props.className, /@\[680px\]\/secret-table:grid-cols/);
    assert.match(row.props.className, /motion-reduce:transition-none/);
    assert.doesNotMatch(row.props.className, /rounded|lg:/);
  }
  const html = view.html();
  assert.match(html, /role="table" aria-label="Secret keys"/);
  assert.match(html, /type="search"/);
  assert.match(html, /••••••••••••••••/);
  assert.match(html, /v4/);
  assert.doesNotMatch(html, /plaintext-test-value|rounded-2xl|uppercase|tracking-\[0.09em\]|border-violet/);
  for (const key of secrets.map((item) => item.key)) {
    for (const action of [`Reveal ${key} for 30 seconds`, `Copy value for ${key}`, `Edit secret ${key}`, `Version history ${key}`, `Delete secret ${key}`]) {
      assert.equal(view.action(action).type, "button");
      assert.equal(view.action(action).disabled, false);
      assert.equal(view.action(action).size, "sm", "icon-only row actions remain compact");
    }
  }
  assert.equal(table.calls.length, 0, "initial and repeated renders never request plaintext");
  table.render(); assert.equal(table.calls.length, 0);
  table.dispose();
});

test("contained tables remove only their outer card and invalid updated dates do not produce invalid datetime attributes", async () => {
  const table = await controller({ contained: true, secrets: [{ ...secrets[0], updatedAt: "not-a-date" }] });
  const view = table.render();
  assert.doesNotMatch(view.root.props.className, /rounded-xl|border-white|overflow-hidden/);
  assert.match(view.root.props.className, /@container\/secret-table/);
  const time = view.tree.find((item) => item.type === "time");
  assert.ok(time);
  assert.equal(time.props.dateTime, undefined);
  assert.equal(time.props.title, "Unknown");
  assert.equal(text(time), "Unknown");
  table.dispose();
});

test("scrollRows opt-in fixes controls and headers while only the named, keyboard-focusable rows can scroll", async () => {
  const table = await controller({ contained: true, scrollRows: true });
  let view = table.render();
  assert.match(view.root.props.className, /flex h-full min-h-0 flex-col overflow-hidden/);
  assert.doesNotMatch(view.root.props.className, /rounded-xl|h-screen|100vh/);
  const shell = view.tree.find((item) => item.props.role === "table");
  assert.ok(shell);
  assert.match(shell.props.className, /flex min-h-0 flex-1 flex-col overflow-hidden/);
  const groups = view.tree.filter((item) => item.props.role === "rowgroup");
  assert.equal(groups.length, 2, "header and body remain one semantic table, without duplicate mobile markup");
  assert.match(groups[0].props.className, /shrink-0/);
  assert.match(groups[0].props.className, /scrollbar-gutter:stable/);
  assert.doesNotMatch(groups[0].props.className, /overflow-y-auto/);
  assert.equal(groups[1].props["aria-label"], "Secret key rows");
  assert.equal(groups[1].props.tabIndex, 0);
  assert.match(groups[1].props.className, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.match(groups[1].props.className, /scrollbar-gutter:stable/);
  assert.match(groups[1].props.className, /focus-visible:outline-2/);
  const html = view.html();
  assert.match(html, /role="rowgroup" aria-label="Secret key rows" tabindex="0"/);
  assert.equal((html.match(/overflow-y-auto/g) ?? []).length, 1, "no ancestor or header becomes another scrolling area");
  assert.equal((html.match(/role="table"/g) ?? []).length, 1);
  const searchBar = view.tree.find((item) => typeof item.props.className === "string" && item.props.className.includes("px-4 py-3") && elements(item.props.children).some((child) => child.type === SearchField));
  assert.ok(searchBar);
  assert.match(searchBar.props.className, /shrink-0/);
  assert.equal(table.calls.length, 0);
  view.checkbox("Select all visible secrets").onChange(); view = table.render();
  assert.match(view.toolbar!.className, /shrink-0/);
  assert.equal(view.bulk?.secrets.length, 2);
  table.revealWith(async () => { throw new Error("Reveal unavailable"); });
  view.action("Reveal DATABASE_URL for 30 seconds").onClick(); await settle(); view = table.render();
  assert.equal(view.notices[0].message, "Reveal unavailable");
  assert.match(view.html(), /space-y-2 px-4 pt-4 shrink-0/);
  assert.equal((view.html().match(/overflow-y-auto/g) ?? []).length, 1);
  table.dispose();
});

test("scrollRows defaults to natural-height rendering for other consumers and remains opt-in with standalone cards", async () => {
  for (const scrollRows of [undefined, false]) {
    const table = await controller({ contained: true, scrollRows });
    const view = table.render();
    assert.doesNotMatch(view.root.props.className, /h-full|min-h-0|overflow-hidden/);
    const shell = view.tree.find((item) => item.props.role === "table")!;
    assert.equal(shell.props.className, undefined);
    const group = view.tree.filter((item) => item.props.role === "rowgroup")[1];
    assert.equal(group.props.tabIndex, undefined);
    assert.equal(group.props["aria-label"], undefined);
    assert.equal(group.props["data-scroll-restoration-id"], undefined);
    assert.doesNotMatch(view.html(), /overflow-y-auto|overscroll-contain/);
    assert.doesNotMatch(view.html(), /data-scroll-restoration-id/);
    table.dispose();
  }
  const standalone = await controller({ scrollRows: true });
  const view = standalone.render();
  assert.match(view.root.props.className, /h-full min-h-0/);
  assert.match(view.root.props.className, /rounded-xl border/);
  assert.match(view.html(), /aria-label="Secret key rows"/);
  standalone.dispose();
});

test("row scroll restoration identity is scoped to organization, vault and environment, not refreshed metadata", async () => {
  const table = await controller({ contained: true, scrollRows: true });
  const identity = (view: ReturnType<typeof table.render>) => {
    const group = view.tree.find((item) => item.props["aria-label"] === "Secret key rows");
    assert.ok(group);
    return group.props["data-scroll-restoration-id"];
  };
  const first = table.render();
  assert.equal(identity(first), "secrets-rows:acme:payments-api:env-a");
  assert.equal(first.tree.filter((item) => item.props["data-scroll-restoration-id"]).length, 1, "only the scrolling rowgroup is registered");
  assert.match(first.html(), /data-scroll-restoration-id="secrets-rows:acme:payments-api:env-a"/);
  const refreshed = table.render({ environment: { ...environment, name: "Updated display name", revision: 20 } });
  assert.equal(identity(refreshed), identity(first));
  const switched = table.render({ environment: { ...environment, id: "env-b", slug: "staging" } });
  assert.equal(identity(switched), "secrets-rows:acme:payments-api:env-b");
  assert.notEqual(identity(switched), identity(first));
  const anotherVault = table.render({ projectSlug: "other-vault" });
  assert.notEqual(identity(anotherVault), identity(switched));
  const anotherOrg = table.render({ orgSlug: "other-org" });
  assert.notEqual(identity(anotherOrg), identity(anotherVault));
  const special = table.render({ orgSlug: 'org " /?[a]', projectSlug: 'vault: /[b]', environment: { ...environment, id: 'env: "\\c' } });
  assert.equal(identity(special), `secrets-rows:${['org " /?[a]', 'vault: /[b]', 'env: "\\c'].map(encodeURIComponent).join(":")}`);
  assert.doesNotMatch(identity(special), /["\\]/, "restoration builds a quoted CSS attribute selector, so scope parts must be selector-safe");
  table.dispose();
});

test("scrollRows centers empty and unmatched messages in the remaining space without changing add or search recovery", async () => {
  const empty = await controller({ contained: true, scrollRows: true, secrets: [] });
  let view = empty.render();
  assert.match(view.root.props.className, /h-full min-h-0 flex-col/);
  assert.match(view.html(), /flex min-h-0 flex-1 flex-col items-center justify-center/);
  assert.doesNotMatch(view.html(), /overflow-y-auto/);
  assert.equal(view.action("Add first secret").size, "md");
  view.action("Add first secret").onClick(); assert.equal(empty.adds, 1);
  empty.dispose();
  const table = await controller({ contained: true, scrollRows: true });
  table.render().search!.onValueChange("missing-key"); view = table.render();
  assert.match(view.html(), /No matching keys/);
  assert.match(view.html(), /flex min-h-0 flex-1 flex-col items-center justify-center/);
  assert.equal(view.search?.value, "missing-key");
  view.action("Clear search").onClick(); view = table.render();
  assert.equal(view.rows.length, 2);
  assert.match(view.html(), /aria-label="Secret key rows"/);
  assert.equal(table.calls.length, 0);
  table.dispose();
});

test("scrollRows keeps user-triggered reveal TTL, clipboard isolation and selection actions unchanged", async () => {
  const table = await controller({ contained: true, scrollRows: true });
  let view = table.render();
  assert.equal(table.calls.length, 0);
  view.action("Reveal DATABASE_URL for 30 seconds").onClick(); await settle(); view = table.render();
  assert.match(view.html(), /plaintext-test-value/);
  assert.match(view.html(), /30s/);
  table.advance(30_000); view = table.render();
  assert.doesNotMatch(view.html(), /plaintext-test-value/);
  view.action("Copy value for API_KEY").onClick(); await settle(); view = table.render();
  assert.deepEqual(table.clipboard, ["plaintext-test-value"]);
  assert.doesNotMatch(view.html(), /plaintext-test-value/);
  view.checkbox("Select API_KEY").onChange(); view = table.render();
  view.action("Move to").onClick(); view = table.render();
  assert.equal(view.bulk?.action, "move");
  assert.equal(view.bulk?.secrets[0].key, "API_KEY");
  assert.equal(table.calls.length, 2, "scroll layout itself never fetches plaintext");
  table.dispose();
  assert.equal(table.timers.size, 0);
});

test("scrollRows introduces no document-wide scrolling styles or scroll commands", async () => {
  const source = await readFile(new URL("../src/components/secrets/secrets-table.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /document\.(?:body|documentElement)|window\.scroll|:global|h-screen|100[ds]?vh/);
});

test("empty inventory and search misses stay distinct and recover through real add/clear handlers", async () => {
  const empty = await controller({ contained: true, secrets: [] });
  let view = empty.render();
  assert.match(view.html(), /No secrets in this environment/);
  assert.equal(view.search, undefined);
  view.action("Add first secret").onClick(); assert.equal(empty.adds, 1);
  assert.equal(empty.calls.length, 0); empty.dispose();
  const table = await controller();
  table.render().search!.onValueChange("  database  "); view = table.render();
  assert.equal(view.rows.length, 1);
  assert.equal(view.search?.value, "  database  ");
  table.render().search!.onValueChange("missing-key"); view = table.render();
  assert.match(view.html(), /No matching keys/);
  assert.equal(view.rows.length, 0);
  view.action("Clear search").onClick(); assert.equal(table.render().rows.length, 2);
  assert.equal(table.calls.length, 0); table.dispose();
});

test("native checkboxes and neutral selection toolbar preserve filtered selection and bulk action wiring", async () => {
  const table = await controller();
  let view = table.render();
  const checkbox = view.checkbox("Select DATABASE_URL");
  assert.equal(checkbox.type, "checkbox");
  assert.equal(checkbox.checked, false);
  assert.match(checkbox.className, /opacity-0/);
  assert.notEqual(checkbox["aria-hidden"], true);
  assert.notEqual(checkbox.tabIndex, -1);
  assert.match(view.html(), /peer-focus-visible:outline/);
  checkbox.onChange(); view = table.render();
  assert.equal(view.checkbox("Select all visible secrets")["aria-checked"], "mixed");
  assert.ok(view.toolbar);
  assert.doesNotMatch(view.toolbar.className, /violet|purple|rounded/);
  assert.equal(view.bulk?.secrets.length, 1);
  for (const [label, action] of [["Move to", "move"], ["Share", "share"], ["Delete", "delete"]]) {
    assert.equal(view.action(label).size, "md");
    assert.equal(view.action(label)["aria-haspopup"], "dialog");
    view.action(label).onClick(); view = table.render();
    assert.equal(view.bulk?.action, action);
    view.bulk!.onClose(); view = table.render();
  }
  view.search!.onValueChange("api"); view = table.render();
  view.checkbox("Select all visible secrets").onChange(); view = table.render();
  assert.equal(view.bulk?.secrets.length, 2, "select-visible keeps earlier hidden selections");
  view.checkbox("Select all visible secrets").onChange(); view = table.render();
  assert.equal(view.bulk?.secrets.length, 1, "deselect-visible does not clear hidden selected keys");
  view.action("Clear").onClick(); assert.equal(table.render().toolbar, undefined);
  assert.equal(table.calls.length, 0); table.dispose();
});

test("bulk Share remains permission-gated and limited to at most 50 selections", async () => {
  for (const permission of [false, null]) {
    const table = await controller({}, permission);
    table.render().checkbox("Select all visible secrets").onChange();
    assert.equal(table.render().tree.some((item) => item.type === Button && text(item.props.children) === "Share"), false);
    assert.deepEqual(JSON.parse(JSON.stringify(table.permissionCalls[0])), { secretShare: ["create"] });
    table.dispose();
  }
  const many = Array.from({ length: 51 }, (_, index) => ({ ...secrets[0], id: `secret-${index}`, key: `KEY_${index}` }));
  const table = await controller({ secrets: many });
  table.render().checkbox("Select all visible secrets").onChange();
  assert.equal(table.render().bulk?.secrets.length, 51);
  assert.equal(table.render().tree.some((item) => item.type === Button && text(item.props.children) === "Share"), false);
  table.dispose();
});

test("reveals are user-triggered, use server TTL, can hide early, and erase transient values on expiry", async () => {
  const table = await controller();
  table.revealWith(async () => ({ value: "short-lived-plaintext", expiresIn: 7 }));
  table.render().action("Reveal DATABASE_URL for 30 seconds").onClick();
  assert.equal(table.render().action("Copy value for DATABASE_URL").disabled, true);
  await settle(); let view = table.render();
  assert.match(view.html(), /short-lived-plaintext/);
  assert.match(view.html(), /7s/);
  assert.deepEqual(table.calls[0], { action: "reveal", orgSlug: "acme", projectSlug: "payments-api", environmentSlug: "production", secretId: "secret-a", input: { intent: "reveal" } });
  assert.ok([...table.timers.values()].some((timer) => !timer.interval && timer.delay === 7_000));
  table.advance(6_000); view = table.render(); assert.match(view.html(), /1s/);
  table.advance(1_000); view = table.render(); assert.doesNotMatch(view.html(), /short-lived-plaintext/);
  view.action("Reveal DATABASE_URL for 30 seconds").onClick(); await settle(); view = table.render();
  view.action("Hide value for DATABASE_URL").onClick(); view = table.render();
  assert.doesNotMatch(view.html(), /short-lived-plaintext/);
  assert.equal(table.timers.size, 0);
  assert.equal(table.calls.length, 2, "hiding an already revealed value never fetches it again");
  table.dispose();
});

test("copy uses copy intent and clipboard without putting plaintext into rendered state", async () => {
  const table = await controller();
  table.render().action("Copy value for DATABASE_URL").onClick(); await settle();
  let view = table.render();
  assert.deepEqual(table.clipboard, ["plaintext-test-value"]);
  assert.deepEqual(table.calls[0].input, { intent: "copy" });
  assert.doesNotMatch(view.html(), /plaintext-test-value/);
  assert.equal(view.action("Copied DATABASE_URL").disabled, false);
  table.advance(2_000); view = table.render();
  assert.equal(view.action("Copy value for DATABASE_URL").disabled, false);
  assert.equal(table.timers.size, 0); table.dispose();
});

test("editor identity and expected revision snapshot survive background metadata refreshes, while history still opens", async () => {
  const table = await controller();
  table.render().action("Edit secret DATABASE_URL").onClick();
  const edited = table.render().editor!;
  assert.equal(edited.open, true);
  assert.equal(edited.secret.key, "DATABASE_URL");
  assert.equal(edited.revision, 7);
  const refreshed = table.render({ revision: 19, environment: { ...environment, revision: 19, name: "Remote production" }, environments: [{ ...environment, revision: 19 }], secrets: [{ ...secrets[0], key: "REMOTE_NAME", version: 5 }, secrets[1]] });
  assert.equal(refreshed.editor?.secret.key, "DATABASE_URL");
  assert.equal(refreshed.editor?.revision, 7);
  assert.equal(refreshed.editor?.environment.name, "Production");
  assert.equal(refreshed.editor?.environments[0].revision, 7);
  refreshed.editor!.onClose();
  table.render().action("Version history API_KEY").onClick();
  assert.equal(table.render().history?.open, true);
  assert.equal(table.render().history?.secret.id, "secret-b");
  table.render().history!.onRolledBack(); assert.equal(table.mutations, 1);
  table.dispose();
});

test("delete forwards the existing exact-name, production and revision contract and clears a revealed value after success", async () => {
  const table = await controller();
  table.render().action("Reveal DATABASE_URL for 30 seconds").onClick(); await settle(); table.render();
  table.render().action("Delete secret DATABASE_URL").onClick();
  let view = table.render();
  assert.equal(view.confirm?.open, true);
  assert.equal(view.confirm?.confirmationText, "DATABASE_URL");
  assert.equal(view.confirm?.production, true);
  view.confirm!.onConfirm(true, "DATABASE_URL"); await settle(); view = table.render();
  assert.deepEqual(table.calls.at(-1), { action: "delete", orgSlug: "acme", projectSlug: "payments-api", environmentSlug: "production", secretId: "secret-a", input: { expectedRevision: 7, confirmation: "DATABASE_URL", confirmProduction: true } });
  assert.equal(view.confirm?.open, false);
  assert.doesNotMatch(view.html(), /plaintext-test-value/);
  assert.equal(table.mutations, 1);
  table.dispose(); assert.equal(table.timers.size, 0);
});

test("reveal, copy and deletion failures retain masked rows and expose recoverable notices", async () => {
  const table = await controller();
  table.revealWith(async () => { throw new Error("Access denied"); });
  table.render().action("Reveal DATABASE_URL for 30 seconds").onClick(); await settle();
  let view = table.render();
  assert.equal(view.notices[0].message, "Access denied");
  assert.doesNotMatch(view.html(), /plaintext-test-value/);
  view.notices[0].onDismiss(); assert.equal(table.render().notices.length, 0);
  table.revealWith(async () => ({ value: "clipboard-only-value", expiresIn: 30 }));
  table.copyWith(async () => { throw new Error("Clipboard unavailable"); });
  table.render().action("Copy value for DATABASE_URL").onClick(); await settle(); view = table.render();
  assert.equal(view.notices[0].message, "Clipboard unavailable");
  assert.doesNotMatch(view.html(), /clipboard-only-value/);
  table.deleteWith(async () => { throw new Error("Revision conflict"); });
  view.action("Delete secret DATABASE_URL").onClick();
  table.render().confirm!.onConfirm(true, "DATABASE_URL"); await settle(); view = table.render();
  assert.equal(view.confirm?.open, true);
  assert.equal(view.notices[0].message, "Revision conflict");
  assert.equal(table.mutations, 0); table.dispose();
});

test("late reveal/copy responses cannot write state or clipboard after the table unmounts", async () => {
  for (const intent of ["reveal", "copy"] as const) {
    const table = await controller();
    let resolve!: (value: { value: string; expiresIn: number }) => void;
    table.revealWith(() => new Promise((done) => { resolve = done; }));
    table.render().action(intent === "reveal" ? "Reveal DATABASE_URL for 30 seconds" : "Copy value for DATABASE_URL").onClick();
    table.dispose(); resolve({ value: "late-plaintext", expiresIn: 30 }); await settle();
    assert.equal(table.writesAfterUnmount, 0);
    assert.deepEqual(table.clipboard, []);
    assert.equal(table.timers.size, 0);
  }
});

test("unmount clears active reveal and copy timers and suppresses clipboard completion feedback", async () => {
  const table = await controller();
  table.render().action("Reveal DATABASE_URL for 30 seconds").onClick(); await settle(); table.render();
  table.render().action("Copy value for API_KEY").onClick(); await settle(); table.render();
  assert.ok(table.timers.size >= 3);
  table.dispose(); assert.equal(table.timers.size, 0);
  assert.equal(table.writesAfterUnmount, 0);
  const copying = await controller();
  let resolve!: () => void;
  copying.copyWith(() => new Promise<void>((done) => { resolve = done; }));
  copying.render().action("Copy value for DATABASE_URL").onClick(); await settle();
  copying.dispose(); resolve(); await settle();
  assert.equal(copying.writesAfterUnmount, 0);
  assert.equal(copying.timers.size, 0);
});

test("bulk completion preserves recoverable feedback and clears the selection without revealing plaintext", async () => {
  const table = await controller();
  table.render().checkbox("Select all visible secrets").onChange();
  table.render().action("Delete").onClick();
  table.render().bulk!.onDone("2 secrets moved to Trash. They can be restored as one batch.");
  const view = table.render();
  assert.equal(view.toolbar, undefined);
  assert.equal(view.bulk?.action, null);
  assert.equal(view.notices[0].tone, "success");
  assert.match(view.notices[0].message, /Trash/);
  assert.equal(table.mutations, 1);
  assert.equal(table.calls.length, 0);
  table.dispose();
});
