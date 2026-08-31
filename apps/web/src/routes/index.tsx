import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";

const resolveHomeDestination = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });

    if (!session?.user) return "/login";

    const organizations = await auth.api.listOrganizations({ headers });
    if (!organizations.length) return "/onboarding";

    const activeOrganization = organizations.find(
      (organization) =>
        organization.id === session.session.activeOrganizationId,
    );

    return `/${activeOrganization?.slug || organizations[0].slug}`;
  },
);

export const Route = createFileRoute("/")({
  loader: async () => {
    const destination = await resolveHomeDestination();
    throw redirect({ href: destination, replace: true });
  },
});
