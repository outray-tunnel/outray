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
  subscriptionsEnabled?: boolean;
  customDomain?: string | null;
}

export type UptimeSubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export interface UptimeSubscriber {
  id: string;
  email: string;
  status: UptimeSubscriberStatus;
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  lastSentAt: string | null;
}

export interface UptimeSubscribersResponse {
  subscribers: UptimeSubscriber[];
  counts: Record<"all" | UptimeSubscriberStatus, number>;
  nextCursor: string | null;
  subscriptionsEnabled: boolean;
}

export interface UptimeIncident {
  id: string;
  title: string;
  publicTitle?: string | null;
  publicImpact?: "degraded" | "outage" | null;
  recoveryConfirmed?: boolean;
  status: "open" | "resolved";
  sourceType?: "uptime_manual" | "uptime_monitor" | "observability_alert";
  uptimePublicationState?: "detected" | "published" | "ignored" | null;
  uptimePublishedAt?: string | null;
  sourceId?: string;
  sourceSnapshot?: { affectedComponents?: Array<{ id: string; name: string }>; monitorName?: string; alertName?: string; service?: string; environment?: string | null };
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
  pages?: Array<Pick<UptimePage, "id" | "name" | "slug" | "published">>;
  limit?: number;
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
  observabilitySource?: {
    alertId: string;
    alertName: string;
    service: string | null;
    environment: string | null;
    alertAvailable: boolean;
    impact: "degraded" | "outage" | null;
    recoveryConfirmed: boolean;
    publicTitle: string | null;
  } | null;
  notifications: Array<{
    id: string; event: string; channel: string; status: string; attempts: number;
    lastError: string | null; sentAt: string | null; createdAt: string;
  }>;
}

export class UptimeRequestError extends Error {
  field?: string;
  code?: string;
  status: number;

  constructor(message: string, status: number, field?: string, code?: string) {
    super(message);
    this.name = "UptimeRequestError";
    this.status = status;
    this.field = field;
    this.code = code;
  }
}

export function uptimeApiPath(orgSlug: string, path = "") {
  return `/api/${encodeURIComponent(orgSlug)}/uptime${path}`;
}

export function statusPagePath(path: string, pageId: string) {
  const [pathname, search] = path.split("?", 2);
  const params = new URLSearchParams(search || "");
  params.set("pageId", pageId);
  return `${pathname}?${params.toString()}`;
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
  const payload = await response.json().catch(() => null) as (T & { error?: string; field?: string; code?: string }) | null;
  if (!response.ok) throw new UptimeRequestError(payload?.error || `Request failed (${response.status})`, response.status, payload?.field, payload?.code);
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
