import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { motionTokens } from "../src/components/arc/lib/motion-tokens";
import * as secretsDraft from "../src/components/onboarding/secrets-draft";
import { workspaceScopeClassName } from "../src/components/ui/workspace-scope";
import { SecretsClientError, type SecretEnvironment } from "../src/lib/secrets-client";
import { serializeEnvText } from "../src/lib/secrets/validation";

type Element = React.ReactElement<any>;
const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const environment: SecretEnvironment = {
  id: "env-development", slug: "development", name: "Development", revision: 4, secretCount: 2,
  isProduction: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
};
const existingEdit = (overrides: Record<string, unknown> = {}) => ({
  id: "secret-existing", key: "EXISTING_KEY", version: 3, revision: 4,
  originalValue: "original-value", value: "edited-value", ...overrides,
});
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

/** Exercise real event handlers and effect cleanup with persistent hook slots. */
async function loadEditor(options: { props?: Record<string, any>; client?: Record<string, any>; browser?: boolean } = {}) {
  const source = await readFile(new URL("../src/components/secrets/inline-secrets-editor.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const hooks: any[] = [];
  const effects: Array<() => void> = [];
  const portals: Array<{ children: React.ReactNode; target: unknown }> = [];
  const documentBody = {};
  let index = 0, saved = 0, conflicts = 0, unmounted = false, updatesAfterUnmount = 0;
  const Button = (props: any) => {
    const { loading, variant: _variant, size: _size, ...native } = props;
    return React.createElement("button", { ...native, "aria-busy": loading || undefined });
  };
  const MotionDiv = (props: any) => {
    const { initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...native } = props;
    return React.createElement("div", native);
  };
  const client = {
    createSecret: async () => [],
    importDotenv: async () => ({ created: 2, updated: 0, unchanged: 0, skipped: 0, revision: 5, keys: [] }),
    ...options.client,
  };
  const module = { exports: {} as { InlineSecretsEditor: (props: any) => Element } };
  runInNewContext(compiled, {
    React, Error, Promise, module, exports: module.exports,
    ...(options.browser ? { document: { body: documentBody } } : {}),
    require: (specifier: string) => {
      if (specifier === "react") return {
        useId: () => "inline-secrets-test",
        useState: (initial: any) => {
          const slot = index++;
          if (!(slot in hooks)) hooks[slot] = typeof initial === "function" ? initial() : initial;
          return [hooks[slot], (next: any) => {
            if (unmounted) updatesAfterUnmount++;
            assert.equal(unmounted, false, "async work must not update an unmounted editor");
            hooks[slot] = typeof next === "function" ? next(hooks[slot]) : next;
          }];
        },
        useRef: (initial: any) => {
          const slot = index++;
          if (!(slot in hooks)) hooks[slot] = { current: initial };
          return hooks[slot];
        },
        useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
          const slot = index++;
          const previous = hooks[slot];
          if (!previous || !deps || deps.some((value, position) => value !== previous.deps?.[position])) {
            effects.push(() => { previous?.cleanup?.(); hooks[slot] = { deps, cleanup: effect() }; });
          }
        },
      };
      if (specifier === "lucide-react") return Object.fromEntries(["Check", "Plus", "X", "LockKeyhole", "CircleAlert", "AlertCircle", "TriangleAlert", "RotateCcw"].map((name) => [name, () => null]));
      if (specifier === "react-dom") return { createPortal: (children: React.ReactNode, target: unknown) => { portals.push({ children, target }); return children; } };
      if (specifier === "motion/react") return { AnimatePresence: (props: any) => props.children, motion: { div: MotionDiv }, useReducedMotion: () => false };
      if (specifier.endsWith("arc/lib/motion-tokens")) return { motionTokens };
      if (specifier.endsWith("ui/workspace-scope")) return { workspaceScopeClassName };
      if (specifier.endsWith("arc/button/button")) return { Button };
      if (specifier.endsWith("ui/workspace-input")) return { WorkspaceInput: "input" };
      if (specifier.endsWith("onboarding/secrets-draft")) return secretsDraft;
      if (specifier.endsWith("lib/secrets-client")) return { secretsClient: client, SecretsClientError };
      if (specifier.endsWith("lib/secrets/validation")) return { serializeEnvText };
      if (specifier === "./secrets-ui") return { ProductionConfirmation: "production-confirmation" };
      throw new Error(`Unexpected inline editor dependency: ${specifier}`);
    },
  });
  const props = {
    orgSlug: "acme", projectSlug: "app", environment, revision: 4, existingKeys: ["EXISTING_KEY"],
    onSaved: () => { saved++; assert.equal(unmounted, false); },
    onConflict: () => { conflicts++; assert.equal(unmounted, false); },
    ...options.props,
  };
  const render = (overrides: Record<string, any> = {}) => {
    index = 0;
    const tree = module.exports.InlineSecretsEditor({ ...props, ...overrides });
    for (const effect of effects.splice(0)) effect();
    return tree;
  };
  const input = (field: "key" | "value", row = 1, tree = render()) => {
    const node = elements(tree).find((element) => element.props["aria-label"] === `Secret ${field} ${row}`);
    assert.ok(node, `${field} ${row} has a native accessible input`);
    return node;
  };
  const button = (label: string, tree = render()) => {
    const node = elements(tree).find((element) => element.props["aria-label"] === label
      || (element.type === "button" || element.type === Button) && React.Children.toArray(element.props.children).includes(label));
    assert.ok(node, `${label} control exists`);
    return node;
  };
  return {
    render, input, button,
    portals, documentBody,
    get saved() { return saved; }, get conflicts() { return conflicts; },
    get updatesAfterUnmount() { return updatesAfterUnmount; },
    fill(key = "NEW_KEY", value = "private-value", row = 1) {
      input("key", row).props.onChange({ target: { value: key } });
      input("value", row).props.onChange({ target: { value } });
    },
    submit(tree = render()) {
      const form = elements(tree).find((element) => element.type === "form");
      assert.ok(form);
      form.props.onSubmit({ preventDefault() {} });
      return flush();
    },
    paste(text: string, field: "key" | "value" = "key", row = 1) {
      let prevented = false;
      input(field, row).props.onPaste({ preventDefault() { prevented = true; }, clipboardData: { getData: () => text } });
      return prevented;
    },
    unmount() {
      for (const hook of hooks) hook?.cleanup?.();
      unmounted = true;
    },
  };
}

test("the inline form presents joined native key/value inputs with row controls and no hint or textarea", async () => {
  const editor = await loadEditor();
  const html = renderToStaticMarkup(editor.render());
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  assert.match(html, /aria-label="Secret key 1"/);
  assert.match(html, /aria-label="Secret value 1"/);
  assert.match(html, /ph-no-capture/);
  assert.doesNotMatch(html, /<textarea\b|\bHint\b|Import|EXISTING_KEY|private-value|(?:Show|Hide) secret value/);
  assert.match(html, /Add another/);
  assert.doesNotMatch(html, /Unsaved changes|>Reset<|>Save</);
  assert.match(editor.input("key").props.className, /rounded-l-2xl! rounded-r-none!/);
  assert.match(editor.input("value").props.className, /rounded-l-none! rounded-r-2xl! border-l-0!/);
  assert.doesNotMatch(editor.input("value").props.className, /pr-11/);
  assert.equal(editor.input("value").props.type, "password");
  editor.fill();
  assert.equal(editor.input("value").props.type, "password");
  editor.button("Add another").props.onClick();
  editor.fill("SECOND", "second", 2);
  editor.button("Remove secret 1").props.onClick();
  assert.equal(editor.input("key").props.value, "SECOND");
  editor.button("Remove secret 1").props.onClick();
  assert.equal(editor.input("key").props.value, "");
  assert.equal(editor.input("value").props.value, "");
});

test("the floating save region appears only for entered data and uses the form's native submit action", async () => {
  const editor = await loadEditor();
  const unsavedRegion = (tree = editor.render()) => elements(tree).find((element) => element.props.role === "region" && element.props["aria-label"] === "Unsaved secret changes");
  assert.equal(unsavedRegion(), undefined);
  editor.button("Add another").props.onClick();
  assert.equal(unsavedRegion(), undefined, "additional empty rows do not count as changes");
  editor.input("value").props.onChange({ target: { value: " " } });
  assert.ok(unsavedRegion(), "a whitespace value is still entered data");
  assert.equal(editor.button("Save").props.disabled, true, "a value without a valid key cannot save");
  editor.input("value").props.onChange({ target: { value: "" } });
  assert.equal(unsavedRegion(), undefined, "manually clearing all fields removes the notice");
  editor.fill();
  const tree = editor.render();
  const region = unsavedRegion(tree)!;
  assert.ok(region);
  const status = elements(region).find((element) => element.props.role === "status");
  assert.ok(status);
  assert.equal(status.props["aria-live"], "polite");
  assert.match(renderToStaticMarkup(status), /Unsaved changes/);
  const save = editor.button("Save", tree);
  assert.equal(save.props.type, "submit");
  assert.equal(save.props.onClick, undefined, "Save does not duplicate form submission in a click handler");
  assert.equal(save.props.disabled, false);
  const form = elements(tree).find((element) => element.type === "form")!;
  assert.ok(form.props.id);
  assert.equal(save.props.form, form.props.id, "the external Save button submits the inline form");
  assert.equal(elements(form).includes(save), false, "the inline form has no separate save button");
  editor.button("Remove secret 1").props.onClick();
  assert.equal(unsavedRegion(), undefined, "removing the filled row leaves the blank row clean");
});

test("Reset clears draft rows, production confirmation and errors without writing", async () => {
  let writes = 0;
  const editor = await loadEditor({ props: { environment: { ...environment, isProduction: true } }, client: {
    createSecret: async () => { writes++; throw new Error("Save failed"); },
  } });
  editor.fill();
  const confirmation = elements(editor.render()).find((element) => element.type === "production-confirmation")!;
  confirmation.props.onChange(true);
  await editor.submit();
  assert.equal(writes, 1);
  assert.match(renderToStaticMarkup(editor.render()), /Save failed|Unsaved changes/);
  const reset = editor.button("Reset");
  assert.equal(reset.props.type, "button");
  reset.props.onClick();
  assert.equal(writes, 1, "Reset is a local operation");
  assert.equal(editor.input("key").props.value, "");
  assert.equal(editor.input("value").props.value, "");
  assert.equal(editor.input("value").props.type, "password");
  assert.equal(elements(editor.render()).filter((element) => /^Secret key /.test(element.props["aria-label"] ?? "")).length, 1);
  assert.doesNotMatch(renderToStaticMarkup(editor.render()), /Save failed|Unsaved changes|private-value/);
  editor.fill("ANOTHER_KEY", "another-value");
  const resetConfirmation = elements(editor.render()).find((element) => element.type === "production-confirmation")!;
  assert.equal(resetConfirmation.props.checked, false);
  assert.equal(editor.button("Save").props.disabled, true, "a new production draft needs fresh confirmation");
});

test("the browser renders the floating action region through the body portal", async () => {
  const editor = await loadEditor({ browser: true });
  editor.render();
  assert.equal(editor.portals.some((portal) => elements(portal.children).some((element) => element.props["aria-label"] === "Unsaved secret changes")), false);
  editor.fill();
  editor.render();
  assert.ok(editor.portals.length > 0);
  const portal = editor.portals.at(-1)!;
  assert.equal(portal.target, editor.documentBody);
  assert.ok(elements(portal.children).some((element) => element.props.role === "region" && element.props["aria-label"] === "Unsaved secret changes"));
});

test("metadata refresh blocks Save but still permits discarding local changes", async () => {
  let writes = 0;
  const editor = await loadEditor({ client: { createSecret: async () => { writes++; return []; } } });
  editor.fill();
  const refreshing = editor.render({ disabled: true });
  assert.equal(editor.button("Save", refreshing).props.disabled, true);
  const reset = editor.button("Reset", refreshing);
  assert.equal(Boolean(reset.props.disabled), false);
  await editor.submit(refreshing);
  assert.equal(writes, 0);
  reset.props.onClick();
  assert.equal(editor.input("key").props.value, "");
  assert.doesNotMatch(renderToStaticMarkup(editor.render()), /Unsaved changes/);
});

test("dirty notifications reserve action space only for entered data or a pending save", async () => {
  const notifications: boolean[] = [];
  const request = deferred<any[]>();
  const editor = await loadEditor({
    props: { onDirtyChange: (dirty: boolean) => { notifications.push(dirty); } },
    client: { createSecret: async () => request.promise },
  });
  editor.render();
  assert.deepEqual(notifications, [false]);
  editor.button("Add another").props.onClick();
  editor.render();
  assert.equal(notifications.at(-1), false, "blank rows do not reserve floating-action space");
  editor.fill();
  editor.render();
  assert.equal(notifications.at(-1), true);
  editor.button("Reset").props.onClick();
  editor.render();
  assert.equal(notifications.at(-1), false);
  editor.fill();
  editor.render();
  notifications.length = 0;
  const saving = editor.submit();
  editor.render();
  assert.deepEqual(notifications, [true], "the table keeps action space throughout saving");
  request.resolve([]);
  await saving;
  await flush();
  editor.render();
  assert.deepEqual(notifications, [true, false], "successful saving releases the space after clearing the draft");
});

test("env paste expands rows while ordinary value paste stays native and malformed batches preserve drafts", async () => {
  const editor = await loadEditor();
  editor.fill();
  for (const value of ["ordinary token", "token=abc123", "https://example.com/?key=value"]) {
    assert.equal(editor.paste(value, "value"), false);
    assert.equal(editor.input("value").props.value, "private-value");
  }
  assert.equal(editor.paste('FIRST=one\nSECOND="two=three"'), true);
  assert.equal(editor.input("key").props.value, "FIRST");
  assert.equal(editor.input("value", 2).props.value, "two=three");
  assert.equal(editor.paste('BROKEN="unterminated\nNEXT=2'), true);
  assert.equal(editor.input("key").props.value, "FIRST");
  assert.equal(editor.input("value", 2).props.value, "two=three");
  assert.match(renderToStaticMarkup(editor.render()), /quoted value/);
});

test("single saves are scoped to the current environment revision and reset only after success", async () => {
  const calls: any[] = [];
  let fail = true;
  const editor = await loadEditor({ client: { createSecret: async (...args: any[]) => { calls.push(args); if (fail) throw new Error("Network unavailable"); return []; } } });
  editor.fill("new_key", "private-value");
  await editor.submit();
  assert.equal(editor.input("value").props.value, "private-value");
  assert.match(renderToStaticMarkup(editor.render()), /Network unavailable/);
  assert.equal(editor.saved, 0);
  fail = false;
  await editor.submit(editor.render({ revision: 9 }));
  assert.deepEqual(normalize(calls[1]), ["acme", "app", "development", {
    key: "NEW_KEY", value: "private-value", environmentSlugs: ["development"],
    expectedRevisions: { development: 9 }, expectedRevision: 9, confirmProduction: false,
  }]);
  assert.equal(editor.saved, 1);
  assert.equal(editor.input("key").props.value, "");
  assert.equal(editor.input("value").props.value, "");
  assert.doesNotMatch(renderToStaticMarkup(editor.render()), /Network unavailable|private-value/);
  assert.doesNotMatch(renderToStaticMarkup(editor.render()), /Unsaved changes/);
});

test("multiple rows preview and commit one atomic import with authoritative revisions", async () => {
  const calls: any[] = [];
  const editor = await loadEditor({ client: {
    createSecret: async () => assert.fail("batch creation must use an atomic import"),
    importDotenv: async (...args: any[]) => { calls.push(args); return { created: 2, updated: 0, unchanged: 0, skipped: 0, revision: args[3].dryRun ? 7 : 8, keys: [] }; },
  } });
  editor.paste('FIRST=one\nSECOND="two=three"');
  await editor.submit();
  const envText = serializeEnvText({ FIRST: "one", SECOND: "two=three" });
  assert.deepEqual(normalize(calls), [
    ["acme", "app", "development", { envText, expectedRevision: 4, dryRun: true, confirmProduction: false }],
    ["acme", "app", "development", { envText, expectedRevision: 7, dryRun: false, confirmProduction: false }],
  ]);
  assert.equal(editor.saved, 1);
  assert.equal(editor.input("key").props.value, "");
});

test("an existing value edit saves with a blank composer and keeps its captured revision and version", async () => {
  const calls: any[] = [];
  const edits = { "secret-existing": existingEdit({ value: "" }) };
  let resets = 0;
  const editor = await loadEditor({ props: {
    edits, onResetEdits: () => { resets++; delete (edits as Record<string, unknown>)["secret-existing"]; },
  }, client: {
    createSecret: async () => assert.fail("an existing edit must not create a secret"),
    importDotenv: async (...args: any[]) => { calls.push(args); return { created: 0, updated: 1, unchanged: 0, skipped: 0, revision: 5, keys: [] }; },
  } });
  const tree = editor.render({ revision: 9 });
  assert.equal(editor.input("key", 1, tree).props.value, "");
  assert.equal(editor.button("Save", tree).props.disabled, false, "an empty edited value is valid without a new draft row");
  assert.match(renderToStaticMarkup(tree), /Unsaved changes/);
  await editor.submit(tree);
  assert.deepEqual(normalize(calls), [["acme", "app", "development", {
    envText: serializeEnvText({ EXISTING_KEY: "" }), dryRun: false, expectedRevision: 4,
    expectedVersions: { EXISTING_KEY: 3 }, confirmProduction: false,
  }]]);
  assert.equal(editor.saved, 1);
  assert.equal(resets, 1, "success clears the existing edits together with the new drafts");
  assert.doesNotMatch(renderToStaticMarkup(editor.render()), /Unsaved changes/);
});

test("mixed new secrets and existing edits commit once with per-key guards and no preview", async () => {
  const calls: any[] = [];
  const edits = {
    "secret-existing": existingEdit({ revision: 6 }),
    "secret-second": existingEdit({ id: "secret-second", key: "SECOND_EXISTING", version: 8, revision: 3, value: "second-edit" }),
  };
  const editor = await loadEditor({ props: { edits, existingKeys: ["EXISTING_KEY", "SECOND_EXISTING"] }, client: {
    createSecret: async () => assert.fail("mixed changes must use one atomic import"),
    importDotenv: async (...args: any[]) => { calls.push(args); return { created: 2, updated: 2, unchanged: 0, skipped: 0, revision: 7, keys: [] }; },
  } });
  editor.paste("FIRST_NEW=one\nSECOND_NEW=two");
  await editor.submit(editor.render({ revision: 10 }));
  assert.deepEqual(normalize(calls), [["acme", "app", "development", {
    envText: serializeEnvText({ FIRST_NEW: "one", SECOND_NEW: "two", EXISTING_KEY: "edited-value", SECOND_EXISTING: "second-edit" }),
    dryRun: false, expectedRevision: 3,
    expectedVersions: { FIRST_NEW: null, SECOND_NEW: null, EXISTING_KEY: 3, SECOND_EXISTING: 8 }, confirmProduction: false,
  }]]);
  assert.equal(editor.saved, 1);
  assert.equal(editor.input("key").props.value, "");
});

test("combined edits reject colliding new keys and validate the edited values before any write", async () => {
  let writes = 0;
  const client = { createSecret: async () => { writes++; }, importDotenv: async () => { writes++; } };
  const collision = await loadEditor({ props: { edits: { "secret-existing": existingEdit() } }, client });
  collision.fill("EXISTING_KEY", "should-not-overwrite");
  assert.equal(collision.button("Save").props.disabled, true);
  await collision.submit();
  assert.equal(collision.saved, 0);
  assert.equal(collision.input("value").props.value, "should-not-overwrite");
  const invalid = await loadEditor({ props: { edits: { "secret-existing": existingEdit({ value: "x".repeat(1024 * 1024) }) } }, client });
  assert.equal(invalid.button("Save").props.disabled, true);
  await invalid.submit();
  assert.equal(invalid.saved, 0);
  assert.equal(writes, 0, "both new rows and existing edits must pass validation before writing");
});

test("Reset discards both new drafts and existing edits without writing", async () => {
  let writes = 0, resets = 0;
  const edits = { "secret-existing": existingEdit() };
  const editor = await loadEditor({ props: {
    edits, onResetEdits: () => { resets++; delete (edits as Record<string, unknown>)["secret-existing"]; },
  }, client: { createSecret: async () => { writes++; }, importDotenv: async () => { writes++; } } });
  editor.fill();
  editor.button("Reset").props.onClick();
  assert.equal(resets, 1);
  assert.equal(writes, 0);
  assert.equal(editor.input("key").props.value, "");
  assert.equal(editor.input("value").props.value, "");
  assert.equal(editor.input("value").props.type, "password");
  assert.doesNotMatch(renderToStaticMarkup(editor.render()), /Unsaved changes/);
});

test("an existing edit conflict preserves every change and cannot rebase to refreshed metadata", async () => {
  const calls: any[] = [];
  let resets = 0;
  const edits = { "secret-existing": existingEdit() };
  const editor = await loadEditor({ props: { edits, onResetEdits: () => { resets++; } }, client: {
    importDotenv: async (...args: any[]) => { calls.push(args); throw new SecretsClientError("Environment changed", 409); },
  } });
  editor.fill("NEW_KEY", "new-value");
  await editor.submit();
  assert.equal(editor.conflicts, 1);
  assert.equal(editor.saved, 0);
  assert.equal(resets, 0);
  assert.equal(editor.input("value").props.value, "new-value");
  assert.equal(edits["secret-existing"].value, "edited-value");
  assert.match(renderToStaticMarkup(editor.render()), /Environment changed/);
  await editor.submit(editor.render({ revision: 12 }));
  assert.equal(calls.length, 2, "conflicts never automatically retry");
  for (const call of calls) {
    assert.equal(call[3].dryRun, false);
    assert.equal(call[3].expectedRevision, 4, "metadata refresh cannot adopt a new baseline for an old edit");
    assert.deepEqual(normalize(call[3].expectedVersions), { NEW_KEY: null, EXISTING_KEY: 3 });
  }
  assert.equal(editor.conflicts, 2);
});

test("existing edit writes lock the shared editor, notify saving state, and ignore stale submit and Reset handlers", async () => {
  const request = deferred<any>();
  const savingStates: boolean[] = [];
  let writes = 0, resets = 0;
  const editor = await loadEditor({ props: {
    edits: { "secret-existing": existingEdit() }, onResetEdits: () => { resets++; },
    onSavingChange: (saving: boolean) => { savingStates.push(saving); },
  }, client: { importDotenv: async () => { writes++; return request.promise; } } });
  const stale = editor.render();
  assert.equal(savingStates.includes(true), false);
  const staleReset = editor.button("Reset", stale);
  const saving = editor.submit(stale);
  await editor.submit(stale);
  const pending = editor.render();
  assert.equal(writes, 1);
  assert.equal(savingStates.at(-1), true);
  assert.equal(editor.button("Reset", pending).props.disabled, true);
  assert.equal(editor.button("Add another", pending).props.disabled, true);
  assert.equal(Boolean(editor.input("value", 1, pending).props.disabled || editor.input("value", 1, pending).props.readOnly), true);
  staleReset.props.onClick();
  assert.equal(resets, 0, "stale Reset cannot discard submitted existing edits");
  request.resolve({ created: 0, updated: 1, unchanged: 0, skipped: 0, revision: 5, keys: [] });
  await saving;
  await flush();
  editor.render();
  assert.equal(editor.saved, 1);
  assert.equal(savingStates.at(-1), false);
});

test("unmount suppresses existing edit completion and saving callbacks", async () => {
  const request = deferred<any>();
  const savingStates: boolean[] = [];
  let resets = 0;
  const editor = await loadEditor({ props: {
    edits: { "secret-existing": existingEdit() }, onResetEdits: () => { resets++; },
    onSavingChange: (saving: boolean) => { savingStates.push(saving); },
  }, client: { importDotenv: async () => request.promise } });
  editor.render();
  const saving = editor.submit();
  editor.render();
  assert.equal(savingStates.at(-1), true);
  editor.unmount();
  const statesAtUnmount = [...savingStates];
  request.resolve({ created: 0, updated: 1, unchanged: 0, skipped: 0, revision: 5, keys: [] });
  await saving;
  await flush();
  assert.equal(editor.saved, 0);
  assert.equal(editor.conflicts, 0);
  assert.equal(resets, 0);
  assert.equal(editor.updatesAfterUnmount, 0);
  assert.deepEqual(savingStates, statesAtUnmount);
});

test("existing keys and invalid drafts cannot overwrite values and failed previews retain every row", async () => {
  let writes = 0;
  for (const key of ["EXISTING_KEY", "1_INVALID"]) {
    const editor = await loadEditor({ client: { createSecret: async () => { writes++; } } });
    editor.fill(key);
    await editor.submit();
    assert.equal(editor.input("key").props.value, key);
    assert.equal(editor.saved, 0);
  }
  assert.equal(writes, 0);
  for (const summary of [{ updated: 1, unchanged: 0 }, { updated: 0, unchanged: 1 }]) {
    const calls: any[] = [];
    const editor = await loadEditor({ client: { importDotenv: async (...args: any[]) => { calls.push(args); return { created: 1, skipped: 0, revision: 4, keys: [], ...summary }; } } });
    editor.paste("FIRST=1\nSECOND=2");
    await editor.submit();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][3].dryRun, true);
    assert.equal(editor.input("key").props.value, "FIRST");
    assert.equal(editor.input("key", 2).props.value, "SECOND");
    assert.equal(editor.saved, 0);
    assert.match(renderToStaticMarkup(editor.render()), /already|exist/i);
  }
});

test("production acknowledgement is required before writing and included in the write", async () => {
  const calls: any[] = [];
  const editor = await loadEditor({ props: { environment: { ...environment, isProduction: true } }, client: { createSecret: async (...args: any[]) => { calls.push(args); return []; } } });
  editor.fill();
  await editor.submit();
  assert.equal(calls.length, 0);
  const confirmation = elements(editor.render()).find((element) => element.type === "production-confirmation");
  assert.ok(confirmation);
  confirmation.props.onChange(true);
  await editor.submit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3].confirmProduction, true);
  assert.equal(editor.saved, 1);
});

test("pending saves deduplicate stale submissions and lock editing and row controls", async () => {
  const request = deferred<any[]>();
  let writes = 0;
  const editor = await loadEditor({ client: { createSecret: async () => { writes++; return request.promise; } } });
  editor.fill();
  const stale = editor.render();
  const staleReset = editor.button("Reset", stale);
  const saving = editor.submit(stale);
  await editor.submit(stale);
  const pending = editor.render();
  assert.equal(writes, 1);
  for (const field of ["key", "value"] as const) {
    const input = editor.input(field, 1, pending);
    assert.equal(Boolean(input.props.disabled || input.props.readOnly), true);
  }
  assert.equal(editor.button("Add another", pending).props.disabled, true);
  assert.equal(editor.button("Reset", pending).props.disabled, true);
  assert.equal(Boolean(editor.button("Save", pending).props.loading), true);
  staleReset.props.onClick();
  assert.equal(editor.input("key").props.value, "NEW_KEY", "a stale Reset handler cannot clear a pending request");
  assert.equal(editor.paste("FIRST=1\nSECOND=2"), true, "pending inputs consume paste instead of modifying the browser value");
  request.resolve([]);
  await saving;
  await flush();
  assert.equal(editor.saved, 1);
});

test("revision conflicts reload metadata once, retain drafts, and never automatically retry", async () => {
  let writes = 0;
  const editor = await loadEditor({ client: { createSecret: async () => { writes++; throw new SecretsClientError("Environment changed", 409); } } });
  editor.fill();
  await editor.submit();
  assert.equal(writes, 1);
  assert.equal(editor.conflicts, 1);
  assert.equal(editor.saved, 0);
  assert.equal(editor.input("value").props.value, "private-value");
  assert.match(renderToStaticMarkup(editor.render()), /Environment changed/);
});

test("unmount stops after preview and suppresses callbacks or state updates after any pending request", async () => {
  for (const operation of ["single", "preview", "commit"] as const) {
    const request = deferred<any>();
    let imports = 0;
    const editor = await loadEditor({ client: {
      createSecret: async () => request.promise,
      importDotenv: async (...args: any[]) => {
        imports++;
        if (operation === "preview" || !args[3].dryRun) return request.promise;
        return { created: 2, updated: 0, unchanged: 0, skipped: 0, revision: 5, keys: [] };
      },
    } });
    if (operation === "single") editor.fill(); else editor.paste("FIRST=1\nSECOND=2");
    const saving = editor.submit();
    if (operation === "commit") await flush();
    editor.unmount();
    request.resolve(operation === "single" ? [] : { created: 2, updated: 0, unchanged: 0, skipped: 0, revision: 5, keys: [] });
    await saving;
    await flush();
    assert.equal(editor.saved, 0);
    assert.equal(editor.conflicts, 0);
    assert.equal(editor.updatesAfterUnmount, 0);
    assert.equal(imports, operation === "single" ? 0 : operation === "preview" ? 1 : 2);
  }
});
