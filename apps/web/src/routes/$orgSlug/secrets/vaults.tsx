import { createFileRoute } from "@tanstack/react-router";
import { VaultsPageView } from "@/components/secrets/vaults-workspace";

export const Route = createFileRoute("/$orgSlug/secrets/vaults")({
  head: () => ({ meta: [{ title: "Vaults - OutRay Secrets" }] }),
  component: VaultsPage,
});

function VaultsPage() {
  const { orgSlug } = Route.useParams();
  return <VaultsPageView orgSlug={orgSlug} />;
}
