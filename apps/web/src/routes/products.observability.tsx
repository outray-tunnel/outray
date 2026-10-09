import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/landing/products/ProductPage";
import { productPageHead } from "@/landing/products/meta";

export const Route = createFileRoute("/products/observability")({
  head: () => productPageHead("observability"),
  component: () => <ProductPage product="observability" />,
});
