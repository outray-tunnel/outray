import { spawn, type ChildProcess } from "child_process";
import { SecretsApiError } from "./secrets-api";
import type {
  SecretCollectionResponse,
  SecretRevisionResponse,
  SecretsApiClient,
} from "./secrets-api";
import type { SecretsTarget } from "./secrets-config";

const POLL_INTERVAL_MS = 5_000;
const RESTART_DEBOUNCE_MS = 750;
const CHILD_STOP_GRACE_MS = 5_000;
const CREDENTIAL_ENV_KEYS = ["OUTRAY_TOKEN", "OUTRAY_API_KEY"] as const;

interface RunningChild {
  child: ChildProcess;
  exit: Promise<number>;
}

interface SecretsReader {
  list(
    target: SecretsTarget,
    options: { values?: boolean; confirmProduction?: boolean },
  ): Promise<SecretCollectionResponse>;
  revision(
    target: SecretsTarget,
    options?: { confirmProduction?: boolean },
  ): Promise<SecretRevisionResponse>;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function collectionToMap(
  collection: SecretCollectionResponse,
): Record<string, string> {
  return Object.fromEntries(
    collection.secrets.map((secret) => {
      if (secret.value === undefined) {
        throw new Error(`Secret ${secret.key} was returned without a value.`);
      }
      return [secret.key, secret.value];
    }),
  );
}

export function buildChildEnvironment(
  base: NodeJS.ProcessEnv,
  secrets: Record<string, string>,
  managedKeys: Iterable<string> = Object.keys(secrets),
): NodeJS.ProcessEnv {
  const environment = { ...base };
  for (const key of managedKeys) delete environment[key];
  Object.assign(environment, secrets);
  for (const key of CREDENTIAL_ENV_KEYS) delete environment[key];
  return environment;
}

function startChild(
  command: string[],
  environment: NodeJS.ProcessEnv,
): RunningChild {
  const [binary, ...arguments_] = command;
  if (!binary) throw new Error("A command is required after --.");

  const child = spawn(binary, arguments_, {
    stdio: "inherit",
    env: environment,
    shell: process.platform === "win32",
  });
  const exit = new Promise<number>((resolve) => {
    child.once("exit", (code, signal) => {
      if (typeof code === "number") resolve(code);
      else if (signal === "SIGINT") resolve(130);
      else if (signal === "SIGTERM") resolve(143);
      else resolve(1);
    });
    child.once("error", () => resolve(1));
  });
  return { child, exit };
}

async function stopChild(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill(signal);
  let graceTimer: NodeJS.Timeout | undefined;
  const grace = new Promise<"timeout">((resolve) => {
    graceTimer = setTimeout(() => resolve("timeout"), CHILD_STOP_GRACE_MS);
  });
  const outcome = await Promise.race([
    exit.then(() => "exit" as const),
    grace,
  ]);
  if (graceTimer) clearTimeout(graceTimer);
  if (outcome === "timeout" && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exit;
  }
}

export interface WatchConnectionHealth {
  consecutiveFailures: number;
  warningShown: boolean;
}

export function recordWatchFailure(health: WatchConnectionHealth): boolean {
  health.consecutiveFailures++;
  if (health.consecutiveFailures < 3 || health.warningShown) return false;
  health.warningShown = true;
  return true;
}

export function recordWatchSuccess(health: WatchConnectionHealth): boolean {
  const recovered = health.warningShown;
  health.consecutiveFailures = 0;
  health.warningShown = false;
  return recovered;
}

export function isTerminalWatchError(error: unknown): boolean {
  return (
    error instanceof SecretsApiError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 410 ||
      error.code === "PRODUCTION_CONFIRMATION_REQUIRED")
  );
}

export async function runWithSecretsOnce(input: {
  api: Pick<SecretsApiClient, "list">;
  target: SecretsTarget;
  command: string[];
  baseEnvironment?: NodeJS.ProcessEnv;
  confirmProduction?: boolean;
}): Promise<number> {
  const collection = await input.api.list(input.target, {
    values: true,
    confirmProduction: input.confirmProduction,
  });
  const secrets = collectionToMap(collection);
  return startChild(
    input.command,
    buildChildEnvironment(input.baseEnvironment ?? process.env, secrets),
  ).exit;
}

function snapshot(collection: SecretCollectionResponse): Map<string, number> {
  return new Map(collection.secrets.map((secret) => [secret.key, secret.version]));
}

export function diffSecretSnapshots(
  previous: Map<string, number>,
  next: Map<string, number>,
): { added: string[]; updated: string[]; removed: string[] } {
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  for (const [key, version] of next) {
    if (!previous.has(key)) added.push(key);
    else if (previous.get(key) !== version) updated.push(key);
  }
  for (const key of previous.keys()) {
    if (!next.has(key)) removed.push(key);
  }
  return {
    added: added.sort(),
    updated: updated.sort(),
    removed: removed.sort(),
  };
}

function changeMessage(diff: ReturnType<typeof diffSecretSnapshots>): string {
  const groups = [
    diff.added.length ? `added ${diff.added.length} (${diff.added.join(", ")})` : null,
    diff.updated.length
      ? `updated ${diff.updated.length} (${diff.updated.join(", ")})`
      : null,
    diff.removed.length
      ? `removed ${diff.removed.length} (${diff.removed.join(", ")})`
      : null,
  ].filter(Boolean);
  return groups.length ? `Secrets changed: ${groups.join("; ")}.` : "Secrets changed.";
}

export async function runWithSecretsWatch(input: {
  api: SecretsReader;
  target: SecretsTarget;
  command: string[];
  baseEnvironment?: NodeJS.ProcessEnv;
  pollIntervalMs?: number;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  confirmProduction?: boolean;
}): Promise<number> {
  const stderr = input.stderr ?? process.stderr;
  const baseEnvironment = input.baseEnvironment ?? process.env;
  const pollIntervalMs = Math.max(input.pollIntervalMs ?? POLL_INTERVAL_MS, 1_000);
  const confirmation = { confirmProduction: input.confirmProduction };
  const initialRevision = await input.api.revision(input.target, confirmation);
  const initialCollection = await input.api.list(input.target, {
    values: true,
    ...confirmation,
  });
  let revision = initialRevision.revision;
  let previousSnapshot = snapshot(initialCollection);
  const managedKeys = new Set(previousSnapshot.keys());
  let secrets = collectionToMap(initialCollection);
  let running = startChild(
    input.command,
    buildChildEnvironment(baseEnvironment, secrets, managedKeys),
  );
  let stopping = false;
  let checking = false;
  const connectionHealth: WatchConnectionHealth = {
    consecutiveFailures: 0,
    warningShown: false,
  };
  const ignoredExits = new WeakSet<ChildProcess>();
  let resolveDone!: (code: number) => void;
  const done = new Promise<number>((resolve) => {
    resolveDone = resolve;
  });

  const observeExit = (current: RunningChild) => {
    current.exit.then((code) => {
      if (stopping || ignoredExits.has(current.child)) return;
      stopping = true;
      resolveDone(code);
    });
  };
  observeExit(running);

  const shutdown = async (code: number, signal: NodeJS.Signals = "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    await stopChild(running.child, signal);
    resolveDone(code);
  };
  const onSigint = () => void shutdown(130, "SIGINT");
  const onSigterm = () => void shutdown(143, "SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  const markSuccess = () => {
    if (recordWatchSuccess(connectionHealth)) {
      stderr.write("Secrets watch connection recovered.\n");
    }
  };

  const check = async () => {
    if (stopping || checking) return;
    checking = true;
    try {
      const nextRevision = await input.api.revision(input.target, confirmation);
      if (nextRevision.revision === revision) {
        markSuccess();
        return;
      }

      await delay(RESTART_DEBOUNCE_MS);
      if (stopping) return;
      const stableRevision = await input.api.revision(input.target, confirmation);
      if (stableRevision.revision === revision) {
        markSuccess();
        return;
      }

      const collection = await input.api.list(input.target, {
        values: true,
        ...confirmation,
      });
      const nextSnapshot = snapshot(collection);
      const diff = diffSecretSnapshots(previousSnapshot, nextSnapshot);
      for (const key of previousSnapshot.keys()) managedKeys.add(key);
      for (const key of nextSnapshot.keys()) managedKeys.add(key);
      secrets = collectionToMap(collection);
      revision = stableRevision.revision;
      previousSnapshot = nextSnapshot;

      stderr.write(`${changeMessage(diff)} Restarting command.\n`);
      ignoredExits.add(running.child);
      await stopChild(running.child);
      if (stopping) return;
      running = startChild(
        input.command,
        buildChildEnvironment(baseEnvironment, secrets, managedKeys),
      );
      observeExit(running);
      markSuccess();
    } catch (error) {
      if (isTerminalWatchError(error)) {
        stderr.write(
          `Secrets watch access ended (${(error as SecretsApiError).status}); stopping command.\n`,
        );
        await shutdown(1);
        return;
      }

      if (recordWatchFailure(connectionHealth)) {
        stderr.write(
          `Secrets watch is temporarily offline after ${connectionHealth.consecutiveFailures} failed checks; command is still running: ${
            error instanceof Error ? error.message : "Unknown error"
          }\n`,
        );
      }
    } finally {
      checking = false;
    }
  };

  const timer = setInterval(() => void check(), pollIntervalMs);
  try {
    return await done;
  } finally {
    clearInterval(timer);
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}
