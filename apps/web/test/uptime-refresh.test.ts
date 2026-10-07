import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

test("visible polling has one 30-second timer, pauses while hidden, deduplicates focus, and cleans up", async () => {
  const source = await readFile(new URL("../src/components/uptime/use-uptime-refresh.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let now = 10_000, sequence = 0, reloads = 0;
  let cleanup: (() => void) | undefined;
  const timers = new Map<number, () => void>(), events = new Map<string, () => void>();
  const document = { visibilityState: "visible", addEventListener: (name: string, handler: () => void) => events.set(name, handler), removeEventListener: (name: string, handler: () => void) => { assert.equal(events.get(name), handler); events.delete(name); } };
  const window = {
    setInterval: (handler: () => void, milliseconds: number) => { assert.equal(milliseconds, 30_000); const id = ++sequence; timers.set(id, handler); return id; },
    clearInterval: (id: number) => { timers.delete(id); },
    addEventListener: (name: string, handler: () => void) => events.set(name, handler), removeEventListener: (name: string, handler: () => void) => { assert.equal(events.get(name), handler); events.delete(name); },
  };
  const module = { exports: {} as any };
  runInNewContext(compiled, { Date: { now: () => now }, document, window, module, exports: module.exports, require: (specifier: string) => {
    assert.equal(specifier, "react");
    return { useEffect: (effect: () => () => void, dependencies: unknown[]) => { assert.equal(dependencies.length, 1); cleanup = effect(); } };
  } });
  module.exports.useUptimeRefresh(() => { reloads++; });
  assert.equal(reloads, 0, "mount does not duplicate the resource's initial request"); assert.equal(timers.size, 1);
  now += 30_000; [...timers.values()][0](); assert.equal(reloads, 1);
  document.visibilityState = "hidden"; events.get("visibilitychange")!(); assert.equal(timers.size, 0);
  now += 30_000; events.get("focus")!(); assert.equal(reloads, 1, "hidden tabs never request a refresh");
  document.visibilityState = "visible"; events.get("visibilitychange")!(); assert.equal(reloads, 2); assert.equal(timers.size, 1);
  events.get("focus")!(); assert.equal(reloads, 2, "visibility + focus cannot double-fetch the same return to the app"); assert.equal(timers.size, 1);
  now += 30_000; [...timers.values()][0](); assert.equal(reloads, 3);
  now += 2_000; events.get("focus")!(); assert.equal(reloads, 4);
  cleanup!(); assert.equal(timers.size, 0); assert.equal(events.size, 0);
});
