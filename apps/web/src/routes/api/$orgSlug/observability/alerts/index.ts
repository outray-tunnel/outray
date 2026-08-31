import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { incidents, observabilityAlerts } from "@/db/alerts-schema";
import { organizations } from "@/db/auth-schema";
import {
  alertConfigValues,
  serializeAlert,
} from "@/lib/observability/alert-api";
import {
  notificationEmailBelongsToOrganization,
  requireAlertManager,
} from "@/lib/observability/alert-access";
import { metricIdentityExists } from "@/lib/observability/alert-metric";
import { validateAlertCreateInput } from "@/lib/observability/alert-validation";
import { requireOrgFromSlug } from "@/lib/org";

export const Route = createFileRoute(
  "/api/$orgSlug/observability/alerts/",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const rows = await db
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
          .orderBy(desc(observabilityAlerts.createdAt));

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

        return Response.json({ alerts, services, summary });
      },

      POST: async ({ request, params }) => {
        const access = await requireAlertManager(request, params.orgSlug);
        if ("error" in access) return access.error;

        const body = await readJsonObject(request);
        if ("error" in body) return body.error;
        const validation = validateAlertCreateInput(body.data);
        if (!validation.success) return validationError(validation);

        const organizationId = access.organization.id;
        const ownsEmail = await notificationEmailBelongsToOrganization(
          organizationId,
          validation.data.notificationEmail,
        );
        if (!ownsEmail) {
          return Response.json(
            {
              error:
                "notificationEmail must belong to a current organization member",
              field: "notificationEmail",
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
          await tx
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.id, organizationId))
            .for("update");

          const existing = await tx
            .select({ id: observabilityAlerts.id })
            .from(observabilityAlerts)
            .where(
              and(
                eq(observabilityAlerts.organizationId, organizationId),
                isNull(observabilityAlerts.deletedAt),
              ),
            )
            .limit(200);
          if (existing.length >= 200) return { limitReached: true } as const;

          const [created] = await tx
            .insert(observabilityAlerts)
            .values({
              id: crypto.randomUUID(),
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
            { error: "Organization alert limit reached (200)" },
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
