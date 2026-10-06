import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { Button } from "../src/components/arc/button/button";
import { Dialog, DialogContent } from "../src/components/arc/dialog/dialog";
import { Select } from "../src/components/ui/select";
import { WorkspaceInput, WorkspaceTextarea } from "../src/components/ui/workspace-input";
import { formatBody, JsonViewer } from "../src/components/requests/json-viewer";
import { getHttpMethodColor } from "../src/components/requests/utils";
import { requestInspectorUrl } from "../src/components/requests/request-inspector-data";
import type { RequestCapture, TunnelEvent } from "../src/components/requests/types";

Object.assign(globalThis, { React });
const requireModule = createRequire(import.meta.url);
const request: TunnelEvent = {
  request_id: "request-one", timestamp: 1_800_000_000_000, tunnel_id: "tunnel-a", organization_id: "org-a",
  host: "preview.example.com", method: "POST", path: "/checkout?test=true", status_code: 201,
  request_duration_ms: 120, bytes_in: 60, bytes_out: 100, client_ip: "127.0.0.1", user_agent: "Test",
};
const capture: RequestCapture = {
  id: "capture-one", timestamp: "2026-10-05T12:00:00Z", tunnelId: "tunnel-a",
  request: { headers: { Host: "preview.example.com", "Content-Length": "60", "Transfer-Encoding": "chunked", Connection: "keep-alive", "Content-Type": "application/json", "X-Test": ["one", "two"] }, body: '{"test":true}', bodySize: 60 },
  response: { headers: { "content-type": "application/json" }, body: '{"ok":true}', bodySize: 100 },
};

type ElementProps = { children?: React.ReactNode; [key: string]: any };
function elements(node: React.ReactNode): React.ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function labeled(node: React.ReactNode, label: string) {
  const element = elements(node).find((item) => item.props["aria-label"] === label);
  assert.ok(element, `the ${label} control exists`);
  return element;
}
function action(node: React.ReactNode, label: string) {
  const element = elements(node).find((item) => (item.type === "button" || item.type === Button) && elements(item).some((descendant) => React.Children.toArray(descendant.props.children).includes(label)));
  assert.ok(element, `the ${label} action exists`);
  return element;
}
function methodSelect(node: React.ReactNode) {
  const element = elements(node).find((item) => typeof item.type === "function" && item.type.name === "MethodDropdown");
  assert.ok(element);
  return element;
}

/** Exercise real modal callbacks, state and effects without a server or browser. */
async function controller({ reducedMotion = false, response = async () => ({ ok: true, json: async () => ({ status: 201, statusText: "Created", headers: { "content-type": "application/json" }, body: '{"ok":true}', duration: 80 }) }) }: {
  reducedMotion?: boolean;
  response?: () => Promise<{ ok: boolean; json: () => Promise<any> }>;
} = {}) {
  const source = await readFile(new URL("../src/components/requests/replay-modal.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const state: any[] = [];
  const refs: { current: any }[] = [];
  const previousEffects: (readonly unknown[])[] = [];
  let effects: { index: number; deps: readonly unknown[]; run: () => void }[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  let changed = false;
  let closed = 0;
  const calls: { url: string; options: RequestInit }[] = [];
  const timers: (() => void)[] = [];
  class FakeElement {
    constructor(public menuOpen = false) {}
    closest() { return this.menuOpen ? this : null; }
  }
  class FakeHTMLElement extends FakeElement {
    isConnected = true;
    focused = 0;
    focus() { this.focused++; }
  }
  const trigger = new FakeHTMLElement();
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports, Error, Element: FakeElement, HTMLElement: FakeHTMLElement,
    document: { activeElement: trigger },
    window: { setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; } },
    fetch: async (url: string, options: RequestInit) => { calls.push({ url, options }); return response(); },
    require: (specifier: string) => {
      if (specifier === "react") return {
        ...React,
        useState(initial: any) {
          const index = stateIndex++;
          if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
          return [state[index], (next: any) => { state[index] = typeof next === "function" ? next(state[index]) : next; changed = true; }];
        },
        useRef(initial: any) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
        useEffect(run: () => void, deps: readonly unknown[]) {
          const index = effectIndex++;
          const previous = previousEffects[index];
          if (!previous || deps.some((value, slot) => !Object.is(value, previous[slot]))) effects.push({ index, deps, run });
        },
      };
      if (specifier === "motion/react") return { useReducedMotion: () => reducedMotion };
      if (specifier === "../arc/button/button") return { Button };
      if (specifier === "../arc/dialog/dialog") return { Dialog, DialogContent };
      if (specifier === "../ui/select") return { Select };
      if (specifier === "../ui/workspace-input") return { WorkspaceInput, WorkspaceTextarea };
      if (specifier === "./json-viewer") return { formatBody, JsonViewer };
      if (specifier === "./utils") return { getHttpMethodColor };
      if (specifier === "./request-inspector-data") return { requestInspectorUrl };
      if (specifier.endsWith(".module.css")) return { default: { content: "replay-content", overlay: "replay-overlay" }, __esModule: true };
      if (specifier.endsWith(".css")) return {};
      if (specifier.startsWith("@hugeicons")) return requireModule(specifier);
      throw new Error(`Unexpected replay import: ${specifier}`);
    },
  });
  const props = { isOpen: true, onClose: () => { closed++; }, request, capture, orgSlug: "team /?" };
  return {
    calls, timers, trigger, FakeElement, refs, closed: () => closed,
    render(update: Partial<typeof props> = {}) {
      Object.assign(props, update);
      let dialog!: React.ReactElement<ElementProps>;
      for (let pass = 0; pass < 5; pass++) {
        stateIndex = 0; refIndex = 0; effectIndex = 0; effects = []; changed = false;
        dialog = module.exports.ReplayModal(props);
        for (const effect of effects) { previousEffects[effect.index] = effect.deps; effect.run(); }
        if (!changed) break;
      }
      const content = dialog.props.children as React.ReactElement<ElementProps>;
      return { dialog, content, body: content.props.children };
    },
  };
}

test("replay uses the shared native dialog portal above the request side sheet, with accessible context", async () => {
  const replay = await controller();
  const { dialog, content, body } = replay.render();
  assert.equal(dialog.type, Dialog);
  assert.equal(dialog.props.open, true);
  assert.equal(content.type, DialogContent);
  assert.equal(content.props.title, "Replay request");
  assert.match(content.props.description, /Sending may change data/);
  assert.equal(content.props.overlayClassName, "replay-overlay");
  assert.match(content.props.className, /outray-arc replay-content/);
  const html = renderToStaticMarkup(React.createElement("div", null, body));
  assert.doesNotMatch(html, /fixed inset-0|md:left-1\/2/);
  assert.match(html, /Replay sends a real request/);
  assert.equal(replay.calls.length, 0, "opening never sends a replay request");
  const shared = await readFile(new URL("../src/components/arc/dialog/dialog.tsx", import.meta.url), "utf8");
  assert.match(shared, /DialogPrimitive\.Portal/);
  assert.match(shared, /DialogPrimitive\.Content/);
  assert.match(shared, /useReducedMotion/);
  const css = await readFile(new URL("../src/components/requests/replay-modal.module.css", import.meta.url), "utf8");
  assert.match(css, /\.overlay\.overlay\s*\{[^}]*z-index: 80/);
  assert.match(css, /\.content\.content\s*\{[^}]*z-index: 81/);
  assert.match(css, /100dvh/);
});

test("replay initialization preserves captured values and excludes transport-owned headers", async () => {
  const replay = await controller();
  let rendered = replay.render();
  action(rendered.body, "Edit").props.onClick();
  rendered = replay.render();
  assert.equal(labeled(rendered.body, "Request URL").props.value, "https://preview.example.com/checkout?test=true");
  const names = elements(rendered.body).filter((item) => /^Header \d+ name$/.test(item.props["aria-label"] ?? ""));
  assert.deepEqual(names.map((item) => item.props.value), ["Content-Type", "X-Test"]);
  assert.equal(labeled(rendered.body, "Header 2 value").props.value, "one, two");
  assert.equal(methodSelect(rendered.body).props.value, "POST");
  assert.equal(labeled(rendered.body, "Request URL").type, WorkspaceInput);
  assert.equal(labeled(rendered.body, "Header 1 name").type, WorkspaceInput);
  assert.equal(labeled(rendered.body, "Header 2 value").type, WorkspaceInput);
  action(rendered.body, "Body").props.onClick();
  rendered = replay.render();
  assert.equal(labeled(rendered.body, "Request body").type, WorkspaceTextarea);
});

test("legacy null headers preserve the captured body and replay URLs recognize only real loopback hosts", async () => {
  for (const [host, expected] of [
    ["127.0.0.1:8000", "http://127.0.0.1:8000/checkout?test=true"],
    ["[::1]:8000", "http://[::1]:8000/checkout?test=true"],
    ["localhost:8000", "http://localhost:8000/checkout?test=true"],
    ["localhost.example.com", "https://localhost.example.com/checkout?test=true"],
    ["https://preview.example.com/", "https://preview.example.com/checkout?test=true"],
  ]) {
    const replay = await controller();
    let rendered = replay.render({
      request: { ...request, host },
      capture: { ...capture, request: { ...capture.request, headers: null } },
    });
    action(rendered.body, "Edit").props.onClick();
    rendered = replay.render();
    assert.equal(labeled(rendered.body, "Request URL").props.value, expected);
    assert.equal(elements(rendered.body).filter((item) => /^Header \d+ name$/.test(item.props["aria-label"] ?? "")).length, 0);
    action(rendered.body, "Body").props.onClick();
    rendered = replay.render();
    assert.equal(labeled(rendered.body, "Request body").props.value, capture.request.body);
    await action(rendered.body, "Send request").props.onClick();
    const sent = JSON.parse(replay.calls[0].options.body as string);
    assert.equal(sent.url, expected);
    assert.deepEqual(sent.headers, {});
    assert.equal(sent.requestBody, capture.request.body);
  }
});

test("closing restores the replay trigger, and Escape closes an open method menu before the dialog", async () => {
  const replay = await controller();
  const { dialog, content } = replay.render();
  content.props.onOpenAutoFocus();
  let prevented = 0;
  content.props.onCloseAutoFocus({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(replay.trigger.focused, 1);
  content.props.onEscapeKeyDown({ target: new replay.FakeElement(true), preventDefault() { prevented++; } });
  assert.equal(prevented, 2, "a Select menu can consume Escape without dismissing replay");
  content.props.onEscapeKeyDown({ target: new replay.FakeElement(), preventDefault() { prevented++; } });
  assert.equal(prevented, 2, "Escape remains native when no menu is open");
  dialog.props.onOpenChange(false);
  assert.equal(replay.closed(), 1);
});

test("one explicit send uses edited values and blocks immediate duplicates or dismissal while pending", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const replay = await controller({ response: async () => { await pending; return { ok: true, json: async () => ({ status: 201, statusText: "Created", headers: {}, body: null, duration: 90 }) }; } });
  let rendered = replay.render();
  action(rendered.body, "Edit").props.onClick();
  rendered = replay.render();
  labeled(rendered.body, "Request URL").props.onChange({ target: { value: "https://preview.example.com/test" } });
  labeled(rendered.body, "Header 2 value").props.onChange({ target: { value: "edited" } });
  methodSelect(rendered.body).props.onChange("PATCH");
  rendered = replay.render();
  action(rendered.body, "Body").props.onClick();
  rendered = replay.render();
  labeled(rendered.body, "Request body").props.onChange({ target: { value: '{"edited":true}' } });
  const send = action(replay.render().body, "Send request");
  const attempt = send.props.onClick();
  await send.props.onClick();
  assert.equal(replay.calls.length, 1);
  assert.equal(replay.calls[0].url, "/api/team%20%2F%3F/requests/replay");
  assert.equal(replay.calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(replay.calls[0].options.body as string), {
    url: "https://preview.example.com/test", method: "PATCH", headers: { "Content-Type": "application/json", "X-Test": "edited" }, requestBody: '{"edited":true}',
  });
  rendered = replay.render();
  assert.equal(rendered.content.props.closeDisabled, true);
  assert.equal(rendered.content.props["aria-busy"], true);
  assert.equal(action(rendered.body, "Sending…").props.loading, true);
  assert.equal(labeled(rendered.body, "Request body").props.disabled, true);
  rendered.dialog.props.onOpenChange(false);
  assert.equal(replay.closed(), 0);
  let prevented = 0;
  for (const event of ["onEscapeKeyDown", "onPointerDownOutside"]) rendered.content.props[event]({ target: null, preventDefault() { prevented++; } });
  assert.equal(prevented, 2);
  finish(); await attempt;
  assert.equal(replay.render().content.props.closeDisabled, false);
});

test("GET and HEAD replay never send the captured body and returning from Body stays usable", async () => {
  for (const method of ["GET", "HEAD"]) {
    const replay = await controller();
    let rendered = replay.render();
    action(rendered.body, "Edit").props.onClick();
    action(replay.render().body, "Body").props.onClick();
    rendered = replay.render();
    assert.ok(labeled(rendered.body, "Request body"));
    methodSelect(rendered.body).props.onChange(method);
    rendered = replay.render();
    assert.equal(action(rendered.body, "Body").props.disabled, true);
    assert.ok(elements(rendered.body).some((item) => item.props["aria-label"] === "Header 1 name"));
    await action(rendered.body, "Send request").props.onClick();
    assert.equal(JSON.parse(replay.calls[0].options.body as string).requestBody, undefined);
  }
});

test("replay errors remain inline with the edited request, linked to a retryable send action", async () => {
  const replay = await controller({ response: async () => ({ ok: false, json: async () => ({ error: "Could not send <request>" }) }) });
  let rendered = replay.render();
  action(rendered.body, "Edit").props.onClick();
  labeled(replay.render().body, "Request URL").props.onChange({ target: { value: "https://preview.example.com/edited" } });
  await action(replay.render().body, "Send request").props.onClick();
  rendered = replay.render();
  assert.equal(labeled(rendered.body, "Request URL").props.value, "https://preview.example.com/edited");
  assert.equal(rendered.content.props.closeDisabled, false);
  const send = action(rendered.body, "Send request");
  assert.equal(send.props["aria-describedby"], "replay-request-error");
  const html = renderToStaticMarkup(React.createElement("div", null, rendered.body));
  assert.match(html, /id="replay-request-error" role="alert"/);
  assert.match(html, /Could not send &lt;request&gt;/);
  await send.props.onClick();
  assert.equal(replay.calls.length, 2);
});

test("Cancel editing restores the original values without submitting", async () => {
  const replay = await controller();
  let rendered = replay.render();
  action(rendered.body, "Edit").props.onClick();
  rendered = replay.render();
  labeled(rendered.body, "Request URL").props.onChange({ target: { value: "https://preview.example.com/edited" } });
  action(replay.render().body, "Cancel").props.onClick();
  rendered = replay.render();
  action(rendered.body, "Edit").props.onClick();
  assert.equal(labeled(replay.render().body, "Request URL").props.value, "https://preview.example.com/checkout?test=true");
  assert.equal(replay.calls.length, 0);
});

test("editing header names keeps stable row identity rather than remounting the focused field", async () => {
  const replay = await controller();
  action(replay.render().body, "Edit").props.onClick();
  let rendered = replay.render();
  const rows = () => elements(rendered.body).filter((item) => item.type === "div" && item.props.className?.includes("min-h-11"));
  const originalKeys = rows().map((row) => row.key);
  labeled(rendered.body, "Header 1 name").props.onChange({ target: { value: "X-Renamed" } });
  rendered = replay.render();
  assert.deepEqual(rows().map((row) => row.key), originalKeys);
  labeled(rendered.body, "Remove X-Renamed").props.onClick();
  rendered = replay.render();
  assert.equal(rows()[0].key, originalKeys[1], "removing another header preserves the remaining row");
  action(rendered.body, "Add header").props.onClick();
  rendered = replay.render();
  assert.equal(new Set(rows().map((row) => row.key)).size, 2);
});

test("successful results preserve response inspection and honor reduced motion for result scrolling", async () => {
  for (const reducedMotion of [false, true]) {
    const replay = await controller({ reducedMotion });
    await action(replay.render().body, "Send request").props.onClick();
    const rendered = replay.render();
    const result = elements(rendered.body).find((item) => item.props["aria-live"] === "polite");
    assert.ok(result);
    let scroll: unknown;
    (result.props.ref as { current: unknown }).current = { scrollIntoView(options: unknown) { scroll = options; } };
    replay.timers.forEach((callback) => callback());
    assert.deepEqual(JSON.parse(JSON.stringify(scroll)), { behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    const html = renderToStaticMarkup(React.createElement("div", null, rendered.body));
    assert.match(html, /Original|Replay/);
    assert.match(html, /Response headers/);
    assert.match(html, /Response body/);
    assert.match(html, /80ms/);
  }
});
