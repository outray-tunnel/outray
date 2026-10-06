import { createFileRoute, redirect } from "@tanstack/react-router";

export { VaultsPageView } from "@/components/secrets/vaults-workspace";

export const Route = createFileRoute("/$orgSlug/secrets/projects")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$orgSlug/secrets/vaults",
      params: { orgSlug: params.orgSlug },
      replace: true,
    });
  },
});
