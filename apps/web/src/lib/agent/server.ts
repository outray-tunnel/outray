import { db } from "../../db";
import { requireOrgMembershipFromSlug } from "../org";
import { createAgentHandlers } from "./handlers";
import { createAgentStore } from "./store";

export const agentHandlers = createAgentHandlers({
  store: createAgentStore(db),
  async authorize(request, orgSlug) {
    const access = await requireOrgMembershipFromSlug(request, orgSlug);
    if ("error" in access) return access.error;
    if (!access.session?.user.id) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return { organizationId: access.organization.id, userId: access.session.user.id };
  },
});
