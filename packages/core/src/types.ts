/**
 * Tunnel protocol types - HTTP
 */
export type TunnelProtocol = "http" | "tcp" | "udp";

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Options for creating an OutrayClient instance
 */
export interface OutrayClientOptions {
  /**
   * Local port to proxy requests to
   */
  localPort: number;

  /**
   * Outray server WebSocket URL
   * @default 'wss://api.outray.dev/'
   */
  serverUrl?: string;

  /**
   * API key for authentication
   */
  apiKey?: string;

  /**
   * Subdomain to use for the tunnel URL
   * Requires authentication
   */
  subdomain?: string;

  /**
   * Custom domain for the tunnel
   * Must be configured in the Outray dashboard first
   */
  customDomain?: string;

  /**
   * Tunnel protocol type
   * @default 'http'
   */
  protocol?: TunnelProtocol;

  /**
   * Remote port for TCP/UDP tunnels
   */
  remotePort?: number;

  /**
   * Callback fired when tunnel is successfully established
   */
  onTunnelReady?: (url: string, port?: number) => void;

  /**
   * Callback fired when tunnel encounters an error
   */
  onError?: (error: Error, code?: string) => void;

  /**
   * Callback fired when tunnel is closed
   */
  onClose?: (reason?: string) => void;

  /**
   * Callback fired when attempting to reconnect
   */
  onReconnecting?: (attempt: number, delay: number) => void;

  /**
   * Callback fired for each proxied request (HTTP only)
   */
  onRequest?: (info: RequestInfo) => void;

  /**
   * Shadow traffic options (HTTP only)
   */
  shadow?: ShadowOptions;

  /**
   * Callback fired when shadow traffic differs from primary response
   */
  onShadowDiff?: (result: ShadowDiffResult) => void;
}

/**
 * Information about a proxied request
 */
export interface RequestInfo {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  error?: string;
}

// ============================================================================
// Shadow Traffic
// ============================================================================

export interface ShadowTarget {
  host?: string;
  port: number;
  protocol?: "http" | "https";
}

export interface ShadowOptions {
  target: ShadowTarget;
  enabled?: boolean;
  sampleRate?: number;
  timeoutMs?: number;
  maxBodyBytes?: number;
  compareHeaders?: string[];
}

export interface ShadowResponseSummary {
  statusCode?: number;
  headers?: Record<string, string | string[]>;
  bodyHash?: string;
  bodyBytes?: number;
  durationMs?: number;
  error?: string;
  truncated?: boolean;
}

export interface ShadowDiffResult {
  requestId: string;
  method: string;
  path: string;
  primary: ShadowResponseSummary;
  shadow: ShadowResponseSummary;
  differences: {
    status: boolean;
    headers: string[];
    body: boolean;
  };
}

// ============================================================================
// Protocol Messages - Client to Server
// ============================================================================

export interface OpenTunnelMessage {
  type: "open_tunnel";
  subdomain?: string | null;
  customDomain?: string | null;
  apiKey?: string;
  forceTakeover?: boolean;
  protocol?: TunnelProtocol;
  remotePort?: number;
}

export interface TunnelResponseMessage {
  type: "response";
  requestId: string;
  statusCode: number;
  headers: Record<string, string | string[]>;
  body?: string;
}

export interface TCPDataMessage {
  type: "tcp_data";
  connectionId: string;
  data: string; // base64 encoded
}

export interface TCPCloseMessage {
  type: "tcp_close";
  connectionId: string;
}

export interface UDPResponseMessage {
  type: "udp_response";
  packetId: string;
  targetAddress: string;
  targetPort: number;
  data: string; // base64 encoded
}

export type ClientMessage =
  | OpenTunnelMessage
  | TunnelResponseMessage
  | TCPDataMessage
  | TCPCloseMessage
  | UDPResponseMessage;

// ============================================================================
// Protocol Messages - Server to Client
// ============================================================================

export interface TunnelOpenedMessage {
  type: "tunnel_opened";
  url: string;
  protocol?: TunnelProtocol;
  port?: number;
}

export interface TunnelDataMessage {
  type: "request";
  requestId: string;
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  body?: string;
}

export interface TCPConnectionMessage {
  type: "tcp_connection";
  connectionId: string;
}

export interface TCPIncomingDataMessage {
  type: "tcp_data";
  connectionId: string;
  data: string; // base64 encoded
}

export interface TCPIncomingCloseMessage {
  type: "tcp_close";
  connectionId: string;
}

export interface UDPDataMessage {
  type: "udp_data";
  packetId: string;
  sourceAddress: string;
  sourcePort: number;
  data: string; // base64 encoded
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage =
  | TunnelOpenedMessage
  | TunnelDataMessage
  | TCPConnectionMessage
  | TCPIncomingDataMessage
  | TCPIncomingCloseMessage
  | UDPDataMessage
  | ErrorMessage;

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  SUBDOMAIN_IN_USE: "SUBDOMAIN_IN_USE",
  AUTH_FAILED: "AUTH_FAILED",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",
  INVALID_SUBDOMAIN: "INVALID_SUBDOMAIN",
  CUSTOM_DOMAIN_NOT_CONFIGURED: "CUSTOM_DOMAIN_NOT_CONFIGURED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
