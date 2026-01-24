import { Link } from "@tanstack/react-router";
import { Navbar } from "./navbar";
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

        <footer className="border-t border-white/10 py-12 bg-black">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="font-bold">OutRay</span>
            </div>
            <div className="text-white/40 text-sm">
              © {new Date().getFullYear()} OutRay. All rights reserved.
            </div>
            <div className="flex gap-6 text-white/60 text-sm">
              <a
                href="https://twitter.com/outraytunnel"
                target="_blank"
                className="hover:text-white transition-colors"
              >
                Twitter
              </a>
              <a
                href="https://github.com/akinloluwami/outray"
                target="_blank"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://discord.gg/DncjGcCHDg"
                target="_blank"
                className="hover:text-white transition-colors"
              >
                Discord
              </a>
              <Link
                to="/terms"
                className="hover:text-white transition-colors"
              >
                Terms
              </Link>
              <Link
                to="/privacy"
                className="hover:text-white transition-colors"
              >
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};
