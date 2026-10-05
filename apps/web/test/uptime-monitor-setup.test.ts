import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { UptimeMonitorForm } from "../src/components/onboarding/uptime-monitor-form";
import { createUptimeMonitorDraft, isUptimeMonitorField, parseUptimeHeaderLines, validateUptimeMonitorDraft } from "../src/components/onboarding/uptime-monitor-input";
import { UptimeRequestError } from "../src/components/uptime/uptime-client";

Object.assign(globalThis, { React });

const validDraft = () => ({ ...createUptimeMonitorDraft(), name: "Public API", url: "https://api.example.com/health" });
const monitor = { id: "new", name: "Public API", url: "https://api.example.com/health", state: "unknown", lastCheckedAt: null };
const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));

function payload(draft = validDraft()) {
  const result = validateUptimeMonitorDraft(draft);
  assert.ok(result.success);
  return result.data;
}

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

test("inline monitor creation defaults to three failures, manual publishing, and expected HTTP success", () => {
  const draft = createUptimeMonitorDraft();
  assert.equal(draft.method, "GET");
  assert.equal(draft.statusMode, "range");
  assert.equal(draft.failureThreshold, 3);
  assert.equal(draft.incidentPublishing, "manual");
  assert.equal(draft.headers, "");
  assert.deepEqual(draft.notificationEmails, []);
  const data = payload();
  assert.equal(data.expectedStatus, null);
  assert.equal(data.responseText, null);
  assert.equal(data.failureThreshold, 3);
  assert.equal(data.incidentPublishing, "manual");
  assert.equal(data.publishAfterMinutes, 5);
});

test("draft validation reports the corresponding name, URL, and exact-status fields", () => {
  for (const [draft, field] of [
    [{ ...validDraft(), name: "  " }, "name"],
    [{ ...validDraft(), url: "not a URL" }, "url"],
    [{ ...validDraft(), url: "https://user:pass@example.com/health" }, "url"],
    [{ ...validDraft(), statusMode: "exact" as const, expectedStatus: "99" }, "expectedStatus"],
    [{ ...validDraft(), statusMode: "exact" as const, expectedStatus: "600" }, "expectedStatus"],
  ] as const) {
    const result = validateUptimeMonitorDraft(draft);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.field, field);
      assert.ok(result.error);
    }
  }
});

test("advanced values become a real monitor payload without stale range-mode status", () => {
  const draft = {
    ...validDraft(), statusMode: "exact" as const, expectedStatus: "503", responseText: "ready",
    headers: "Authorization: Bearer test-value:with:colons\nX-API-Key: sample",
    notificationEmails: ["owner@example.com"], failureThreshold: 4,
    incidentPublishing: "after_confirmation" as const, publishAfterMinutes: "7",
  };
  const data = payload(draft);
  assert.equal(data.expectedStatus, 503);
  assert.equal(data.responseText, "ready");
  assert.deepEqual(data.headers, { Authorization: "Bearer test-value:with:colons", "X-API-Key": "sample" });
  assert.deepEqual(data.notificationEmails, ["owner@example.com"]);
  assert.equal(data.failureThreshold, 4);
  assert.equal(data.incidentPublishing, "after_confirmation");
  assert.equal(data.publishAfterMinutes, 7);
  assert.equal(payload({ ...draft, statusMode: "range" }).expectedStatus, null);
});

test("header parsing supports values containing colons but rejects malformed or duplicate names", () => {
  assert.deepEqual(parseUptimeHeaderLines("  X-Token: one:two  \n\nAccept: application/json\n"), { "X-Token": "one:two", Accept: "application/json" });
  for (const input of ["not-a-header", ": value", "Bad Name: value", "X-Token: first\nx-token: second"]) assert.throws(() => parseUptimeHeaderLines(input));
});

test("the initial form is compact, labelled, and keeps advanced controls optional", () => {
  const html = renderToStaticMarkup(React.createElement(UptimeMonitorForm, { orgSlug: "acme", onCreated: () => {} }));
  assert.match(html, /<form\b/);
  assert.match(html, /Monitor name/);
  assert.match(html, /Public URL/);
  assert.match(html, /Create monitor/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /href="[^"]*\/uptime\/monitors|<select\b|text-\[34px\]|rounded-\[24px\]/);
});

/** Test actual submission and control handlers without any fetch, route, database, or auth access. */
async function loadForm({ draft = validDraft(), request = async () => ({ monitor }), moreOptions = false }: {
  draft?: ReturnType<typeof createUptimeMonitorDraft>;
  request?: (...args: any[]) => Promise<any>;
  moreOptions?: boolean;
} = {}) {
  const source = await readFile(new URL("../src/components/onboarding/uptime-monitor-form.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const state: any[] = [draft, moreOptions, false, null, null];
  const refs: Array<{ current: unknown }> = [];
  const received: any[] = [];
  const calls: any[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  const stubs = Object.fromEntries(["Button", "Select", "UptimeEmailRecipients"].map((name) => [name, (props: any) => React.createElement("div", { "data-component": name }, props.children)]));
  const module = { exports: {} as { UptimeMonitorForm: (props: any) => React.ReactElement<any> } };
  runInNewContext(compiled, {
    module, exports: module.exports, React, Error, Promise,
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState: (initial: any) => {
          const slot = stateIndex++;
          if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
          return [state[slot], (next: any) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
        },
        useRef: (initial: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
        useId: () => "monitor-form",
      };
      if (specifier === "./uptime-monitor-input") return { createUptimeMonitorDraft, isUptimeMonitorField, parseUptimeHeaderLines, validateUptimeMonitorDraft };
      if (specifier.endsWith("uptime-client")) return { UptimeRequestError, uptimeRequest: async (...args: any[]) => { calls.push(args); return request(...args); } };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@hugeicons-pro/")) return { __esModule: true, default: [] };
      if (specifier.startsWith("@/components/") || specifier.startsWith("../")) return stubs;
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected monitor form dependency: ${specifier}`);
    },
  });
  return {
    state, calls, received, stubs,
    render() {
      stateIndex = 0; refIndex = 0;
      return module.exports.UptimeMonitorForm({ orgSlug: "acme", onCreated: (value: unknown) => { received.push(value); } });
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function submit(tree: React.ReactNode) {
  const form = elements(tree).find((element) => element.type === "form");
  assert.ok(form);
  form.props.onSubmit({ preventDefault() {} });
  await settle();
}

test("saving POSTs to the current workspace and returns the actual created monitor without navigation", async () => {
  const setup = await loadForm({ draft: { ...validDraft(), headers: "Authorization: Bearer sample" } });
  const originalForm = setup.render();
  await submit(originalForm);
  assert.equal(setup.calls.length, 1);
  assert.equal(setup.calls[0][0], "acme");
  assert.equal(setup.calls[0][1], "/monitors");
  assert.equal(setup.calls[0][2].method, "POST");
  const body = JSON.parse(setup.calls[0][2].body);
  assert.equal(body.name, "Public API");
  assert.equal(body.url, "https://api.example.com/health");
  assert.equal(body.failureThreshold, 3);
  assert.equal(body.incidentPublishing, "manual");
  assert.deepEqual(body.headers, { Authorization: "Bearer sample" });
  assert.deepEqual(normalize(setup.received), [monitor]);
  assert.equal(setup.state[0].headers, "", "request header secrets are removed from the form after success");
  assert.equal(setup.state[2], false);
  assert.equal(setup.state[4]?.id, "new");
  const success = setup.render();
  assert.equal(success.props["aria-label"], "Created monitor");
  assert.equal(elements(success).some((element) => element.type === "form"), false);
  await submit(originalForm);
  assert.equal(setup.calls.length, 1, "a stale submit after success cannot create another monitor");
});

test("API field errors keep all inputs and show the error beside its optional control", async () => {
  const draft = { ...validDraft(), headers: "Authorization: Bearer sample" };
  const setup = await loadForm({ draft, request: async () => { throw new UptimeRequestError("Header rejected", 400, "headers"); } });
  await submit(setup.render());
  assert.deepEqual(normalize(setup.state[0]), draft);
  assert.equal(setup.state[1], true, "a hidden field error opens advanced options");
  assert.equal(setup.state[2], false);
  assert.equal(setup.state[3]?.field, "headers");
  assert.equal(setup.state[3]?.message ?? setup.state[3]?.error, "Header rejected");
  assert.deepEqual(setup.received, []);
  assert.equal(elements(setup.render()).some((element) => element.props.role === "alert"), true);
});

test("invalid input never makes a request and retains the draft for correction", async () => {
  const draft = { ...validDraft(), name: "" };
  const setup = await loadForm({ draft });
  await submit(setup.render());
  assert.equal(setup.calls.length, 0);
  assert.equal(setup.state[3]?.field, "name");
  assert.deepEqual(normalize(setup.state[0]), draft);
  assert.deepEqual(setup.received, []);
});

test("quota, permission, and unavailable errors keep the form retryable without reporting creation", async () => {
  for (const [status, message] of [
    [403, "Beta limit reached: 10 monitors per organization"],
    [403, "Only organization owners and admins can manage alerts"],
    [503, "Uptime is temporarily unavailable"],
  ] as const) {
    let rejected = true;
    const draft = validDraft();
    const setup = await loadForm({ draft, request: async () => {
      if (rejected) throw new UptimeRequestError(message, status);
      return { monitor };
    } });
    await submit(setup.render());
    assert.deepEqual(normalize(setup.state[0]), draft);
    assert.equal(setup.state[2], false);
    assert.equal(setup.state[3]?.message, message);
    assert.equal(setup.state[3]?.field, undefined);
    assert.equal(setup.state[4], null);
    assert.deepEqual(setup.received, []);
    rejected = false;
    await submit(setup.render());
    assert.equal(setup.calls.length, 2);
    assert.equal(setup.received.length, 1);
  }
});

test("the in-flight submission guard prevents duplicate posts even before React renders the pending state", async () => {
  let resolveRequest!: (result: unknown) => void;
  const setup = await loadForm({ request: () => new Promise((resolve) => { resolveRequest = resolve; }) });
  const tree = setup.render();
  const first = submit(tree);
  await submit(tree);
  assert.equal(setup.calls.length, 1);
  assert.equal(setup.state[2], true);
  resolveRequest({ monitor });
  await first;
  await settle();
  assert.equal(setup.calls.length, 1);
  assert.equal(setup.received.length, 1);
});

test("advanced custom controls update the submitted payload and HEAD does not carry a text match", async () => {
  const setup = await loadForm({ moreOptions: true, draft: { ...validDraft(), responseText: "healthy" } });
  const tree = elements(setup.render());
  const select = (label: string) => {
    const control = tree.find((element) => element.type === setup.stubs.Select && element.props.ariaLabel === label);
    assert.ok(control);
    return control;
  };
  select("Method").props.onChange("HEAD");
  select("Expected status").props.onChange("exact");
  select("Failed checks to confirm Down").props.onChange("4");
  select("Incident publishing mode").props.onChange("after_confirmation");
  const advanced = elements(setup.render());
  const exact = advanced.find((element) => element.type === "input" && element.props["aria-label"] === "Exact HTTP status code");
  assert.ok(exact);
  exact.props.onChange({ target: { value: "204" } });
  const delay = advanced.find((element) => element.type === "input" && element.props.id === "monitor-form-publishAfterMinutes");
  assert.ok(delay);
  delay.props.onChange({ target: { value: "7" } });
  const recipients = advanced.find((element) => element.type === setup.stubs.UptimeEmailRecipients);
  assert.ok(recipients);
  recipients.props.onChange(["owner@example.com"]);
  assert.equal(advanced.some((element) => element.type === "input" && element.props.id === "monitor-form-responseText"), false);
  await submit(setup.render());
  const data = JSON.parse(setup.calls[0][2].body);
  assert.equal(data.method, "HEAD");
  assert.equal(data.expectedStatus, 204);
  assert.equal(data.responseText, null);
  assert.equal(data.failureThreshold, 4);
  assert.equal(data.incidentPublishing, "after_confirmation");
  assert.equal(data.publishAfterMinutes, 7);
  assert.deepEqual(data.notificationEmails, ["owner@example.com"]);
});

test("unsafe destinations and headers surface validation errors without leaving the browser", () => {
  for (const url of ["http://localhost:3000", "http://127.0.0.1", "https://[::1]/", "https://api.example.com:8443/health", "https://api.example.com/#secret"]) {
    const result = validateUptimeMonitorDraft({ ...validDraft(), url });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.field, "url");
  }
  for (const headers of ["Host: internal", "Cookie: session=value", "X-Forwarded-For: 127.0.0.1", "Authorization: value\rBad: injected"]) {
    const result = validateUptimeMonitorDraft({ ...validDraft(), headers });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.field, "headers");
  }
});
