import { createFileRoute } from "@tanstack/react-router";
import { ProductLayout } from "@/landing/products/ProductLayout";
import landingCss from "@/landing/landing.css?url";
import productsCss from "@/landing/products/products.css?url";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [{ name: "theme-color", content: "#050505" }],
    links: [
      { rel: "stylesheet", href: landingCss },
      { rel: "stylesheet", href: productsCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preload", href: "/fonts/geom-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],
  }),
  component: ProductLayout,
});
