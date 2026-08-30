import { parse, type Type } from "protobufjs";

// The wire-compatible subset of opentelemetry-proto v1.7.0 required by the
// traces, logs, and metrics Export services. Unknown future fields are ignored.
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

message ResourceLogs {
  Resource resource = 1;
  repeated ScopeLogs scope_logs = 2;
  string schema_url = 3;
}
message ScopeLogs {
  InstrumentationScope scope = 1;
  repeated LogRecord log_records = 2;
  string schema_url = 3;
}
message LogRecord {
  fixed64 time_unix_nano = 1;
  uint32 severity_number = 2;
  string severity_text = 3;
  AnyValue body = 5;
  repeated KeyValue attributes = 6;
  uint32 dropped_attributes_count = 7;
  fixed32 flags = 8;
  bytes trace_id = 9;
  bytes span_id = 10;
  fixed64 observed_time_unix_nano = 11;
  string event_name = 12;
}
message ExportLogsServiceRequest {
  repeated ResourceLogs resource_logs = 1;
}
message ExportLogsServiceResponse {
  ExportLogsPartialSuccess partial_success = 1;
}
message ExportLogsPartialSuccess {
  int64 rejected_log_records = 1;
  string error_message = 2;
}

message ResourceMetrics {
  Resource resource = 1;
  repeated ScopeMetrics scope_metrics = 2;
  string schema_url = 3;
}
message ScopeMetrics {
  InstrumentationScope scope = 1;
  repeated Metric metrics = 2;
  string schema_url = 3;
}
message Metric {
  string name = 1;
  string description = 2;
  string unit = 3;
  oneof data {
    Gauge gauge = 5;
    Sum sum = 7;
    Histogram histogram = 9;
    ExponentialHistogram exponential_histogram = 10;
    Summary summary = 11;
  }
  repeated KeyValue metadata = 12;
}
message Gauge { repeated NumberDataPoint data_points = 1; }
message Sum {
  repeated NumberDataPoint data_points = 1;
  AggregationTemporality aggregation_temporality = 2;
  bool is_monotonic = 3;
}
message Histogram {
  repeated HistogramDataPoint data_points = 1;
  AggregationTemporality aggregation_temporality = 2;
}
message ExponentialHistogram {
  repeated ExponentialHistogramDataPoint data_points = 1;
  AggregationTemporality aggregation_temporality = 2;
}
message Summary { repeated SummaryDataPoint data_points = 1; }
enum AggregationTemporality {
  AGGREGATION_TEMPORALITY_UNSPECIFIED = 0;
  AGGREGATION_TEMPORALITY_DELTA = 1;
  AGGREGATION_TEMPORALITY_CUMULATIVE = 2;
}
message NumberDataPoint {
  repeated KeyValue attributes = 7;
  fixed64 start_time_unix_nano = 2;
  fixed64 time_unix_nano = 3;
  oneof value {
    double as_double = 4;
    sfixed64 as_int = 6;
  }
  repeated Exemplar exemplars = 5;
  uint32 flags = 8;
}
message HistogramDataPoint {
  repeated KeyValue attributes = 9;
  fixed64 start_time_unix_nano = 2;
  fixed64 time_unix_nano = 3;
  fixed64 count = 4;
  optional double sum = 5;
  repeated fixed64 bucket_counts = 6;
  repeated double explicit_bounds = 7;
  repeated Exemplar exemplars = 8;
  uint32 flags = 10;
  optional double min = 11;
  optional double max = 12;
}
message ExponentialHistogramDataPoint {
  repeated KeyValue attributes = 1;
  fixed64 start_time_unix_nano = 2;
  fixed64 time_unix_nano = 3;
  fixed64 count = 4;
  optional double sum = 5;
  sint32 scale = 6;
  fixed64 zero_count = 7;
  Buckets positive = 8;
  Buckets negative = 9;
  uint32 flags = 10;
  repeated Exemplar exemplars = 11;
  optional double min = 12;
  optional double max = 13;
  double zero_threshold = 14;

  message Buckets {
    sint32 offset = 1;
    repeated uint64 bucket_counts = 2;
  }
}
message SummaryDataPoint {
  repeated KeyValue attributes = 7;
  fixed64 start_time_unix_nano = 2;
  fixed64 time_unix_nano = 3;
  fixed64 count = 4;
  double sum = 5;
  repeated ValueAtQuantile quantile_values = 6;
  uint32 flags = 8;

  message ValueAtQuantile {
    double quantile = 1;
    double value = 2;
  }
}
message Exemplar {
  repeated KeyValue filtered_attributes = 7;
  fixed64 time_unix_nano = 2;
  oneof value {
    double as_double = 3;
    sfixed64 as_int = 6;
  }
  bytes span_id = 4;
  bytes trace_id = 5;
}
message ExportMetricsServiceRequest {
  repeated ResourceMetrics resource_metrics = 1;
}
message ExportMetricsServiceResponse {
  ExportMetricsPartialSuccess partial_success = 1;
}
message ExportMetricsPartialSuccess {
  int64 rejected_data_points = 1;
  string error_message = 2;
}
`;

const root = parse(schema, { keepCase: false }).root;
const requestType = root.lookupType("outray.otlp.ExportTraceServiceRequest");
const responseType = root.lookupType("outray.otlp.ExportTraceServiceResponse");
const logsRequestType = root.lookupType("outray.otlp.ExportLogsServiceRequest");
const logsResponseType = root.lookupType(
  "outray.otlp.ExportLogsServiceResponse",
);
const metricsRequestType = root.lookupType(
  "outray.otlp.ExportMetricsServiceRequest",
);
const metricsResponseType = root.lookupType(
  "outray.otlp.ExportMetricsServiceResponse",
);

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
    ? {
        partialSuccess: {
          rejectedSpans: String(rejectedSpans),
          errorMessage,
        },
      }
    : {};
  return responseType.encode(responseType.create(value)).finish();
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
  return logsResponseType.encode(logsResponseType.create(value)).finish();
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
  return metricsResponseType.encode(metricsResponseType.create(value)).finish();
}
