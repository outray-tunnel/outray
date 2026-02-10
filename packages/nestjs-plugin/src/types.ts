import { OutrayClientOptions } from "@outray/core";

export interface OutrayPluginOptions extends Partial<Omit<OutrayClientOptions, "localPort" | "onTunnelReady" | "onError" | "onReconnecting" | "onClose">> {
    /**
     * The port the NestJS application is running on.
     * If not provided, the plugin will attempt to resolve it from the NestJS app.
     */
    port?: number | string;

    /**
     * Whether to enable the tunnel.
     * Defaults to true if NODE_ENV is not 'production'.
     */
    enabled?: boolean;

    /**
     * Whether to suppress console output.
     * Defaults to false.
     */
    silent?: boolean;

    /**
     * Enable local network access via mDNS (.local domain)
     * Allows devices on the same LAN to access the dev server
     * @default false
     */
    local?: boolean;

    // Event callbacks
    onTunnelReady?: (url: string) => void;
    onLocalReady?: (info: { hostname: string; ip: string; httpUrl?: string; httpsUrl?: string }) => void;
    onError?: (error: Error) => void;
    onReconnecting?: () => void;
    onClose?: () => void;
}
