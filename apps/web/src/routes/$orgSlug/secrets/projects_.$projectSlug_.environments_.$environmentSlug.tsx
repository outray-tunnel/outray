import { createFileRoute, redirect } from "@tanstack/react-router";

export { VaultEnvironmentPageView } from "@/components/secrets/environment-keys-workspace";

export const Route = createFileRoute("/$orgSlug/secrets/projects_/$projectSlug_/environments_/$environmentSlug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$orgSlug/secrets/vaults/$projectSlug/environments/$environmentSlug",
      params: { orgSlug: params.orgSlug, projectSlug: params.projectSlug, environmentSlug: params.environmentSlug },
      replace: true,
    });
  },
});
