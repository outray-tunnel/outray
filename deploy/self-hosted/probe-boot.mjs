// No worker code (and therefore no socket or database operation) loads until
// the operator's guarded runner has installed and tested this network namespace.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";

const activation = process.env.OUTRAY_PROBE_ACTIVATION_ID;
if (!/^[a-f0-9]{64}$/.test(activation || "")) process.exit(1);
const marker = "/tmp/outray-probe-activate";
let stopped = false, child;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { stopped = true; if (child) child.kill(signal); else process.exit(0); });
}
while (!stopped) {
  if (existsSync(marker) && readFileSync(marker, "utf8") === activation) break;
  await pause(200);
}
if (!stopped) {
  child = spawn(process.execPath, ["apps/uptime-probe/dist/index.js"], { stdio: ["ignore", "pipe", "inherit"] });
  let output = "", ready = false;
  const deadline = setTimeout(() => { if (!ready) child.kill("SIGTERM"); }, 60_000);
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    output = (output + chunk.toString("utf8")).slice(-4096);
    if (!ready && output.includes("[Uptime] Worker ready")) {
      ready = true;
      clearTimeout(deadline);
      writeFileSync("/tmp/outray-probe-ready", JSON.stringify({ pid: child.pid, activation }), { mode: 0o600, flag: "wx" });
    }
  });
  child.once("error", () => { clearTimeout(deadline); console.error("[Uptime] Worker execution failed"); process.exit(1); });
  child.once("exit", (code) => { clearTimeout(deadline); process.exit(code || (stopped ? 0 : 1)); });
}
