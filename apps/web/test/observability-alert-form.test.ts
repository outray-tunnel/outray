import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as alertData from "../src/components/observability/alerts-data";
import { AlertSelectionControl } from "../src/components/observability/alert-selection-control";
import { validateAlertCreateInput } from "../src/lib/observability/alert-validation";

Object.assign(globalThis, { React });
type Element = React.ReactElement<Record<string, any>>;
type RequestCall = { url: string; init: RequestInit; respond: (response: unknown) => void };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function collect(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(collect);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...collect(element.props.children)];
}

function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement(node)) return text((node as Element).props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

function alert(signal: alertData.AlertSignal = "request_error_rate"): alertData.AlertRecord {
  return {
    id: "alert-one", name: "Checkout health", description: "Protect checkout.", signal,
    service: "payments-worker", environment: "production", metricKey: signal === "metric_value" ? "a".repeat(32) : null,
    metricName: signal === "metric_value" ? "queue.depth" : null, metricType: signal === "metric_value" ? "gauge" : null,
    metricUnit: signal === "metric_value" ? "items" : null, aggregationTemporality: signal === "metric_value" ? "unspecified" : null,
    isMonotonic: signal === "metric_value" ? false : null, metricAggregation: signal === "metric_value" ? "max" : null,
    logLevel: signal === "log_count" ? "error" : "all", logQuery: signal === "log_count" ? "Payment refused" : null,
    operator: "gt", threshold: signal === "request_latency_p95" ? 750 : 5, windowMinutes: 5,
    evaluationIntervalSeconds: 60, consecutiveFailures: 2, consecutiveRecoveries: 2, minimumSamples: 20,
    noDataState: "no_data", notificationEmail: "owner@acme.dev", notificationEmails: ["owner@acme.dev"],
    notificationSlackConfigured: true, notificationDiscordConfigured: false, notificationSlackTarget: null,
    notificationDiscordTarget: null, enabled: true, state: "healthy", underlyingState: "healthy", mutedUntil: null,
    currentValue: 0, sampleCount: 20, failureStreak: 0, recoveryStreak: 0, lastEvaluatedAt: null,
    nextEvaluationAt: null, lastStateChangedAt: null, lastEvaluationError: null,
    createdAt: "2026-10-05T12:00:00Z", updatedAt: "2026-10-05T12:00:00Z", openIncidentId: null,
  };
}

/** Executes the real component's effects and handlers; visual primitives are inert boundary stubs. */
async function harness(filename: "alert-form" | "alert-email-recipients", props: Record<string, any>, autoCatalog = true) {
  const source = await readFile(new URL(`../src/components/observability/${filename}.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const values: any[] = [];
  const refs: Array<{ current: any }> = [];
  const memos: Array<{ value: any; deps: unknown[] }> = [];
  const activeEffects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  let effects: Array<{ callback: () => void | (() => void); deps: unknown[] }> = [];
  let stateIndex = 0; let refIndex = 0; let memoIndex = 0; let dirty = false;
  let currentProps = props; let previousKey: string | null = null;
  let tree: React.ReactNode;
  const requests: RequestCall[] = [];
  const stubs: Record<string, React.ComponentType<any>> = {};
  const stub = (name: string) => stubs[name] ?? (stubs[name] = Object.assign(() => null, { displayName: name }));
  const same = (left: unknown[], right: unknown[]) => left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const memo = (callback: () => any, deps: unknown[]) => {
    const index = memoIndex++;
    if (!memos[index] || !same(memos[index].deps, deps)) memos[index] = { value: callback(), deps: deps.slice() };
    return memos[index].value;
  };
  const module = { exports: {} as Record<string, (props: Record<string, any>) => React.ReactNode> };
  runInNewContext(compiled, {
    React, module, exports: module.exports, AbortController, Error, Number, Date,
    fetch: (url: string, init: RequestInit = {}) => {
      const response = deferred<unknown>();
      requests.push({ url, init, respond: response.resolve });
      if (autoCatalog && !init.method) {
        response.resolve({ ok: true, json: async () => url.endsWith("/members")
          ? { members: [], currentUserId: "owner" }
          : url.includes("/services?") ? { services: [{ name: "payments-worker", environment: "production" }] }
          : url.includes("/logs?") ? { services: ["payments-worker"] } : { metrics: [] } });
      }
      return response.promise;
    },
    require: (specifier: string) => {
      if (specifier === "react") return {
        ...React,
        useState: (initial: any) => {
          const index = stateIndex++;
          if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
          return [values[index], (next: any) => {
            const value = typeof next === "function" ? next(values[index]) : next;
            if (!Object.is(value, values[index])) { values[index] = value; dirty = true; }
          }];
        },
        useRef: (initial: any) => { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
        useMemo: memo, useCallback: (callback: any, deps: unknown[]) => memo(() => callback, deps),
        useEffect: (callback: () => void | (() => void), deps: unknown[]) => effects.push({ callback, deps }),
        useId: () => "alert-form-control",
      };
      if (specifier === "./alerts-data") return alertData;
      // Keep the shared field boundary native; its visual implementation has its own tests.
      if (specifier.endsWith("ui/workspace-input")) return { WorkspaceInput: "input", WorkspaceTextarea: "textarea" };
      if (specifier.endsWith(".css")) return {};
      if (specifier.startsWith("@outray/icons/")) return { default: {} };
      return new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : stub(String(property)) });
    },
  });
  const component = module.exports[filename === "alert-form" ? "AlertFormModal" : "AlertEmailRecipients"];
  function reset() {
    activeEffects.forEach((effect) => effect.cleanup?.());
    values.length = 0; refs.length = 0; memos.length = 0; activeEffects.length = 0;
  }
  function render() {
    let passes = 0;
    do {
      assert.ok(passes++ < 30, "component effects must settle without a render loop");
      stateIndex = 0; refIndex = 0; memoIndex = 0; effects = []; dirty = false;
      tree = component(currentProps);
      if (React.isValidElement(tree) && typeof tree.type === "function" && !Object.values(stubs).includes(tree.type)) {
        const element = tree as Element;
        const key = String(element.key);
        if (previousKey !== null && key !== previousKey) reset();
        previousKey = key;
        tree = (element.type as (props: Record<string, any>) => React.ReactNode)(element.props);
      }
      effects.forEach((effect, index) => {
        if (activeEffects[index] && same(activeEffects[index].deps, effect.deps)) return;
        activeEffects[index]?.cleanup?.();
        activeEffects[index] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
      });
    } while (dirty);
    return collect(tree);
  }
  function named(name: string) {
    return render().filter((element) => element.type === stubs[name]);
  }
  function input(label: string) {
    const container = render().find((element) => element.type === "label" && text(element.props.children).trim() === label);
    assert.ok(container, `field ${label} exists`);
    const control = collect(container.props.children).find((element) => element.type === "input" || element.type === "textarea");
    assert.ok(control, `field ${label} has a native text input`);
    return control;
  }
  function select(label: string) {
    const control = named("Select").find((element) => (element.props.label ?? element.props.ariaLabel) === label);
    assert.ok(control, `select ${label} exists`);
    return control;
  }
  return {
    requests, render, named, input, select,
    text: () => text(tree), props: () => currentProps,
    update(next: Record<string, any>) { currentProps = { ...currentProps, ...next }; render(); },
    changeInput(label: string, value: string) { input(label).props.onChange({ target: { value } }); render(); },
    changeSelect(label: string, value: string) { const control = select(label); (control.props.onValueChange ?? control.props.onChange)(value); render(); },
    async submit() {
      const form = render().find((element) => element.type === "form");
      assert.ok(form, "the form submits through its native form handler");
      const pending = form.props.onSubmit({ preventDefault() {} });
      render();
      return { pending };
    },
    async flush() { for (let count = 0; count < 12; count++) await Promise.resolve(); render(); },
    unmount: reset,
  };
}

function formProps(overrides: Record<string, any> = {}) {
  return { isOpen: true, onClose() {}, orgSlug: "acme", services: ["payments-worker"], onSaved() {}, ...overrides };
}

function patchCall(driver: Awaited<ReturnType<typeof harness>>) {
  const call = driver.requests.find((request) => request.init.method === "PATCH" || request.init.method === "POST");
  assert.ok(call, "saving issues a scoped mutation");
  return { ...call, payload: JSON.parse(String(call.init.body)) as Record<string, any> };
}

test("selection control retains native checkbox semantics, disabled state, and accessible naming", () => {
  const html = renderToStaticMarkup(React.createElement(AlertSelectionControl, {
    checked: true, disabled: true, onChange() {}, "aria-label": "Notify Alex", name: "recipient", value: "alex@acme.dev",
  }));
  assert.match(html, /<input[^>]*type="checkbox"/);
  assert.match(html, /aria-label="Notify Alex"/);
  assert.match(html, /checked=""/); assert.match(html, /disabled=""/);
  assert.match(html, /name="recipient"/); assert.match(html, /value="alex@acme.dev"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /peer-focus-visible/); assert.match(html, /motion-reduce:transition-none/);
  assert.doesNotMatch(html, /role="checkbox"|accent-violet/);
});

test("alert fields share the refreshed input boundary and preserve native field constraints", async () => {
  const source = await readFile(new URL("../src/components/observability/alert-form.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ WorkspaceInput, WorkspaceTextarea \} from "\.\.\/ui\/workspace-input"/);
  assert.doesNotMatch(source, /<input\b|<textarea\b|inputClassName|focus-visible:outline-accent/);

  const driver = await harness("alert-form", formProps({ initialAlert: alert() }));
  driver.render(); await driver.flush();
  const name = driver.input("Name");
  assert.equal(name.props.maxLength, 120);
  assert.equal(name.props.autoFocus, true);
  assert.equal(name.props.className, "mt-2", "only field spacing stays local");
  const description = driver.input("Description");
  assert.equal(description.type, "textarea");
  assert.equal(description.props.rows, 2);
  assert.equal(description.props.maxLength, 1000);
  driver.changeInput("Description", "Updated response context.");
  assert.equal(driver.input("Description").props.value, "Updated response context.");

  await driver.submit();
  const threshold = driver.input("Threshold (%)");
  assert.equal(threshold.props.type, "number");
  assert.equal(threshold.props.step, "any");
  for (const label of ["Failures to fire", "Recoveries to resolve"]) {
    const field = driver.input(label);
    assert.equal(field.props.type, "number");
    assert.equal(field.props.min, "1");
    assert.equal(field.props.max, "10");
  }
  assert.equal(driver.input("Minimum samples").props.min, "1");
  driver.unmount();
});

test("refreshed Observability search fields explicitly opt into the shared workspace appearance", async () => {
  for (const filename of [
    "alert-email-recipients",
    "alerts-list-content",
    "services-content",
    "http-requests-content",
    "metrics-content",
    "logs-content",
    "traces-content",
  ]) {
    const source = await readFile(new URL(`../src/components/observability/${filename}.tsx`, import.meta.url), "utf8");
    const fields = [...source.matchAll(/<SearchField\b[\s\S]*?\/>/g)];
    assert.ok(fields.length, `${filename} contains a search field`);
    assert.ok(fields.every(([field]) => /appearance="workspace"/.test(field)), `${filename} uses the redesigned appearance rather than changing stock Arc inputs globally`);
  }
});

test("creation validates each step before issuing any mutation and preserves entered values", async () => {
  const driver = await harness("alert-form", formProps());
  driver.render(); await driver.flush();
  await driver.submit();
  assert.match(driver.text(), /Give this alert a name/);
  assert.equal(driver.requests.filter((request) => request.init.method).length, 0);
  driver.changeInput("Name", "Checkout alerts");
  await driver.submit();
  driver.changeInput("Threshold (%)", "101");
  await driver.submit();
  assert.match(driver.text(), /between 0% and 100%/);
  assert.equal(driver.input("Threshold (%)").props.value, "101");
  assert.equal(driver.requests.filter((request) => request.init.method).length, 0);
  driver.changeInput("Threshold (%)", "5");
  await driver.submit();
  assert.match(driver.text(), /Checkout alerts/);
  driver.unmount();
});

test("condition edits preserve all six signals and do not overwrite names, recipients, or provider credentials", async () => {
  for (const signal of alertData.signalOptions.map((option) => option.value)) {
    const original = alert(signal);
    const driver = await harness("alert-form", formProps({ initialAlert: original, mode: "condition" }));
    driver.render(); await driver.flush();
    assert.match(driver.text(), /reset|evaluation window/i);
    const { pending } = await driver.submit();
    const call = patchCall(driver);
    assert.equal(call.init.method, "PATCH");
    assert.equal(call.url, "/api/acme/observability/alerts/alert-one");
    assert.equal(call.payload.signal, signal);
    assert.equal(call.payload.service, "payments-worker");
    assert.equal(call.payload.environment, "production");
    for (const field of ["name", "description", "notificationEmails", "notificationEmail", "enabled", "notificationSlackWebhook", "notificationDiscordWebhook"]) {
      assert.equal(field in call.payload, false, `${field} stays untouched in condition mode`);
    }
    if (signal === "metric_value") {
      assert.equal(call.payload.metricKey, "a".repeat(32));
      assert.equal(call.payload.metricName, "queue.depth");
      assert.equal(call.payload.metricType, "gauge"); assert.equal(call.payload.metricAggregation, "max");
      assert.equal(call.payload.isMonotonic, false);
    }
    if (signal === "log_count") { assert.equal(call.payload.logLevel, "error"); assert.equal(call.payload.logQuery, "Payment refused"); }
    call.respond({ ok: true, json: async () => ({ alert: original }) });
    await pending; await driver.flush(); driver.unmount();
  }
});

test("background refresh does not replace unsaved form text; changing org or incident identity remounts it", async () => {
  const original = alert();
  const driver = await harness("alert-form", formProps({ initialAlert: original }));
  driver.render(); await driver.flush(); driver.changeInput("Name", "Unsaved responder context");
  driver.update({ initialAlert: { ...original, name: "Fresh server name", currentValue: 3 } });
  assert.equal(driver.input("Name").props.value, "Unsaved responder context");
  driver.update({ initialAlert: { ...original, id: "second-alert", name: "Second rule" } });
  assert.equal(driver.input("Name").props.value, "Second rule");
  driver.changeInput("Name", "Other unsaved text");
  driver.update({ orgSlug: "other-team", initialAlert: { ...original, id: "second-alert", name: "Other org rule" } });
  assert.equal(driver.input("Name").props.value, "Other org rule");
  driver.unmount();
});

test("no-telemetry and numeric guardrails reject invalid windows, intervals, thresholds, and streak counts", async () => {
  const driver = await harness("alert-form", formProps({ initialAlert: alert(), mode: "condition" }));
  driver.render(); await driver.flush();
  driver.changeSelect("Signal", "no_telemetry");
  driver.changeSelect("Evaluation window", "1"); await driver.submit();
  assert.match(driver.text(), /at least 5 minutes/);
  driver.changeSelect("Evaluation window", "5");
  driver.changeInput("Failures to fire", "1.5"); await driver.submit();
  assert.match(driver.text(), /between 1 and 10/);
  driver.changeInput("Failures to fire", "2");
  driver.changeInput("Minimum samples", "1000001"); await driver.submit();
  assert.match(driver.text(), /1,000,000/);
  driver.changeInput("Minimum samples", "20");
  driver.changeSelect("Evaluation window", "not-a-window"); await driver.submit();
  assert.match(driver.text(), /window/i);
  driver.changeSelect("Evaluation window", "5");
  driver.changeSelect("Evaluation interval", "123"); await driver.submit();
  assert.match(driver.text(), /interval/i);
  assert.equal(driver.requests.filter((request) => request.init.method).length, 0);
  driver.unmount();
});

test("creation retains server field errors and values while offering a retry and passes chosen OAuth setup providers", async () => {
  const saved: unknown[][] = [];
  const original = alert();
  const driver = await harness("alert-form", formProps({ initialAlert: original, integrationAvailability: { slack: true, discord: false }, onSaved: (...args: unknown[]) => saved.push(args) }));
  driver.render(); await driver.flush();
  await driver.submit(); await driver.submit();
  const choices = driver.named("AlertSelectionControl");
  assert.equal(choices.length, 2);
  assert.equal(choices[1].props.disabled, true, "unconfigured OAuth provider cannot be selected");
  choices[0].props.onChange(); driver.render();
  let { pending } = await driver.submit();
  let call = patchCall(driver);
  assert.deepEqual(call.payload.notificationEmails, ["owner@acme.dev"]);
  assert.equal(validateAlertCreateInput(call.payload).success, true);
  call.respond({ ok: false, json: async () => ({ error: "Name is not available", field: "name" }) });
  await pending; await driver.flush();
  assert.match(driver.text(), /Name is not available/);
  assert.equal(driver.input("Name").props.value, original.name);
  assert.equal(saved.length, 0);
  await driver.submit(); await driver.submit();
  ({ pending } = await driver.submit());
  call = { ...driver.requests.filter((request) => request.init.method).at(-1)!, payload: {} };
  call.respond({ ok: true, json: async () => ({ alert: original }) });
  await pending; await driver.flush();
  assert.equal(saved.length, 1); assert.equal(saved[0][0], original);
  assert.deepEqual(Array.from(saved[0][1] as string[]), ["slack"]);
  driver.unmount();
});

test("non-JSON save errors use safe feedback and keep the form open with entered values", async () => {
  let saved = 0;
  const driver = await harness("alert-form", formProps({ initialAlert: alert(), mode: "condition", onSaved: () => { saved++; } }));
  driver.render(); await driver.flush(); driver.changeInput("Threshold (%)", "8");
  const { pending } = await driver.submit();
  patchCall(driver).respond({ ok: false, json: async () => { throw new SyntaxError("Unexpected token '<', <!DOCTYPE"); } });
  await pending; await driver.flush();
  assert.match(driver.text(), /Could not save/); assert.doesNotMatch(driver.text(), /DOCTYPE|Unexpected token/);
  assert.equal(driver.input("Threshold (%)").props.value, "8"); assert.equal(saved, 0);
  driver.unmount();
});

test("new rules use an encoded organization POST with safe defaults and selected team emails", async () => {
  const saved: unknown[][] = [];
  const driver = await harness("alert-form", formProps({ orgSlug: "team /β", onSaved: (...args: unknown[]) => saved.push(args) }));
  driver.render(); await driver.flush();
  driver.changeInput("Name", "  Queue health  ");
  driver.changeInput("Description", "  Watch checkout.  ");
  await driver.submit(); await driver.submit();
  const picker = driver.named("AlertEmailRecipients")[0];
  assert.ok(picker); picker.props.onChange(["owner@acme.dev", "responder@acme.dev"]); driver.render();
  const { pending } = await driver.submit();
  const call = patchCall(driver);
  assert.equal(call.init.method, "POST");
  assert.equal(call.url, "/api/team%20%2F%CE%B2/observability/alerts");
  assert.equal(call.payload.name, "Queue health"); assert.equal(call.payload.description, "Watch checkout.");
  assert.equal(call.payload.signal, "request_error_rate"); assert.equal(call.payload.threshold, 5);
  assert.equal(call.payload.minimumSamples, 20); assert.equal(call.payload.enabled, true);
  assert.deepEqual(call.payload.notificationEmails, ["owner@acme.dev", "responder@acme.dev"]);
  assert.equal(validateAlertCreateInput(call.payload).success, true);
  call.respond({ ok: true, json: async () => ({ alert: alert() }) });
  await pending; await driver.flush(); assert.equal(saved.length, 1);
  driver.unmount();
});

test("pending saves disable edits and dismissal and reject duplicate submissions without hiding the action error", async () => {
  let closed = 0;
  const driver = await harness("alert-form", formProps({ initialAlert: alert(), mode: "condition", onClose: () => { closed++; } }));
  driver.render(); await driver.flush();
  const { pending } = await driver.submit();
  const content = driver.named("DialogContent")[0];
  assert.equal(content.props.closeDisabled, true);
  assert.ok(driver.render().some((element) => element.type === "fieldset" && element.props.disabled));
  driver.named("Dialog")[0].props.onOpenChange(false); assert.equal(closed, 0);
  let prevented = 0;
  const event = { preventDefault() { prevented++; } };
  content.props.onEscapeKeyDown(event); content.props.onInteractOutside(event);
  assert.equal(prevented, 2);
  await driver.submit();
  assert.equal(driver.requests.filter((request) => request.init.method).length, 1);
  patchCall(driver).respond({ ok: false, json: async () => ({ error: "Only organization owners and admins can manage alerts" }) });
  await pending; await driver.flush();
  assert.equal(driver.named("DialogContent")[0].props.closeDisabled, false);
  assert.match(driver.text(), /Only organization owners and admins/);
  assert.equal(closed, 0, "failed saves leave the editor open");
  driver.named("Dialog")[0].props.onOpenChange(false); assert.equal(closed, 1);
  driver.unmount();
});

test("partially unavailable catalogs keep configured selections and provide a working retry", async () => {
  const driver = await harness("alert-form", formProps({ initialAlert: alert("metric_value"), mode: "condition" }), false);
  driver.render();
  driver.requests.forEach((request) => request.respond({ ok: false })); await driver.flush();
  assert.match(driver.text(), /Some telemetry choices could not be loaded/);
  assert.equal(driver.select("Service").props.value, "payments-worker");
  assert.equal(driver.select("Environment").props.value, "production");
  assert.equal(driver.select("Gauge metric").props.value, "a".repeat(32));
  const retry = driver.named("Button").find((element) => text(element.props.children) === "Retry");
  assert.ok(retry); retry.props.onClick(); driver.render();
  assert.equal(driver.requests.length, 6);
  assert.ok(driver.requests.slice(0, 3).every((request) => request.init.signal?.aborted));
  driver.requests.slice(3).forEach((request) => request.respond({ ok: true, json: async () => ({ services: [], metrics: [] }) }));
  await driver.flush(); assert.doesNotMatch(driver.text(), /Some telemetry choices could not be loaded/);
  assert.equal(driver.select("Gauge metric").props.value, "a".repeat(32));
  driver.unmount();
});

test("closing while catalog JSON is pending aborts requests and prevents stale data appearing on reopen", async () => {
  const driver = await harness("alert-form", formProps({ services: [] }), false);
  driver.render();
  assert.equal(driver.requests.length, 3);
  const bodies = driver.requests.map(() => deferred<unknown>());
  driver.requests.forEach((request, index) => request.respond({ ok: true, json: () => bodies[index].promise }));
  await driver.flush();
  const oldRequests = driver.requests.slice();
  driver.update({ isOpen: false });
  assert.ok(oldRequests.every((request) => request.init.signal?.aborted));
  driver.update({ isOpen: true });
  bodies[0].resolve({ services: [{ name: "stale-service", environment: "stale-env" }] });
  bodies[1].resolve({ services: ["stale-logs"] });
  bodies[2].resolve({ metrics: [{ key: "b".repeat(32), name: "stale-gauge", type: "gauge", services: ["stale-metric"] }] });
  await driver.flush();
  const options = driver.select("Service").props.options;
  assert.ok(!options.some((option: { value: string }) => option.value.startsWith("stale")));
  driver.unmount();
});

test("recipient picker has matched skeletons, a retry action, searchable members, and removable unavailable selections", async () => {
  const selected = ["OWNER@acme.dev", "removed@acme.dev"];
  const changes: string[][] = [];
  const driver = await harness("alert-email-recipients", { orgSlug: "team /β", value: selected, onChange: (next: string[]) => changes.push(next) }, false);
  const initial = driver.render();
  assert.ok(initial.some((element) => element.props["aria-label"] === "Loading email recipients" && element.props["aria-busy"]));
  assert.equal(driver.requests[0].url, "/api/team%20%2F%CE%B2/observability/alerts/members");
  driver.requests[0].respond({ ok: false }); await driver.flush();
  assert.match(driver.text(), /Could not load team members/);
  const retry = driver.named("Button").find((element) => text(element.props.children) === "Try again");
  assert.ok(retry); retry.props.onClick(); driver.render();
  const members = [
    { id: "owner", name: "Alex Owner", email: "owner@acme.dev", role: "owner" },
    { id: "member", name: "Jamie Member", email: "jamie@acme.dev", role: "member" },
  ];
  driver.requests[1].respond({ ok: true, json: async () => ({ members, currentUserId: "owner" }) }); await driver.flush();
  assert.match(driver.text(), /Alex Owner\(you\)|Alex Owner.*\(you\)/);
  assert.match(driver.text(), /removed@acme.dev is no longer a team member/);
  let controls = driver.named("AlertSelectionControl");
  assert.equal(controls.length, 2); assert.equal(controls[0].props.checked, true);
  controls[0].props.onChange(); assert.deepEqual(Array.from(changes.at(-1)!), ["removed@acme.dev"]);
  const search = driver.named("SearchField")[0]; search.props.onValueChange(" JAMIE "); driver.render();
  assert.equal(driver.named("AlertSelectionControl").length, 1); assert.match(driver.text(), /Jamie Member/);
  const remove = driver.named("Button").find((element) => text(element.props.children) === "Remove");
  assert.ok(remove); remove.props.onClick(); assert.deepEqual(Array.from(changes.at(-1)!), ["OWNER@acme.dev"]);
  driver.update({ disabled: true });
  controls = driver.named("AlertSelectionControl"); assert.ok(controls.every((element) => element.props.disabled));
  assert.equal(driver.named("SearchField")[0].props.disabled, true);
  assert.equal(driver.named("Button").find((element) => text(element.props.children) === "Remove")?.props.disabled, true);
  driver.unmount();
});

test("recipient picker discards aborted late JSON and remounts searches when organizations change", async () => {
  const driver = await harness("alert-email-recipients", { orgSlug: "acme", value: [], onChange() {} }, false);
  driver.render();
  const body = deferred<unknown>();
  driver.requests[0].respond({ ok: true, json: () => body.promise }); await driver.flush();
  driver.named("SearchField")[0].props.onValueChange("old search"); driver.render();
  driver.update({ orgSlug: "another-team" });
  assert.equal(driver.requests[0].init.signal?.aborted, true);
  assert.equal(driver.named("SearchField")[0].props.value, "");
  body.resolve({ members: [{ id: "old-owner", name: "Previous team owner", email: "old@acme.dev", role: "owner" }], currentUserId: "old-owner" });
  await driver.flush();
  assert.doesNotMatch(driver.text(), /Previous team owner/);
  assert.equal(driver.named("AlertSelectionControl").length, 0);
  driver.unmount();
});
