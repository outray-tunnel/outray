import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { EnvironmentFormContent, type EnvironmentFormContentProps } from "../src/components/secrets/environment-form-content";
import { workspaceInputClassName, workspaceTextareaClassName } from "../src/components/ui/workspace-input-styles";
import type { SecretEnvironment } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

const environment: SecretEnvironment = {
  id: "environment-live", name: "Live & Protected", slug: "live", description: "Application configuration", color: "violet",
  secretCount: 12, revision: 7, isProduction: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const defaults: EnvironmentFormContentProps = {
  projectSlug: "payments-api", environment: null, name: "Staging", slug: "staging", description: "Preview configuration",
  confirmation: "", productionConfirmed: false, isProduction: false, saving: false, error: null, errors: {}, canSubmit: true,
  onNameChange: () => {}, onSlugChange: () => {}, onDescriptionChange: () => {}, onConfirmationChange: () => {},
  onProductionChange: () => {}, onSubmit: () => {}, onClose: () => {},
};
const render = (overrides: Partial<EnvironmentFormContentProps> = {}) => renderToStaticMarkup(React.createElement(EnvironmentFormContent, { ...defaults, ...overrides }));
const textContent = (html: string) => html.replace(/<[^>]*>/g, "");
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
const controls = (html: string) => [...html.matchAll(/<input\b[^>]*>|<textarea\b[^>]*>[\s\S]*?<\/textarea>/g)].map(([control]) => control);
function field(html: string, label: string) {
  const match = [...html.matchAll(/<label\b[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)].find(([, , contents]) => textContent(contents).startsWith(label));
  assert.ok(match, `the native control has an associated ${label} label`);
  const control = controls(html).find((element) => element.includes(`id="${match[1]}"`));
  assert.ok(control); return control;
}
function descriptions(control: string) { return control.match(/aria-describedby="([^"]+)"/)?.[1].split(" ") ?? []; }
test("create form uses one native form with labeled bounded fields, an optional description, and explicit footer action types", () => {
  const html = render();
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  assert.match(html, /<form[^>]*noValidate=""/);
  const name = field(html, "Environment name"), slug = field(html, "Slug"), description = field(html, "Description");
  assert.match(name, /maxLength="100"/); assert.match(name, /required=""/); assert.match(name, /autoComplete="off"/);
  assert.match(name, /data-environment-name=""/);
  assert.match(slug, /maxLength="63"/); assert.match(slug, /required=""/);
  assert.match(slug, /autoCapitalize="none"/); assert.match(slug, /autoCorrect="off"/); assert.match(slug, /spellCheck="false"/);
  assert.equal(descriptions(slug).length, 1);
  assert.ok(html.includes(`id="${descriptions(slug)[0]}"`));
  assert.match(description, /^<textarea\b/); assert.match(description, /maxLength="500"/); assert.match(description, /rows="3"/);
  assert.doesNotMatch(description, /required/); assert.match(html, /Description <span[^>]*>Optional<\/span>/);
  assert.doesNotMatch(html, /\saria-invalid=|\sautofocus(?:=|\s|>)|Confirm environment name|type="checkbox"/);
  const cancel = buttons(html).find((button) => textContent(button) === "Cancel") ?? "";
  const create = buttons(html).find((button) => textContent(button) === "Create environment") ?? "";
  assert.match(cancel, /type="button"/); assert.match(create, /type="submit"/);
  assert.doesNotMatch(cancel, /\sdisabled=""/); assert.doesNotMatch(create, /\sdisabled=""/);
  assert.match(html, /<footer\b/);
  assert.doesNotMatch(html, /class="footerHint"|Add secrets after creating it/, "the create footer contains actions without helper text");
  assert.match(html, /payments-api/);
});

test("every field error is associated with its invalid native control while existing hints remain associated", () => {
  const errors = { name: "Name is required", slug: "Slug is invalid", description: "Description is too long", confirmation: "Names must match exactly" };
  const html = render({ environment, errors, error: "Could not save this environment", canSubmit: false });
  for (const [key, label] of [["name", "Environment name"], ["slug", "Slug"], ["description", "Description"], ["confirmation", "Confirm environment name"]] as const) {
    const control = field(html, label);
    assert.match(control, /aria-invalid="true"/);
    const ids = descriptions(control);
    assert.equal(ids.length, key === "slug" || key === "confirmation" ? 2 : 1);
    const errorId = ids.find((id) => id.endsWith(`${key}-error`));
    assert.ok(errorId);
    assert.match(html, new RegExp(`id="${errorId}" class="[^"]*text-rose-300[^"]*">${errors[key]}</p>`));
    for (const id of ids) assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /role="alert">Could not save this environment<\/div>/);
  const submit = buttons(html).find((button) => /type="submit"/.test(button)) ?? "";
  assert.match(submit, /disabled=""/);
  assert.match(html, /value="Staging"/); assert.match(html, /Preview configuration/);
});

test("edit confirmation references the captured original name rather than a changed draft and retains metadata-only copy", () => {
  const html = render({ environment, name: "Renamed production", slug: "renamed-live", confirmation: "Live & Protected", isProduction: true, productionConfirmed: true });
  const confirmation = field(html, "Confirm environment name");
  assert.match(confirmation, /value="Live &amp; Protected"/); assert.match(confirmation, /required=""/); assert.match(confirmation, /maxLength="100"/);
  assert.match(html, /Type <span[^>]*>Live &amp; Protected<\/span> to save these changes/);
  assert.doesNotMatch(html, /Type <span[^>]*>Renamed production<\/span>/);
  assert.match(html, /This environment is protected/);
  assert.match(html, /I confirm this production change/);
  assert.match(html, /Save changes/); assert.match(html, /Secret values stay unchanged/);
  assert.doesNotMatch(html, /Create environment|Add secrets after creating it/);
});

test("production uses a visible associated label with a required semantic native checkbox and purely decorative custom mark", () => {
  for (const checked of [false, true]) {
    const html = render({ isProduction: true, productionConfirmed: checked });
    const checkbox = controls(html).find((control) => control.includes('type="checkbox"')) ?? "";
    assert.match(checkbox, /required=""/); assert.match(checkbox, /aria-describedby="[^"]+-production-hint"/);
    assert.doesNotMatch(checkbox, /aria-hidden|tabindex="-1"|role="checkbox"/);
    assert.equal(checkbox.includes('checked=""'), checked);
    const label = html.match(/<label class="group flex min-h-8[^"]*">[\s\S]*?<\/label>/)?.[0] ?? "";
    assert.ok(label.includes(checkbox)); assert.match(label, /I understand this is a production environment/);
    assert.match(label, /peer-focus-visible:outline-2[^"]*" aria-hidden="true"/);
    const section = html.match(/<section\b[^>]*aria-labelledby="([^"]+)"[^>]*>/)?.[1];
    assert.ok(section); assert.ok(html.includes(`id="${section}"`));
  }
  assert.doesNotMatch(render({ name: "Production", slug: "production", isProduction: false }), /type="checkbox"|productionChoice/, "the pure view obeys the controller's production stage rather than guessing from strings");
});

test("pending state disables fields and cancellation, while the Arc busy submit remains keyboard-focusable", () => {
  const html = render({ environment, isProduction: true, saving: true, canSubmit: false });
  assert.match(html, /<form[^>]*aria-busy="true"/);
  for (const control of controls(html)) assert.match(control, /disabled=""/);
  const cancel = buttons(html).find((button) => textContent(button) === "Cancel") ?? "";
  const submit = buttons(html).find((button) => textContent(button) === "Save changes") ?? "";
  assert.match(cancel, /disabled=""/); assert.match(cancel, /type="button"/);
  assert.match(submit, /type="submit"/); assert.match(submit, /aria-busy="true"/); assert.match(submit, /aria-disabled="true"/);
  assert.match(submit, /tabindex="0"/); assert.doesNotMatch(submit, /\sdisabled=""/);
  assert.equal(buttons(html).length, 2, "saving does not add secondary submission or dismissal affordances");
});

test("the form only displays its requested metadata and never offers a nonpersisted color picker or renders private fields", () => {
  const privateEnvironment = { ...environment, value: "private-plaintext", ciphertext: "private-ciphertext", token: "private-token", secrets: [{ key: "PRIVATE_KEY", value: "private-secret-value" }] };
  const html = render({ projectSlug: "vault /?β", environment: privateEnvironment });
  assert.match(html, /vault \/\?β/); assert.match(html, /Live &amp; Protected/);
  assert.doesNotMatch(html, /private-|PRIVATE_KEY|type="color"|type="radio"/);
  assert.doesNotMatch(textContent(html), /Choose a color|\bColor\b|\bViolet\b|Healthy|All secure|Encrypted at rest/);
});

test("actual native field handlers and footer props forward exact values/events to their supplied adapters", async () => {
  const source = await readFile(new URL("../src/components/secrets/environment-form-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const Button = () => null; const Placeholder = () => null; const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useId: () => "environment-form-test" };
      if (specifier === "lucide-react") return { Check: Placeholder, Layers: Placeholder, LockKeyhole: Placeholder };
      if (specifier === "../arc/button/button") return { Button };
      if (specifier === "../ui/workspace-input") return { WorkspaceInput: "input", WorkspaceTextarea: "textarea" };
      throw new Error(`Unexpected environment form dependency: ${specifier}`);
    },
  });
  const changes: Array<[string, string | boolean]> = []; const events: React.FormEvent<HTMLFormElement>[] = []; let closes = 0;
  const props: EnvironmentFormContentProps = { ...defaults, environment, isProduction: true,
    onNameChange: (value) => changes.push(["name", value]), onSlugChange: (value) => changes.push(["slug", value]),
    onDescriptionChange: (value) => changes.push(["description", value]), onConfirmationChange: (value) => changes.push(["confirmation", value]),
    onProductionChange: (value) => changes.push(["production", value]), onSubmit: (event) => events.push(event), onClose: () => { closes++; },
  };
  function elements(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>; return [element, ...elements(element.props.children)];
  }
  const nodes = elements(module.exports.EnvironmentFormContent(props));
  for (const key of ["name", "slug", "description", "confirmation"]) {
    const input = nodes.find((node) => node.props.id === `environment-form-test-${key}`);
    assert.ok(input); input.props.onChange({ target: { value: `  ${key} /?β  ` } });
  }
  const checkbox = nodes.find((node) => node.props.type === "checkbox");
  assert.ok(checkbox); checkbox.props.onChange({ target: { checked: true } }); checkbox.props.onChange({ target: { checked: false } });
  assert.deepEqual(changes, [["name", "  name /?β  "], ["slug", "  slug /?β  "], ["description", "  description /?β  "], ["confirmation", "  confirmation /?β  "], ["production", true], ["production", false]]);
  const form = nodes.find((node) => node.type === "form"); assert.ok(form); assert.equal(form.props.onSubmit, props.onSubmit);
  const event = { preventDefault() {} } as React.FormEvent<HTMLFormElement>; form.props.onSubmit(event); assert.equal(events[0], event);
  const cancel = nodes.find((node) => node.type === Button && node.props.type === "button");
  const submit = nodes.find((node) => node.type === Button && node.props.type === "submit");
  assert.ok(cancel); assert.equal(cancel.props.onClick, props.onClose); cancel.props.onClick(); assert.equal(closes, 1);
  assert.ok(submit); assert.equal(submit.props.onClick, undefined, "submission flows through one form handler rather than a second button adapter");
});

test("short-view utilities keep the Arc header/footer fixed in a bounded flex chain and scroll only form fields", async () => {
  const [dialog, content] = await Promise.all([
    readFile(new URL("../src/components/secrets/environment-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/secrets/environment-form-content.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(dialog, /w-\[min\(calc\(100vw-24px\),520px\)\]/);
  assert.match(dialog, /max-h-\[calc\(100dvh-24px\)\]/);
  assert.match(dialog, /flex[^"\n]*flex-col[^"\n]*overflow-hidden/);
  assert.match(dialog, /\[&>div:last-child\]:min-h-0/);
  assert.match(dialog, /\[&>div:last-child\]:flex-1/);
  assert.match(dialog, /\[&>div:last-child\]:flex-col/);
  assert.match(dialog, /\[&>div:last-child\]:p-0/);
  assert.match(dialog, /\[&>div:first-child\]:shrink-0/);
  assert.match(content, /<form className="flex min-h-0 flex-1 flex-col"/);
  assert.match(content, /min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain/);
  assert.equal((content.match(/overflow-y-auto/g) ?? []).length, 1);
  assert.match(content, /grid grid-cols-1 items-start/);
  assert.match(content, /<footer className="flex shrink-0/);
});

test("mobile, reduced-motion, native-checkbox and scoped input-focus utilities preserve accessible controls without a double outline", async () => {
  const [content, controller] = await Promise.all([
    readFile(new URL("../src/components/secrets/environment-form-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/secrets/environment-dialog.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(content, /grid grid-cols-1 items-start gap-5 max-\[540px\]:gap-\[18px\]/);
  assert.match(content, /max-\[540px\]:flex-col/);
  assert.match(content, /motion-reduce:transition-none/);
  assert.match(workspaceInputClassName, /motion-reduce:transition-none/);
  assert.match(workspaceTextareaClassName, /motion-reduce:transition-none/);
  assert.match(content, /peer absolute inset-0 z-1 m-0 size-full cursor-\[inherit\] opacity-0/);
  assert.doesNotMatch(content, /display-none|visibility-hidden/);
  assert.match(content, /peer-focus-visible:outline-2/);
  for (const classes of [workspaceInputClassName, workspaceTextareaClassName]) {
    assert.match(classes, /focus:outline-none/); assert.match(classes, /focus:border-white\/35/); assert.match(classes, /focus:shadow-/);
  }
  assert.match(field(render(), "Environment name"), /data-workspace-input="default"/);
  assert.match(field(render(), "Description"), /data-workspace-input="textarea"/);
  assert.match(controller, /className=\{`\$\{workspaceScopeClassName\} ph-no-capture[^`]*`\} data-private-product="secrets"/);
  assert.match(controller, /onOpenAutoFocus=/); assert.match(controller, /onCloseAutoFocus=/);
  assert.match(controller, /querySelector<HTMLElement>\("\[data-environment-name\]"\)\?\.focus\(\)/);
  assert.doesNotMatch(render(), /autofocus/);
});
