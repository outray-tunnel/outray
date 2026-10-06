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
import { CreateDomainForm, type CreateDomainModalProps } from "../src/components/domains/create-domain-modal";
import { CreateSubdomainForm } from "../src/components/subdomains/create-subdomain-modal";
import { isReservedStatusDomain } from "../src/lib/reserved-status-domain";
import { WorkspaceInput } from "../src/components/ui/workspace-input";
import { workspaceInputShellClassName } from "../src/components/ui/workspace-input-styles";

Object.assign(globalThis, { React });
const requireModule = createRequire(import.meta.url);
const submitEvent = { preventDefault() {} } as React.FormEvent<HTMLFormElement>;

type Resource = "domains" | "subdomains";
type FormProps = React.ComponentProps<typeof CreateDomainForm>;

/** Exercise the actual modal controller with only hooks and module boundaries isolated. */
async function controller(resource: Resource) {
  const source = await readFile(new URL(`../src/components/${resource}/create-${resource === "domains" ? "domain" : "subdomain"}-modal.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const cells: unknown[] = [];
  let cursor = 0;
  let changed = false;
  let effects: { index: number; deps: readonly unknown[]; run: () => void }[] = [];
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (next: unknown) => {
        cells[index] = typeof next === "function" ? next(cells[index]) : next;
        changed = true;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = { current: initial };
      return cells[index];
    },
    useEffect(run: () => void, deps: readonly unknown[]) {
      const index = cursor++;
      const previous = cells[index] as { deps: readonly unknown[] } | undefined;
      if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) effects.push({ index, deps, run });
    },
  };
  const modules: Record<string, unknown> = {
    react: hooks,
    "../arc/button/button": { Button },
    "../arc/dialog/dialog": { Dialog, DialogContent },
    "../ui/workspace-input": { WorkspaceInput },
    "../ui/workspace-input-styles": { workspaceInputShellClassName },
    "../outray-arc-theme.css": {},
    "@/lib/reserved-status-domain": { isReservedStatusDomain },
  };
  const module = { exports: {} as Record<string, (props: CreateDomainModalProps) => React.ReactElement> };
  runInNewContext(compiled, {
    module, exports: module.exports, React, Error,
    require: (specifier: string) => {
      if (Object.hasOwn(modules, specifier)) return modules[specifier];
      if (specifier.startsWith("@hugeicons")) return requireModule(specifier);
      throw new Error(`Unexpected modal import: ${specifier}`);
    },
  });
  const component = module.exports[resource === "domains" ? "CreateDomainModal" : "CreateSubdomainModal"];
  const props: CreateDomainModalProps = {
    isOpen: true, isPending: false, error: null,
    onClose() {}, onCreate() {},
    setError(next) { props.error = next; },
  };
  return {
    error: () => props.error,
    render(update: Partial<CreateDomainModalProps> = {}) {
      Object.assign(props, update);
      for (let pass = 0; pass < 5; pass++) {
        cursor = 0; changed = false; effects = [];
        const dialog = component(props) as React.ReactElement<React.ComponentProps<typeof Dialog>>;
        if (changed) continue;
        for (const effect of effects) { cells[effect.index] = { deps: effect.deps }; effect.run(); }
        const content = dialog.props.children as React.ReactElement<React.ComponentProps<typeof DialogContent>>;
        const form = content.props.children as React.ReactElement<FormProps>;
        return { dialog: dialog.props, content: content.props, form: form.props };
      }
      throw new Error("Modal controller did not stabilize");
    },
  };
}

for (const resource of ["domains", "subdomains"] as const) {
  const raw = resource === "domains" ? "  API.Example.COM  " : "  PREVIEW  ";
  const normalized = resource === "domains" ? "api.example.com" : "preview";
  const Form = resource === "domains" ? CreateDomainForm : CreateSubdomainForm;

  test(`${resource} form has a labeled neutral-focus field, live preview, escaped alert, and real Arc actions`, () => {
    const html = renderToStaticMarkup(React.createElement(Form, {
      value: raw, onValueChange() {}, onSubmit() {}, onCancel() {},
      isPending: false, error: "Already taken <address>",
    }));
    const input = html.match(/<input\b[^>]*>/)?.[0] ?? "";
    const id = input.match(/id="([^"]+)"/)?.[1];
    assert.ok(id);
    assert.ok(html.includes(`for="${id}"`));
    assert.match(input, /data-outray-composite-input=""|data-outray-composite-input/);
    assert.match(input, /aria-invalid="true"/);
    assert.match(input, /aria-describedby=/);
    assert.ok(html.includes(workspaceInputShellClassName), "address uses the shared composite input shell");
    assert.match(html, /role="alert"/);
    assert.match(html, /Already taken &lt;address&gt;/);
    assert.ok(html.includes(normalized));
    assert.match(html, /Cancel/);
    assert.doesNotMatch(html, /fixed inset-0|autoFocus|user@example/);
  });

  test(`${resource} pending form locks input and Cancel but keeps busy Submit focusable`, () => {
    const html = renderToStaticMarkup(React.createElement(Form, {
      value: raw, onValueChange() {}, onSubmit() {}, onCancel() {},
      isPending: true, error: null,
    }));
    assert.match(html, /<form[^>]*aria-busy="true"/);
    assert.match(html, /<input[^>]*disabled=""/);
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([button]) => button);
    assert.match(buttons[0], /disabled=""/);
    assert.match(buttons[1], /type="submit"/);
    assert.match(buttons[1], /aria-busy="true"/);
    assert.match(buttons[1], /aria-disabled="true"/);
    assert.doesNotMatch(buttons[1], /\sdisabled=""/);
  });

  test(`${resource} immediately rejected save retains input and permits retry without a pending render`, async () => {
    const modal = await controller(resource);
    const calls: string[] = [];
    modal.render({ onCreate: async (value) => { calls.push(value); throw new Error("Address is already taken"); } }).form.onValueChange(raw);
    const attempted = modal.render();
    await attempted.form.onSubmit(submitEvent);
    const failed = modal.render();
    assert.equal(modal.error(), "Address is already taken");
    assert.equal(failed.form.value, raw);
    assert.equal(failed.form.isPending, false);
    assert.equal(failed.content.closeDisabled, false);
    await modal.render({ onCreate: async (value) => { calls.push(value); } }).form.onSubmit(submitEvent);
    assert.deepEqual(calls, [normalized, normalized]);
    assert.equal(modal.render().form.value, "");
  });

  test(`${resource} in-flight save blocks immediate duplicates, close, Escape, and outside dismissal`, async () => {
    const modal = await controller(resource);
    let finish = () => {};
    const pending = new Promise<void>((resolve) => { finish = () => resolve(); });
    let calls = 0;
    let closed = 0;
    modal.render({ onCreate: () => { calls++; return pending; }, onClose: () => { closed++; } }).form.onValueChange(raw);
    const ready = modal.render();
    const attempt = ready.form.onSubmit(submitEvent);
    await ready.form.onSubmit(submitEvent);
    const saving = modal.render();
    assert.equal(calls, 1);
    assert.equal(saving.form.isPending, true);
    assert.equal(saving.content.closeDisabled, true);
    saving.dialog.onOpenChange?.(false);
    saving.form.onCancel();
    assert.equal(closed, 0);
    let prevented = 0;
    const dismissal = { preventDefault() { prevented++; } };
    saving.content.onEscapeKeyDown?.(dismissal as never);
    saving.content.onPointerDownOutside?.(dismissal as never);
    assert.equal(prevented, 2);
    finish();
    await attempt;
    assert.equal(modal.render().form.isPending, false);
  });

  test(`${resource} reopening resets the draft and explicit focus returns to the trigger`, async () => {
    const modal = await controller(resource);
    let focused = 0;
    const triggerRef = { current: { focus() { focused++; } } as HTMLButtonElement };
    modal.render({ triggerRef }).form.onValueChange(raw);
    modal.render({ isOpen: false });
    const reopened = modal.render({ isOpen: true });
    assert.equal(reopened.form.value, "");
    let prevented = false;
    reopened.content.onCloseAutoFocus?.({ preventDefault() { prevented = true; } } as never);
    assert.equal(prevented, true);
    assert.equal(focused, 1);
  });
}

test("modal hostname validation matches endpoint rules and reserved Uptime domains never dispatch", async () => {
  for (const [resource, invalid] of [
    ["subdomains", ["has.dot", "has spaces", "https://preview"]],
    ["domains", ["example.com", "https://api.example.com", "-api.example.com", "status.outray.app", "nested.status.outray.app"]],
  ] as const) {
    const modal = await controller(resource);
    let creates = 0;
    for (const value of invalid) {
      modal.render({ onCreate() { creates++; } }).form.onValueChange(value);
      await modal.render().form.onSubmit(submitEvent);
      assert.ok(modal.error(), `${value} exposes validation feedback`);
      assert.equal(modal.render().form.value, value);
    }
    assert.equal(creates, 0);
  }
});
