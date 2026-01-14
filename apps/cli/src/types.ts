export type TunnelProtocol = "http" | "tcp" | "udp";

export interface OpenTunnelMessage {
  type: "open_tunnel";
  subdomain?: string | null;
  customDomain?: string | null;
  apiKey?: string;
  forceTakeover?: boolean;
  protocol?: TunnelProtocol;
  remotePort?: number; // For TCP/UDP: the port to expose on the server
  ipAllowlist?: string[]; // List of allowed IPs or CIDR ranges
}

export interface TunnelOpenedMessage {
  type: "tunnel_opened";
  url: string;
  protocol?: TunnelProtocol;
  port?: number; // For TCP/UDP: the assigned port on the server
}

// TCP/UDP specific messages
export interface TCPConnectionMessage {
  type: "tcp_connection";
  connectionId: string;
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

export interface UDPDataMessage {
  type: "udp_data";
  packetId: string;
  sourceAddress: string;
  sourcePort: number;
  data: string; // base64 encoded
}

export interface UDPResponseMessage {
  type: "udp_response";
  packetId: string;
  targetAddress: string;
  targetPort: number;
  data: string; // base64 encoded
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
  | TCPConnectionMessage
  | TCPDataMessage
  | TCPCloseMessage
  | UDPDataMessage
  | ErrorMessage;
export type ClientMessage =
  | OpenTunnelMessage
  | TunnelResponseMessage
  | TCPDataMessage
  | TCPCloseMessage
  | UDPResponseMessage;
