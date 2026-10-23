/** Operator-only fixtures. This module is never exposed in either MCP catalog. */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { members, organizations, users } from "../../db/auth-schema";
import { incidents } from "../../db/alerts-schema";
import { secretProjects } from "../../db/secrets-schema";
import { uptimeMonitors, uptimeStatusPages, uptimeStatusComponents } from "../../db/uptime-schema";
import { dispatchMcpTool } from "./dispatch";
import { outrayTools } from "./catalog";
import { MCP_SCOPES } from "./policy";
import type { McpRequestActor } from "./request-actor";
import { instanceConfig } from "../../../../../shared/instance-config";

const slug = "mcp-review";
const purpose = "outray-plugin-review";

export async function prepareMcpReview(email: string, ingestOrigin?: string) {
  if (instanceConfig().selfHosted) throw new Error("Directory review fixtures require the hosted OutRay installation");
  const { user, organization } = await db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, email));
    let [organization] = await tx.select().from(organizations).where(eq(organizations.slug, slug)).for("update");
    if (organization && JSON.parse(organization.metadata || "{}").purpose !== purpose) throw new Error("The review slug belongs to another organization");
    if (user) {
      const memberships = await tx.select().from(members).where(eq(members.userId, user.id));
      if (memberships.some((membership) => membership.organizationId !== organization?.id)) throw new Error("Use a dedicated reviewer account without other organization access");
    }
    if (!user) [user] = await tx.insert(users).values({ id: crypto.randomUUID(), email, name: "OutRay reviewer", emailVerified: false }).returning();
    if (!organization) [organization] = await tx.insert(organizations).values({ id: crypto.randomUUID(), name: "OutRay plugin review", slug,
      createdAt: new Date(), metadata: JSON.stringify({ purpose, version: 1 }) }).returning();
    const existing = await tx.select().from(members).where(eq(members.organizationId, organization.id));
    if (existing.some((membership) => membership.userId !== user.id)) throw new Error("The review organization has unexpected members");
    if (!existing.length) await tx.insert(members).values({ id: crypto.randomUUID(), organizationId: organization.id, userId: user.id, role: "owner", createdAt: new Date() });
    else if (existing[0].role !== "owner") throw new Error("The reviewer must own the isolated review organization");
    return { user, organization };
  });
  const actor: McpRequestActor = { user, connectionId: "operator-review-fixture", organizationIds: [organization.id], scopes: [...MCP_SCOPES], catalog: "direct" };
  const invoke = async (name: string, args: Record<string, unknown> = {}) => {
    const tool = outrayTools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error("Review tool is unavailable");
    return await dispatchMcpTool(tool, actor, { orgSlug: slug, ...args }) as Record<string, any>;
  };
  const [vault] = await db.select().from(secretProjects).where(and(eq(secretProjects.organizationId, organization.id), eq(secretProjects.slug, "demo"), isNull(secretProjects.deletedAt)));
  if (!vault) await invoke("create_vault", { name: "Demo", slug: "demo" });
  const target = { vaultSlug: "demo", environmentSlug: "development" };
  const inventory = await invoke("list_secrets", target);
  if (!inventory.secrets.some((secret: { key: string }) => secret.key === "DEMO_MESSAGE")) {
    const current = await invoke("get_environment_revision", target);
    await invoke("create_secret", { ...target, key: "DEMO_MESSAGE", value: "Synthetic review fixture", expectedRevision: current.revision });
  }
  let [monitor] = await db.select().from(uptimeMonitors).where(and(eq(uptimeMonitors.organizationId, organization.id), isNull(uptimeMonitors.deletedAt)));
  if (!monitor) monitor = (await invoke("create_monitor", { name: "Demo endpoint", url: "https://example.com", enabled: false })).monitor;
  let [page] = await db.select().from(uptimeStatusPages).where(eq(uptimeStatusPages.organizationId, organization.id));
  if (!page) page = (await invoke("create_status_page", { name: "Review status", slug: "outray-mcp-review" })).page;
  const [component] = await db.select().from(uptimeStatusComponents).where(eq(uptimeStatusComponents.pageId, page.id));
  if (!component) await invoke("create_status_component", { pageId: page.id, name: "Demo API", monitorIds: [monitor.id] });
  const [incident] = await db.select().from(incidents).where(and(eq(incidents.organizationId, organization.id), eq(incidents.sourceType, "uptime_manual")));
  if (!incident) await invoke("create_incident", { pageId: page.id, title: "Review exercise", componentIds: [], note: "Synthetic demonstration; no customer incident.", status: "investigating", publish: false });

  let traceId: string | undefined;
  if (ingestOrigin) {
    const credential = await invoke("create_credential", { name: "Temporary review fixture ingestion", scopes: ["observability:write"], expiresIn: "30d" });
    try {
      traceId = crypto.randomUUID().replaceAll("-", "");
      const now = BigInt(Date.now()) * 1_000_000n;
      const span = { traceId, spanId: crypto.randomUUID().replaceAll("-", "").slice(0, 16), name: "GET /demo", kind: 2,
        startTimeUnixNano: String(now - 25_000_000n), endTimeUnixNano: String(now), status: { code: 2, message: "Synthetic review failure" },
        attributes: [{ key: "http.request.method", value: { stringValue: "GET" } }, { key: "http.response.status_code", value: { intValue: "503" } }, { key: "url.path", value: { stringValue: "/demo" } }] };
      const response = await fetch(`${ingestOrigin}/v1/traces`, { method: "POST", signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
        body: JSON.stringify({ resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "demo-service" } }, { key: "deployment.environment.name", value: { stringValue: "review" } }] }, scopeSpans: [{ scope: { name: "outray-plugin-review" }, spans: [span] }] }] }) });
      if (!response.ok) throw new Error(`Review telemetry ingestion failed (${response.status})`);
    } finally { await invoke("revoke_credential", { id: credential.machineToken.id }); }
  }
  return { organizationSlug: slug, pageId: page.id, monitorId: monitor.id, traceId,
    telemetry: traceId ? "Accepted by ingestion; verify it through list_services before recording" : "Not seeded: supply MCP_REVIEW_INGEST_ORIGIN" };
}
