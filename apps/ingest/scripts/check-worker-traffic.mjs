import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// Inspect invocation outcomes without printing request headers or payloads.
const require = createRequire(import.meta.url);
const wrangler = resolve(
  dirname(require.resolve("wrangler/package.json")),
  "bin/wrangler.js",
);
const child = spawn(process.execPath, [wrangler, "tail", "--format", "json"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  stdio: ["ignore", "pipe", "pipe"],
});
const lines = createInterface({ input: child.stdout });
let buffered = "";
let invocations = 0;
let errors = 0;
lines.on("line", (line) => {
  if (!buffered && !line.trimStart().startsWith("{")) return;
  buffered += line + "\n";
  try {
    const entry = JSON.parse(buffered);
    buffered = "";
    if (!entry.outcome) return;
    invocations++;
    if (entry.outcome !== "ok") errors++;
    const request = entry.event?.request;
    console.log(
      JSON.stringify({
        type: request ? "fetch" : entry.event?.queue ? "queue" : "other",
        path: request?.url ? new URL(request.url).pathname : undefined,
        method: request?.method,
        queue: entry.event?.queue,
        batchSize: entry.event?.batchSize,
        outcome: entry.outcome,
        exceptions: entry.exceptions?.length ?? 0,
      }),
    );
  } catch {
    if (buffered.length > 2_000_000) buffered = "";
  }
});
// Do not echo stderr: provider errors can contain untrusted response text.
child.stderr.resume();
const timeout = setTimeout(() => child.kill("SIGINT"), 30_000);
child.on("error", () => {
  clearTimeout(timeout);
  console.error("Could not start Worker traffic check");
  process.exitCode = 1;
});
child.on("close", () => {
  clearTimeout(timeout);
  console.log(JSON.stringify({ invocations, errors }));
  if (errors) process.exitCode = 1;
});
process.once("SIGINT", () => child.kill("SIGINT"));
