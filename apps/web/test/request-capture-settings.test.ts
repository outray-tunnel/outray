import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RequestCaptureSettingsContent,
  RequestCaptureSettingsForm,
  RequestCaptureSettingsModal,
  type RequestCaptureSettingsModalProps,
} from "../src/components/requests/request-capture-settings";

Object.assign(globalThis, { React });

const defaults: RequestCaptureSettingsModalProps = {
  enabled: false,
  isLoading: false,
  isLoadError: false,
  isRetrying: false,
  isUpdating: false,
  onRetry: () => {},
  onSave: async () => {},
  onCancel: () => {},
};

function render(props: Partial<RequestCaptureSettingsModalProps> = {}) {
  return renderToStaticMarkup(
    React.createElement(RequestCaptureSettingsContent, {
      ...defaults,
      ...props,
    }),
  );
}

test("capture settings present two labeled, keyboard-native radios with the saved selection", () => {
  const html = render();
  const radios = html.match(/<input[^>]+type="radio"[^>]*>/g) ?? [];
  assert.equal(radios.length, 2);
  assert.match(radios[0], /data-capture-mode="metadata"/);
  assert.match(radios[0], /checked=""/);
  assert.match(radios[1], /data-capture-mode="full"/);
  assert.doesNotMatch(radios[1], /checked=/);
  assert.equal(
    radios[0].match(/name="([^"]+)"/)?.[1],
    radios[1].match(/name="([^"]+)"/)?.[1],
  );
  for (const radio of radios) {
    assert.match(radio, /aria-labelledby=/);
    assert.match(radio, /aria-describedby=/);
  }
  assert.match(html, /<fieldset[^>]*>/);
  assert.match(html, /<legend[^>]*>Capture mode<\/legend>/);
  assert.match(html, /peer-focus-visible:outline/);
  assert.match(html, /sm:grid-cols-2/);

  const full = render({ enabled: true });
  assert.match(full, /data-capture-mode="full"[^>]*checked=""/);
  assert.doesNotMatch(full, /data-capture-mode="metadata"[^>]*checked=""/);
});

test("opening capture settings does not write and unchanged Save is disabled", () => {
  let writes = 0;
  const html = render({
    onSave: async () => {
      writes += 1;
    },
  });
  assert.equal(writes, 0);
  const save = html.match(/<button[^>]+type="submit"[^>]*>/)?.[0];
  assert.ok(save);
  assert.match(save, /\sdisabled=""/);
  assert.match(html, /Save changes/);
  assert.match(html, /Cancel/);
  assert.doesNotMatch(html, /role="switch"/);
  for (const [button] of html.matchAll(/<button\b[^>]*>/g)) assert.match(button, /class="[^"]*\bsm\b/);
});

test("the requests page opens capture settings with a medium launcher", async () => {
  const source = await readFile(new URL("../src/routes/$orgSlug/requests.tsx", import.meta.url), "utf8");
  const trigger = source.match(/<DialogTrigger asChild>[\s\S]*?<\/DialogTrigger>/)?.[0];
  assert.ok(trigger);
  assert.match(trigger, /<Button type="button" variant="secondary" size="md"/);
  assert.match(trigger, /Capture settings/);
});

test("capture settings describe organization scope, sensitive data and future-only effects", () => {
  const html = render();
  assert.match(html, /Applies to all HTTP tunnels in this organization/);
  assert.match(html, /Sensitive data may be captured/);
  assert.match(html, /passwords, tokens, cookies or personal data/);
  assert.match(html, /Changes affect future requests only/);
  assert.match(html, /does not delete existing captures/);
  assert.doesNotMatch(html, /automatically redacted|never contains sensitive/);
});

test("saving locks mode choices and Cancel, with a focusable busy Save button", () => {
  const html = render({ isUpdating: true });
  assert.match(html, /<form[^>]+aria-busy="true"/);
  assert.match(html, /<fieldset[^>]+disabled=""/);
  const cancel = html.match(/<button[^>]+type="button"[^>]*>/)?.[0];
  assert.ok(cancel);
  assert.match(cancel, /\sdisabled=""/);
  const save = html.match(/<button[^>]+type="submit"[^>]*>/)?.[0];
  assert.ok(save);
  assert.match(save, /aria-busy="true"/);
  assert.match(save, /aria-disabled="true"/);
  assert.doesNotMatch(save, /\sdisabled=""/);
});

test("save errors are inline, escaped and linked to the attempted action", () => {
  const html = render({
    enabled: true,
    updateError: "Could not save <setting>",
  });
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not save &lt;setting&gt;/);
  const errorId = html.match(/<p id="([^"]+-save-error)" role="alert"/)?.[1];
  assert.ok(errorId);
  assert.ok(html.includes(`aria-describedby="${errorId}"`));
  assert.match(html, /data-capture-mode="full"[^>]*checked=""/);
});

test("initial loading uses a layout-matched skeleton and unavailable Save", () => {
  const html = render({ isLoading: true });
  assert.match(html, /Loading request capture settings/);
  assert.match(html, /motion-safe:animate-pulse/);
  assert.match(html, /sm:grid-cols-2/);
  assert.doesNotMatch(html, /type="radio"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Save changes/);
});

test("initial load failure offers retry without showing fabricated settings", () => {
  const html = render({ isLoadError: true });
  assert.match(html, /Couldn’t load capture settings/);
  assert.match(html, /Your settings haven’t changed/);
  assert.match(html, /Try again/);
  assert.match(html, /Cancel/);
  assert.doesNotMatch(html, /type="radio"/);
});

test("a mounted editor can retain its mode choices during a refresh failure", () => {
  const html = renderToStaticMarkup(
    React.createElement(RequestCaptureSettingsForm, {
      ...defaults,
      enabled: true,
      isLoadError: true,
    }),
  );
  assert.match(html, /data-capture-mode="full"[^>]*checked=""/);
  assert.match(html, /Couldn’t refresh capture settings/);
  assert.match(html, /Retry/);
  assert.match(html, /<fieldset[^>]+disabled=""/);
});

test("modal dismissals are blocked only while saving", () => {
  for (const isUpdating of [false, true]) {
    const modal = RequestCaptureSettingsModal({ ...defaults, isUpdating });
    assert.equal(modal.props.closeDisabled, isUpdating);
    for (const handler of [
      modal.props.onEscapeKeyDown,
      modal.props.onPointerDownOutside,
    ]) {
      let prevented = false;
      handler({
        preventDefault: () => {
          prevented = true;
        },
      });
      assert.equal(prevented, isUpdating);
    }
  }
});
