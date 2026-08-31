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
  // WebSocket passthrough
  WSUpgradeMessage,
  WSUpgradeResponseMessage,
  WSFrameMessage,
  WSCloseMessage,
} from "./types";

// Error codes constant
export { ErrorCodes } from "./types";

// Safe, opt-in HTTP request/response payload capture for active OpenTelemetry spans
export {
  OUTRAY_HTTP_CAPTURE_ATTRIBUTES,
  captureFetchRequest,
  captureFetchResponse,
  createNodeHttpPayloadCaptureMiddleware,
  isHttpPayloadCaptureActive,
} from "./http-payload-capture";
export type {
  HttpPayloadCaptureOptions,
  HttpPayloadCaptureSetting,
  NodeHttpPayloadCaptureMiddleware,
} from "./http-payload-capture";
