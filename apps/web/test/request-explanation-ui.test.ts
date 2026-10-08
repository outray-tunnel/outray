import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  RequestExplanation,
  RequestExplanationResult,
} from "../src/components/observability/request-explanation";
import {
  buildRequestExplanationPreview,
  requestExplanationDemoScenarios,
} from "../src/components/observability/request-explanation-data";

Object.assign(globalThis, { React });

const request = requestExplanationDemoScenarios[0].request;
const preview = buildRequestExplanationPreview(request);
type ExplanationProps = React.ComponentProps<typeof RequestExplanation>;
type ResultProps = React.ComponentProps<typeof RequestExplanationResult>;
type Element = React.ReactElement<any>;

function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement(node)) return text((node as Element).props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

/** Check local hook transitions without a DOM, provider, or real timer dependency. */
async function loadExplanation({ reducedMotion = false } = {}) {
  const source = await readFile(
    new URL("../src/components/observability/request-explanation.tsx", import.meta.url),
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
  const values: any[] = [];
  const refs: Array<{ current: any }> = [];
  const effects: Array<{
    dependencies: unknown[];
    cleanup?: (() => void) | void;
  }> = [];
  const pendingEffects: Array<{
    slot: number;
    callback: () => (() => void) | void;
    dependencies: unknown[];
  }> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let timerId = 0;
  let fetchCount = 0;
  const stubs = Object.fromEntries(
    ["Button", "CopyButton", "AnimatePresence"].map((name) => [
      name,
      (props: any) => React.createElement("div", null, props.children),
    ]),
  );
  const module = {
    exports: {} as typeof import("../src/components/observability/request-explanation"),
  };
  runInNewContext(compiled, {
    React,
    module,
    exports: module.exports,
    fetch: () => {
      fetchCount++;
      throw new Error("A local request explanation must not perform network work");
    },
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
    require: (specifier: string) => {
      if (specifier === "react") return {
        useId: () => "request-explanation-test",
        useState: (initial: any) => {
          const slot = stateIndex++;
          if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
          return [values[slot], (next: any) => {
            values[slot] = typeof next === "function" ? next(values[slot]) : next;
          }];
        },
        useRef: (initial: any) => {
          const slot = refIndex++;
          return refs[slot] ??= { current: initial };
        },
        useEffect: (callback: () => (() => void) | void, dependencies: unknown[]) => {
          const slot = effectIndex++;
          if (!effects[slot] || dependencies.length !== effects[slot].dependencies.length ||
            dependencies.some((value, index) => !Object.is(value, effects[slot].dependencies[index]))) {
            pendingEffects.push({ slot, callback, dependencies: Array.from(dependencies) });
          }
        },
      };
      if (specifier === "motion/react") return {
        ...stubs,
        motion: { div: "div" },
        useReducedMotion: () => reducedMotion,
      };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "../arc/button/button" || specifier === "../arc/copy-button/copy-button") return stubs;
      if (specifier === "./request-explanation-data") return { buildRequestExplanationPreview };
      throw new Error(`Unexpected explanation dependency: ${specifier}`);
    },
  });
  const stubComponents = new Set(Object.values(stubs));
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement(node)) return [];
    const element = node as Element;
    const rendered = typeof element.type === "function" && !stubComponents.has(element.type as any)
      ? element.type(element.props)
      : element.props.children;
    return [element, ...elements(rendered)];
  }
  return {
    stubs,
    timers,
    get fetchCount() { return fetchCount; },
    render(overrides: Partial<ExplanationProps> = {}) {
      stateIndex = 0;
      refIndex = 0;
      effectIndex = 0;
      return elements(module.exports.RequestExplanation({ request, ...overrides }));
    },
    renderResult(overrides: Partial<ResultProps> = {}) {
      return elements(module.exports.RequestExplanationResult({ preview, ...overrides }));
    },
    commit() {
      for (const effect of pendingEffects.splice(0)) {
        effects[effect.slot]?.cleanup?.();
        effects[effect.slot] = { dependencies: effect.dependencies, cleanup: effect.callback() };
      }
    },
    cleanup() {
      for (const effect of effects) effect.cleanup?.();
    },
    fire(id: number) {
      const timer = timers.get(id);
      if (!timer) return false;
      timers.delete(id);
      timer.callback();
      return true;
    },
    button(tree: Element[], label: string) {
      const button = tree.find((element) => element.type === stubs.Button && text(element.props.children) === label);
      assert.ok(button, `Missing ${label} button`);
      return button;
    },
  };
}

test("the idle explanation is explicitly a local prototype and server-renders without network work", (t) => {
  let fetchCount = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCount++;
    throw new Error("Unexpected explanation fetch");
  });
  const html = renderToStaticMarkup(React.createElement(RequestExplanation, { request }));
  assert.match(html, /aria-label="Request explanation preview"/);
  assert.match(html, /Explain this request|Explain request/);
  assert.match(html, /Prototype|Local preview/);
  assert.match(html, /No AI provider connected/);
  assert.match(html, /aria-expanded="false"/);
  const controls = html.match(/aria-controls="([^"]+)"/)?.[1];
  assert.ok(controls);
  assert.ok(html.includes(`id="${controls}" aria-busy="false"`));
  assert.doesNotMatch(html, /Preparing local preview|Copy summary|Scripted follow-up/);
  assert.equal(fetchCount, 0);
});

test("auto-start server-render announces preparation without claiming an AI investigation", () => {
  const html = renderToStaticMarkup(React.createElement(RequestExplanation, { request, autoStart: true }));
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="Preparing local preview"/);
  for (const step of ["Read request metadata", "Check available context", "Prepare explanation"]) assert.ok(html.includes(step));
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /scripted local preview, not running an AI investigation/);
  assert.match(html, /Cancel preview|motion-reduce:animate-none/);
  assert.doesNotMatch(html, /Copy summary|Scripted follow-up/);
});

test("results separate observed facts, unconfirmed hypotheses, next checks and limitations", () => {
  const html = renderToStaticMarkup(React.createElement(RequestExplanationResult, {
    preview,
    onOpenEvidence: () => {},
    followUp: preview.followUps[0].id,
    onFollowUp: () => {},
  }));
  for (const label of ["What we can see", "Unconfirmed possibility", "Observed evidence", "Suggested next checks", "Follow-up questions", "Scripted follow-up", "Scripted preview, not a diagnosis"]) assert.ok(html.includes(label), label);
  assert.match(html, /What this preview can’t tell you/);
  assert.match(html, /deterministic frontend preview, not an AI investigation/);
  assert.match(html, /Request details are not loaded/);
  assert.match(html, /aria-label="Copy summary"/);
  assert.match(html, /aria-pressed="true"/);
  const healthy = buildRequestExplanationPreview(requestExplanationDemoScenarios[2].request);
  const healthyHtml = renderToStaticMarkup(React.createElement(RequestExplanationResult, { preview: healthy }));
  assert.doesNotMatch(healthyHtml, /Unconfirmed possibility|aria-label="Inspect .* evidence"|Follow-up questions/);
  assert.match(healthyHtml, /Request metadata/);
});

test("preview text remains escaped rather than executable markup", () => {
  const untrusted = '<script>alert("payload")</script>';
  const html = renderToStaticMarkup(React.createElement(RequestExplanationResult, {
    preview: {
      ...preview,
      title: untrusted,
      evidence: [{ ...preview.evidence[0], value: untrusted }],
      followUps: [{ id: "unsafe", label: untrusted, answer: untrusted }],
    },
    followUp: "unsafe",
    onFollowUp: () => {},
  }));
  assert.doesNotMatch(html, /<script>|dangerouslySetInnerHTML/);
  assert.match(html, /&lt;script&gt;/);
});

test("every evidence control opens its response or context target only", async () => {
  const view = await loadExplanation();
  const targets: string[] = [];
  const tree = view.renderResult({ onOpenEvidence: (target) => targets.push(target) });
  const buttons = tree.filter((element) => element.type === "button" && element.props["aria-label"]?.startsWith("Inspect "));
  assert.equal(buttons.length, preview.evidence.length);
  for (const [index, button] of buttons.entries()) {
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-label"], `Inspect ${preview.evidence[index].label} evidence`);
    button.props.onClick();
  }
  assert.deepEqual(targets, preview.evidence.map((item) => item.target));
  assert.ok(targets.includes("response") && targets.includes("context"));
  assert.equal(view.renderResult().some((element) => element.type === "button"), false);
  assert.equal(view.fetchCount, 0);
});

test("copy summary keeps the prototype disclaimer, uncertainty and unavailable evidence", async () => {
  const view = await loadExplanation();
  const copy = view.renderResult().find((element) => element.type === view.stubs.CopyButton);
  assert.ok(copy);
  assert.equal(copy.props.label, "Copy summary");
  assert.match(copy.props.value, /^OutRay request explanation — frontend prototype \(not an AI diagnosis\)/);
  for (const label of ["Observed evidence:", "Unconfirmed possibility:", "Suggested next checks:", "Limitations:", "Request details are not loaded", "not an AI investigation or a root-cause diagnosis"]) assert.ok(copy.props.value.includes(label), label);
  assert.ok(copy.props.value.includes(preview.title));
  assert.equal(view.fetchCount, 0);
});

test("illustrative sample findings render only with an explicit preview override and retain disclaimers", async () => {
  const samplePreview = requestExplanationDemoScenarios[0].preview;
  assert.ok(samplePreview);
  assert.notEqual(samplePreview.title, preview.title, "real request metadata must not invent the sample trace findings");
  const view = await loadExplanation({ reducedMotion: true });
  view.render({ autoStart: true, preview: samplePreview });
  view.commit();
  for (const id of [...view.timers.keys()]) view.fire(id);
  const tree = view.render({ autoStart: true, preview: samplePreview });
  view.commit();
  const title = tree.find((element) => element.type === "h3");
  assert.equal(text(title?.props.children), samplePreview.title);
  const copy = tree.find((element) => element.type === view.stubs.CopyButton);
  assert.ok(copy);
  assert.ok(copy.props.value.includes(samplePreview.summary));
  assert.match(copy.props.value, /^OutRay request explanation — frontend prototype \(not an AI diagnosis\)/);
  assert.ok(samplePreview.limitations.every((limitation) => copy.props.value.includes(limitation)));
  assert.ok(tree.some((element) => text(element.props.children).includes("Scripted preview, not a diagnosis")));
  assert.equal(view.fetchCount, 0);
  view.cleanup();
});

test("local preparation advances to results, follow-up chips toggle and run-again resets answers", async () => {
  const view = await loadExplanation();
  let tree = view.render();
  view.commit();
  assert.equal(view.timers.size, 0);
  view.button(tree, "Explain request").props.onClick();
  tree = view.render();
  view.commit();
  assert.equal(view.button(tree, "Preparing preview").props.loading, true);
  const timers = [...view.timers.entries()];
  assert.equal(timers.length, 3);
  assert.ok(timers.every(([, timer]) => timer.delay > 0));
  assert.ok(timers[0][1].delay < timers[1][1].delay && timers[1][1].delay < timers[2][1].delay);
  for (const [index, [id]] of timers.entries()) {
    assert.equal(view.fire(id), true);
    tree = view.render();
    view.commit();
    if (index < 2) {
      const status = tree.find((element) => element.props.role === "status");
      assert.ok(status);
      assert.ok(text(status.props.children).includes(index === 0 ? "Check available context" : "Prepare explanation"));
    }
  }
  assert.equal(view.timers.size, 0);
  assert.equal(view.button(tree, "Run again").props.loading, false);
  assert.ok(tree.some((element) => text(element.props.children).includes("Local explanation preview ready")));
  const followUp = preview.followUps[0];
  const findChip = () => tree.find((element) => element.type === "button" && text(element.props.children) === followUp.label)!;
  assert.equal(findChip().props["aria-pressed"], false);
  findChip().props.onClick();
  tree = view.render();
  view.commit();
  assert.equal(findChip().props["aria-pressed"], true);
  assert.ok(tree.some((element) => element.props.role === "status" &&
    text(element.props.children).includes("Scripted follow-up") && text(element.props.children).includes(followUp.answer)));
  assert.equal(view.timers.size, 0, "follow-up answers are scripted, not new preparation runs");
  findChip().props.onClick();
  tree = view.render();
  view.commit();
  assert.equal(findChip().props["aria-pressed"], false);
  assert.equal(tree.some((element) => element.props.role === "status" && text(element.props.children).includes("Scripted follow-up")), false);
  findChip().props.onClick();
  tree = view.render();
  view.commit();
  view.button(tree, "Run again").props.onClick();
  tree = view.render();
  view.commit();
  assert.equal(tree.some((element) => element.props.role === "status" && text(element.props.children).includes("Scripted follow-up")), false);
  assert.equal(view.timers.size, 3);
  assert.equal(view.fetchCount, 0);
  view.cleanup();
  assert.equal(view.timers.size, 0);
});

test("cancel restores the trigger focus and clears timers; unmount also clears preparation", async () => {
  const view = await loadExplanation();
  let tree = view.render();
  view.commit();
  const trigger = view.button(tree, "Explain request");
  let focusCount = 0;
  trigger.props.ref.current = { focus: () => focusCount++ };
  trigger.props.onClick();
  tree = view.render();
  view.commit();
  const pending = [...view.timers.keys()];
  assert.equal(pending.length, 3);
  view.button(tree, "Cancel preview").props.onClick();
  tree = view.render();
  view.commit();
  assert.equal(focusCount, 1);
  assert.equal(view.button(tree, "Explain request").props["aria-expanded"], false);
  assert.equal(view.timers.size, 0);
  assert.ok(pending.every((id) => view.fire(id) === false), "cancelled callbacks cannot complete the old preview");
  view.button(tree, "Explain request").props.onClick();
  view.render();
  view.commit();
  assert.equal(view.timers.size, 3);
  view.cleanup();
  assert.equal(view.timers.size, 0);
  assert.equal(view.fetchCount, 0);
});

test("reduced motion uses zero-delay preparation and no transition duration", async () => {
  const view = await loadExplanation({ reducedMotion: true });
  let tree = view.render({ autoStart: true });
  view.commit();
  assert.equal(view.timers.size, 3);
  assert.ok([...view.timers.values()].every((timer) => timer.delay === 0));
  assert.ok(tree.some((element) => element.props.transition?.duration === 0));
  for (const id of [...view.timers.keys()]) view.fire(id);
  tree = view.render({ autoStart: true });
  view.commit();
  assert.ok(view.button(tree, "Run again"));
  assert.equal(view.timers.size, 0);
  assert.ok(tree.some((element) => element.props.transition?.duration === 0));
  assert.equal(view.fetchCount, 0);
  view.cleanup();
});
