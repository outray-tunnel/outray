import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents, observabilityAlerts } from "@/db/alerts-schema";
import {
  alertConfigValues,
  serializeAlert,
} from "@/lib/observability/alert-api";
import {
  notificationEmailsBelongToOrganization,
  requireAlertManager,
} from "@/lib/observability/alert-access";
import { metricIdentityExists } from "@/lib/observability/alert-metric";
import { alertOAuthCredentials } from "@/lib/observability/alert-oauth";
import { validateAlertCreateInput } from "@/lib/observability/alert-validation";
import { requireOrgFromSlug } from "@/lib/org";
import { getOrganizationLimits, withOrganizationQuotaLock } from "@/lib/organization-entitlements.server";

export const Route = createFileRoute(
  "/api/$orgSlug/observability/alerts/",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const [rows, limits] = await Promise.all([
          db
          .select()
          .from(observabilityAlerts)
          .where(
            and(
              eq(
                observabilityAlerts.organizationId,
                orgResult.organization.id,
              ),
              isNull(observabilityAlerts.deletedAt),
            ),
          )
          .orderBy(desc(observabilityAlerts.createdAt)),
          getOrganizationLimits(orgResult.organization.id),
        ]);

        const openIncidentRows = rows.length
          ? await db
              .select({ id: incidents.id, sourceId: incidents.sourceId })
              .from(incidents)
              .where(
                and(
                  eq(incidents.organizationId, orgResult.organization.id),
                  eq(incidents.sourceType, "observability_alert"),
                  eq(incidents.status, "open"),
                  inArray(
                    incidents.sourceId,
                    rows.map((row) => row.id),
                  ),
                ),
              )
          : [];
        const openIncidents = new Map(
          openIncidentRows.map((incident) => [incident.sourceId, incident.id]),
        );
        const alerts = rows.map((row) =>
          serializeAlert(row, new Date(), openIncidents.get(row.id) ?? null),
        );
        const summary = {
          total: alerts.length,
          firing: 0,
          healthy: 0,
          pending: 0,
          noData: 0,
          error: 0,
          muted: 0,
          paused: 0,
        };
        for (const alert of alerts) {
          switch (alert.state) {
            case "firing":
              summary.firing += 1;
              break;
            case "healthy":
              summary.healthy += 1;
              break;
            case "pending":
              summary.pending += 1;
              break;
            case "no_data":
              summary.noData += 1;
              break;
            case "error":
              summary.error += 1;
              break;
            case "muted":
              summary.muted += 1;
              break;
            case "paused":
              summary.paused += 1;
              break;
          }
        }

        const services = Array.from(
          new Set(rows.map((row) => row.service).filter(Boolean) as string[]),
        ).sort((left, right) => left.localeCompare(right));

        return Response.json({
          alerts,
          services,
          summary,
          limit: limits.maxObservabilityAlerts,
          integrationAvailability: {
            slack: Boolean(alertOAuthCredentials("slack")),
            discord: Boolean(alertOAuthCredentials("discord")),
          },
        });
      },

      POST: async ({ request, params }) => {
        const access = await requireAlertManager(request, params.orgSlug);
        if ("error" in access) return access.error;

        const body = await readJsonObject(request);
        if ("error" in body) return body.error;
        const validation = validateAlertCreateInput(body.data);
        if (!validation.success) return validationError(validation);

        const organizationId = access.organization.id;
        const ownsEmail = await notificationEmailsBelongToOrganization(
          organizationId,
          validation.data.notificationEmails,
        );
        if (!ownsEmail) {
          return Response.json(
            {
              error:
                "Email recipients must be current organization members",
              field: "notificationEmails",
            },
            { status: 400 },
          );
        }

        if (validation.data.signal === "metric_value") {
          try {
            const exists = await metricIdentityExists(
              organizationId,
              validation.data,
            );
            if (!exists) {
              return Response.json(
                {
                  error:
                    "metric identity does not match an available gauge metric for this service",
                  field: "metricKey",
                },
                { status: 400 },
              );
            }
          } catch (error) {
            console.error("Failed to validate alert metric identity", error);
            return Response.json(
              { error: "Metric catalog is temporarily unavailable" },
              { status: 503 },
            );
          }
        }

        const now = new Date();
        const result = await db.transaction(async (tx) => {
          await withOrganizationQuotaLock(tx, organizationId);
          const { maxObservabilityAlerts: limit } = await getOrganizationLimits(organizationId, tx);
          if (limit !== -1) {
            const [existing] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(observabilityAlerts)
              .where(and(eq(observabilityAlerts.organizationId, organizationId), isNull(observabilityAlerts.deletedAt)));
            if (existing.count >= limit) return { limitReached: true, limit } as const;
          }

          const alertId = crypto.randomUUID();
          const [created] = await tx
            .insert(observabilityAlerts)
            .values({
              id: alertId,
              organizationId,
              createdBy: access.session!.user.id,
              ...alertConfigValues(validation.data),
              underlyingState: "no_data",
              nextEvaluationAt: now,
              lastStateChangedAt: now,
            })
            .returning();
          return { created } as const;
        });

        if ("limitReached" in result) {
          return Response.json(
            { error: `Organization alert limit reached (${result.limit})`, limit: result.limit },
            { status: 403 },
          );
        }

        return Response.json(
          { alert: serializeAlert(result.created, now) },
          { status: 201 },
        );
      },
    },
  },
});

async function readJsonObject(
  request: Request,
): Promise<{ data: unknown } | { error: Response }> {
  try {
    return { data: await request.json() };
  } catch {
    return {
      error: Response.json({ error: "Invalid JSON request body" }, { status: 400 }),
    };
  }
}

function validationError(result: {
  error: string;
  field?: string;
}) {
  return Response.json(
    { error: result.error, ...(result.field ? { field: result.field } : {}) },
    { status: 400 },
  );
}
