import { createFileRoute, Navigate } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/")({
  component: () => {
    const { data, isPending } = authClient.useSession();
    const { data: organizations, isPending: isOrgsPending } =
      authClient.useListOrganizations();

    if (isPending || isOrgsPending) return <div></div>;

    if (!data?.session) {
      return <Navigate to="/login" replace />;
    }

    return (
      <Navigate
        to="/$orgSlug"
        params={{ orgSlug: organizations?.[0]?.slug! }}
        replace
      />
    );
  },
});
