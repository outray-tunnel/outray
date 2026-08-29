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
