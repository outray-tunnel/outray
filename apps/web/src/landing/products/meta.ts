import { products, type ProductId } from "./content";

export function productPageHead(product?: ProductId, siteUrl = import.meta.env.PUBLIC_SITE_URL?.trim()) {
  const content = product ? products[product] : undefined;
  const title = content ? `${content.name} — OutRay` : "Products — OutRay";
  const description = content?.description ?? "Explore OutRay Tunnels, Observability, Secrets, and Uptime: connected developer tools from a local service to a running application.";
  const path = product ? `/products/${product}` : "/products";
  const canonical = siteUrl ? new URL(path, siteUrl).toString() : undefined;
  const image = siteUrl ? new URL("/og-image.png", siteUrl).toString() : "/og-image.png";

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "OutRay" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: image },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}
