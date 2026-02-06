import type { ShadowOptions } from "@outray/core";

/**
 * Configuration options for the Outray Next.js plugin
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

  /**
   * Shadow traffic options (HTTP only)
   */
  shadow?: ShadowOptions;
}
