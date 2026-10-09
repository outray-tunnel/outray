import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import "../outray-arc-theme.css";

/** A focused workspace surface, without a second navigation system. */
export function OnboardingShell({
  orgSlug,
  children,
}: {
  orgSlug: string;
  children: ReactNode;
}) {
  return (
    <div className="workspace-ui outray-arc min-h-screen bg-[#070707] text-zinc-300 selection:bg-accent/30">
      <a
        href="#onboarding-content"
        className="sr-only z-50 rounded-lg bg-white px-3 py-2 text-black focus:not-sr-only focus:absolute focus:left-6 focus:top-2"
      >
        Skip to content
      </a>
      <header className="border-b border-white/[0.07] bg-[#090909]">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-4 px-6 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/$orgSlug/get-started"
              params={{ orgSlug }}
              aria-label="OutRay setup home"
              className="flex shrink-0 items-center gap-2 rounded-md text-zinc-100 transition-colors hover:text-white motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              <img src="/logo.png" alt="" className="size-6 object-contain" />
              <span className="text-[15px] font-medium tracking-[-0.025em]">OutRay</span>
            </Link>
            <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/[0.09]" />
            <span className="min-w-0 truncate text-[12px] text-zinc-400" title={orgSlug}>
              {orgSlug}
            </span>
          </div>
          <Link
            to="/$orgSlug/tunnel"
            params={{ orgSlug }}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Open console
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main id="onboarding-content" tabIndex={-1} className="mx-auto w-full max-w-[1180px] px-6 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
