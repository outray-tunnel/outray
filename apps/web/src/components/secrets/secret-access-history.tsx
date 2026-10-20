import { useCallback, useEffect, useRef, useState } from "react";
import { secretsClient, type SecretAuditEvent, type SecretEnvironment, type SecretMetadata } from "@/lib/secrets-client";
import { SecretAccessHistoryContent } from "./secret-access-history-content";

export interface SecretAccessHistoryProps {
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  secret: SecretMetadata;
}

export function SecretAccessHistory(props: SecretAccessHistoryProps) {
  const scope = JSON.stringify([props.orgSlug, props.projectSlug, props.environment.id, props.environment.slug, props.secret.id]);
  return <SecretAccessHistorySession key={scope} {...props} />;
}

export function SecretAccessHistorySession({ orgSlug, projectSlug, environment, secret }: SecretAccessHistoryProps) {
  const [events, setEvents] = useState<SecretAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const active = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const loadedCursors = useRef(new Set<string>());

  const load = useCallback(async (cursor: string | null) => {
    if (!active.current || pending.current || (cursor !== null && loadedCursors.current.has(cursor))) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const page = await secretsClient.secretAccessHistory(orgSlug, projectSlug, environment.slug, secret.id, cursor, controller.signal);
      if (!active.current || controller.signal.aborted || pending.current !== controller) return;
      if (cursor !== null) loadedCursors.current.add(cursor);
      setEvents((previous) => {
        const seen = new Set(previous.map((event) => event.id));
        return [...previous, ...page.events.filter((event) => {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          return true;
        })];
      });
      // A repeated cursor must not offer an endless loop of the same page.
      setNextCursor(page.nextCursor && !loadedCursors.current.has(page.nextCursor) ? page.nextCursor : null);
    } catch (cause) {
      if (!active.current || controller.signal.aborted || pending.current !== controller) return;
      const forbidden = typeof cause === "object" && cause !== null && "status" in cause && cause.status === 403;
      setDenied(forbidden);
      setError(forbidden ? "You don’t have permission to view access history for this secret." : cause instanceof Error ? cause.message : "Couldn’t load access history. Try again.");
    } finally {
      if (active.current && !controller.signal.aborted && pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, [orgSlug, projectSlug, environment.slug, secret.id]);

  useEffect(() => {
    active.current = true;
    void load(null);
    return () => {
      active.current = false;
      pending.current?.abort();
      pending.current = null;
    };
  }, [load]);

  return <SecretAccessHistoryContent events={events} loading={loading} error={error} denied={denied} hasMore={nextCursor !== null} onLoadMore={() => void load(nextCursor)} onRetry={() => void load(events.length ? nextCursor : null)} />;
}
