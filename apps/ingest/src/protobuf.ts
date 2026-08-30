import { parse, type Type } from "protobufjs";

// The wire-compatible subset of opentelemetry-proto v1.7.0 required by the
// traces Export service. Unknown future fields are safely ignored by protobuf.
const schema = String.raw`
syntax = "proto3";

package outray.otlp;

message AnyValue {
  oneof value {
    string string_value = 1;
    bool bool_value = 2;
    int64 int_value = 3;
    double double_value = 4;
    ArrayValue array_value = 5;
    KeyValueList kvlist_value = 6;
    bytes bytes_value = 7;
  }
}
message ArrayValue { repeated AnyValue values = 1; }
message KeyValueList { repeated KeyValue values = 1; }
message KeyValue { string key = 1; AnyValue value = 2; }
message InstrumentationScope {
  string name = 1;
  string version = 2;
  repeated KeyValue attributes = 3;
  uint32 dropped_attributes_count = 4;
}

message Resource {
  repeated KeyValue attributes = 1;
  uint32 dropped_attributes_count = 2;
}

message ResourceSpans {
  Resource resource = 1;
  repeated ScopeSpans scope_spans = 2;
  string schema_url = 3;
}
message ScopeSpans {
  InstrumentationScope scope = 1;
  repeated Span spans = 2;
  string schema_url = 3;
}
message Span {
  bytes trace_id = 1;
  bytes span_id = 2;
  string trace_state = 3;
  bytes parent_span_id = 4;
  string name = 5;
  SpanKind kind = 6;
  fixed64 start_time_unix_nano = 7;
  fixed64 end_time_unix_nano = 8;
  repeated KeyValue attributes = 9;
  uint32 dropped_attributes_count = 10;
  repeated Event events = 11;
  uint32 dropped_events_count = 12;
  repeated Link links = 13;
  uint32 dropped_links_count = 14;
  Status status = 15;
  fixed32 flags = 16;

  enum SpanKind {
    SPAN_KIND_UNSPECIFIED = 0;
    SPAN_KIND_INTERNAL = 1;
    SPAN_KIND_SERVER = 2;
    SPAN_KIND_CLIENT = 3;
    SPAN_KIND_PRODUCER = 4;
    SPAN_KIND_CONSUMER = 5;
  }
  message Event {
    fixed64 time_unix_nano = 1;
    string name = 2;
    repeated KeyValue attributes = 3;
    uint32 dropped_attributes_count = 4;
  }
  message Link {
    bytes trace_id = 1;
    bytes span_id = 2;
    string trace_state = 3;
    repeated KeyValue attributes = 4;
    uint32 dropped_attributes_count = 5;
    fixed32 flags = 6;
  }
}
message Status {
  string message = 2;
  StatusCode code = 3;
  enum StatusCode {
    STATUS_CODE_UNSET = 0;
    STATUS_CODE_OK = 1;
    STATUS_CODE_ERROR = 2;
  }
}

message ExportTraceServiceRequest {
  repeated ResourceSpans resource_spans = 1;
}
message ExportTraceServiceResponse {
  ExportTracePartialSuccess partial_success = 1;
}
message ExportTracePartialSuccess {
  int64 rejected_spans = 1;
  string error_message = 2;
}
`;

const root = parse(schema, { keepCase: false }).root;
const requestType = root.lookupType("outray.otlp.ExportTraceServiceRequest");
const responseType = root.lookupType("outray.otlp.ExportTraceServiceResponse");

function decode(type: Type, payload: Uint8Array): unknown {
  const message = type.decode(payload);
  return type.toObject(message, {
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

export function encodeTraceResponse(
  rejectedSpans: number,
  errorMessage: string,
): Uint8Array {
  const value = rejectedSpans
    ? {
        partialSuccess: {
          rejectedSpans: String(rejectedSpans),
          errorMessage,
        },
      }
    : {};
  return responseType.encode(responseType.create(value)).finish();
}
