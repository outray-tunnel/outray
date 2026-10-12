import { createFileRoute } from "@tanstack/react-router";
import { ProductLayout } from "@/landing/products/ProductLayout";

export const Route = createFileRoute("/products")({
  head: ({ match }) => ({
    meta: [{ name: "theme-color", content: "#050505" }],
    links: [
      ...(!match.context.instance?.selfHosted
        ? [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }]
        : []),
      { rel: "preload", href: "/fonts/geom-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],
  }),
  component: ProductLayout,
});
