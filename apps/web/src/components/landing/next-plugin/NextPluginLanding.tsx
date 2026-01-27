import { Navbar } from "../navbar";
import { Footer } from "../shared";
import { NextHero } from "./NextHero";
import { NextCodeExample } from "./NextCodeExample";
import { NextTechnologies } from "./NextTechnologies";
import { NextCTA } from "./NextCTA";

export const NextPluginLanding = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30">
      <Navbar />

      <NextHero />

      <NextCodeExample />

      <NextTechnologies />

      <NextCTA />

      <Footer />
    </div>
  );
};
