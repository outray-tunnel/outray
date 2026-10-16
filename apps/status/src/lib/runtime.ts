import { AsyncLocalStorage } from "node:async_hooks";
import type { StatusSnapshotBucket } from "./snapshots";

export interface StatusWorkerEnv {
  HYPERDRIVE?: { connectionString: string };
  STATUS_SNAPSHOTS?: StatusSnapshotBucket;
  [binding: string]: unknown;
}

export type StatusEnvironment = Readonly<Record<string, string | undefined>>;

export interface StatusRuntimeInput {
  env: StatusWorkerEnv;
  request: Request;
  waitUntil: (promise: Promise<unknown>) => void;
}

export interface StatusRuntime extends StatusRuntimeInput {
  readonly platform: "cloudflare";
  readonly environment: StatusEnvironment;
  readonly resources: Map<symbol, unknown>;
  onCleanup: (cleanup: () => Promise<void> | void) => void;
}

const requestRuntime = new AsyncLocalStorage<StatusRuntime>();

/** Called only by the server adapter/Worker entry, never inferred from headers. */
export async function withStatusRuntime<T>(
  input: StatusRuntimeInput,
  callback: () => T | Promise<T>,
): Promise<T> {
  const existing = requestRuntime.getStore();
  if (existing?.env === input.env && existing.request === input.request) return callback();

  const cleanup = new Set<() => Promise<void> | void>();
  const environment = Object.fromEntries(Object.entries(input.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ));
  const runtime: StatusRuntime = {
    ...input,
    platform: "cloudflare",
    environment,
    resources: new Map(),
    onCleanup: (operation) => { cleanup.add(operation); },
  };

  return requestRuntime.run(runtime, async () => {
    try {
      return await callback();
    } finally {
      const results = await Promise.allSettled([...cleanup].map(async (operation) => operation()));
      if (results.some((result) => result.status === "rejected")) {
        // Never log a connection string, request, credential, or database error body.
        console.error("[Status] Request resource cleanup failed");
      }
      runtime.resources.clear();
    }
  });
}

export function getStatusRuntime(): StatusRuntime | undefined {
  return requestRuntime.getStore();
}

export function statusEnvironment(): StatusEnvironment {
  return getStatusRuntime()?.environment ?? (typeof process === "undefined" ? {} : process.env);
}

/** Worker bindings do not need NODE_ENV to enable production safety checks. */
export function isStatusProduction(): boolean {
  return getStatusRuntime() !== undefined || statusEnvironment().NODE_ENV === "production";
}
