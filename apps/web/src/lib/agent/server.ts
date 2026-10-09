import { db } from "../../db";
import { requireOrgMembershipFromSlug } from "../org";
import { createAgentHandlers } from "./handlers";
import { agentMonthlyUsage, reportAgentUsageAccountingError } from "./monthly-usage-redis";
import { createAgentStore } from "./store";
import { createAgentUsageStore } from "./usage-store";

export const agentHandlers = createAgentHandlers({
  store: createAgentUsageStore(createAgentStore(db), agentMonthlyUsage, {
    onAccountingError: reportAgentUsageAccountingError,
  }),
  async authorize(request, orgSlug) {
    const access = await requireOrgMembershipFromSlug(request, orgSlug);
    if ("error" in access) return access.error;
    if (!access.session?.user.id) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return { organizationId: access.organization.id, userId: access.session.user.id };
  },
});
