// Core client
export { OutrayClient } from "./client";

// Protocol utilities
export { encodeMessage, decodeMessage } from "./protocol";

// Types
export type {
  // Client options
  OutrayClientOptions,
  RequestInfo,
  ShadowOptions,
  ShadowTarget,
  ShadowDiffResult,
  ShadowResponseSummary,
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
