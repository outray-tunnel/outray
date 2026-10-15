import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/landing/products/ProductPage";
import { productPageHead } from "@/landing/products/meta";
import { UptimeHero } from "@/landing/products/UptimeHero";
import { UptimeFeatureSections } from "@/landing/products/UptimeFeatureSections";

export const Route = createFileRoute("/products/uptime")({
  head: () => productPageHead("uptime"),
  component: () => <ProductPage product="uptime"
    className="[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160]"
    hero={<UptimeHero />}
    workflow={<></>}
    sections={<UptimeFeatureSections />}
  />,
});
