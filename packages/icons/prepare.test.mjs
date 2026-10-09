import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { collectIcons, prepareIcons, selectIconMode } from "./prepare.mjs";

test("unlicensed builds default to free even when Pro is already installed", () => {
  assert.equal(selectIconMode(), "free");
  assert.equal(selectIconMode({ proAvailable: true }), "free");
  assert.equal(selectIconMode({ mode: "free", licenseKey: "fixture", proAvailable: true }), "free");
});

test("licensed auto mode preserves Pro but unavailable optional packages fall back", () => {
  assert.equal(selectIconMode({ licenseKey: "fixture", proAvailable: true }), "pro");
  assert.equal(selectIconMode({ licenseKey: "fixture", proAvailable: false }), "free");
  assert.equal(selectIconMode({ licenseKey: "   ", proAvailable: true }), "free");
});

test("explicit Pro is opt-in and fails clearly when its packages are missing", () => {
  assert.equal(selectIconMode({ mode: "pro", proAvailable: true }), "pro");
  assert.throws(() => selectIconMode({ mode: "pro" }), /Pro icons were requested but are not installed/);
  assert.throws(() => selectIconMode({ mode: "typo" }), /OUTRAY_ICON_MODE/);
});

test("per-icon imports are collected without bundling an icon barrel", () => {
  assert.deepEqual(collectIcons('import PlayIcon from "@outray/icons/solid/PlayIcon"; import PlayAgain from "@outray/icons/solid/PlayIcon"; import Tick from "@outray/icons/stroke/Tick02Icon"'), ["solid/PlayIcon", "stroke/Tick02Icon"]);
});

test("private packs are optional and the public MIT pack is required", () => {
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies["@hugeicons/core-free-icons"], "4.3.5");
  for (const style of ["solid", "stroke"]) {
    assert.equal(pkg.dependencies[`@hugeicons-pro/core-${style}-rounded`], undefined);
    assert.ok(pkg.optionalDependencies[`@hugeicons-pro/core-${style}-rounded`]);
  }
});

test("forced free generation has only direct public imports and loads in ESM/CJS", async () => {
  const { mode, count } = prepareIcons({ OUTRAY_ICON_MODE: "free" });
  assert.equal(mode, "free");
  assert.ok(count > 0);
  for (const style of ["solid", "stroke"]) {
    for (const file of readdirSync(new URL(`./generated/${style}/`, import.meta.url))) {
      const source = readFileSync(new URL(`./generated/${style}/${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /@hugeicons-pro/);
      assert.match(source, /@hugeicons\/core-free-icons\/[A-Za-z0-9]+Icon/);
    }
  }
  const { default: icon } = await import("@outray/icons/solid/PlayIcon");
  assert.ok(Array.isArray(icon));
  const cjs = createRequire(import.meta.url)("@outray/icons/solid/PlayIcon");
  assert.ok(Array.isArray(cjs) || Array.isArray(cjs.default));
  assert.deepEqual(JSON.parse(readFileSync(new URL("./generated/mode.json", import.meta.url), "utf8")), { mode: "free" });
});
