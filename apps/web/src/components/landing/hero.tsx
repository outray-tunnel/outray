import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ArrowRight, Copy, Check, LayoutDashboard } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { usePostHog } from "posthog-js/react";
import { Terminal } from "./Terminal";
import { BeamGroup } from "./beam-group";

export const Hero = () => {
  const [copied, setCopied] = useState(false);
  const posthog = usePostHog();
  const { data: session } = authClient.useSession();
  const { data: organizations } = authClient.useListOrganizations();

  const copyCommand = () => {
    navigator.clipboard.writeText("npm install -g outray");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center overflow-hidden pt-20">
      <div className="absolute inset-0 z-0 md:-translate-x-[10%]">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <color attach="background" args={["#000000"]} />
          <BeamGroup />
        </Canvas>
      </div>

      <div className="flex flex-col gap-8 max-w-360 mx-auto px-6 relative z-10 w-full items-center">
        <div className="flex flex-col gap-6 items-center mt-20">
          <a
            href="https://www.ycombinator.com/companies/outray"
            target="_blank"
            onClick={() => posthog.capture("yc_badge_clicked")}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-white/60 backdrop-blur-sm hover:bg-white/10 transition-colors"
          >
            <div className="w-4 h-4 bg-[#F26522] flex items-center justify-center rounded-xs">
              <span className="text-white text-[10px] font-bold font-sans">
                Y
              </span>
            </div>
            <span>Not backed by Y Combinator</span>
          </a>
          <h1 className="text-5xl md:text-7xl font-bold text-center tracking-tight leading-[1.1]">
            <span className="bg-white/10 text-white rounded-2xl px-4 py-1 inline-block mb-2 md:mb-0">
              Expose
            </span>{" "}
            your local server <br className="hidden md:block" /> to the internet
          </h1>
          <p className="text-xl md:text-2xl text-center text-white/60 max-w-2xl leading-relaxed">
            OutRay is an open-source ngrok alternative that makes it easy to
            expose your local development server to the internet via secure
            tunnels.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
          {session ? (
            <Link
              to={organizations?.length ? "/$orgSlug" : "/select"}
              params={{
                orgSlug:
                  organizations && organizations.length
                    ? organizations[0].slug
                    : "",
              }}
              className="w-full sm:w-auto px-8 py-4 bg-white text-black hover:bg-gray-200 rounded-full font-bold text-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
            >
              Dashboard <LayoutDashboard size={20} />
            </Link>
          ) : (
            <Link
              to="/signup"
              className="w-full sm:w-auto px-8 py-4 bg-white text-black hover:bg-gray-200 rounded-full font-bold text-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
            >
              Get Started Free <ArrowRight size={20} />
            </Link>
          )}
          <button
            onClick={copyCommand}
            className="w-full sm:w-auto flex items-center gap-3 text-white/60 px-8 py-4 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 font-mono text-sm backdrop-blur-sm transition-all group cursor-pointer"
          >
            <span className="text-accent">$</span> npm install -g outray
            {copied ? (
              <Check size={16} className="text-green-400" />
            ) : (
              <Copy
                size={16}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            )}
          </button>
        </div>

        <div className="w-full max-w-4xl mt-12 pointer-events-auto">
          <Terminal />
        </div>
      </div>
    </div>
  );
};
