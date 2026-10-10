import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("previously valid resolved-config objects still pass TypeScript checking", () => {
  const require = createRequire(import.meta.url);
  const compiler = require.resolve("typescript/lib/tsc.js");
  const fixture = fileURLToPath(
    new URL("./fixtures/resolved-options-compatibility.ts", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      compiler,
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target", "ES2022",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "--types", "node",
      fixture,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );

  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
