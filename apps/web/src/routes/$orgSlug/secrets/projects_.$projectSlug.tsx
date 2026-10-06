import { createFileRoute, redirect } from "@tanstack/react-router";

export { VaultPageView } from "@/components/secrets/vault-workspace";

export const Route = createFileRoute("/$orgSlug/secrets/projects_/$projectSlug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$orgSlug/secrets/vaults/$projectSlug",
      params: { orgSlug: params.orgSlug, projectSlug: params.projectSlug },
      replace: true,
    });
  },
});
