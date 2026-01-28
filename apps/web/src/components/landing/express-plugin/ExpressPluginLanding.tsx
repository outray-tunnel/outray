import { Navbar } from "../navbar";
import { Footer } from "../shared";
import { ExpressHero } from "./ExpressHero";
import { ExpressCodeExample } from "./ExpressCodeExample";
import { ExpressUseCases } from "./ExpressUseCases";
import { ExpressCTA } from "./ExpressCTA";

export const ExpressPluginLanding = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30">
      <Navbar />

      <ExpressHero />

      <ExpressCodeExample />

      <ExpressUseCases />

      <ExpressCTA />

      <Footer />
    </div>
  );
};
