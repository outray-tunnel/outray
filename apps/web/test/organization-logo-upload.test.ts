import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { organizationInitials, organizationLogo } from "../src/components/sidebar/organization-switcher-state";

type Props = Record<string, any>;
type Feedback = { message: string; error: boolean } | null;
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const logoUrl = "https://images.example.com/org-logos/acme/logo.png";
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const file = (type = "image/png", size = 20, name = type === "image/webp" ? "logo.webp" : "logo.png") => new File([new Uint8Array(size)], name, { type });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Exercise upload handlers and cleanup while keeping native File/FormData behavior. */
async function upload(initial: Props = {}) {
  const source = await readFile(new URL("../src/components/workspace/organization-logo-upload.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const slots: any[] = [];
  const effects: Array<() => void> = [];
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const uploaded: string[] = [], feedback: Feedback[] = [];
  let index = 0, disposed = false, lateWrites = 0, pickerOpens = 0;
  let outcome: () => Promise<Response> = async () => response({ logoUrl });
  const module = { exports: {} as { OrganizationLogoUpload: (props: Props) => React.ReactNode } };
  const inputNode = { value: "", click() { pickerOpens++; } };
  const props = {
    orgSlug: "acme", name: "Acme Studio", image: null,
    onUploaded: (url: string) => { assert.equal(disposed, false); uploaded.push(url); },
    onFeedback: (value: Feedback) => { assert.equal(disposed, false); feedback.push(value); },
    ...initial,
  };
  runInNewContext(compiled, {
    React, Error, AbortController, FormData, File, URL, module, exports: module.exports,
    fetch: (url: string, init: RequestInit) => { calls.push({ url, init }); return outcome(); },
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState: (initial: unknown) => {
          const slot = index++;
          if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
          return [slots[slot], (next: unknown) => {
            if (disposed) lateWrites++;
            slots[slot] = typeof next === "function" ? next(slots[slot]) : next;
          }];
        },
        useRef: (initial: unknown) => {
          const slot = index++;
          return slots[slot] ?? (slots[slot] = { current: initial });
        },
        useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
          const slot = index++, previous = slots[slot];
          if (!previous || !deps || deps.some((value, at) => !Object.is(value, previous.deps?.[at]))) {
            effects.push(() => { previous?.cleanup?.(); slots[slot] = { deps, cleanup: effect() }; });
          }
        },
      };
      if (specifier === "lucide-react") return { ImagePlus: () => null, LoaderCircle: () => null, Building2: () => null };
      if (specifier === "../sidebar/organization-switcher-state") return { organizationInitials, organizationLogo };
      throw new Error(`Unexpected organization logo dependency: ${specifier}`);
    },
  });
  function render(overrides: Props = {}) {
    index = 0;
    const node = module.exports.OrganizationLogoUpload({ ...props, ...overrides });
    const tree = elements(node);
    const input = tree.find((element) => element.type === "input");
    if (input?.props.ref) input.props.ref.current = inputNode;
    for (const effect of effects.splice(0)) effect();
    return { node, tree };
  }
  function input(tree = render().tree) {
    const element = tree.find((element) => element.type === "input" && element.props.type === "file");
    assert.ok(element, "a native file input is available");
    return element;
  }
  function button(tree = render().tree) {
    const element = tree.find((element) => element.type === "button");
    assert.ok(element, "the logo is a keyboard-accessible button");
    return element;
  }
  return {
    render, input, button, calls, uploaded, feedback,
    get pickerOpens() { return pickerOpens; }, get lateWrites() { return lateWrites; },
    fetchWith(next: typeof outcome) { outcome = next; },
    choose(selected?: File, tree = render().tree) {
      const target = { files: selected ? [selected] : [], value: selected ? selected.name : "" };
      input(tree).props.onChange({ target, currentTarget: target });
      return target;
    },
    dispose() { for (const slot of slots) slot?.cleanup?.(); disposed = true; },
  };
}

test("the organization logo opens a native image picker from an accessible button", async () => {
  const view = await upload();
  const empty = view.render();
  assert.equal(view.button(empty.tree).props["aria-label"], "Upload organization logo");
  const input = view.input(empty.tree);
  assert.equal(input.props["aria-label"], "Choose organization logo");
  assert.equal(input.props.accept, "image/png,image/jpeg,image/webp,.jpg,.jpeg");
  view.button(empty.tree).props.onClick();
  assert.equal(view.pickerOpens, 1);
  assert.equal(view.calls.length, 0);
  const existing = view.render({ image: logoUrl });
  assert.equal(view.button(existing.tree).props["aria-label"], "Change organization logo");
  assert.match(renderToStaticMarkup(existing.node), /src="https:\/\/images\.example\.com\/org-logos\/acme\/logo.png"/);
  view.dispose();
});

test("canceling the picker leaves the current logo and feedback untouched", async () => {
  const view = await upload({ image: logoUrl });
  const target = view.choose(); await settle();
  assert.equal(target.value, "");
  assert.equal(view.calls.length, 0);
  assert.deepEqual(view.uploaded, []);
  assert.deepEqual(view.feedback, []);
  assert.match(renderToStaticMarkup(view.render().node), /org-logos\/acme\/logo.png/);
  view.dispose();
});

test("invalid file types and oversized logos are rejected before upload and leave the input reusable", async () => {
  for (const selected of [file("image/svg+xml"), file("image/gif"), file("image/png", 256 * 1024 + 1)]) {
    const view = await upload({ image: logoUrl });
    const target = view.choose(selected); await settle();
    assert.equal(target.value, "", "clear the native selection so the same file can be selected again");
    assert.equal(view.calls.length, 0);
    assert.equal(view.uploaded.length, 0);
    assert.equal(view.feedback.at(-1)?.error, true);
    assert.match(renderToStaticMarkup(view.render().node), /org-logos\/acme\/logo.png/);
    view.dispose();
  }
});

test("PNG, WebP and JPEG logos with .jpg or .jpeg names upload to the encoded organization route", async () => {
  for (const [type, name] of [["image/png", "logo.png"], ["image/webp", "logo.webp"], ["image/jpeg", "logo.jpg"], ["image/jpeg", "logo.jpeg"]]) {
    const view = await upload({ orgSlug: "team/with space" });
    const selected = file(type, 256 * 1024, name);
    const target = view.choose(selected); await settle();
    assert.equal(target.value, "");
    assert.equal(view.calls.length, 1);
    const call = view.calls[0];
    assert.equal(call.url, "/api/team%2Fwith%20space/organization/logo");
    assert.equal(call.init.method, "POST");
    assert.ok(call.init.body instanceof FormData);
    const body = call.init.body as FormData;
    const sent = body.get("logo") as File;
    assert.equal(sent.name, selected.name);
    assert.equal(sent.type, selected.type);
    assert.equal(sent.size, selected.size);
    assert.deepEqual([...body.keys()], ["logo"]);
    assert.ok(call.init.signal);
    assert.equal(call.init.signal.aborted, false);
    assert.deepEqual(view.uploaded, [logoUrl]);
    assert.equal(view.feedback.at(-1)?.error, false);
    assert.ok(view.feedback.at(-1)?.message);
    view.dispose();
  }
});

test("pending uploads synchronously deduplicate old handlers and disable the picker", async () => {
  const view = await upload(), wait = deferred<Response>();
  view.fetchWith(() => wait.promise);
  const old = view.render();
  view.choose(file(), old.tree);
  view.choose(file("image/webp"), old.tree);
  view.button(old.tree).props.onClick();
  assert.equal(view.calls.length, 1);
  assert.equal(view.pickerOpens, 0, "stale button handlers cannot open another picker during an upload");
  const pending = view.render();
  assert.equal(view.button(pending.tree).props.disabled, true);
  assert.equal(view.input(pending.tree).props.disabled, true);
  assert.deepEqual(view.uploaded, []);
  wait.resolve(response({ logoUrl })); await settle();
  assert.equal(Boolean(view.button().props.disabled), false);
  assert.equal(Boolean(view.input().props.disabled), false);
  assert.deepEqual(view.uploaded, [logoUrl]);
  view.dispose();
});

test("upload failures preserve the old logo and allow retrying the same selected file", async () => {
  for (const failure of ["response", "network"] as const) {
    const view = await upload({ image: logoUrl });
    const selected = file();
    view.fetchWith(async () => {
      if (failure === "network") throw new Error("Network unavailable");
      return response({ error: "Upload denied" }, 403);
    });
    const target = view.choose(selected); await settle();
    assert.equal(target.value, "");
    assert.deepEqual(view.uploaded, []);
    assert.equal(view.feedback.at(-1)?.error, true);
    assert.match(renderToStaticMarkup(view.render().node), /org-logos\/acme\/logo.png/);
    const nextUrl = "https://images.example.com/org-logos/acme/replacement.webp";
    view.fetchWith(async () => response({ logoUrl: nextUrl }));
    view.choose(selected); await settle();
    assert.equal(view.calls.length, 2);
    assert.deepEqual(view.uploaded, [nextUrl]);
    assert.equal(view.feedback.at(-1)?.error, false);
    view.dispose();
  }
});

test("malformed or unsafe upload URLs never replace the current image", async () => {
  for (const returned of [null, "", "javascript:alert(1)"]) {
    const view = await upload({ image: logoUrl });
    view.fetchWith(async () => response({ logoUrl: returned }));
    view.choose(file()); await settle();
    assert.deepEqual(view.uploaded, []);
    assert.equal(view.feedback.at(-1)?.error, true);
    assert.match(renderToStaticMarkup(view.render().node), /org-logos\/acme\/logo.png/);
    view.dispose();
  }
});

test("unmount aborts the upload and ignores late success or failure", async () => {
  for (const result of ["success", "failure"] as const) {
    const view = await upload(), wait = deferred<Response>();
    view.fetchWith(() => wait.promise);
    view.choose(file());
    const request = view.calls[0];
    assert.equal(request.init.signal?.aborted, false);
    view.dispose();
    assert.equal(request.init.signal?.aborted, true);
    const feedbackAtClose = [...view.feedback];
    if (result === "success") wait.resolve(response({ logoUrl }));
    else wait.reject(new Error("Late failure"));
    await settle();
    assert.deepEqual(view.uploaded, []);
    assert.deepEqual(view.feedback, feedbackAtClose);
    assert.equal(view.lateWrites, 0);
  }
});
