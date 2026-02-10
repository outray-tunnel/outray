/**
 * Configuration options for the Outray Express middleware
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
   * Enable local network access via mDNS (.local domain)
   * Allows devices on the same LAN to access the dev server
   * @default false
   */
  local?: boolean;

  /**
   * Callback fired when tunnel is successfully established
   */
  onTunnelReady?: (url: string) => void;

  /**
   * Callback fired when local access is available
   */
  onLocalReady?: (info: { hostname: string; ip: string; httpUrl?: string; httpsUrl?: string }) => void;

  /**
   * Callback fired when tunnel encounters an error
   */
  onError?: (error: Error) => void;

  /**
   * Callback fired when tunnel is reconnecting
   */
  onReconnecting?: () => void;

  /**
   * Callback fired when tunnel connection is closed
   */
  onClose?: () => void;
}
