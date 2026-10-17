import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { uptimeSubscribers } from "@/db/uptime-schema";
import { badInput, findStatusPage, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { parseSubscriberQuery, serializeSubscriber, subscriberCursor, subscriberSearchPattern } from "@/lib/uptime/subscriber-api";

export const Route = createFileRoute("/api/$orgSlug/uptime/subscribers/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Email addresses are management-only, unlike the public incident feed.
        const access = await requireUptimeManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const input = parseSubscriberQuery(new URL(request.url).searchParams);
        if ("error" in input) return badInput(input.error);
        const organizationId = access.organization.id;
        const page = await findStatusPage(organizationId, request);
        if (!page) return notFound("Status page");
        const scope = and(eq(uptimeSubscribers.organizationId, organizationId), eq(uptimeSubscribers.pageId, page.id));
        const [rows, [counts]] = await Promise.all([
          db.select().from(uptimeSubscribers).where(and(scope,
            input.q ? ilike(uptimeSubscribers.email, subscriberSearchPattern(input.q)) : undefined,
            input.status ? eq(uptimeSubscribers.status, input.status) : undefined,
            input.cursor ? or(lt(uptimeSubscribers.createdAt, input.cursor.createdAt),
              and(eq(uptimeSubscribers.createdAt, input.cursor.createdAt), lt(uptimeSubscribers.id, input.cursor.id))) : undefined,
          )).orderBy(desc(uptimeSubscribers.createdAt), desc(uptimeSubscribers.id)).limit(input.limit + 1),
          db.select({
            all: sql<number>`count(*)::int`,
            pending: sql<number>`count(*) FILTER (WHERE ${uptimeSubscribers.status} = 'pending')::int`,
            confirmed: sql<number>`count(*) FILTER (WHERE ${uptimeSubscribers.status} = 'confirmed')::int`,
            unsubscribed: sql<number>`count(*) FILTER (WHERE ${uptimeSubscribers.status} = 'unsubscribed')::int`,
          }).from(uptimeSubscribers).where(scope),
        ]);
        const visible = rows.slice(0, input.limit);
        return Response.json({ subscribers: visible.map(serializeSubscriber), counts,
          nextCursor: rows.length > input.limit ? subscriberCursor(visible[visible.length - 1]) : null,
          subscriptionsEnabled: page.subscriptionsEnabled });
      },
    },
  },
});
