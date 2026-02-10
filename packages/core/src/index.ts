// Core client
export { OutrayClient } from "./client";

// mDNS / Local access
export {
  MDNSAdvertiser,
  LocalProxy,
  LocalHttpsProxy,
  LocalAccessManager,
} from "./mdns";
export type { LocalAccessInfo } from "./mdns";

// Protocol utilities
export { encodeMessage, decodeMessage } from "./protocol";

// Types
export type {
  // Client options
  OutrayClientOptions,
  RequestInfo,
  TunnelProtocol,
  // Protocol messages
  ClientMessage,
  ServerMessage,
  OpenTunnelMessage,
  TunnelOpenedMessage,
  TunnelDataMessage,
  TunnelResponseMessage,
  TCPConnectionMessage,
  TCPDataMessage,
  TCPCloseMessage,
  TCPIncomingDataMessage,
  TCPIncomingCloseMessage,
  UDPDataMessage,
  UDPResponseMessage,
  ErrorMessage,
  ErrorCode,
} from "./types";

// Error codes constant
export { ErrorCodes } from "./types";
