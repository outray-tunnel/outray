import type {
  HttpRequestSummary,
  RequestDetailsResponse,
} from "./http-requests-data";

export interface RequestExplanationPreview {
  category: "server-error" | "client-error" | "slow" | "healthy" | "unknown";
  title: string;
  summary: string;
  evidence: {
    id: string;
    label: string;
    value: string;
    detail: string;
    target: "response" | "context";
  }[];
  hypothesis: { title: string; detail: string } | null;
  nextChecks: string[];
  limitations: string[];
  followUps: { id: string; label: string; answer: string }[];
}

// A scripted preview cutoff, not a measured service baseline or an SLO.
const PREVIEW_SLOW_THRESHOLD_MS = 1_000;

function validStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}

function validDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasTrace(request: HttpRequestSummary): boolean {
  return typeof request.traceId === "string" && request.traceId.trim().length > 0;
}

function classify(request: HttpRequestSummary): RequestExplanationPreview["category"] {
  if (!validStatus(request.statusCode) || request.statusCode < 200) return "unknown";
  if (request.statusCode >= 500) return "server-error";
  if (request.statusCode >= 400) return "client-error";
  if (!validDuration(request.duration)) return "unknown";
  return request.duration >= PREVIEW_SLOW_THRESHOLD_MS ? "slow" : "healthy";
}

const categoryCopy: Record<
  RequestExplanationPreview["category"],
  Pick<RequestExplanationPreview, "title" | "hypothesis" | "nextChecks">
> = {
  "server-error": {
    title: "A server-error response was recorded",
    hypothesis: {
      title: "Possible server-side failure",
      detail: "Unconfirmed hypothesis: a server-side operation may have failed or been unavailable. Status and total duration do not identify the failing code or establish a root cause.",
    },
    nextChecks: [
      "Inspect available response details for a safe error description.",
      "Review correlated logs and trace spans, if available, for this request.",
      "Compare nearby requests before judging the scope or recovery of the issue.",
    ],
  },
  "client-error": {
    title: "A client-error response was recorded",
    hypothesis: {
      title: "Possible request rejection",
      detail: "Unconfirmed hypothesis: validation, authentication, authorization, or routing may explain the 4xx response. Metadata alone cannot establish which; payload contents were not inspected.",
    },
    nextChecks: [
      "Inspect available response details for the reason the request was rejected.",
      "Check the expected route, permissions, and input without exposing sensitive values.",
      "Review correlated logs or trace spans, if available, to verify the cause.",
    ],
  },
  slow: {
    title: "This request crossed the preview duration threshold",
    hypothesis: {
      title: "Possible time spent waiting or doing work",
      detail: "Unconfirmed hypothesis: request handling may have spent time waiting or doing work. Total duration cannot locate that time; no downstream spans or measured baseline were analyzed.",
    },
    nextChecks: [
      "Inspect trace span timings, if available, to locate where time was spent.",
      "Compare similar requests with a measured baseline or service objective.",
      "Review correlated logs for timing clues without treating log counts as a cause.",
    ],
  },
  healthy: {
    title: "This request completed below the preview threshold",
    hypothesis: null,
    nextChecks: [
      "Check nearby requests before drawing conclusions about service health.",
      "Inspect response or trace details if the caller still reported an issue.",
    ],
  },
  unknown: {
    title: "There is not enough metadata to classify this request",
    hypothesis: null,
    nextChecks: [
      "Confirm a final HTTP status and valid duration were recorded.",
      "Load available capture details and correlated logs before investigating further.",
    ],
  },
};

/** Local, deterministic preview. Never reads payload values or performs network work. */
export function buildRequestExplanationPreview(
  request: HttpRequestSummary,
  details?: RequestDetailsResponse | null,
): RequestExplanationPreview {
  const category = classify(request);
  const copy = categoryCopy[category];
  const status = validStatus(request.statusCode) ? request.statusCode : null;
  const duration = validDuration(request.duration) ? request.duration : null;
  // A stale inspector response must not provide another request's capture or log facts.
  const matchingDetails = details?.request.id === request.id &&
    details.request.requestId === request.requestId ? details : null;
  const tracePresent = hasTrace(request);
  const limitations = [
    "This is a deterministic frontend preview, not an AI investigation or a root-cause diagnosis.",
    "No trace spans, downstream calls, databases, recovery events, or historical baselines were analyzed.",
    "The 1000 ms slow threshold is a preview cutoff, not a measured baseline or service objective.",
  ];
  if (status === null) limitations.push("A valid HTTP status was not recorded.");
  else if (status < 200) limitations.push("Only an interim HTTP status was recorded; a final response outcome is unknown.");
  if (duration === null) limitations.push("A valid request duration was not recorded.");
  if (!tracePresent) limitations.push("No trace identifier is attached; trace correlation is unavailable in this preview.");
  if (request.captureState === "redacted" || matchingDetails?.request.captureState === "redacted") {
    limitations.push("Capture is redacted; sensitive values are unavailable and were not inspected.");
  }
  if (request.captureState === "metadata" || matchingDetails?.request.captureState === "metadata") {
    limitations.push("Metadata-only capture does not provide complete request and response payloads.");
  }

  const evidence: RequestExplanationPreview["evidence"] = [
    {
      id: "http-status", label: "Response status",
      value: status === null ? "Not recorded" : `HTTP ${status}`,
      detail: status === null ? "No valid status is available." : status >= 500
        ? "A 5xx server-error response was recorded; the status does not reveal its cause."
        : status >= 400 ? "A 4xx client-error response was recorded; the status does not reveal its cause."
        : status < 200 ? "This is an interim response, not a final outcome."
        : status >= 300 ? "A redirect response was recorded; the caller's final outcome is not known."
        : "A 2xx response was recorded; this alone does not prove the service is healthy.",
      target: "response",
    },
    {
      id: "duration", label: "Duration",
      value: duration === null ? "Not recorded" : `${duration} ms`,
      detail: duration === null ? "No valid duration is available."
        : duration >= PREVIEW_SLOW_THRESHOLD_MS
          ? "At or above the 1000 ms preview cutoff; no measured baseline was compared."
          : "Below the 1000 ms preview cutoff; no measured baseline was compared.",
      target: "context",
    },
    {
      id: "trace", label: "Trace context", value: tracePresent ? "Identifier attached" : "Not attached",
      detail: tracePresent ? "Trace correlation may be available; no span contents or timings were analyzed."
        : "No trace identifier is attached to this request.",
      target: "context",
    },
  ];

  if (matchingDetails) {
    const captureFields = [
      { label: "Request headers", captured: matchingDetails.request.request.headersCaptured, truncated: matchingDetails.request.request.headersTruncated },
      { label: "Request body", captured: matchingDetails.request.request.bodyCaptured, truncated: matchingDetails.request.request.bodyTruncated },
      { label: "Response headers", captured: matchingDetails.request.response.headersCaptured, truncated: matchingDetails.request.response.headersTruncated },
      { label: "Response body", captured: matchingDetails.request.response.bodyCaptured, truncated: matchingDetails.request.response.bodyTruncated },
    ];
    for (const field of captureFields) {
      const verb = field.label.endsWith("headers") ? "were" : "was";
      if (field.captured !== true) limitations.push(`${field.label} ${verb} not captured; that evidence is unavailable.`);
      if (field.truncated) limitations.push(`${field.label} ${verb} truncated; that capture is incomplete.`);
    }
    evidence.push({
      id: "capture", label: "Capture availability",
      value: `${captureFields.filter((field) => field.captured === true).length} of 4 fields captured`,
      detail: "Recorded header and body capture flags only; payload values were not read.", target: "response",
    });
    const errorCount = matchingDetails.logs.filter((log) => log.level === "error").length;
    const warningCount = matchingDetails.logs.filter((log) => log.level === "warn").length;
    evidence.push({
      id: "correlated-logs", label: "Correlated logs",
      value: `${matchingDetails.logs.length} ${matchingDetails.logs.length === 1 ? "log" : "logs"}`,
      detail: `${errorCount} error-level and ${warningCount} warning-level logs; messages were not read and counts do not establish a cause.`,
      target: "context",
    });
    if (matchingDetails.logs.length === 0) limitations.push("No correlated logs were returned; this does not prove there were no errors.");
  } else {
    limitations.push("Request details are not loaded; capture flags and correlated log counts are unavailable.");
    if (details) limitations.push("Loaded details belong to a different request and were not used.");
    evidence.push({
      id: "capture", label: "Capture availability",
      value: request.captureState === "redacted" ? "Redacted" : request.captureState === "metadata" ? "Metadata only" : "Not loaded",
      detail: "Request and response capture flags are not loaded; no payload values were read.", target: "response",
    }, {
      id: "correlated-logs", label: "Correlated logs", value: "Not loaded",
      detail: "Log counts are unknown, not zero; log messages were not read.", target: "context",
    });
  }

  const summary = `${status === null ? "HTTP status is unavailable" : `HTTP ${status} was recorded`}${duration === null ? "; duration is unavailable." : ` with a duration of ${duration} ms.`} ${category === "server-error" || category === "client-error" ? "This identifies the response class, not the root cause." : category === "slow" ? "It crosses a preview cutoff, not a measured baseline." : category === "healthy" ? "It is below the preview cutoff, not proof of service health." : "A final status and valid duration are needed for a complete classification."}`;
  const nextChecks = [...copy.nextChecks];

  return {
    category, title: copy.title, summary, evidence,
    hypothesis: copy.hypothesis ? { ...copy.hypothesis } : null,
    nextChecks, limitations,
    followUps: [
      { id: "root-cause", label: "What caused this?", answer: copy.hypothesis?.detail ?? "The available metadata does not establish a root cause. A successful response or short duration also cannot explain a caller-reported issue." },
      { id: "confidence", label: "What is confirmed?", answer: "Only the displayed status, duration, capture flags, trace presence, and loaded correlated log counts are metadata facts. Hypotheses are unconfirmed, and payload values and log messages were not read." },
      { id: "next-checks", label: "What should I check next?", answer: nextChecks.join(" ") },
    ],
  };
}

export const requestExplanationDemoScenarios: {
  value: "server-error" | "slow" | "healthy";
  label: "Failed request" | "Slow request" | "Successful request";
  request: HttpRequestSummary;
  preview?: RequestExplanationPreview;
}[] = [
  {
    value: "server-error", label: "Failed request",
    request: {
      id: "demo-request-explanation-failed", requestId: "demo-checkout-request",
      timestamp: "2026-10-08T12:00:00Z", method: "POST", route: "/api/checkout", path: "/api/checkout",
      service: "payments", environment: "demo", region: "demo-region", statusCode: 503, duration: 2430,
      traceId: "demo-checkout-trace", spanId: "demo-checkout-span", captureState: "redacted", requestSize: 128, responseSize: 64,
    },
    preview: {
      category: "server-error",
      title: "The payment-provider call is the strongest lead",
      summary: "In this sample, the payment-provider span takes 2400 of 2430 ms, and a mock timeout log points to the same call. The request returns HTTP 503.",
      evidence: [
        {
          id: "http-status", label: "Sample response", value: "HTTP 503",
          detail: "The illustrative checkout request returns a server-error response.", target: "response",
        },
        {
          id: "duration", label: "Sample request duration", value: "2430 ms",
          detail: "Total duration of the illustrative request, not a service baseline.", target: "context",
        },
        {
          id: "sample-provider-span", label: "Sample payment-provider span", value: "2400 ms · ~99%",
          detail: "Mock trace data places nearly all sample request time in the payment-provider call.", target: "context",
        },
        {
          id: "correlated-logs", label: "Sample correlated logs", value: "1 timeout log",
          detail: "Mock log data includes one timeout event for the payment-provider call.", target: "context",
        },
      ],
      hypothesis: {
        title: "Payment provider timeout",
        detail: "Unconfirmed hypothesis: the provider call exceeded its timeout and led to the 503. The sample timing and timeout clue make this the strongest lead, not a definitive cause.",
      },
      nextChecks: [
        "Check the provider timeout and retry settings against the request deadline.",
        "Inspect the upstream span's timeout outcome and cancellation path.",
        "Look for the same provider-timeout pattern in nearby requests.",
      ],
      limitations: [
        "All traces, logs, and timings are illustrative sample data.",
        "No live AI call or service read was performed; no definitive cause is established.",
        "The sample payload is redacted and was not inspected. No baseline or deployment history was compared.",
      ],
      followUps: [
        {
          id: "root-cause", label: "What caused this?",
          answer: "A payment-provider timeout is the strongest unconfirmed lead in this sample: the 2400 ms provider span and one mock timeout event point to the same call. They do not prove why it timed out.",
        },
        {
          id: "confidence", label: "What is confirmed?",
          answer: "Within the illustrative sample: HTTP 503, 2430 ms total duration, a 2400 ms payment-provider span, and one timeout log. None of these are live service observations.",
        },
        {
          id: "next-checks", label: "What should I check next?",
          answer: "Start with the provider call's timeout, retry budget, and cancellation outcome. Then check whether nearby requests show the same upstream timeout pattern.",
        },
      ],
    },
  },
  {
    value: "slow", label: "Slow request",
    request: {
      id: "demo-request-explanation-slow", requestId: "demo-orders-request",
      timestamp: "2026-10-08T12:01:00Z", method: "GET", route: "/api/orders", path: "/api/orders",
      service: "orders", environment: "demo", region: "demo-region", statusCode: 200, duration: 1840,
      traceId: "demo-orders-trace", spanId: "demo-orders-span", captureState: "metadata", requestSize: 0, responseSize: 256,
    },
    preview: {
      category: "slow",
      title: "Most time was spent in the database span",
      summary: "In this sample, the database span takes 1720 of 1840 ms—about 93% of the request. HTTP 200 confirms the response succeeded, but does not explain the wait.",
      evidence: [
        {
          id: "http-status", label: "Sample response", value: "HTTP 200",
          detail: "The illustrative orders request returns a successful response.", target: "response",
        },
        {
          id: "duration", label: "Sample request duration", value: "1840 ms",
          detail: "Total duration of the illustrative request, not a measured latency regression.", target: "context",
        },
        {
          id: "sample-database-span", label: "Sample database span", value: "1720 ms · ~93%",
          detail: "Mock trace data places most sample request time in a database span; query execution and connection wait are not separated.", target: "context",
        },
      ],
      hypothesis: {
        title: "A slow query or connection wait",
        detail: "Unconfirmed hypothesis: query execution or waiting for a database connection accounts for the long span. The sample timing cannot distinguish the two.",
      },
      nextChecks: [
        "Separate query execution time from connection-pool wait in the trace.",
        "Look for recurring database wait patterns across similar requests.",
        "Check the query plan and pool contention before changing limits.",
      ],
      limitations: [
        "All traces, logs, and timings are illustrative sample data.",
        "No live AI call or service read was performed; no definitive cause is established.",
        "This sample has metadata-only capture. No query text, measured baseline, or deployment history was inspected.",
      ],
      followUps: [
        {
          id: "root-cause", label: "What caused this?",
          answer: "The illustrative database span is the main timing lead. A slow query or connection wait is unconfirmed; the sample does not contain the breakdown needed to choose between them.",
        },
        {
          id: "confidence", label: "What is confirmed?",
          answer: "Within the illustrative sample: HTTP 200, 1840 ms total duration, and a 1720 ms database span—about 93% of the request. No live database behavior or latency baseline was measured.",
        },
        {
          id: "next-checks", label: "What should I check next?",
          answer: "Split database time into connection wait and query execution, then compare the wait pattern across similar requests. Check the query plan and pool contention before deciding on a fix.",
        },
      ],
    },
  },
  {
    value: "healthy", label: "Successful request",
    request: {
      id: "demo-request-explanation-successful", requestId: "demo-health-request",
      timestamp: "2026-10-08T12:02:00Z", method: "GET", route: "/health", path: "/health",
      service: "api", environment: "demo", region: "demo-region", statusCode: 200, duration: 84,
      traceId: "", spanId: "", captureState: "full", requestSize: 0, responseSize: 16,
    },
  },
];
