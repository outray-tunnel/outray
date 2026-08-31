import { createFileRoute } from "@tanstack/react-router";
import { VaultEnvironmentPageView } from "./projects_.$projectSlug_.environments_.$environmentSlug";

export const Route = createFileRoute(
  "/$orgSlug/secrets/vaults_/$projectSlug_/environments_/$environmentSlug",
)({
  head: () => ({ meta: [{ title: "Environment - OutRay Secrets" }] }),
  component: VaultEnvironmentPage,
});

function VaultEnvironmentPage() {
  const { orgSlug, projectSlug, environmentSlug } = Route.useParams();
  return (
    <VaultEnvironmentPageView
      orgSlug={orgSlug}
      projectSlug={projectSlug}
      environmentSlug={environmentSlug}
    />
  );
}
