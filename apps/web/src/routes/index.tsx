import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/landing/LandingPage";
import landingCss from "@/landing/landing.css?url";

const title = "OutRay — Everything between localhost and production.";
const description = "Developer infrastructure for secure tunnels, server-side observability, encrypted runtime secrets, and uptime monitoring.";
const configuredSiteUrl = import.meta.env.PUBLIC_SITE_URL?.trim();
const canonicalUrl = configuredSiteUrl ? new URL("/", configuredSiteUrl).toString() : undefined;
const ogImageUrl = configuredSiteUrl ? new URL("/og-image.png", configuredSiteUrl).toString() : "/og-image.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow" },
      { name: "theme-color", content: "#050505" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "OutRay" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      ...(canonicalUrl ? [{ property: "og:url", content: canonicalUrl }] : []),
      { property: "og:image", content: ogImageUrl },
      { property: "og:image:alt", content: "OutRay: Everything between localhost and production. Tunnels, Observability, Secrets, and Uptime." },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: ogImageUrl },
      { name: "twitter:image:alt", content: "OutRay: Everything between localhost and production. Tunnels, Observability, Secrets, and Uptime." },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "OutRay",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Linux, macOS, Windows",
          ...(canonicalUrl ? { url: canonicalUrl } : {}),
          description,
          codeRepository: "https://github.com/outray-tunnel/outray",
        },
      },
    ],
    links: [
      { rel: "stylesheet", href: landingCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preload", href: "/fonts/geom-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      ...(canonicalUrl ? [{ rel: "canonical", href: canonicalUrl }] : []),
    ],
  }),
  component: LandingPage,
});
