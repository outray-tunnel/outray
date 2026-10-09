import { createFileRoute } from "@tanstack/react-router";
import { ProductsIndex } from "@/landing/products/ProductPage";
import { productPageHead } from "@/landing/products/meta";

export const Route = createFileRoute("/products/")({
  head: () => productPageHead(),
  component: ProductsIndex,
});
