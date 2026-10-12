import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { Footer } from "../Footer";
import { Navigation } from "../Navigation";
import { initLandingInteractions } from "../home";

export function ProductLayout() {
  useEffect(() => initLandingInteractions(), []);

  return (
    <div className="min-h-screen min-w-80 bg-[#050505] font-sans text-[#f7f7f8] [--header-height:78px] [--line:rgb(255_255_255_/_0.1)]">
      <a className="fixed top-3 left-3 z-[1000] -translate-y-[140%] rounded-xl border border-white/15 bg-white px-4 py-[11px] font-bold text-[#050505] transition-transform focus:translate-y-0" href="#main-content">Skip to content</a>
      <Navigation loginUrl="/login" signupUrl="/signup" githubUrl="https://github.com/outray-tunnel/outray" />
      <main className="relative z-[1] pt-[var(--header-height)]" id="main-content"><Outlet /></main>
      <Footer statusUrl="https://status.outray.dev" loginUrl="/login" privacyUrl="/privacy" termsUrl="/terms" githubUrl="https://github.com/outray-tunnel/outray" />
    </div>
  );
}
