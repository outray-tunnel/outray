import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/landing/products/ProductPage";
import { productPageHead } from "@/landing/products/meta";

export const Route = createFileRoute("/products/tunnels")({
  head: () => productPageHead("tunnels"),
  component: () => <ProductPage product="tunnels" />,
});
