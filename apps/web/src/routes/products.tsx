import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProductLayout } from "@/landing/products/ProductLayout";

export const Route = createFileRoute("/products")({
  loader: ({ location }) => {
    if (/^\/products\/?$/.test(location.pathname)) throw notFound({ routeId: "/products" });
  },
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
  notFoundComponent: ProductsNotFound,
});

function ProductsNotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[#050505] px-6 text-center font-sans text-zinc-200">
      <h1 className="text-2xl tracking-tight">Page not found</h1>
      <a className="rounded-lg text-sm text-zinc-400 underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="/">Back to OutRay</a>
    </main>
  );
}
