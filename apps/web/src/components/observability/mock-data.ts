export type ServiceHealth = "healthy" | "degraded" | "critical";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ObservabilityService {
  id: string;
  name: string;
  runtime: string;
  environment: string;
  region: string;
  health: ServiceHealth;
  requestsPerMinute: number;
  errorRate: number;
  p95: number;
  deploy: string;
  version: string;
}

export interface LogEvent {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  traceId: string;
  environment: string;
  attributes: Record<string, string>;
}

export interface TraceSpan {
  name: string;
  service: string;
  duration: number;
  offset: number;
  status: "ok" | "error";
}

export interface TraceEvent {
  id: string;
  name: string;
  rootService: string;
  startedAt: string;
  duration: number;
  spanCount: number;
  status: "ok" | "error";
  method: string;
  spans: TraceSpan[];
}

export type RequestCaptureState = "full" | "metadata" | "redacted";

export interface ApiRequestEvent {
  id: string;
  timestamp: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  route: string;
  path: string;
  service: string;
  environment: string;
  region: string;
  statusCode: number;
  duration: number;
  traceId: string;
  spanId: string;
  clientAddress: string;
  userAgent: string;
  protocol: string;
  captureState: RequestCaptureState;
  request: {
    headers: Record<string, string>;
    query: Record<string, string>;
    body: string | null;
    size: number;
  };
  response: {
    headers: Record<string, string>;
    body: string | null;
    size: number;
  };
}

export const trafficTrend = [
  34, 38, 36, 43, 46, 44, 51, 55, 53, 61, 58, 64, 68, 65, 72, 74, 78, 73,
  81, 87, 83, 89, 94, 91,
];

export const latencyTrend = [
  312, 326, 298, 341, 355, 337, 371, 392, 364, 418, 401, 439, 466, 421, 452,
  486, 471, 448, 462, 497, 480, 459, 486, 472,
];

export const errorTrend = [
  0.42, 0.37, 0.51, 0.48, 0.62, 0.55, 0.71, 0.64, 0.58, 0.81, 0.76, 0.69,
  0.74, 0.83, 0.79, 0.68, 0.72, 0.91, 0.86, 0.78, 0.73, 0.69, 0.76, 0.73,
];

export const apiRequests: ApiRequestEvent[] = [
  {
    id: "req_01JY7Q4G8JZ9N3ME5F2A1K6T8V",
    timestamp: "09:51:42.118",
    method: "POST",
    route: "/v1/checkout",
    path: "/v1/checkout?expand=payment",
    service: "api-gateway",
    environment: "production",
    region: "fra1",
    statusCode: 502,
    duration: 1248,
    traceId: "7f2b190d4eb6426a",
    spanId: "a98c4ef15079d6b2",
    clientAddress: "197.210.84.16",
    userAgent: "OutRay SDK/1.4.2",
    protocol: "HTTP/2",
    captureState: "redacted",
    request: {
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_01JY7Q4G8JZ9N3ME5F2A1K6T8V",
        authorization: "[REDACTED]",
        "user-agent": "OutRay SDK/1.4.2",
      },
      query: { expand: "payment" },
      body: JSON.stringify({ order_id: "ord_89214", payment_method: "card", card_token: "[REDACTED]", save_method: false }),
      size: 184,
    },
    response: {
      headers: { "content-type": "application/json; charset=utf-8", "x-request-id": "req_01JY7Q4G8JZ9N3ME5F2A1K6T8V", "cache-control": "no-store" },
      body: JSON.stringify({ error: { code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "Payment authorization failed", retryable: true } }),
      size: 126,
    },
  },
  {
    id: "req_01JY7Q4E94WY0X6N3Q8R2K1H5C",
    timestamp: "09:51:39.587",
    method: "POST",
    route: "/v1/orders",
    path: "/v1/orders",
    service: "api-gateway",
    environment: "production",
    region: "fra1",
    statusCode: 201,
    duration: 184,
    traceId: "d9a814270f2346f3",
    spanId: "9d3f74a62c801be5",
    clientAddress: "102.89.47.203",
    userAgent: "Mozilla/5.0",
    protocol: "HTTP/2",
    captureState: "full",
    request: {
      headers: { "content-type": "application/json", "x-request-id": "req_01JY7Q4E94WY0X6N3Q8R2K1H5C", authorization: "[REDACTED]", origin: "https://app.example.com" },
      query: {},
      body: JSON.stringify({ cart_id: "cart_4912", currency: "NGN", shipping_address_id: "addr_1294" }),
      size: 142,
    },
    response: {
      headers: { "content-type": "application/json; charset=utf-8", location: "/v1/orders/ord_89214", "x-request-id": "req_01JY7Q4E94WY0X6N3Q8R2K1H5C" },
      body: JSON.stringify({ id: "ord_89214", status: "pending_payment", total: 28400, currency: "NGN", created_at: "2026-08-29T09:51:39.742Z" }),
      size: 196,
    },
  },
  {
    id: "req_01JY7Q4C2AXF9DV8Z4M1P6R3WB",
    timestamp: "09:51:36.800",
    method: "GET",
    route: "/checkout",
    path: "/checkout",
    service: "web-app",
    environment: "production",
    region: "global",
    statusCode: 200,
    duration: 242,
    traceId: "c730247a7d72453c",
    spanId: "29f1b7ca36e480d2",
    clientAddress: "41.58.214.92",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    protocol: "HTTP/2",
    captureState: "metadata",
    request: { headers: { accept: "text/html", "user-agent": "Mozilla/5.0", cookie: "[REDACTED]" }, query: {}, body: null, size: 0 },
    response: { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-cache" }, body: null, size: 18472 },
  },
  {
    id: "req_01JY7Q49J8C2K5A7H1P3M6VX0N",
    timestamp: "09:51:34.091",
    method: "POST",
    route: "/internal/payments/settle",
    path: "/internal/payments/settle",
    service: "worker-payments",
    environment: "production",
    region: "fra1",
    statusCode: 500,
    duration: 1820,
    traceId: "a421ba83477b45c5",
    spanId: "c8a920ed4f31b675",
    clientAddress: "10.24.8.19",
    userAgent: "worker-payments/1.9.4",
    protocol: "HTTP/1.1",
    captureState: "full",
    request: {
      headers: { "content-type": "application/json", "x-internal-secret": "[REDACTED]", "x-attempt": "2" },
      query: {},
      body: JSON.stringify({ payment_id: "pay_720184", ledger_account: "acct_4982", amount: 28400, currency: "NGN" }),
      size: 154,
    },
    response: {
      headers: { "content-type": "application/json", "x-retry-after": "30" },
      body: JSON.stringify({ error: "serialization_failure", transaction_id: "txn_340192", retryable: true }),
      size: 104,
    },
  },
  {
    id: "req_01JY7Q46NX0C8H4S2V5D9M3K1A",
    timestamp: "09:51:31.550",
    method: "POST",
    route: "/v1/notifications/email",
    path: "/v1/notifications/email",
    service: "notifications",
    environment: "staging",
    region: "iad1",
    statusCode: 202,
    duration: 628,
    traceId: "59b792ea50254a20",
    spanId: "f41d73a908b2c65e",
    clientAddress: "10.42.1.84",
    userAgent: "checkout-api/1.31.0",
    protocol: "HTTP/2",
    captureState: "redacted",
    request: {
      headers: { "content-type": "application/json", authorization: "[REDACTED]" },
      query: {},
      body: JSON.stringify({ template: "receipt", recipient: "a***@example.com", variables: { order_id: "ord_89214", total: "NGN 28,400" } }),
      size: 238,
    },
    response: { headers: { "content-type": "application/json" }, body: JSON.stringify({ delivery_id: "del_819402", status: "accepted" }), size: 72 },
  },
  {
    id: "req_01JY7Q43TR6P8M1V5D2Z0A9K7C",
    timestamp: "09:51:29.312",
    method: "GET",
    route: "/v1/customers/:id",
    path: "/v1/customers/cus_48219?include=plan",
    service: "identity",
    environment: "production",
    region: "iad1",
    statusCode: 200,
    duration: 91,
    traceId: "18b3fc0c86f94870",
    spanId: "e2c74a96350b8f1d",
    clientAddress: "10.18.4.32",
    userAgent: "api-gateway/2.14.3",
    protocol: "HTTP/2",
    captureState: "metadata",
    request: { headers: { accept: "application/json", authorization: "[REDACTED]" }, query: { include: "plan" }, body: null, size: 0 },
    response: { headers: { "content-type": "application/json", "cache-control": "private, max-age=30" }, body: null, size: 892 },
  },
  {
    id: "req_01JY7Q40B5A2P9M8R1H6X3K4VN",
    timestamp: "09:51:26.844",
    method: "PATCH",
    route: "/v1/orders/:id",
    path: "/v1/orders/ord_89214",
    service: "checkout-api",
    environment: "production",
    region: "fra1",
    statusCode: 422,
    duration: 318,
    traceId: "8c9f121d30be4a67",
    spanId: "71a03e9482cf5bd6",
    clientAddress: "102.89.47.203",
    userAgent: "Mozilla/5.0",
    protocol: "HTTP/2",
    captureState: "full",
    request: { headers: { "content-type": "application/json", authorization: "[REDACTED]" }, query: {}, body: JSON.stringify({ status: "completed", delivery_reference: null }), size: 86 },
    response: { headers: { "content-type": "application/problem+json" }, body: JSON.stringify({ type: "validation_error", errors: [{ field: "delivery_reference", message: "Required when completing an order" }] }), size: 172 },
  },
  {
    id: "req_01JY7Q3X6N4V2Z8K1D5M9A0PRC",
    timestamp: "09:51:22.608",
    method: "DELETE",
    route: "/v1/sessions/:id",
    path: "/v1/sessions/ses_74810",
    service: "identity",
    environment: "production",
    region: "iad1",
    statusCode: 204,
    duration: 67,
    traceId: "21ab640f98dc4375",
    spanId: "fb801c4296a5d3e7",
    clientAddress: "197.210.84.16",
    userAgent: "OutRay SDK/1.4.2",
    protocol: "HTTP/2",
    captureState: "full",
    request: { headers: { authorization: "[REDACTED]", "x-request-id": "req_01JY7Q3X6N4V2Z8K1D5M9A0PRC" }, query: {}, body: null, size: 0 },
    response: { headers: { "x-request-id": "req_01JY7Q3X6N4V2Z8K1D5M9A0PRC" }, body: null, size: 0 },
  },
];

export const services: ObservabilityService[] = [
  {
    id: "api-gateway",
    name: "api-gateway",
    runtime: "Node.js 22",
    environment: "production",
    region: "fra1",
    health: "healthy",
    requestsPerMinute: 1842,
    errorRate: 0.18,
    p95: 186,
    deploy: "8 min ago",
    version: "v2.14.3",
  },
  {
    id: "checkout-api",
    name: "checkout-api",
    runtime: "Go 1.24",
    environment: "production",
    region: "fra1",
    health: "degraded",
    requestsPerMinute: 684,
    errorRate: 2.84,
    p95: 874,
    deploy: "3 hr ago",
    version: "v1.31.0",
  },
  {
    id: "identity",
    name: "identity",
    runtime: "Node.js 22",
    environment: "production",
    region: "iad1",
    health: "healthy",
    requestsPerMinute: 542,
    errorRate: 0.07,
    p95: 142,
    deploy: "1 day ago",
    version: "v4.8.1",
  },
  {
    id: "web-app",
    name: "web-app",
    runtime: "React 19",
    environment: "production",
    region: "global",
    health: "healthy",
    requestsPerMinute: 2311,
    errorRate: 0.31,
    p95: 224,
    deploy: "34 min ago",
    version: "v7.2.6",
  },
  {
    id: "worker-payments",
    name: "worker-payments",
    runtime: "Python 3.13",
    environment: "production",
    region: "fra1",
    health: "critical",
    requestsPerMinute: 128,
    errorRate: 7.12,
    p95: 1820,
    deploy: "5 days ago",
    version: "v1.9.4",
  },
  {
    id: "notifications",
    name: "notifications",
    runtime: "Node.js 22",
    environment: "staging",
    region: "iad1",
    health: "healthy",
    requestsPerMinute: 96,
    errorRate: 0.11,
    p95: 203,
    deploy: "18 min ago",
    version: "v3.4.0-rc.2",
  },
];

export const logs: LogEvent[] = [
  {
    id: "log-01",
    timestamp: "09:51:42.918",
    level: "error",
    service: "checkout-api",
    message: "payment authorization failed after 3 attempts",
    traceId: "7f2b190d4eb6426a",
    environment: "production",
    attributes: { provider: "paystack", order_id: "ord_89214", retry: "3" },
  },
  {
    id: "log-02",
    timestamp: "09:51:41.204",
    level: "warn",
    service: "worker-payments",
    message: "queue processing time exceeded configured threshold",
    traceId: "09d814a502d744b1",
    environment: "production",
    attributes: { queue: "payment-events", duration_ms: "1824", threshold_ms: "1000" },
  },
  {
    id: "log-03",
    timestamp: "09:51:39.771",
    level: "info",
    service: "api-gateway",
    message: "request completed",
    traceId: "d9a814270f2346f3",
    environment: "production",
    attributes: { method: "POST", path: "/v1/orders", status: "201", duration_ms: "184" },
  },
  {
    id: "log-04",
    timestamp: "09:51:38.116",
    level: "debug",
    service: "identity",
    message: "session cache hit",
    traceId: "18b3fc0c86f94870",
    environment: "production",
    attributes: { cache: "redis", ttl: "3584", region: "iad1" },
  },
  {
    id: "log-05",
    timestamp: "09:51:36.842",
    level: "info",
    service: "web-app",
    message: "server component rendered",
    traceId: "c730247a7d72453c",
    environment: "production",
    attributes: { route: "/checkout", render_ms: "42", cache: "miss" },
  },
  {
    id: "log-06",
    timestamp: "09:51:34.091",
    level: "error",
    service: "worker-payments",
    message: "database transaction rolled back",
    traceId: "a421ba83477b45c5",
    environment: "production",
    attributes: { database: "payments", error: "serialization_failure", attempt: "2" },
  },
  {
    id: "log-07",
    timestamp: "09:51:31.550",
    level: "info",
    service: "notifications",
    message: "email delivery accepted by provider",
    traceId: "59b792ea50254a20",
    environment: "staging",
    attributes: { provider: "zeptomail", template: "receipt", recipient_count: "1" },
  },
  {
    id: "log-08",
    timestamp: "09:51:29.312",
    level: "warn",
    service: "api-gateway",
    message: "client approaching rate limit",
    traceId: "e6877435bb334903",
    environment: "production",
    attributes: { client_id: "cli_4b23", remaining: "12", window: "60s" },
  },
];

export const traces: TraceEvent[] = [
  {
    id: "7f2b190d4eb6426a",
    name: "POST /v1/checkout",
    rootService: "api-gateway",
    startedAt: "09:51:42.118",
    duration: 1248,
    spanCount: 8,
    status: "error",
    method: "POST",
    spans: [
      { name: "POST /v1/checkout", service: "api-gateway", duration: 1248, offset: 0, status: "error" },
      { name: "authorize session", service: "identity", duration: 84, offset: 28, status: "ok" },
      { name: "create order", service: "checkout-api", duration: 1032, offset: 142, status: "error" },
      { name: "SELECT cart", service: "postgres", duration: 118, offset: 188, status: "ok" },
      { name: "authorize payment", service: "paystack", duration: 714, offset: 382, status: "error" },
    ],
  },
  {
    id: "d9a814270f2346f3",
    name: "POST /v1/orders",
    rootService: "api-gateway",
    startedAt: "09:51:39.587",
    duration: 184,
    spanCount: 6,
    status: "ok",
    method: "POST",
    spans: [
      { name: "POST /v1/orders", service: "api-gateway", duration: 184, offset: 0, status: "ok" },
      { name: "authorize session", service: "identity", duration: 36, offset: 12, status: "ok" },
      { name: "persist order", service: "checkout-api", duration: 102, offset: 62, status: "ok" },
      { name: "INSERT order", service: "postgres", duration: 48, offset: 87, status: "ok" },
    ],
  },
  {
    id: "c730247a7d72453c",
    name: "GET /checkout",
    rootService: "web-app",
    startedAt: "09:51:36.800",
    duration: 242,
    spanCount: 7,
    status: "ok",
    method: "GET",
    spans: [
      { name: "GET /checkout", service: "web-app", duration: 242, offset: 0, status: "ok" },
      { name: "load session", service: "identity", duration: 52, offset: 18, status: "ok" },
      { name: "GET /v1/cart", service: "checkout-api", duration: 118, offset: 86, status: "ok" },
    ],
  },
  {
    id: "a421ba83477b45c5",
    name: "payment.completed",
    rootService: "worker-payments",
    startedAt: "09:51:33.002",
    duration: 1820,
    spanCount: 9,
    status: "error",
    method: "EVENT",
    spans: [
      { name: "payment.completed", service: "worker-payments", duration: 1820, offset: 0, status: "error" },
      { name: "load payment", service: "postgres", duration: 284, offset: 70, status: "ok" },
      { name: "settle ledger", service: "ledger-api", duration: 1240, offset: 412, status: "error" },
    ],
  },
  {
    id: "59b792ea50254a20",
    name: "notification.receipt",
    rootService: "notifications",
    startedAt: "09:51:30.922",
    duration: 628,
    spanCount: 4,
    status: "ok",
    method: "EVENT",
    spans: [
      { name: "notification.receipt", service: "notifications", duration: 628, offset: 0, status: "ok" },
      { name: "render template", service: "notifications", duration: 82, offset: 42, status: "ok" },
      { name: "send email", service: "zeptomail", duration: 438, offset: 152, status: "ok" },
    ],
  },
];

export const monitors = [
  { name: "Checkout error rate", query: "errors > 2% for 5m", state: "firing", service: "checkout-api", changed: "12 min ago" },
  { name: "Payment worker latency", query: "p95 > 1.2s for 10m", state: "firing", service: "worker-payments", changed: "28 min ago" },
  { name: "API availability", query: "availability < 99.9% for 5m", state: "healthy", service: "api-gateway", changed: "4 days ago" },
  { name: "Identity saturation", query: "cpu > 85% for 15m", state: "healthy", service: "identity", changed: "9 days ago" },
] as const;
