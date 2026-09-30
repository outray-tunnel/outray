import { useCallback, useEffect, useState } from "react";

export type UptimeState = "unknown" | "up" | "down" | "operational" | "degraded" | "outage";

export interface UptimeMonitor {
  id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  hasHeaders?: boolean;
  expectedStatus: number | null;
  responseText: string | null;
  notificationEmails?: string[];
  enabled: boolean;
  state: UptimeState;
  lastCheckedAt: string | null;
  lastStateChangedAt?: string | null;
  createdAt: string;
}

export interface UptimeCheck {
  id: string;
  checkedAt: string;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorKind?: string | null;
}

export interface UptimeComponent {
  id: string;
  groupId: string | null;
  name: string;
  description: string | null;
  visible: boolean;
  sortOrder: number;
  monitorIds: string[];
  state: UptimeState;
  manualState?: UptimeState | null;
  manualUpdatedAt?: string | null;
}

export interface UptimeGroup {
  id: string;
  name: string;
  visible: boolean;
  sortOrder: number;
  components: UptimeComponent[];
}

export interface UptimePage {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  accentColor: string;
  logoUrl: string | null;
  published: boolean;
  customDomain?: string | null;
}

export interface UptimeIncident {
  id: string;
  title: string;
  status: string;
  sourceType?: string;
  startedAt?: string;
  resolvedAt?: string | null;
  createdAt?: string;
  componentIds?: string[];
  updates?: Array<{ id: string; note: string; status: string; publishedAt: string | null; componentStates?: Record<string, UptimeState>; createdAt: string }>;
}

export function uptimeApiPath(orgSlug: string, path = "") {
  return `/api/${encodeURIComponent(orgSlug)}/uptime${path}`;
}

export async function uptimeRequest<T>(orgSlug: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(uptimeApiPath(orgSlug, path), {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  if (!payload) throw new Error("The server returned an empty response.");
  return payload;
}

export function useUptimeResource<T>(orgSlug: string, path: string) {
  const key = `${orgSlug}:${path}`;
  const [result, setResult] = useState<{ key: string; data: T } | null>(null);
  const [status, setStatus] = useState<{ key: string; loading: boolean; error: string | null }>({ key, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    void uptimeRequest<T>(orgSlug, path, { signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setResult({ key, data: payload });
          setStatus({ key, loading: false, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setStatus({ key, loading: false, error: cause instanceof Error ? cause.message : "Could not load Uptime data." });
      });
    return () => controller.abort();
  }, [key, orgSlug, path, revision]);

  return {
    data: result?.key === key ? result.data : null,
    loading: status.key !== key || status.loading,
    error: status.key === key ? status.error : null,
    reload,
  };
}

export function formatTime(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}
