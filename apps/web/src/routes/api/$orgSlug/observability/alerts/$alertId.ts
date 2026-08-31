import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  incidents,
  notifications,
  observabilityAlertEvaluations,
  observabilityAlerts,
} from "@/db/alerts-schema";
import {
  alertConfigFromRow,
  alertConfigValues,
  serializeAlert,
  serializeEvaluation,
  serializeIncident,
  serializeNotification,
} from "@/lib/observability/alert-api";
import {
  notificationEmailBelongsToOrganization,
  requireAlertManager,
} from "@/lib/observability/alert-access";
import { metricIdentityExists } from "@/lib/observability/alert-metric";
import { validateAlertPatchInput } from "@/lib/observability/alert-validation";
import { requireOrgFromSlug } from "@/lib/org";

const EVALUATION_CONFIG_FIELDS = new Set([
  "signal",
  "service",
  "environment",
  "metricKey",
  "metricName",
  "metricType",
  "metricUnit",
  "aggregationTemporality",
  "isMonotonic",
  "metricAggregation",
  "logLevel",
  "logQuery",
  "operator",
  "threshold",
  "windowMinutes",
  "evaluationIntervalSeconds",
  "consecutiveFailures",
  "consecutiveRecoveries",
  "minimumSamples",
  "noDataState",
]);

const METRIC_IDENTITY_FIELDS = new Set([
  "signal",
  "service",
  "metricKey",
  "metricName",
  "metricType",
  "metricUnit",
  "aggregationTemporality",
  "isMonotonic",
]);

export const Route = createFileRoute(
  "/api/$orgSlug/observability/alerts/$alertId",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const organizationId = orgResult.organization.id;

        const alert = await findAlert(organizationId, params.alertId);
        if (!alert) return notFound();

        const url = new URL(request.url);
        const evaluationLimit = boundedLimit(
          url.searchParams.get("evaluationLimit"),
          100,
          200,
        );
        const incidentLimit = boundedLimit(
          url.searchParams.get("incidentLimit"),
          50,
          100,
        );
        const notificationLimit = boundedLimit(
          url.searchParams.get("notificationLimit"),
          50,
          100,
        );

        const [evaluationRows, incidentRows, notificationRows] =
          await Promise.all([
            db
              .select()
              .from(observabilityAlertEvaluations)
              .where(
                and(
                  eq(
                    observabilityAlertEvaluations.organizationId,
                    organizationId,
                  ),
                  eq(observabilityAlertEvaluations.alertId, alert.id),
                ),
              )
              .orderBy(desc(observabilityAlertEvaluations.evaluatedAt))
              .limit(evaluationLimit),
            db
              .select()
              .from(incidents)
              .where(
                and(
                  eq(incidents.organizationId, organizationId),
                  eq(incidents.sourceType, "observability_alert"),
                  eq(incidents.sourceId, alert.id),
                ),
              )
              .orderBy(desc(incidents.startedAt))
              .limit(incidentLimit),
            db
              .select()
              .from(notifications)
              .where(
                and(
                  eq(notifications.organizationId, organizationId),
                  eq(notifications.sourceType, "observability_alert"),
                  eq(notifications.sourceId, alert.id),
                ),
              )
              .orderBy(desc(notifications.createdAt))
              .limit(notificationLimit),
          ]);

        return Response.json({
          alert: serializeAlert(
            alert,
            new Date(),
            incidentRows.find((incident) => incident.status === "open")?.id ??
              null,
          ),
          evaluations: evaluationRows.map(serializeEvaluation),
          incidents: incidentRows.map(serializeIncident),
          notifications: notificationRows.map(serializeNotification),
        });
      },

      PATCH: async ({ request, params }) => {
        const access = await requireAlertManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const organizationId = access.organization.id;

        const existing = await findAlert(organizationId, params.alertId);
        if (!existing) return notFound();

        const body = await readJsonObject(request);
        if ("error" in body) return body.error;
        const validation = validateAlertPatchInput(
          body.data,
          alertConfigFromRow(existing),
        );
        if (!validation.success) return validationError(validation);

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

        const keys = Object.keys(body.data as Record<string, unknown>);
        const metricIdentityChanged = keys.some((key) =>
          METRIC_IDENTITY_FIELDS.has(key),
        );
        if (
          validation.data.signal === "metric_value" &&
          metricIdentityChanged
        ) {
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

        const evaluationConfigChanged = keys.some((key) =>
          EVALUATION_CONFIG_FIELDS.has(key),
        );
        const now = new Date();
        const updated = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(observabilityAlerts)
            .set({
              ...alertConfigValues(validation.data),
              ...(evaluationConfigChanged
                ? {
                    underlyingState: "no_data",
                    currentValue: null,
                    sampleCount: 0,
                    failureStreak: 0,
                    recoveryStreak: 0,
                    lastEvaluationError: null,
                    lastStateChangedAt: now,
                    nextEvaluationAt: now,
                  }
                : validation.data.enabled && !existing.enabled
                  ? { nextEvaluationAt: now }
                  : {}),
              leaseOwner: null,
              leaseUntil: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(observabilityAlerts.id, existing.id),
                eq(observabilityAlerts.organizationId, organizationId),
                isNull(observabilityAlerts.deletedAt),
              ),
            )
            .returning();

          if (row && evaluationConfigChanged) {
            await tx
              .update(incidents)
              .set({
                status: "resolved",
                resolvedAt: now,
                updatedAt: now,
              })
              .where(
                and(
                  eq(incidents.organizationId, organizationId),
                  eq(incidents.sourceType, "observability_alert"),
                  eq(incidents.sourceId, row.id),
                  eq(incidents.status, "open"),
                ),
              );
          }

          return row;
        });

        if (!updated) return notFound();
        const [openIncident] = await db
          .select({ id: incidents.id })
          .from(incidents)
          .where(
            and(
              eq(incidents.organizationId, organizationId),
              eq(incidents.sourceType, "observability_alert"),
              eq(incidents.sourceId, updated.id),
              eq(incidents.status, "open"),
            ),
          )
          .limit(1);
        return Response.json({
          alert: serializeAlert(updated, now, openIncident?.id ?? null),
        });
      },

      DELETE: async ({ request, params }) => {
        const access = await requireAlertManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const organizationId = access.organization.id;
        const now = new Date();

        const result = await db.transaction(async (tx) => {
          const [deleted] = await tx
            .update(observabilityAlerts)
            .set({
              enabled: false,
              deletedAt: now,
              leaseOwner: null,
              leaseUntil: null,
              mutedUntil: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(observabilityAlerts.id, params.alertId),
                eq(observabilityAlerts.organizationId, organizationId),
                isNull(observabilityAlerts.deletedAt),
              ),
            )
            .returning({ id: observabilityAlerts.id });

          if (!deleted) return null;

          await tx
            .update(incidents)
            .set({ status: "resolved", resolvedAt: now, updatedAt: now })
            .where(
              and(
                eq(incidents.organizationId, organizationId),
                eq(incidents.sourceType, "observability_alert"),
                eq(incidents.sourceId, deleted.id),
                eq(incidents.status, "open"),
              ),
            );

          return deleted;
        });

        if (!result) return notFound();
        return Response.json({ success: true });
      },
    },
  },
});

async function findAlert(organizationId: string, alertId: string) {
  const [alert] = await db
    .select()
    .from(observabilityAlerts)
    .where(
      and(
        eq(observabilityAlerts.id, alertId),
        eq(observabilityAlerts.organizationId, organizationId),
        isNull(observabilityAlerts.deletedAt),
      ),
    )
    .limit(1);
  return alert;
}

function notFound() {
  return Response.json({ error: "Alert not found" }, { status: 404 });
}

function boundedLimit(input: string | null, fallback: number, maximum: number) {
  const value = Number(input);
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

async function readJsonObject(
  request: Request,
): Promise<{ data: unknown } | { error: Response }> {
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return {
        error: Response.json(
          { error: "Request body must be an object" },
          { status: 400 },
        ),
      };
    }
    return { data };
  } catch {
    return {
      error: Response.json({ error: "Invalid JSON request body" }, { status: 400 }),
    };
  }
}

function validationError(result: { error: string; field?: string }) {
  return Response.json(
    { error: result.error, ...(result.field ? { field: result.field } : {}) },
    { status: 400 },
  );
}
