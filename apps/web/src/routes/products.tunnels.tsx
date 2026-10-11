import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/landing/products/ProductPage";
import { TunnelHero } from "@/landing/products/TunnelHero";
import { TunnelTerminalSection } from "@/landing/products/TunnelTerminal";
import { TunnelFeatureSections } from "@/landing/products/TunnelFeatureSections";
import styles from "@/landing/products/tunnel-sections.module.css";
import { productPageHead } from "@/landing/products/meta";

export const Route = createFileRoute("/products/tunnels")({
  head: () => productPageHead("tunnels"),
  component: () => <ProductPage product="tunnels" className={styles.page} hero={<TunnelHero />} workflow={<TunnelTerminalSection />} sections={<TunnelFeatureSections />} />,
});
