import { createFileRoute, Navigate, useParams } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/settings/")({
  component: () => {
    const { orgSlug } = useParams({ from: "/$orgSlug/settings" });
    return (
      <Navigate
        to="/$orgSlug/settings/profile"
        params={{
          orgSlug,
        }}
      />
    );
  },
});
