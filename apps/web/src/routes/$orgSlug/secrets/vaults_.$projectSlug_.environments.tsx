import { createFileRoute } from "@tanstack/react-router";
import { VaultEnvironmentsLayout } from "@/components/secrets/vault-environments-layout";

export const Route = createFileRoute("/$orgSlug/secrets/vaults_/$projectSlug_/environments")({
  component: VaultEnvironmentsRoute,
});

function VaultEnvironmentsRoute() {
  const { orgSlug, projectSlug } = Route.useParams();
  return <VaultEnvironmentsLayout key={JSON.stringify([orgSlug, projectSlug])} orgSlug={orgSlug} projectSlug={projectSlug} />;
}
