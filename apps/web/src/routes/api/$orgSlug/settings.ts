import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { organizationSettings } from "../../../db/app-schema";
import { requireOrgFromSlug } from "../../../lib/org";
import { redis } from "../../../lib/redis";

async function publishFullCaptureSetting(
  organizationId: string,
  enabled: boolean,
) {
  try {
    await redis.publish(
      "tunnel:control",
      JSON.stringify({
        type: "full_capture_setting",
        organizationId,
        enabled,
      }),
    );
  } catch (error) {
    console.error("Failed to publish full capture setting:", error);
  }
}

export const Route = createFileRoute("/api/$orgSlug/settings")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const orgResult = await requireOrgFromSlug(request, params.orgSlug);
          if ("error" in orgResult) return orgResult.error;
          const { organization } = orgResult;

          // Get organization settings
          const settings = await db.query.organizationSettings.findFirst({
            where: eq(organizationSettings.organizationId, organization.id),
          });

          const fullCaptureEnabled = settings?.fullCaptureEnabled ?? false;
          await publishFullCaptureSetting(
            organization.id,
            fullCaptureEnabled,
          );

          return Response.json({ fullCaptureEnabled });
        } catch (error) {
          console.error("Error fetching organization settings:", error);
          return Response.json(
            { error: "Failed to fetch settings" },
            { status: 500 }
          );
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          const orgResult = await requireOrgFromSlug(request, params.orgSlug);
          if ("error" in orgResult) return orgResult.error;
          const { organization } = orgResult;

          const body = await request.json();
          const { fullCaptureEnabled } = body;

          if (typeof fullCaptureEnabled !== "boolean") {
            return Response.json(
              { error: "fullCaptureEnabled must be a boolean" },
              { status: 400 }
            );
          }

          // Upsert organization settings
          await db
            .insert(organizationSettings)
            .values({
              id: crypto.randomUUID(),
              organizationId: organization.id,
              fullCaptureEnabled,
            })
            .onConflictDoUpdate({
              target: organizationSettings.organizationId,
              set: {
                fullCaptureEnabled,
              },
            });

          await publishFullCaptureSetting(
            organization.id,
            fullCaptureEnabled,
          );

          return Response.json({ success: true, fullCaptureEnabled });
        } catch (error) {
          console.error("Error updating organization settings:", error);
          return Response.json(
            { error: "Failed to update settings" },
            { status: 500 }
          );
        }
      },
    },
  },
});
