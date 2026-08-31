import { createFileRoute } from "@tanstack/react-router";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  incidents,
  observabilityAlertEvaluations,
  observabilityAlerts,
} from "@/db/alerts-schema";
import { serializeAlert } from "@/lib/observability/alert-api";
import { requireAlertManager } from "@/lib/observability/alert-access";

export const Route = createFileRoute(
  "/api/$orgSlug/observability/alerts/$alertId/evaluate",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const access = await requireAlertManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const organizationId = access.organization.id;
        const now = new Date();

        const [existing] = await db
          .select()
          .from(observabilityAlerts)
          .where(
            and(
              eq(observabilityAlerts.id, params.alertId),
              eq(observabilityAlerts.organizationId, organizationId),
              isNull(observabilityAlerts.deletedAt),
            ),
          )
          .limit(1);
        if (!existing) return notFound();
        if (!existing.enabled) {
          return Response.json(
            { error: "Resume this alert before requesting an evaluation" },
            { status: 409 },
          );
        }

        const windowEndedAt = currentEvaluationBoundary(now);
        const [completedWindow] = await db
          .select({ id: observabilityAlertEvaluations.id })
          .from(observabilityAlertEvaluations)
          .where(
            and(
              eq(observabilityAlertEvaluations.alertId, existing.id),
              eq(observabilityAlertEvaluations.windowEndedAt, windowEndedAt),
              inArray(observabilityAlertEvaluations.status, [
                "success",
                "no_data",
              ]),
            ),
          )
          .limit(1);

        if (completedWindow) {
          return Response.json({
            alert: serializeAlert(existing, now),
            evaluationQueued: false,
            evaluationInProgress: false,
            alreadyEvaluated: true,
          });
        }

        const [queued] = await db
          .update(observabilityAlerts)
          .set({ nextEvaluationAt: now, updatedAt: now })
          .where(
            and(
              eq(observabilityAlerts.id, existing.id),
              eq(observabilityAlerts.organizationId, organizationId),
              eq(observabilityAlerts.enabled, true),
              isNull(observabilityAlerts.deletedAt),
              or(
                isNull(observabilityAlerts.leaseUntil),
                lte(observabilityAlerts.leaseUntil, now),
              ),
            ),
          )
          .returning();

        const [openIncident] = await db
          .select({ id: incidents.id })
          .from(incidents)
          .where(
            and(
              eq(incidents.organizationId, organizationId),
              eq(incidents.sourceType, "observability_alert"),
              eq(incidents.sourceId, existing.id),
              eq(incidents.status, "open"),
            ),
          )
          .limit(1);

        return Response.json(
          {
            alert: serializeAlert(
              queued ?? existing,
              now,
              openIncident?.id ?? null,
            ),
            evaluationQueued: Boolean(queued),
            evaluationInProgress: !queued,
          },
          { status: 202 },
        );
      },
    },
  },
});

function notFound() {
  return Response.json({ error: "Alert not found" }, { status: 404 });
}

function currentEvaluationBoundary(now: Date) {
  const configuredDelay = Number(process.env.ALERT_LATE_DATA_SECONDS);
  const lateDataSeconds = Number.isInteger(configuredDelay)
    ? Math.max(0, Math.min(300, configuredDelay))
    : 60;
  const minute = Math.floor(now.getTime() / 60_000) * 60_000;
  return new Date(minute - lateDataSeconds * 1_000);
}
