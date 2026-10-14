import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/landing/products/ProductPage";
import { ObservabilityHero } from "@/landing/products/ObservabilityHero";
import { ObservabilityRequestStory } from "@/landing/products/ObservabilityRequestStory";
import { ObservabilityFeatureSections } from "@/landing/products/ObservabilityFeatureSections";
import { productPageHead } from "@/landing/products/meta";

export const Route = createFileRoute("/products/observability")({
  head: () => productPageHead("observability"),
  component: () => <ProductPage
    product="observability"
    className="[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160] [--foreground:#f2f2f2] [--surface-muted:#242424] [--text-secondary:#a0a0a0]"
    hero={<ObservabilityHero />}
    workflow={<ObservabilityRequestStory />}
    sections={<ObservabilityFeatureSections />}
  />,
});
