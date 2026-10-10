import type { IConversionOptions } from "protobufjs/minimal.js";
import { outray } from "./proto/otlp.generated.js";

// These codecs are generated ahead of time. Loading reflection-based protobufjs
// would compile functions at runtime, which Cloudflare Workers does not allow.
// Source: ./proto/otlp.proto. Regenerate with npm run generate:protobuf.
const requestType = outray.otlp.ExportTraceServiceRequest;
const responseType = outray.otlp.ExportTraceServiceResponse;
const logsRequestType = outray.otlp.ExportLogsServiceRequest;
const logsResponseType = outray.otlp.ExportLogsServiceResponse;
const metricsRequestType = outray.otlp.ExportMetricsServiceRequest;
const metricsResponseType = outray.otlp.ExportMetricsServiceResponse;

function decode<T>(
  type: {
    decode(payload: Uint8Array): T;
    toObject(message: T, options?: IConversionOptions): Record<string, unknown>;
  },
  payload: Uint8Array,
): unknown {
  return type.toObject(type.decode(payload), {
    arrays: true,
    bytes: String,
    enums: Number,
    longs: String,
    objects: true,
  });
}

export function decodeTraceRequest(payload: Uint8Array): unknown {
  return decode(requestType, payload);
}

export function decodeLogsRequest(payload: Uint8Array): unknown {
  return decode(logsRequestType, payload);
}

export function decodeMetricsRequest(payload: Uint8Array): unknown {
  return decode(metricsRequestType, payload);
}

export function encodeTraceResponse(
  rejectedSpans: number,
  errorMessage: string,
): Uint8Array {
  const value = rejectedSpans
    ? { partialSuccess: { rejectedSpans: String(rejectedSpans), errorMessage } }
    : {};
  return responseType.encode(responseType.fromObject(value)).finish();
}

export function encodeLogsResponse(
  rejectedLogRecords: number,
  errorMessage: string,
): Uint8Array {
  const value = rejectedLogRecords
    ? {
        partialSuccess: {
          rejectedLogRecords: String(rejectedLogRecords),
          errorMessage,
        },
      }
    : {};
  return logsResponseType.encode(logsResponseType.fromObject(value)).finish();
}

export function encodeMetricsResponse(
  rejectedDataPoints: number,
  errorMessage: string,
): Uint8Array {
  const value = rejectedDataPoints
    ? {
        partialSuccess: {
          rejectedDataPoints: String(rejectedDataPoints),
          errorMessage,
        },
      }
    : {};
  return metricsResponseType
    .encode(metricsResponseType.fromObject(value))
    .finish();
}
