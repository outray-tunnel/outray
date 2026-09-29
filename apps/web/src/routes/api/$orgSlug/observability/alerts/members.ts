import { createFileRoute } from "@tanstack/react-router";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, users } from "@/db/auth-schema";
import { requireAlertManager } from "@/lib/observability/alert-access";

export const Route = createFileRoute("/api/$orgSlug/observability/alerts/members")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const access = await requireAlertManager(request, params.orgSlug);
        if ("error" in access) return access.error;

        const rows = await db
          .select({ id: users.id, name: users.name, email: users.email, role: members.role })
          .from(members)
          .innerJoin(users, eq(members.userId, users.id))
          .where(eq(members.organizationId, access.organization.id))
          .orderBy(asc(users.name), asc(users.email));

        return Response.json({ members: rows, currentUserId: access.session!.user.id });
      },
    },
  },
});
