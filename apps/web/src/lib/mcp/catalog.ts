import * as z from "zod";
import type { McpCatalog } from "./policy";
import { PUBLIC_MCP_TOOL_NAMES } from "./public-tool-names";
import type { productRoutes } from "./product-routes";
import { ALERT_SIGNALS, ALERT_OPERATORS, ALERT_NO_DATA_STATES, ALERT_LOG_LEVELS, ALERT_METRIC_AGGREGATIONS, ALERT_AGGREGATION_TEMPORALITIES } from "../observability/alert-validation";

export type McpArguments = Record<string, unknown>;
export interface OutrayTool {
  name: string;
  description: string;
  route?: keyof typeof productRoutes;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  shape: z.ZodRawShape;
  query?: string[];
  body?: string[];
  public: boolean;
  values?: boolean;
  write: boolean;
  destructive: boolean;
  openWorld: boolean;
  manager?: boolean;
  operation?: string;
}

const id = z.string().trim().min(1).max(256);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const text = z.string().max(4000);
const name = z.string().trim().min(1).max(100);
const optionalText = text.optional();
const positive = z.number().int().min(1);
const revision = z.number().int().nonnegative();
const strings = z.array(id).max(100);
const org = { orgSlug: slug.describe("An organization slug returned by list_organizations") };
const vault = { ...org, vaultSlug: slug };
const env = { ...vault, environmentSlug: slug };
const secret = { ...env, secretId: id };
const page = { ...org, pageId: id.describe("The exact status page ID; never infer a different page") };
const production = { confirmProduction: z.boolean().optional().describe("True only when the user explicitly authorized the production operation") };
const confirmedDelete = { ...production, confirmation: text.describe("The exact confirmation phrase required by the existing product workflow") };
const range = z.enum(["1h", "6h", "24h", "7d", "30d"]).optional();
const search = { range, service: optionalText, search: z.string().max(500).optional(), limit: positive.max(500).optional() };
const monitor = {
  name, url: z.url().max(2048), method: z.enum(["GET", "HEAD"]).optional(),
  expectedStatus: z.number().int().min(100).max(599).nullable().optional(), responseText: z.string().max(1000).nullable().optional(),
  notificationEmails: z.array(z.email()).max(20).optional(), failureThreshold: z.number().int().min(2).max(5).optional(),
  incidentPublishing: z.enum(["manual", "after_confirmation", "automatic"]).optional(),
  publishAfterMinutes: positive.max(60).optional(), enabled: z.boolean().optional(),
};
const alert = {
  name, description: optionalText, signal: z.enum(ALERT_SIGNALS), service: name,
  environment: optionalText, metricKey: optionalText, metricName: optionalText, metricType: z.literal("gauge").optional(),
  metricUnit: optionalText, metricAggregation: z.enum(ALERT_METRIC_AGGREGATIONS).optional(),
  aggregationTemporality: z.enum(ALERT_AGGREGATION_TEMPORALITIES).optional(), isMonotonic: z.boolean().optional(),
  logLevel: z.enum(ALERT_LOG_LEVELS).optional(), logQuery: optionalText,
  operator: z.enum(ALERT_OPERATORS), threshold: z.number(),
  windowMinutes: positive.max(1440).optional(), evaluationIntervalSeconds: positive.max(3600).optional(),
  consecutiveFailures: positive.max(100).optional(), consecutiveRecoveries: positive.max(100).optional(),
  minimumSamples: positive.max(100000).optional(), noDataState: z.enum(ALERT_NO_DATA_STATES).optional(),
  notificationEmails: z.array(z.email()).max(20).optional(), enabled: z.boolean().optional(), mutedUntil: z.iso.datetime().nullable().optional(),
};
const incidentUpdate = {
  note: z.string().max(20000), status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  componentStates: z.record(id, z.enum(["unknown", "operational", "degraded", "outage"])).optional(),
  publish: z.boolean().default(false).describe("Publish only when explicitly requested; publication can notify subscribers"),
  publicTitle: optionalText, acknowledgeRecovery: z.boolean().optional(),
};

function read(name: string, description: string, route: OutrayTool["route"], shape: z.ZodRawShape = org, query: string[] = []): OutrayTool {
  return { name, description, route, shape, query, method: "GET", public: true, write: false, destructive: false, openWorld: false };
}
function write(name: string, description: string, route: OutrayTool["route"], method: OutrayTool["method"], shape: z.ZodRawShape,
  body: string[] = [], options: Partial<OutrayTool> = {}): OutrayTool {
  return { name, description, route, method, shape, body, public: true, write: true,
    destructive: method !== "POST", openWorld: false, ...options };
}
const optional = (shape: z.ZodRawShape) => Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, (value as z.ZodType).optional()]));

export const outrayTools: OutrayTool[] = [
  { ...read("get_profile", "Identify the connected OutRay account without returning credentials", undefined, {}), operation: "profile" },
  { ...read("list_organizations", "List selected organizations that the connected user still belongs to", undefined, {}), operation: "organizations" },
  read("list_tunnels", "List online tunnels in an authorized organization", "tunnels/index"),
  read("get_tunnel", "Inspect a tunnel and its traffic statistics", "tunnels/$tunnelId", { ...org, tunnelId: id }),
  write("stop_tunnel", "Stop the specified tunnel when the user requests disconnection", "tunnels/$tunnelId.stop", "POST", { ...org, tunnelId: id }, [], { destructive: true }),
  read("list_tunnel_requests", "Inspect bounded tunnel request metadata", "requests", { ...org, ...search, tunnelId: id.optional(), cursor: optionalText }, ["range", "search", "limit", "tunnelId", "cursor"]),
  { ...write("get_request_capture", "Inspect a captured request subject to the existing capture policy", "requests/capture", "POST", { ...org, tunnelId: id, timestamp: z.iso.datetime(), requestId: id.optional() }, ["tunnelId", "timestamp", "requestId"]), write: false },
  write("replay_request", "Replay a request to an explicitly specified public URL; may cause external side effects", "requests/replay", "POST", {
    ...org, url: z.url().max(2048), method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]),
    headers: z.record(z.string().max(100), z.string().max(8000)).optional(), requestBody: z.string().max(1_048_576).optional(),
  }, ["url", "method", "headers", "requestBody"], { public: false, values: true, destructive: true, openWorld: true }),
  read("list_domains", "List custom tunnel domains and verification state", "domains/index"),
  write("create_domain", "Register a custom tunnel domain", "domains/index", "POST", { ...org, domain: z.string().max(253) }, ["domain"]),
  write("verify_domain", "Verify ownership and DNS configuration of an existing domain", "domains/$domainId.verify", "POST", { ...org, domainId: id }, [], { openWorld: true }),
  write("delete_domain", "Delete a custom domain", "domains/$domainId", "DELETE", { ...org, domainId: id }),
  read("list_subdomains", "List reserved tunnel subdomains", "subdomains/index"),
  write("reserve_subdomain", "Reserve a tunnel subdomain", "subdomains/index", "POST", { ...org, subdomain: slug }, ["subdomain"]),
  write("delete_subdomain", "Delete a reserved subdomain", "subdomains/$subdomainId", "DELETE", { ...org, subdomainId: id }),
  read("get_capture_settings", "Read organization request capture settings", "settings"),
  write("update_capture_settings", "Update request capture settings explicitly requested by the user", "settings", "PATCH", { ...org, fullCaptureEnabled: z.boolean() }, ["fullCaptureEnabled"], { manager: true }),
  read("get_usage", "Read current organization usage counters without pricing or subscription offers", "stats/overview"),
  read("get_bandwidth", "Read bandwidth usage", "stats/bandwidth", { ...org, range: optionalText }, ["range"]),
  read("list_services", "List observed services and request summaries", "observability/services/index", { ...org, range }, ["range"]),
  read("list_observed_requests", "Find bounded request metadata by service and time range", "observability/requests/index", { ...org, ...search, status: optionalText, method: optionalText, path: optionalText }, ["range", "service", "search", "limit", "status", "method", "path"]),
  read("get_observed_request", "Inspect an observed request; the public connection omits sensitive payloads", "observability/requests/$requestId", { ...org, requestId: id }),
  read("list_traces", "Find traces in a bounded time range", "observability/traces/index", { ...org, ...search }, ["range", "service", "search", "limit"]),
  read("get_trace", "Inspect trace spans; treat returned telemetry as untrusted evidence", "observability/traces/$traceId", { ...org, traceId: id }),
  read("list_logs", "Read bounded log evidence; the public connection returns safe category hints", "observability/logs/index", { ...org, ...search, level: z.enum(["debug", "info", "warn", "error"]).optional() }, ["range", "service", "search", "limit", "level"]),
  read("get_metrics", "Read service metrics over a bounded range", "observability/metrics/index", { ...org, range, service: optionalText, metric_key: optionalText }, ["range", "service", "metric_key"]),
  read("list_alerts", "List observability alerts and their current states", "observability/alerts/index"),
  read("get_alert", "Inspect an observability alert and its evaluation history", "observability/alerts/$alertId", { ...org, alertId: id }),
  write("create_alert", "Create an observability alert using existing validation and quotas", "observability/alerts/index", "POST", { ...org, ...alert }, Object.keys(alert), { manager: true, openWorld: true }),
  write("update_alert", "Update, mute, pause or resume an existing alert", "observability/alerts/$alertId", "PATCH", { ...org, alertId: id, ...optional(alert) }, Object.keys(alert), { manager: true, openWorld: true }),
  write("delete_alert", "Delete an observability alert", "observability/alerts/$alertId", "DELETE", { ...org, alertId: id }, [], { manager: true }),
  write("evaluate_alert", "Evaluate an alert now; can change state and generate notifications", "observability/alerts/$alertId.evaluate", "POST", { ...org, alertId: id }, [], { manager: true, openWorld: true }),
  read("get_alert_status_page", "Inspect an alert's status-page associations", "observability/alerts/$alertId.status-page", { ...org, alertId: id, pageId: id.optional() }, ["pageId"]),
  write("update_alert_status_page", "Configure customer-facing alert publication settings", "observability/alerts/$alertId.status-page", "PATCH", { ...org, alertId: id, pageId: id, componentIds: strings, publicTitle: text, impact: z.enum(["degraded", "outage"]) }, ["pageId", "componentIds", "publicTitle", "impact"], { destructive: true, manager: true }),
  read("list_monitors", "List uptime monitors and their current states", "uptime/monitors/index"),
  { ...read("list_status_pages", "List status page identifiers and publication states", undefined), operation: "status_pages" },
  read("get_monitor", "Inspect an uptime monitor and recent check history", "uptime/monitors/$monitorId", { ...org, monitorId: id }),
  write("create_monitor", "Create an uptime monitor; OutRay will probe the specified public URL", "uptime/monitors/index", "POST", { ...org, ...monitor }, Object.keys(monitor), { manager: true, openWorld: true }),
  write("update_monitor", "Update, pause or resume an uptime monitor", "uptime/monitors/$monitorId", "PATCH", { ...org, monitorId: id, ...optional(monitor) }, Object.keys(monitor), { manager: true, openWorld: true }),
  write("delete_monitor", "Delete an uptime monitor", "uptime/monitors/$monitorId", "DELETE", { ...org, monitorId: id }, [], { manager: true }),
  write("set_monitor_headers", "Set private monitor HTTP headers through a direct MCP connection", "uptime/monitors/$monitorId", "PATCH", { ...org, monitorId: id, headers: z.record(z.string().max(100), z.string().max(8000)) }, ["headers"], { public: false, values: true, manager: true, openWorld: true }),
  read("get_status_page", "Inspect the specified status page and component states", "uptime/page", page, ["pageId"]),
  write("create_status_page", "Create a status page draft", "uptime/page", "POST", { ...org, name, slug, description: optionalText }, ["name", "slug", "description"], { manager: true }),
  write("update_status_page", "Edit or publish the exact status page requested by the user", "uptime/page", "PATCH", { ...page, name: name.optional(), description: optionalText, published: z.boolean().optional(), accentColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), analyticsOrigins: z.array(z.url()).max(20).optional() }, ["name", "description", "published", "accentColor", "analyticsOrigins"], { query: ["pageId"], destructive: true, manager: true, openWorld: true }),
  read("get_status_analytics", "Read status page visitor analytics", "uptime/page.analytics", { ...page, range: optionalText }, ["pageId", "range"]),
  write("create_status_group", "Create a component group on a status page", "uptime/groups/index", "POST", { ...page, name }, ["name"], { query: ["pageId"], manager: true }),
  write("update_status_group", "Edit a status page group", "uptime/groups/$groupId", "PATCH", { ...page, groupId: id, name: name.optional(), visible: z.boolean().optional(), sortOrder: revision.optional() }, ["name", "visible", "sortOrder"], { query: ["pageId"], manager: true }),
  write("delete_status_group", "Delete a status page group", "uptime/groups/$groupId", "DELETE", { ...page, groupId: id }, [], { query: ["pageId"], manager: true }),
  write("update_status_layout", "Reorder every group and component on an explicitly selected status page", "uptime/page.layout", "PATCH", { ...page, root: strings, groups: z.record(id, strings) }, ["root", "groups"], { query: ["pageId"], manager: true }),
  write("create_status_component", "Create a status component and optionally associate monitors", "uptime/components/index", "POST", { ...page, name, description: optionalText, groupId: id.nullable().optional(), monitorIds: strings.optional() }, ["name", "description", "groupId", "monitorIds"], { query: ["pageId"], manager: true }),
  write("update_status_component", "Edit a status component and its monitor associations", "uptime/components/$componentId", "PATCH", { ...page, componentId: id, name: name.optional(), description: optionalText, groupId: id.nullable().optional(), monitorIds: strings.optional(), visible: z.boolean().optional(), sortOrder: revision.optional() }, ["name", "description", "groupId", "monitorIds", "visible", "sortOrder"], { query: ["pageId"], manager: true }),
  write("delete_status_component", "Delete a status component", "uptime/components/$componentId", "DELETE", { ...page, componentId: id }, [], { query: ["pageId"], manager: true }),
  read("list_status_domains", "List status page custom domains", "uptime/domains/index", page, ["pageId"]),
  write("create_status_domain", "Add a custom domain to the specified status page", "uptime/domains/index", "POST", { ...page, domain: z.string().max(253) }, ["domain"], { query: ["pageId"], manager: true }),
  write("verify_status_domain", "Verify DNS ownership for a status page domain", "uptime/domains/$domainId.verify", "POST", { ...page, domainId: id }, [], { query: ["pageId"], manager: true, openWorld: true }),
  write("delete_status_domain", "Delete a status page custom domain", "uptime/domains/$domainId", "DELETE", { ...page, domainId: id }, [], { query: ["pageId"], manager: true }),
  read("list_subscribers", "List status page subscribers with pagination", "uptime/subscribers/index", { ...page, cursor: id.optional(), limit: positive.max(100).optional(), status: z.enum(["pending", "confirmed", "unsubscribed"]).optional(), q: optionalText }, ["pageId", "cursor", "limit", "status", "q"]),
  write("update_subscriber", "Change a status page subscriber's supported subscription state", "uptime/subscribers/$subscriberId", "PATCH", { ...page, subscriberId: id, status: z.literal("unsubscribed") }, ["status"], { query: ["pageId"], manager: true }),
  write("update_subscriber_settings", "Enable or disable subscriptions to a status page", "uptime/subscribers/settings", "PATCH", { ...page, subscriptionsEnabled: z.boolean() }, ["subscriptionsEnabled"], { query: ["pageId"], manager: true }),
  read("list_incidents", "List incidents on the specified status page", "uptime/incidents/index", page, ["pageId"]),
  read("get_incident", "Inspect an incident and its update timeline", "uptime/incidents/$incidentId", { ...page, incidentId: id }, ["pageId"]),
  write("create_incident", "Create an incident draft, or publish only when explicitly requested", "uptime/incidents/index", "POST", { ...page, title: name, componentIds: strings, ...incidentUpdate }, ["title", "componentIds", ...Object.keys(incidentUpdate)], { query: ["pageId"], destructive: true, manager: true, openWorld: true }),
  write("create_incident_update", "Draft or publish an incident update; publication may notify subscribers", "uptime/incidents/$incidentId/updates/index", "POST", { ...page, incidentId: id, ...incidentUpdate }, Object.keys(incidentUpdate), { query: ["pageId"], destructive: true, manager: true, openWorld: true }),
  write("update_incident_draft", "Edit or publish an incident draft; existing publication and recovery rules apply", "uptime/incidents/$incidentId/updates/$updateId", "PATCH", { ...page, incidentId: id, updateId: id, ...optional(incidentUpdate) }, Object.keys(incidentUpdate), { query: ["pageId"], manager: true, openWorld: true }),
  write("decide_incident", "Apply an explicit publication or ignore decision to a detected incident", "uptime/incidents/$incidentId/decision", "POST", { ...page, incidentId: id, action: z.literal("ignore") }, ["action"], { query: ["pageId"], manager: true, openWorld: true }),
  read("list_notification_integrations", "Inspect configured uptime notification destinations without credentials", "uptime/integrations/index"),
  { ...read("get_notification_connection_link", "Return an OutRay browser link to authorize Slack or Discord; credentials stay in the browser flow", undefined, { ...org, provider: z.enum(["slack", "discord"]), alertId: id.optional() }), manager: true, operation: "notification_link" },
  write("disconnect_notification_integration", "Disconnect an uptime notification provider", "uptime/integrations/$provider", "DELETE", { ...org, provider: z.enum(["slack", "discord"]) }, [], { manager: true }),
  write("disconnect_alert_integration", "Disconnect the selected alert's notification provider", "observability/alerts/$alertId.integrations.$provider", "DELETE", { ...org, alertId: id, provider: z.enum(["slack", "discord"]) }, [], { manager: true }),
  read("get_secrets_overview", "Read vault inventory and aggregate secret metadata without values", "secrets/overview"),
  read("list_vaults", "List Secrets vault metadata", "secrets/projects/index"),
  read("get_vault", "Inspect vault metadata and environments", "secrets/projects/$projectSlug", vault),
  write("create_vault", "Create a Secrets vault", "secrets/projects/index", "POST", { ...org, name, slug: slug.optional(), description: optionalText }, ["name", "slug", "description"], { manager: true }),
  write("update_vault", "Rename a vault or update its metadata", "secrets/projects/$projectSlug", "PATCH", { ...vault, name: name.optional(), slug: slug.optional(), description: optionalText }, ["name", "slug", "description"], { manager: true }),
  write("delete_vault", "Delete a vault using the product's exact confirmation and production safeguards", "secrets/projects/$projectSlug", "DELETE", { ...vault, ...confirmedDelete }, Object.keys(confirmedDelete), { manager: true }),
  write("create_environment", "Create a vault environment", "secrets/projects/$projectSlug/environments", "POST", { ...vault, name, slug: slug.optional(), description: optionalText, isProduction: z.boolean().optional(), ...production }, ["name", "slug", "description", "isProduction", ...Object.keys(production)], { manager: true }),
  write("update_environment", "Update environment metadata with revision and production safeguards", "secrets/projects/$projectSlug/environments/$environmentSlug", "PATCH", { ...env, name: name.optional(), slug: slug.optional(), description: optionalText, isProduction: z.boolean().optional(), expectedRevision: revision, ...production }, ["name", "slug", "description", "isProduction", "expectedRevision", ...Object.keys(production)], { manager: true }),
  write("delete_environment", "Delete an environment with the product's exact confirmation", "secrets/projects/$projectSlug/environments/$environmentSlug", "DELETE", { ...env, ...confirmedDelete, expectedRevision: revision }, [...Object.keys(confirmedDelete), "expectedRevision"], { manager: true }),
  read("get_environment_revision", "Read an environment revision before an optimistic mutation", "secrets/projects/$projectSlug/environments/$environmentSlug/revision", env),
  read("list_secrets", "List secret names and metadata without values", "secrets/projects/$projectSlug/environments/$environmentSlug/secrets", env),
  read("list_secret_versions", "List historical secret version metadata without values", "secrets/projects/$projectSlug/environments/$environmentSlug/secrets/$secretId.versions", secret),
  write("reveal_secret", "Reveal a secret value only when explicitly requested through a direct MCP connection", "secrets/projects/$projectSlug/environments/$environmentSlug/secrets/$secretId.reveal", "POST", { ...secret, version: positive.optional(), intent: z.enum(["reveal", "copy"]), ...production }, ["version", "intent", ...Object.keys(production)], { public: false, values: true, write: false }),
  write("create_secret", "Create a secret value explicitly supplied through a direct MCP connection", "secrets/projects/$projectSlug/environments/$environmentSlug/secrets", "POST", { ...env, key: z.string().regex(/^[A-Z_][A-Z0-9_]{0,255}$/), value: z.string().max(65536), description: optionalText, expectedRevision: revision, ...production }, ["key", "value", "description", "expectedRevision", ...Object.keys(production)], { public: false, values: true }),
  write("update_secret", "Update an explicitly selected secret through a direct MCP connection", "secrets/projects/$projectSlug/environments/$environmentSlug/secrets/$secretId", "PATCH", { ...secret, key: z.string().regex(/^[A-Z_][A-Z0-9_]{0,255}$/).optional(), value: z.string().max(65536).optional(), description: optionalText, expectedVersion: positive, expectedRevision: revision, ...production }, ["key", "value", "description", "expectedVersion", "expectedRevision", ...Object.keys(production)], { public: false, values: true }),
  write("delete_secret", "Delete an explicitly selected secret with production confirmation", "secrets/projects/$projectSlug/environments/$environmentSlug/secrets/$secretId", "DELETE", { ...secret, ...confirmedDelete, expectedRevision: revision }, [...Object.keys(confirmedDelete), "expectedRevision"]),
  write("rollback_secret", "Restore a historical secret version without revealing its value", "secrets/projects/$projectSlug/environments/$environmentSlug/secrets/$secretId.rollback", "POST", { ...secret, version: positive, expectedVersion: positive, expectedRevision: revision, ...production }, ["version", "expectedVersion", "expectedRevision", ...Object.keys(production)], { destructive: true }),
  write("export_secrets", "Export secret values only through a direct MCP connection", "secrets/projects/$projectSlug/environments/$environmentSlug/export", "POST", { ...env, confirmation: text.optional(), ...production }, ["confirmation", ...Object.keys(production)], { public: false, values: true, write: false }),
  write("import_secrets", "Import dotenv values explicitly supplied through a direct MCP connection", "secrets/projects/$projectSlug/environments/$environmentSlug/import", "POST", { ...env, envText: z.string().max(1_048_576), dryRun: z.boolean().optional(), expectedRevision: revision, ...production }, ["envText", "dryRun", "expectedRevision", ...Object.keys(production)], { public: false, values: true }),
  read("list_secret_trash", "List recoverable deleted secret metadata", "secrets/trash"),
  write("restore_secret_trash", "Restore a deleted vault, environment or secret using its required confirmation", "secrets/trash/restore", "POST", { ...org, type: z.enum(["project", "environment", "secret", "bulk"]), id, ...confirmedDelete }, ["type", "id", ...Object.keys(confirmedDelete)], { manager: true }),
  write("purge_secret_trash", "Permanently purge deleted data using its required confirmation", "secrets/trash/purge", "POST", { ...org, type: z.enum(["project", "environment", "secret", "bulk"]), id, ...confirmedDelete }, ["type", "id", ...Object.keys(confirmedDelete)], { manager: true, destructive: true }),
  read("list_secret_audit", "Read bounded secret audit metadata", "secrets/audit", { ...org, limit: positive.max(100).optional(), cursor: id.optional() }, ["limit", "cursor"]),
  read("list_credentials", "List credential metadata without returning authentication secrets", "auth-tokens"),
  write("create_credential", "Create a scoped machine credential; returned material is available only through direct MCP", "auth-tokens", "POST", { ...org, name, scopes: z.array(z.enum(["tunnel:connect", "observability:write", "secrets:read", "secrets:write", "secrets:delete"])).min(1), expiresIn: z.enum(["30d", "90d", "1y", "never"]).optional(), projectId: id.optional(), environmentId: id.optional() }, ["name", "scopes", "expiresIn", "projectId", "environmentId"], { public: false, values: true, manager: true }),
  write("revoke_credential", "Revoke a scoped machine credential", "auth-tokens", "DELETE", { ...org, id }, ["id"], { manager: true }),
  read("list_secret_shares", "List encrypted secret share metadata", "secrets/shares/index"),
  write("revoke_secret_share", "Revoke a secret share without revealing its contents", "secrets/shares/$shareId", "DELETE", { ...org, shareId: id }, [], { manager: true }),
  { ...write("create_secret_share", "Create an encrypted, expiring share link for explicitly selected secrets through direct MCP", undefined, "POST", { ...env, secretIds: strings.min(1).max(50), durationValue: positive.max(90), durationUnit: z.enum(["days", "months"]), maxViews: positive.max(100), ...production }, [], { public: false, values: true, manager: true }), operation: "secret_share" },
  write("rotate_secret_key", "Rotate the organization's Secrets encryption key after explicit confirmation", "secrets/keys/rotate", "POST", { ...org, confirmation: z.literal("ROTATE") }, ["confirmation"], { manager: true, destructive: true }),
  write("rewrap_secret_keys", "Rewrap organization data keys with the active configured master key", "secrets/keys/rewrap", "POST", org, [], { manager: true, destructive: true }),
  { ...read("get_organization", "Inspect organization settings and the connected user's role", undefined), operation: "organization" },
  { ...read("list_members", "List members and roles in an authorized organization", undefined), operation: "members" },
  { ...read("list_invitations", "List organization invitations", undefined), operation: "invitations", manager: true },
  { ...write("invite_member", "Invite the explicitly specified email to this organization", undefined, "POST", { ...org, email: z.email(), role: z.enum(["member", "admin"]).default("member") }, [], { manager: true, openWorld: true }), operation: "invite" },
  { ...write("cancel_invitation", "Cancel a pending organization invitation", undefined, "DELETE", { ...org, invitationId: id }, [], { manager: true }), operation: "cancel_invitation" },
  { ...write("update_member_role", "Change a member's role while preserving last-owner and role hierarchy rules", undefined, "PATCH", { ...org, memberId: id, role: z.enum(["member", "admin", "owner"]) }, [], { manager: true }), operation: "member_role" },
  { ...write("remove_member", "Remove a member while preserving last-owner and role hierarchy rules", undefined, "DELETE", { ...org, memberId: id }, [], { manager: true }), operation: "remove_member" },
  { ...write("update_organization", "Update an organization's name", undefined, "PATCH", { ...org, name }, [], { manager: true }), operation: "update_organization" },
  { ...read("get_billing_link", "Return a neutral link for billing account management; changes happen in OutRay", undefined), operation: "billing_link" },
];

export function toolsForCatalog(catalog: McpCatalog) {
  return outrayTools.filter((tool) => catalog === "direct" || (PUBLIC_MCP_TOOL_NAMES.has(tool.name) && tool.public && !tool.values));
}

export function schemaForTool(tool: OutrayTool) { return z.strictObject(tool.shape); }
