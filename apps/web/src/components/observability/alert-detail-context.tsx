import { createContext, useContext } from "react";
import type { AlertRecord, AlertState } from "@/routes/$orgSlug/observability/alerts";

export interface AlertEvaluation {
  id: string;
  value: number | null;
  state?: AlertState | string;
  status?: string;
  resultingState?: AlertState | string;
  previousState?: AlertState | string | null;
  sampleCount?: number;
  message?: string | null;
  error?: string | null;
  evaluatedAt?: string;
  createdAt?: string;
  timestamp?: string;
}

export interface AlertIncident {
  id: string;
  status: "open" | "resolved" | string;
  startedAt?: string;
  openedAt?: string;
  createdAt?: string;
  resolvedAt?: string | null;
  triggerValue?: number | null;
  resolvedValue?: number | null;
  lastValue?: number | null;
}

export interface AlertNotification {
  id: string;
  channel?: string;
  type?: string;
  destination?: string;
  recipient?: string;
  status: string;
  sentAt?: string | null;
  createdAt?: string;
  error?: string | null;
  lastError?: string | null;
}

export interface AlertDetailsResponse {
  alert: AlertRecord;
  evaluations: AlertEvaluation[];
  incidents: AlertIncident[];
  notifications: AlertNotification[];
}

export const AlertDetailContext = createContext<{
  data: AlertDetailsResponse;
  refreshing: boolean;
} | null>(null);

export function useAlertDetail() {
  const context = useContext(AlertDetailContext);
  if (!context) throw new Error("Alert detail tabs require the alert layout");
  return context;
}
