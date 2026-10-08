import { createFileRoute } from "@tanstack/react-router";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, users } from "@/db/auth-schema";
import { badInput, requireUptimeRead } from "@/lib/uptime/api";
import { parseUptimeMembersQuery, uptimeMembersPage, uptimeMembersWhere } from "@/lib/uptime/members-query";

export const Route = createFileRoute("/api/$orgSlug/uptime/members")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const access = await requireUptimeRead(request, params.orgSlug);
      if ("error" in access) return access.error;
      const parsed = parseUptimeMembersQuery(new URL(request.url).searchParams);
      if (!parsed.success) return badInput(parsed.error, parsed.field);
      const query = db.select({ id: users.id, name: users.name, email: users.email, role: members.role })
        .from(members).innerJoin(users, eq(members.userId, users.id))
        .where(uptimeMembersWhere(access.organization.id, parsed.data))
        .orderBy(asc(users.name), asc(users.email), asc(users.id));
      if (!parsed.data) {
        return Response.json({ members: await query, currentUserId: access.session!.user.id });
      }
      const rows = await query.limit(parsed.data.limit + 1);
      return Response.json({ ...uptimeMembersPage(rows, parsed.data), currentUserId: access.session!.user.id });
    },
  } },
});
