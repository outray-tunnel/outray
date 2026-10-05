import { createFileRoute } from "@tanstack/react-router";
import { ProductSetup } from "@/components/onboarding/product-setup";
import { parseSetupProduct, type SetupProduct } from "@/components/onboarding/setup-products";

export const Route = createFileRoute("/$orgSlug/setup")({
  validateSearch: (search: Record<string, unknown>): { product: SetupProduct } => ({
    product: parseSetupProduct(search.product),
  }),
  head: () => ({ meta: [{ title: "Set up OutRay" }] }),
  component: SetupPage,
});

function SetupPage() {
  const { orgSlug } = Route.useParams();
  const { product } = Route.useSearch();
  return <ProductSetup key={orgSlug + ":" + product} orgSlug={orgSlug} product={product} />;
}
