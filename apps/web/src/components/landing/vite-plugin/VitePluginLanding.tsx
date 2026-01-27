import { Navbar } from "../navbar";
import { Footer } from "../shared";
import { ViteHero } from "./ViteHero";
import { ViteCodeExample } from "./ViteCodeExample";
import { ViteFrameworks } from "./ViteFrameworks";
import { ViteCTA } from "./ViteCTA";

export const VitePluginLanding = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30">
      <Navbar />

      <ViteHero />

      <ViteCodeExample />

      <ViteFrameworks />

      <ViteCTA />

      <Footer />
    </div>
  );
};
