import { createFileRoute } from "@tanstack/react-router";
import { VaultEnvironmentPageView } from "@/components/secrets/environment-keys-workspace";
import { useVaultEnvironmentsLayout } from "@/components/secrets/vault-environments-context";

export const Route = createFileRoute(
  "/$orgSlug/secrets/vaults_/$projectSlug_/environments/$environmentSlug",
)({
  head: () => ({ meta: [{ title: "Environment - OutRay Secrets" }] }),
  component: VaultEnvironmentPage,
});

function VaultEnvironmentPage() {
  const { orgSlug, projectSlug, environmentSlug } = Route.useParams();
  const layout = useVaultEnvironmentsLayout();
  return (
    <VaultEnvironmentPageView
      orgSlug={orgSlug}
      projectSlug={projectSlug}
      environmentSlug={environmentSlug}
      project={layout.project}
      sharedLayout
      actionsContainer={layout.actionsContainer}
      onProjectMutated={layout.reloadProject}
    />
  );
}
