import type { OutrayTanStackServerOptions } from "@outray/tanstack-start/server";

const PRIVATE_PATH_SEGMENTS = new Set([
  "auth", "secrets", "login", "logout", "signup", "register", "cli",
  "auth-tokens", "machine-tokens", "tokens", "invitations", "invite",
  "webhooks", "checkout", "portal", "admin", "_serverfn",
  "mcp", "authorize", "connections", "sign-in", "continue",
]);

// Application-owned opaque values must not be forwarded into another telemetry
// store. Shared credential/URL redaction is applied by the SDK as well.
export const INTERNAL_OBSERVABILITY_REDACTED_FIELDS = [
  "requestBody", "responseBody", "requestHeaders", "responseHeaders", "body",
  "params", "parameters", "query", "value", "values", "envText", "plaintext",
  "rawBody", "connectionString", "credentials", "assertion", "signature",
] as const;

export const INTERNAL_OBSERVABILITY_REDACTED_LOG_FIELDS = [
  ...INTERNAL_OBSERVABILITY_REDACTED_FIELDS,
  "data", "result", "content", "contents", "env", "environmentVariables",
] as const;

function decodedPathname(pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.length > 8192) return null;
  let decoded = pathname;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!decoded.includes("%")) return decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
  }
  return decoded.includes("%") ? null : decoded;
}

/** Sensitive paths need stable route names, not a telemetry exclusion. */
export function isSensitiveInternalObservabilityRequest({ pathname }: { pathname: string }): boolean {
  const decoded = decodedPathname(pathname)?.toLowerCase();
  if (decoded === undefined || decoded === null) return true;
  const segments = decoded.split("/").filter(Boolean);
  return segments.some((segment) =>
    PRIVATE_PATH_SEGMENTS.has(segment)
    || segment.endsWith("-token")
    || segment.endsWith(".callback")
    || segment === "callback",
  ) || /^\/v1\/(traces|logs|metrics)(?:\/|$)/.test(decoded);
}

const SECRET_PROJECT_ROUTE = "/api/:orgSlug/secrets/projects/:projectSlug";
const SECRET_ENVIRONMENT_ROUTE = `${SECRET_PROJECT_ROUTE}/environments/:environmentSlug`;
const SENSITIVE_ROUTE_TEMPLATES = [
  "/api/mcp", "/api/mcp/openai", "/api/mcp/consent", "/api/mcp/connections",
  "/plugins/authorize", "/plugins/sign-in", "/plugins/continue", "/plugins/connections",
  "/login", "/logout", "/signup", "/register", "/cli/login", "/invitations/accept",
  "/api/tunnel/auth", "/api/dashboard/ws-token", "/api/dashboard/validate-ws-token",
  "/api/uptime/integrations/:provider/callback",
  "/api/observability/alerts/integrations/:provider/callback",
  "/api/:orgSlug/auth-tokens", "/api/:orgSlug/portal/polar", "/:orgSlug/tokens",
  "/api/auth/callback/:provider",
  "/api/auth/sign-in/magic-link", "/api/auth/magic-link/verify", "/api/auth/jwks",
  ...["authorize", "token", "revoke", "register", "consent", "continue", "userinfo", "introspect"].map((action) => `/api/auth/oauth2/${action}`),
  ...["get-session", "sign-out", "sign-in/social", "sign-in/email", "sign-up/email",
    "organization/list", "organization/get-full-organization", "organization/set-active",
    "organization/get-active-member", "organization/invite-member", "organization/accept-invitation",
  ].map((action) => `/api/auth/${action}`),
  ...["exchange", "complete", "login", "login/status", "secrets", "secrets/targets", "secrets/rollback", "secrets/revision"]
    .map((action) => `/api/cli/${action}`),
  ...["polar", "paystack"].map((provider) => `/api/webhooks/${provider}`),
  ...["polar", "paystack", "paystack-verify"].map((provider) => `/api/checkout/${provider}`),
  ...["tunnels", "charts", "users", "users/:userId", "subscriptions", "organizations",
    "organizations/:slug", "revenue-history", "overview", "stats", "proxy-image", "login",
  ].map((action) => `/api/admin/${action}`),
  "/admin",
  ...["tunnels", "charts", "users", "users/:userId", "subscriptions", "organizations", "organizations/:slug", "actions"]
    .map((action) => `/admin/${action}`),
  ...["overview", "audit", "trash", "trash/purge", "trash/restore", "keys/rewrap", "keys/rotate",
    "machine-tokens", "machine-tokens/:tokenId", "shares", "shares/snapshot", "shares/:shareId", "projects",
  ].map((action) => `/api/:orgSlug/secrets/${action}`),
  SECRET_PROJECT_ROUTE,
  `${SECRET_PROJECT_ROUTE}/environments`,
  SECRET_ENVIRONMENT_ROUTE,
  ...["import", "bulk", "export", "secrets", "revision", "secrets/:secretId",
    "secrets/:secretId/versions", "secrets/:secretId/reveal", "secrets/:secretId/rollback",
  ].map((action) => `${SECRET_ENVIRONMENT_ROUTE}/${action}`),
  "/:orgSlug/secrets",
  ...["projects", "projects/:projectSlug", "projects/:projectSlug/environments/:environmentSlug",
    "vaults", "vaults/:projectSlug", "vaults/:projectSlug/environments",
    "vaults/:projectSlug/environments/:environmentSlug", "shares", "trash", "audit",
  ].map((action) => `/:orgSlug/secrets/${action}`),
  "/v1/traces", "/v1/logs", "/v1/metrics",
];

// Static templates keep names, tokens and tenant-specific slugs out of spans
// and metric labels. More specific actions win over dynamic IDs (e.g. snapshot).
const sensitiveRoutes = SENSITIVE_ROUTE_TEMPLATES.map((template) => {
  const segments = template.split("/");
  const pattern = segments.map((segment) => segment.startsWith(":")
    ? "[^/]+"
    : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/");
  return {
    template,
    expression: new RegExp(`^${pattern}/?$`, "i"),
    specificity: segments.filter((segment) => segment && !segment.startsWith(":")).length,
  };
}).sort((left, right) => right.specificity - left.specificity);

/** Resolve sensitive paths without ever falling back to their raw suffixes. */
export function resolveInternalObservabilityRoute({ pathname }: { pathname: string }): string | null {
  const decoded = decodedPathname(pathname);
  if (decoded === null) return "/:invalid-path";
  if (!isSensitiveInternalObservabilityRequest({ pathname })) return null;
  const registered = sensitiveRoutes.find((route) => route.expression.test(decoded));
  if (registered) return registered.template;
  if (/^\/_serverfn(?:\/|$)/i.test(decoded)) return "/_serverFn/:functionId";
  if (/^\/api\/auth(?:\/|$)/i.test(decoded)) return "/api/auth/:path";
  // New/unrecognized sensitive routes stay observable, without guessing which
  // segments might be credentials. Add their template above for finer grouping.
  return "/:sensitive-route";
}

/**
 * A dedicated, server-only credential opts the console into internal Ops.
 * Generic tunnel/SDK environment variables never enable this integration.
 */
export function resolveInternalObservabilityOptions(
  env: Record<string, string | undefined>,
): OutrayTanStackServerOptions | undefined {
  const apiKey = env.OUTRAY_INTERNAL_OBSERVABILITY_API_KEY?.trim();
  if (!apiKey) return undefined;

  let endpoint: URL;
  try {
    endpoint = new URL(env.OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT ?? "");
  } catch {
    throw new Error("OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT must be an HTTPS origin.");
  }
  if (
    endpoint.protocol !== "https:"
    || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash
    || endpoint.pathname !== "/"
  ) {
    throw new Error("OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT must be an HTTPS origin without credentials, path, query, or fragment.");
  }

  return {
    apiKey,
    endpoint: endpoint.origin,
    serviceName: env.OUTRAY_INTERNAL_OBSERVABILITY_SERVICE_NAME?.trim() || "outray-web",
    environment: env.OUTRAY_INTERNAL_OBSERVABILITY_ENVIRONMENT?.trim() || "production",
    enabled: true,
    capturePayloads: {
      maxBodyBytes: 16 * 1024,
      maxHeaderBytes: 8 * 1024,
      redactedFields: INTERNAL_OBSERVABILITY_REDACTED_FIELDS,
      // Login/OTP inputs use generic `code`; response error codes are useful.
      redactedRequestFields: ["code", "state", "nonce", "challenge"],
    },
    captureConsole: true,
    redactedLogFields: INTERNAL_OBSERVABILITY_REDACTED_LOG_FIELDS,
    recordExceptions: false,
    autoInstrumentations: false,
    diagnostics: "none",
    // Include every route, including auth, callbacks, Secrets and assets. Capture
    // supported content after redaction instead of suppressing entire requests.
    ignoreDefaultPaths: false,
    routeResolver: resolveInternalObservabilityRoute,
  };
}
