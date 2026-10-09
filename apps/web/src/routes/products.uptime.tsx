import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/landing/products/ProductPage";
import { productPageHead } from "@/landing/products/meta";

export const Route = createFileRoute("/products/uptime")({
  head: () => productPageHead("uptime"),
  component: () => <ProductPage product="uptime" />,
});
