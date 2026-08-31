import { createFileRoute } from "@tanstack/react-router";
import { VaultsPageView } from "./projects";

export const Route = createFileRoute("/$orgSlug/secrets/vaults")({
  head: () => ({ meta: [{ title: "Vaults - OutRay Secrets" }] }),
  component: VaultsPage,
});

function VaultsPage() {
  const { orgSlug } = Route.useParams();
  return <VaultsPageView orgSlug={orgSlug} />;
}
