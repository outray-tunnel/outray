import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { workspaceScopeClassName } from "@/components/ui/workspace-scope";

export function PluginShell({ title, description, icon, children }: { title: string; description?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return <div className={`${workspaceScopeClassName} flex min-h-svh flex-col bg-[#090909] font-sans text-zinc-300 selection:bg-accent/30 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-accent`}>
    <header className="border-b border-white/[.07]">
      <div className="mx-auto flex h-16 max-w-[1040px] items-center justify-between gap-4 px-5 sm:px-8">
        <a href="/" aria-label="OutRay home" className="inline-flex shrink-0 items-center gap-2.5 rounded-md text-zinc-100">
          <img src="/logo.png" alt="" width={30} height={30} className="object-contain" />
          <span className="text-[17px] font-semibold tracking-[-.035em]">OutRay</span>
        </a>
        <a href="/plugins/connections" className="inline-flex items-center gap-2 rounded-md text-xs text-zinc-400 transition-colors hover:text-zinc-100 motion-reduce:transition-none">
          Connected apps<ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </header>
    <main className="mx-auto w-full max-w-[760px] flex-1 px-5 pt-8 pb-10 sm:px-8 sm:pt-10 sm:pb-10">
      <a href="/select" className="mb-5 inline-flex items-center gap-1.5 rounded-md text-xs text-zinc-500 transition-colors hover:text-zinc-200 motion-reduce:transition-none">
        <ArrowLeft size={13} aria-hidden="true" />Your workspaces
      </a>
      <div className="flex items-center gap-3.5">
        {icon}
        <div className="min-w-0 flex-1"><WorkspacePageHeader title={title} description={description} appearance="compact" /></div>
      </div>
      <div className="mt-5">{children}</div>
    </main>
    <footer className="mx-auto flex w-full max-w-[760px] flex-wrap items-center justify-between gap-4 px-5 pb-6 text-xs text-zinc-500 sm:px-8">
      <span>OutRay integrations</span>
      <nav aria-label="Support and policies" className="flex gap-5 [&_a]:rounded-sm [&_a]:transition-colors [&_a:hover]:text-zinc-200 motion-reduce:[&_a]:transition-none">
        <a href="/contact">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
      </nav>
    </footer>
  </div>;
}
