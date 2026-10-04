import { QueryClient } from "@tanstack/react-query";
import { onSet, type WritableAtom } from "nanostores";

const DASHBOARD_STALE_TIME_MS = 30_000;
const DASHBOARD_QUERY_PREFIXES = [
  "stats",
  "tunnelStats",
  "protocolStats",
  "tunnels",
  "tunnel",
  "subscription",
] as const;

export function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Permissions, secrets and unknown query families remain immediately stale.
        staleTime: 0,
      },
    },
  });

  for (const prefix of DASHBOARD_QUERY_PREFIXES) {
    queryClient.setQueryDefaults([prefix], {
      staleTime: DASHBOARD_STALE_TIME_MS,
    });
  }

  return queryClient;
}

interface SessionIdentitySnapshot {
  data: { user: { id: string } } | null;
  isPending: boolean;
  isRefetching?: boolean;
  error?: unknown;
}

interface QueryClientSnapshot {
  client: QueryClient;
  generation: number;
}

export function createQueryClientManager() {
  let snapshot: QueryClientSnapshot = {
    client: createQueryClient(),
    generation: 0,
  };
  let identity: string | null | undefined;
  let activeBinding: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const observeIdentity = (session: SessionIdentitySnapshot) => {
    // A refresh retains the current identity until its real result is known.
    // Transient transport errors are not evidence of another signed-in user.
    if (session.isPending || session.isRefetching || session.error) return;
    const nextIdentity = session.data?.user.id ?? null;
    if (identity === undefined) {
      identity = nextIdentity;
      return;
    }
    if (identity === nextIdentity) return;
    identity = nextIdentity;
    const previousClient = snapshot.client;
    snapshot = {
      client: createQueryClient(),
      generation: snapshot.generation + 1,
    };
    // Cancellation destroys in-flight queries. Rotation keeps late mutation
    // callbacks attached to the old client, never the new account's cache.
    previousClient.clear();
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    bindSession: (sessionStore: WritableAtom<SessionIdentitySnapshot>) => {
      activeBinding?.();
      // onSet does not mount the auth atom or start another session HTTP read.
      const removeHook = onSet(sessionStore, ({ newValue }) => observeIdentity(newValue));
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        removeHook();
      };
      activeBinding = stop;
      const currentSession = sessionStore.value;
      if (currentSession !== undefined) observeIdentity(currentSession);
      return () => {
        stop();
        if (activeBinding === stop) activeBinding = undefined;
      };
    },
  };
}

let browserQueryClientManager: ReturnType<typeof createQueryClientManager> | undefined;

function getBrowserQueryClientManager() {
  browserQueryClientManager ??= createQueryClientManager();
  return browserQueryClientManager;
}

export function getQueryClientSnapshot(): QueryClientSnapshot {
  if (typeof window === "undefined") {
    return { client: createQueryClient(), generation: 0 };
  }
  return getBrowserQueryClientManager().getSnapshot();
}

export function subscribeQueryClient(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  return getBrowserQueryClientManager().subscribe(listener);
}

export function bindQueryClientToSession(sessionStore: WritableAtom<SessionIdentitySnapshot>) {
  if (typeof window === "undefined") return () => {};
  return getBrowserQueryClientManager().bindSession(sessionStore);
}

export function getQueryClient() {
  // A server render must never reuse another request's organization cache.
  return getQueryClientSnapshot().client;
}
