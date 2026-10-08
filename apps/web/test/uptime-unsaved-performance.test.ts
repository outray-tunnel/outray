import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

test("typing keeps the navigation guard stable while dirty transitions still protect the latest draft", async () => {
  const source = await readFile(new URL("../src/components/uptime/use-uptime-unsaved-changes.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  type Guard = { shouldBlockFn: () => boolean; enableBeforeUnload: boolean; withResolver: boolean };
  let stored: { callback: () => boolean; dependencies: boolean[] } | undefined;
  const guards: Guard[] = [];
  const resolver = { status: "idle", reset() {}, proceed() {} };
  const module = { exports: {} as { useUptimeUnsavedChanges: (dirty: boolean) => typeof resolver } };
  runInNewContext(compiled, { module, exports: module.exports, require(specifier: string) {
    if (specifier === "react") return { useCallback(callback: () => boolean, dependencies: boolean[]) {
      if (!stored || dependencies.some((value, index) => value !== stored!.dependencies[index])) stored = { callback, dependencies };
      return stored.callback;
    } };
    if (specifier === "@tanstack/react-router") return { useBlocker(guard: Guard) { guards.push(guard); return resolver; } };
    throw new Error(`Unexpected navigation guard dependency: ${specifier}`);
  } });

  for (const dirty of [false, true, false]) {
    const firstIndex = guards.length;
    for (let input = 0; input < 100; input++) assert.equal(module.exports.useUptimeUnsavedChanges(dirty), resolver);
    const guard = guards[firstIndex];
    for (const render of guards.slice(firstIndex)) {
      assert.equal(render.shouldBlockFn, guard.shouldBlockFn, "unrelated form edits must not re-register the history/unload guard");
      assert.equal(render.shouldBlockFn(), dirty);
      assert.equal(render.enableBeforeUnload, dirty);
      assert.equal(render.withResolver, true);
    }
  }
  assert.notEqual(guards[0].shouldBlockFn, guards[100].shouldBlockFn);
  assert.notEqual(guards[100].shouldBlockFn, guards[200].shouldBlockFn);
});
