import { databasePool, startUptimeWorker, WorkerStartupError } from "./worker";
import { closeDatabasePool, safeDatabaseError } from "./database";

let shuttingDown = false;
function shutdown(exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  void closeDatabasePool(databasePool).then((result) => {
    if (result !== "closed") console.error("[Uptime] Database shutdown incomplete", result);
    // Checked-out clients cannot hold systemd shutdown/restart indefinitely.
    process.exit(exitCode);
  });
}

void startUptimeWorker().catch((error) => {
  // Never log full errors: connection strings, request headers, or URLs may leak.
  console.error("[Uptime] Worker failed to start",
    error instanceof WorkerStartupError ? error.message : safeDatabaseError(error));
  shutdown(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(0);
  });
}
