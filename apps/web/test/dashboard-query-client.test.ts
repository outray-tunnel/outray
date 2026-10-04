import assert from "node:assert/strict";
import test from "node:test";
import { QueryObserver, isCancelledError } from "@tanstack/react-query";
import { atom, onMount } from "nanostores";
import {
  createQueryClient,
  createQueryClientManager,
  getQueryClient,
} from "../src/lib/query-client";

function sessionIdentity(
  userId: string | null,
  isPending = false,
  isRefetching = false,
  error: Error | null = null,
) {
  return {
    data: userId ? { user: { id: userId } } : null,
    isPending,
    isRefetching,
    error,
  };
}

test("known dashboard query families reuse results for 30 seconds", () => {
  const client = createQueryClient();
  for (const prefix of [
    "stats",
    "tunnelStats",
    "protocolStats",
    "tunnels",
    "tunnel",
    "subscription",
  ]) {
    const defaults = client.defaultQueryOptions({
      queryKey: [prefix, "org-a", "detail"],
    });
    assert.equal(defaults.staleTime, 30_000, prefix);
    assert.equal(defaults.refetchOnWindowFocus, false, prefix);
  }
  client.clear();
});

test("permissions, sensitive data and new query families stay immediately stale", () => {
  const client = createQueryClient();
  for (const prefix of [
    "active-member",
    "members",
    "invitations",
    "auth-tokens",
    "org-settings",
    "secrets-project-options",
    "secrets-project-environments",
    "admin",
    "unknown-future-query",
    "stats-permissions",
  ]) {
    const defaults = client.defaultQueryOptions({ queryKey: [prefix, "org-a"] });
    assert.equal(defaults.staleTime, 0, prefix);
  }
  assert.equal(
    client.defaultQueryOptions({ queryKey: ["stats", "org-a"], staleTime: 0 }).staleTime,
    0,
    "individual queries can still opt out of dashboard freshness",
  );
  client.clear();
});

test("query client factories never share cached organization data", () => {
  const first = createQueryClient();
  const second = createQueryClient();
  const key = ["stats", "overview", "org-a"];
  first.setQueryData(key, { requests: 100 });
  assert.notEqual(first, second);
  assert.notEqual(first.getQueryCache(), second.getQueryCache());
  assert.equal(second.getQueryData(key), undefined);
  first.clear();
  second.clear();
});

test("server lookups create request-local query clients", () => {
  assert.equal(typeof window, "undefined");
  const first = getQueryClient();
  const second = getQueryClient();
  first.setQueryData(["subscription", "org-a"], { plan: "pro" });
  assert.notEqual(first, second);
  assert.equal(second.getQueryData(["subscription", "org-a"]), undefined);
  first.clear();
  second.clear();
});

test("browser lookups preserve one client across dashboard navigation", (t) => {
  const serverClient = getQueryClient();
  const serverKey = ["subscription", "private-server-org"];
  serverClient.setQueryData(serverKey, { plan: "pro" });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  const restoreWindow = () => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  };
  t.after(restoreWindow);

  const first = getQueryClient();
  assert.notEqual(first, serverClient);
  assert.equal(first.getQueryData(serverKey), undefined);
  first.setQueryData(["tunnels", "org-a"], [{ id: "tunnel-a" }]);
  const second = getQueryClient();
  assert.equal(first, second);
  assert.deepEqual(second.getQueryData(["tunnels", "org-a"]), [{ id: "tunnel-a" }]);
  restoreWindow();
  const nextServerClient = getQueryClient();
  assert.notEqual(nextServerClient, first);
  assert.equal(nextServerClient.getQueryData(["tunnels", "org-a"]), undefined);
  nextServerClient.clear();
  serverClient.clear();
  first.clear();
});

test("server requests after browser initialization cannot see the browser cache", () => {
  assert.equal(typeof window, "undefined");
  const client = getQueryClient();
  assert.equal(client.getQueryData(["tunnels", "org-a"]), undefined);
  client.clear();
});

test("identity binding observes existing auth updates without mounting or fetching a session", () => {
  const manager = createQueryClientManager();
  const session = atom(sessionIdentity(null, true));
  let mounts = 0;
  const removeMount = onMount(session, () => { mounts += 1; });
  const unbind = manager.bindSession(session);
  session.set(sessionIdentity("user-a"));
  assert.equal(mounts, 0);
  assert.equal(session.lc, 0);
  assert.equal(manager.getSnapshot().generation, 0);
  unbind();
  removeMount();
  manager.getSnapshot().client.clear();
});

test("initial pending session and the first identity do not clear the initial dashboard load", () => {
  const manager = createQueryClientManager();
  const initial = manager.getSnapshot();
  initial.client.setQueryData(["subscription", "org-a"], { plan: "pro" });
  const session = atom(sessionIdentity(null, true));
  const unbind = manager.bindSession(session);
  session.set(sessionIdentity("user-a", true, true));
  session.set(sessionIdentity("user-a"));
  assert.equal(manager.getSnapshot(), initial);
  assert.deepEqual(initial.client.getQueryData(["subscription", "org-a"]), { plan: "pro" });
  unbind();
  initial.client.clear();
});

test("an uninitialized session atom is not interpreted as logout", () => {
  const manager = createQueryClientManager();
  const session = atom(sessionIdentity("user-a"));
  const unbind = manager.bindSession(session);
  unbind();
  Reflect.deleteProperty(session, "value");
  const rebound = manager.bindSession(session);
  assert.equal(manager.getSnapshot().generation, 0);
  session.set(sessionIdentity("user-a"));
  assert.equal(manager.getSnapshot().generation, 0);
  rebound();
  manager.getSnapshot().client.clear();
});

test("same-user refreshes and transient refresh failures keep the current cache", () => {
  const manager = createQueryClientManager();
  const initial = manager.getSnapshot();
  const session = atom(sessionIdentity("user-a"));
  const unbind = manager.bindSession(session);
  let changes = 0;
  const unsubscribe = manager.subscribe(() => { changes += 1; });
  initial.client.setQueryData(["tunnels", "org-a"], [{ id: "tunnel-a" }]);
  session.set(sessionIdentity("user-a", false, true));
  session.set(sessionIdentity(null, false, false, new Error("Network offline")));
  session.set(sessionIdentity("user-a"));
  assert.equal(manager.getSnapshot(), initial);
  assert.equal(changes, 0);
  assert.deepEqual(initial.client.getQueryData(["tunnels", "org-a"]), [{ id: "tunnel-a" }]);
  unsubscribe();
  unbind();
  initial.client.clear();
});

test("account changes replace the client and generation so remounted observers have no old-user data", () => {
  const manager = createQueryClientManager();
  const previous = manager.getSnapshot();
  const session = atom(sessionIdentity("user-a"));
  const unbind = manager.bindSession(session);
  const key = ["stats", "overview", "org-a"];
  previous.client.setQueryData(key, { private: "user-a" });
  const oldObserver = new QueryObserver(previous.client, { queryKey: key, enabled: false });
  const stopOldObserver = oldObserver.subscribe(() => {});
  assert.deepEqual(oldObserver.getCurrentResult().data, { private: "user-a" });
  let changes = 0;
  const unsubscribe = manager.subscribe(() => { changes += 1; });

  session.set(sessionIdentity("user-b", false, true));
  assert.equal(manager.getSnapshot(), previous, "pending account changes do not rotate early");
  session.set(sessionIdentity("user-b"));
  const current = manager.getSnapshot();
  assert.notEqual(current.client, previous.client);
  assert.equal(current.generation, previous.generation + 1);
  assert.equal(current.client.getQueryData(key), undefined);
  assert.equal(previous.client.getQueryData(key), undefined);
  const newObserver = new QueryObserver(current.client, { queryKey: key, enabled: false });
  assert.equal(newObserver.getCurrentResult().data, undefined);
  assert.equal(changes, 1);

  // Old in-flight mutation callbacks still hold their original client.
  previous.client.setQueryData(key, { private: "late-user-a" });
  assert.equal(current.client.getQueryData(key), undefined);
  stopOldObserver();
  newObserver.destroy();
  unsubscribe();
  unbind();
  previous.client.clear();
  current.client.clear();
});

test("logout and a later login each receive an empty account-bound cache", () => {
  const manager = createQueryClientManager();
  const session = atom(sessionIdentity("user-a"));
  const unbind = manager.bindSession(session);
  const initial = manager.getSnapshot();
  initial.client.setQueryData(["subscription", "org-a"], { plan: "pro" });
  session.set(sessionIdentity(null));
  const loggedOut = manager.getSnapshot();
  assert.equal(loggedOut.generation, 1);
  assert.notEqual(loggedOut.client, initial.client);
  assert.equal(loggedOut.client.getQueryData(["subscription", "org-a"]), undefined);
  session.set(sessionIdentity("user-b"));
  assert.equal(manager.getSnapshot().generation, 2);
  assert.notEqual(manager.getSnapshot().client, loggedOut.client);
  unbind();
  manager.getSnapshot().client.clear();
});

test("identity rotation aborts outstanding queries instead of allowing stale results into the new cache", async () => {
  const manager = createQueryClientManager();
  const session = atom(sessionIdentity("user-a"));
  const unbind = manager.bindSession(session);
  const previous = manager.getSnapshot().client;
  let aborted = false;
  const pending = previous.fetchQuery({
    queryKey: ["tunnels", "org-a"],
    queryFn: ({ signal }) => new Promise<string>((resolve) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        resolve("obsolete private data");
      }, { once: true });
    }),
  });
  session.set(sessionIdentity("user-b"));
  await assert.rejects(pending, (error) => isCancelledError(error));
  assert.equal(aborted, true);
  assert.equal(manager.getSnapshot().client.getQueryData(["tunnels", "org-a"]), undefined);
  unbind();
  manager.getSnapshot().client.clear();
});

test("identity bindings safely detach and rebind without losing identity changes", () => {
  const manager = createQueryClientManager();
  const session = atom(sessionIdentity("user-a"));
  const oldUnbind = manager.bindSession(session);
  const currentUnbind = manager.bindSession(session);
  oldUnbind();
  session.set(sessionIdentity("user-b"));
  assert.equal(manager.getSnapshot().generation, 1);
  currentUnbind();
  currentUnbind();
  session.set(sessionIdentity("user-c"));
  assert.equal(manager.getSnapshot().generation, 1, "detached stores are not observed");
  const rebound = manager.bindSession(session);
  assert.equal(manager.getSnapshot().generation, 2, "rebind checks the current identity synchronously");
  session.set(sessionIdentity("user-c", false, true));
  session.set(sessionIdentity("user-c"));
  assert.equal(manager.getSnapshot().generation, 2);
  rebound();
  manager.getSnapshot().client.clear();
});
