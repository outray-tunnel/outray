import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/landing/products/ProductPage";
import { SecretsHero } from "@/landing/products/SecretsHero";
import { SecretsEnvironmentSection } from "@/landing/products/SecretsEnvironmentSection";
import { SecretsProblemSection } from "@/landing/products/SecretsProblemSection";
import { SecretsFeatureSections } from "@/landing/products/SecretsFeatureSections";
import { productPageHead } from "@/landing/products/meta";

export const Route = createFileRoute("/products/secrets")({
  head: () => productPageHead("secrets"),
  component: () => <ProductPage
    product="secrets"
    className="[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160] [--foreground:#f2f2f2] [--surface-muted:#242424] [--text-secondary:#a0a0a0]"
    hero={<SecretsHero />}
    workflow={<><SecretsProblemSection /><SecretsEnvironmentSection /></>}
    sections={<SecretsFeatureSections />}
  />,
});
