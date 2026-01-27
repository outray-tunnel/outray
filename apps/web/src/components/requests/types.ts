export interface TunnelEvent {
  request_id?: string;
  timestamp: number;
  tunnel_id: string;
  organization_id: string;
  host: string;
  method: string;
  path: string;
  status_code: number;
  request_duration_ms: number;
  bytes_in: number;
  bytes_out: number;
  client_ip: string;
  user_agent: string;
}

export type TimeRange = "live" | "1h" | "24h" | "7d" | "30d";
export type InspectorTab = "request" | "response";

export interface RequestDetails {
  headers: Record<string, string | string[]>;
  queryParams: Record<string, string>;
  body: string | null;
}

export interface ResponseDetails {
  headers: Record<string, string | string[]>;
  body: string | null;
}

export interface RequestCapture {
  id: string;
  timestamp: string;
  tunnelId: string;
  request: {
    headers: Record<string, string | string[]>;
    body: string | null;
    bodySize: number;
  };
  response: {
    headers: Record<string, string | string[]>;
    body: string | null;
    bodySize: number;
  };
}
