import { useEffect } from "react";
import { FinalCta } from "./FinalCta";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { Navigation } from "./Navigation";
import { OpenSource } from "./OpenSource";
import { ProductStories } from "./ProductStories";
import { initLandingInteractions } from "./home";

const links = {
  signup: "/signup",
  login: "/login",
  privacy: "/privacy",
  terms: "/terms",
  github: "https://github.com/outray-tunnel/outray",
  status: "https://status.outray.dev",
} as const;

export function LandingPage() {
  useEffect(() => initLandingInteractions(), []);

  return (
    <div className="relative isolate min-h-screen min-w-[320px] overflow-x-clip bg-page bg-[radial-gradient(circle_at_50%_-10%,rgb(131_103_199_/.17),transparent_34rem)] text-ink selection:bg-[rgb(131_103_199_/.55)] selection:text-white before:pointer-events-none before:fixed before:inset-0 before:z-0 before:bg-[linear-gradient(rgb(255_255_255_/.025)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/.025)_1px,transparent_1px)] before:bg-[size:64px_64px] before:[mask-image:linear-gradient(to_bottom,black,transparent_62%)] before:content-['']">
      <a className="fixed top-3 left-3 z-[1000] -translate-y-[140%] rounded-xl border border-line-strong bg-white px-4 py-[11px] font-bold text-page transition-transform duration-200 ease-snappy focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light" href="#main-content">Skip to content</a>
      <Navigation
        loginUrl={links.login}
        signupUrl={links.signup}
        githubUrl={links.github}
      />
      <main className="relative z-[1]" id="main-content">
        <Hero signupUrl={links.signup} githubUrl={links.github} />
        <ProductStories />
        <OpenSource githubUrl={links.github} />
        <FinalCta signupUrl={links.signup} />
      </main>
      <Footer
        statusUrl={links.status}
        loginUrl={links.login}
        privacyUrl={links.privacy}
        termsUrl={links.terms}
        githubUrl={links.github}
      />
    </div>
  );
}
