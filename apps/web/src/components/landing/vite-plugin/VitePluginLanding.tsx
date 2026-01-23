import { Navbar } from "../navbar";
import { ViteHero } from "./ViteHero";
import { ViteCodeExample } from "./ViteCodeExample";
import { ViteFrameworks } from "./ViteFrameworks";
import { ViteCTA } from "./ViteCTA";
import { ViteFooter } from "./ViteFooter";

export const VitePluginLanding = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30">
      <Navbar />

      <ViteHero />

      <ViteCodeExample />

      <ViteFrameworks />

      <ViteCTA />

      <ViteFooter />
    </div>
  );
};
