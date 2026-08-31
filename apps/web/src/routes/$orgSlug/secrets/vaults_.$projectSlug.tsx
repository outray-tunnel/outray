import { createFileRoute } from "@tanstack/react-router";
import { VaultPageView } from "./projects_.$projectSlug";

export const Route = createFileRoute(
  "/$orgSlug/secrets/vaults_/$projectSlug",
)({
  head: () => ({ meta: [{ title: "Vault - OutRay Secrets" }] }),
  component: VaultPage,
});

function VaultPage() {
  const { orgSlug, projectSlug } = Route.useParams();
  return <VaultPageView orgSlug={orgSlug} projectSlug={projectSlug} />;
}
