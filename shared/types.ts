export interface HelloMessage {
  type: "hello";
  clientId: string;
  version: string;
}

export interface OpenTunnelMessage {
  type: "open_tunnel";
  subdomain?: string;
  apiKey?: string;
  forceTakeover?: boolean;
}

export interface TunnelOpenedMessage {
  type: "tunnel_opened";
  tunnelId: string;
  url: string;
}

export interface RequestMessage {
  type: "request";
  requestId: string;
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  body?: string;
}

export interface ResponseMessage {
  type: "response";
  requestId: string;
  statusCode: number;
  headers: Record<string, string | string[]>;
  body?: string;
}

export interface PingMessage {
  type: "ping";
}

export interface PongMessage {
  type: "pong";
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type Message =
  | HelloMessage
  | OpenTunnelMessage
  | TunnelOpenedMessage
  | RequestMessage
  | ResponseMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;
