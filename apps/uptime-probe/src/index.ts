import { databasePool, startUptimeWorker, WorkerStartupError } from "./worker";

void startUptimeWorker().catch((error) => {
  // Never log full errors: connection strings, request headers, or URLs may leak.
  console.error("[Uptime] Worker failed to start",
    error instanceof WorkerStartupError ? error.message : "internal_error");
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void databasePool.end().finally(() => process.exit(0));
  });
}
