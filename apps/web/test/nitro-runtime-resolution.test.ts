import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build, loadConfigFromFile } from "vite";

test("Nitro resolves CommonJS OpenTelemetry interop imports to a Node-compatible entry", async () => {
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "production" },
    fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  );
  assert.ok(loaded);
  const resolve = loaded.config.environments?.nitro?.resolve;
  assert.deepEqual(resolve?.mainFields, ["main"]);
  assert.equal(loaded.config.resolve?.mainFields, undefined, "client resolution remains unchanged");

  // This is the default + named import shape emitted by the first SSR build.
  const entry = "\0otel-runtime-resolution";
  const result = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [{
      name: "otel-runtime-resolution",
      resolveId(id) { if (id === entry) return entry; },
      load(id) {
        if (id === entry) return 'import core, { hrTime } from "@opentelemetry/core"; export { core, hrTime };';
      },
    }],
    ssr: { noExternal: true, resolve },
    build: { ssr: true, write: false, minify: false, rollupOptions: { input: entry } },
  });
  assert.ok(!Array.isArray(result) && "output" in result);
  const chunk = result.output.find((item) => item.type === "chunk");
  assert.ok(chunk);
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
  assert.equal(typeof runtime.hrTime, "function");
  assert.equal(typeof runtime.core.hrTime, "function");
});
