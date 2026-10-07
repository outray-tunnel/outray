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
  failureThreshold: number;
  incidentPublishing: "manual" | "after_confirmation" | "automatic";
  publishAfterMinutes: number;
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
  status: "open" | "resolved";
  sourceType?: "uptime_manual" | "uptime_monitor";
  uptimePublicationState?: "detected" | "published" | "ignored" | null;
  uptimePublishedAt?: string | null;
  sourceId?: string;
  sourceSnapshot?: { affectedComponents?: Array<{ id: string; name: string }>; monitorName?: string };
  startedAt?: string;
  resolvedAt?: string | null;
  createdAt?: string;
  componentIds?: string[];
  updates?: UptimeIncidentUpdate[];
}

export type UptimeIncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

export interface UptimeIncidentUpdate {
  id: string;
  note: string;
  bodyJson?: import("@outray/incident-content").IncidentDocument | null;
  status: UptimeIncidentStatus;
  publishedAt: string | null;
  componentStates?: Record<string, UptimeState>;
  createdAt: string;
}

export interface UptimePageResponse {
  page: UptimePage | null;
  groups: UptimeGroup[];
  standaloneComponents: UptimeComponent[];
  canManage?: boolean;
}

export interface UptimeIncidentListResponse {
  incidents: UptimeIncident[];
  nextCursor: string | null;
  canManage: boolean;
}

export interface UptimeIncidentDetailResponse {
  incident: UptimeIncident;
  updates: UptimeIncidentUpdate[];
  componentIds: string[];
  canManage: boolean;
  monitorAvailable: boolean;
  notifications: Array<{
    id: string; event: string; channel: string; status: string; attempts: number;
    lastError: string | null; sentAt: string | null; createdAt: string;
  }>;
}

export class UptimeRequestError extends Error {
  field?: string;
  status: number;

  constructor(message: string, status: number, field?: string) {
    super(message);
    this.name = "UptimeRequestError";
    this.status = status;
    this.field = field;
  }
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
  const payload = await response.json().catch(() => null) as (T & { error?: string; field?: string }) | null;
  if (!response.ok) throw new UptimeRequestError(payload?.error || `Request failed (${response.status})`, response.status, payload?.field);
  if (!payload) throw new Error("The server returned an empty response.");
  return payload;
}

export function useUptimeResource<T>(orgSlug: string, path: string) {
  const key = `${orgSlug}:${path}`;
  const [result, setResult] = useState<{ key: string; data: T } | null>(null);
  const [status, setStatus] = useState<{ key: string; revision: number; loading: boolean; error: string | null }>({ key, revision: 0, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    void uptimeRequest<T>(orgSlug, path, { signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setResult({ key, data: payload });
          setStatus({ key, revision, loading: false, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setStatus({ key, revision, loading: false, error: cause instanceof Error ? cause.message : "Could not load Uptime data." });
      });
    return () => controller.abort();
  }, [key, orgSlug, path, revision]);

  return {
    data: result?.key === key ? result.data : null,
    loading: status.key !== key || status.revision !== revision || status.loading,
    error: status.key === key && status.revision === revision ? status.error : null,
    reload,
  };
}

export function formatTime(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}
