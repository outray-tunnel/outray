import type { ClientMessage, ServerMessage } from "./types";

/**
 * Encode a client message to send to the server
 */
export function encodeMessage(message: ClientMessage): string {
  return JSON.stringify(message);
}

/**
 * Decode a server message received from the server
 */
export function decodeMessage(data: string): ServerMessage {
  return JSON.parse(data) as ServerMessage;
}
