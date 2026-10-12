import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/landing/products/ProductPage";
import { TunnelHero } from "@/landing/products/TunnelHero";
import { TunnelTerminalSection } from "@/landing/products/TunnelTerminal";
import { TunnelFeatureSections } from "@/landing/products/TunnelFeatureSections";
import { productPageHead } from "@/landing/products/meta";

export const Route = createFileRoute("/products/tunnels")({
  head: () => productPageHead("tunnels"),
  component: () => <ProductPage product="tunnels" className="[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160] [--foreground:#f2f2f2] [--surface-muted:#242424] [--text-secondary:#a0a0a0]" hero={<TunnelHero />} workflow={<TunnelTerminalSection />} sections={<TunnelFeatureSections />} />,
});
