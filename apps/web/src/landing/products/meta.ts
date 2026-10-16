import { products, type ProductId } from "./content";

export function productPageHead(product: ProductId, siteUrl = import.meta.env.PUBLIC_SITE_URL?.trim()) {
  const content = products[product];
  const title = `${content.name} — OutRay`;
  const description = content.description;
  const path = `/products/${product}`;
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
