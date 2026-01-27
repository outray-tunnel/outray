import { Navbar } from "./navbar";
import { Footer } from "./shared";
import { DeveloperExperience } from "./developer-experience";
import { NetworkDiagram } from "./network-diagram";
import { BringYourOwnDomain } from "./bring-your-own-domain";
import { MultipleProtocols } from "./multiple-protocols";
import { OpenSource } from "./opensource";
import { Hero } from "./hero";

export const Landing = () => {
  return (
    <>
      <div className="min-h-screen bg-black text-white selection:bg-accent/30">
        <Navbar />

        <Hero />

        <div className="py-24 border-white/5">
          <DeveloperExperience />
        </div>

        <NetworkDiagram />

        <BringYourOwnDomain />

        <MultipleProtocols />

        <OpenSource />

        <Footer />
      </div>
    </>
  );
};
