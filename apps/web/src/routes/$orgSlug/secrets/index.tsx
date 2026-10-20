import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/secrets/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$orgSlug/secrets/vaults",
      params: { orgSlug: params.orgSlug },
      replace: true,
    });
  },
});
