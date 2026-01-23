import type { Plugin } from "vite";

/**
 * Configuration options for the Outray Vite plugin
 */
export interface OutrayPluginOptions {
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
   * API key for authentication
   * Can also be set via OUTRAY_API_KEY environment variable
   * @default process.env.OUTRAY_API_KEY
   */
  apiKey?: string;

  /**
   * Outray server WebSocket URL
   * @default 'wss://api.outray.dev/'
   */
  serverUrl?: string;

  /**
   * Enable or disable the tunnel
   * Useful for conditionally enabling in certain environments
   * @default process.env.OUTRAY_ENABLED !== "false"
   */
  enabled?: boolean;

  /**
   * Suppress tunnel status logs
   * @default false
   */
  silent?: boolean;

  /**
   * Callback fired when tunnel is successfully established
   */
  onTunnelReady?: (url: string) => void;

  /**
   * Callback fired when tunnel encounters an error
   */
  onError?: (error: Error) => void;

  /**
   * Callback fired when tunnel connection is closed
   */
  onClose?: () => void;

  /**
   * Callback fired when tunnel is attempting to reconnect
   */
  onReconnecting?: () => void;
}

/**
 * Options for the OutrayClient
 */
export interface OutrayClientOptions {
  localPort: number;
  serverUrl: string;
  apiKey?: string;
  subdomain?: string;
  customDomain?: string;
  silent?: boolean;
  onTunnelReady?: (url: string) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onReconnecting?: () => void;
}

// Protocol message types

export type TunnelProtocol = "http" | "tcp" | "udp";

export interface OpenTunnelMessage {
  type: "open_tunnel";
  subdomain?: string | null;
  customDomain?: string | null;
  apiKey?: string;
  forceTakeover?: boolean;
  protocol?: TunnelProtocol;
  remotePort?: number;
}

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

export interface TunnelResponseMessage {
  type: "response";
  requestId: string;
  statusCode: number;
  headers: Record<string, string | string[]>;
  body?: string;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage =
  | TunnelOpenedMessage
  | TunnelDataMessage
  | ErrorMessage;

export type ClientMessage = OpenTunnelMessage | TunnelResponseMessage;
