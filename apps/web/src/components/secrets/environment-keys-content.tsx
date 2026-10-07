import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Layers, LockKeyhole, Plus, RefreshCw, Upload } from "lucide-react";
import { Button } from "../arc/button/button";
import type { SecretEnvironment, SecretMetadata, SecretProject } from "@/lib/secrets-client";
import "../outray-arc-theme.css";

export interface EnvironmentKeysData {
  project: SecretProject;
  environment: SecretEnvironment;
  secrets: SecretMetadata[];
  revision: number;
}

export interface EnvironmentKeysContentProps {
  orgSlug: string;
  projectSlug: string;
  environmentSlug: string;
  data: EnvironmentKeysData | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  actionError: string | null;
  exporting: boolean;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
  onRetry: () => void;
  sharedLayout?: boolean;
  actionsContainer?: HTMLElement | null;
  children?: ReactNode;
}

export function EnvironmentKeysHeader({ orgSlug, projectSlug, project, environmentSlug, actions }: {
  orgSlug: string;
  projectSlug: string;
  project: SecretProject | null;
  environmentSlug: string;
  actions?: ReactNode;
}) {
  const environment = project?.environments.find((item) => item.slug === environmentSlug);
  return <header className="shrink-0">
      <Link to="/$orgSlug/secrets/vaults/$projectSlug" params={{ orgSlug, projectSlug }} className="inline-flex min-h-8 items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-zinc-200 motion-reduce:transition-none focus-visible:rounded focus-visible:outline-2 focus-visible:outline-accent">
        <ArrowLeft size={13} aria-hidden="true" />{project?.name || "Vault"}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h1 className="break-words text-[20px] font-normal tracking-[-0.035em] text-white">{environment?.name || "Secrets"}</h1><p className="mt-1 text-[12px] leading-5 text-zinc-500">Values stay hidden until revealed, then clear after 30 seconds.</p></div>
        {actions}
      </div>
    </header>;
}

export function EnvironmentKeysTabs({ orgSlug, projectSlug, project, environmentSlug }: {
  orgSlug: string;
  projectSlug: string;
  project: SecretProject;
  environmentSlug: string;
}) {
  return <nav aria-label="Switch environment" className="flex overflow-x-auto shrink-0 border-b border-white/[0.07] bg-white/[0.01]">
        {project.environments.map((environment) => {
          const selected = environment.slug === environmentSlug;
          const Icon = environment.isProduction ? LockKeyhole : Layers;
          return <Link key={environment.id} to="/$orgSlug/secrets/vaults/$projectSlug/environments/$environmentSlug" params={{ orgSlug, projectSlug, environmentSlug: environment.slug }} resetScroll={false} aria-current={selected ? "page" : undefined}
            className={`relative flex min-w-[120px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-3 text-[12px] transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${selected ? "bg-white/[0.035] text-zinc-100" : "text-zinc-400"}`}>
            <Icon size={13} aria-hidden="true" className={environment.isProduction ? "text-amber-300/75" : "text-zinc-500"} /><span>{environment.name}</span>
            {environment.isProduction && <span className="sr-only">Production environment</span>}
            <span className="ml-0.5 tabular-nums text-zinc-500"><span className="sr-only">{environment.secretCount === 1 ? "1 secret" : `${environment.secretCount} secrets`}</span><span aria-hidden="true">{environment.secretCount.toLocaleString()}</span></span>
            {selected && <span className="absolute inset-x-3 bottom-0 h-px bg-zinc-300" aria-hidden="true" />}
          </Link>;
        })}
      </nav>;
}

export function EnvironmentKeysContent({ orgSlug, projectSlug, environmentSlug, data, loading, refreshing, error, actionError, exporting, onAdd, onImport, onExport, onRetry, sharedLayout = false, actionsContainer, children }: EnvironmentKeysContentProps) {
  const actions = data && <div className="flex flex-wrap items-center gap-2">
    <Button variant="secondary" size="md" aria-haspopup="dialog" onClick={onImport}><Upload size={13} aria-hidden="true" />Import</Button>
    <Button variant="secondary" size="md" loading={exporting} aria-haspopup={data.environment.isProduction ? "dialog" : undefined} onClick={onExport}><Download size={13} aria-hidden="true" />Export .env</Button>
    <Button size="md" aria-haspopup="dialog" onClick={onAdd}><Plus size={14} aria-hidden="true" />Add secret</Button>
  </div>;
  return <div className={sharedLayout ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "outray-arc @container/secret-keys mx-auto w-full max-w-[1440px] space-y-5"}>
    {sharedLayout ? actionsContainer && createPortal(actions, actionsContainer) : <EnvironmentKeysHeader orgSlug={orgSlug} projectSlug={projectSlug} environmentSlug={environmentSlug} project={data?.project ?? null} actions={actions} />}
    {actionError && <p role="alert" className="shrink-0 border border-rose-400/20 bg-rose-400/[0.035] px-4 py-3 text-[12px] text-rose-200">{actionError}</p>}
    {loading && !data ? <EnvironmentKeysSkeleton sharedLayout={sharedLayout} /> : !data ? <section role="alert" className={`bg-[#111112] px-5 py-12 text-center ${sharedLayout ? "flex min-h-0 flex-1 flex-col items-center justify-center" : "rounded-xl border border-white/[0.08]"}`}><Layers size={22} className="mx-auto text-zinc-500" aria-hidden="true" /><h2 className="mt-3 text-[14px] font-medium text-zinc-200">Environment unavailable</h2><p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-zinc-500">{error || "We could not load the secret keys for this environment."}</p><Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button></section> : <section aria-label="Environment secret keys" className={`min-w-0 overflow-hidden bg-[#111112] ${sharedLayout ? "flex min-h-0 flex-1 flex-col" : "rounded-xl border border-white/[0.08]"}`}>
      {!sharedLayout && <EnvironmentKeysTabs orgSlug={orgSlug} projectSlug={projectSlug} project={data.project} environmentSlug={environmentSlug} />}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 className="text-[14px] font-medium text-zinc-200">Secret keys</h2><span className="text-[11px] tabular-nums text-zinc-500">{data.secrets.length.toLocaleString()} {data.secrets.length === 1 ? "secret" : "secrets"}</span><span className="text-[11px] text-zinc-600">Revision {data.revision}</span>{data.environment.isProduction && <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/[0.07] px-1.5 py-0.5 text-[10px] text-amber-300/75"><LockKeyhole size={10} aria-hidden="true" />Production</span>}</div>
        <span role="status" className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">{refreshing ? <><RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Updating</> : <><LockKeyhole size={11} aria-hidden="true" />Values hidden by default</>}</span>
      </div>
      {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75"><span>Could not refresh secret keys. Showing the last available metadata.</span><Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button></div>}
      {children}
    </section>}
  </div>;
}

export function EnvironmentKeysSkeleton({ sharedLayout = false }: { sharedLayout?: boolean }) {
  return <div aria-label="Loading environment secret keys" aria-busy="true" className={`overflow-hidden bg-[#111112] animate-pulse motion-reduce:animate-none ${sharedLayout ? "flex min-h-0 flex-1 flex-col" : "rounded-xl border border-white/[0.08]"}`}>
    {!sharedLayout && <div className="flex h-[43px] shrink-0 items-center justify-around gap-3 border-b border-white/[0.07] px-3" aria-hidden="true">{[1, 2, 3].map((index) => <div key={index} className="h-3 w-20 rounded bg-white/[0.05]" />)}</div>}
    <div className="flex h-[49px] shrink-0 items-center gap-3 border-b border-white/[0.07] px-4"><div className="h-3 w-20 rounded bg-white/[0.05]" /><div className="h-3 w-14 rounded bg-white/[0.04]" /></div>
    <div className="shrink-0 border-b border-white/[0.07] px-4 py-3"><div className="h-[34px] max-w-sm rounded-lg bg-white/[0.04]" /></div>
    <div className="flex h-10 shrink-0 items-center gap-4 border-b border-white/[0.07] px-4" aria-hidden="true"><div className="h-3 w-8 rounded bg-white/[0.04]" /><div className="h-3 flex-1 rounded bg-white/[0.04]" /><div className="h-3 w-16 rounded bg-white/[0.04]" /></div>
    <div className={sharedLayout ? "min-h-0 flex-1 overflow-hidden" : undefined} aria-hidden="true">{[1, 2, 3, 4, 5].map((index) => <div key={index} className="flex min-h-[72px] items-center gap-3 border-b border-white/[0.06] px-4 last:border-b-0"><div className="size-4 rounded bg-white/[0.04]" /><div className="min-w-0 flex-1"><div className="h-3 w-36 max-w-full rounded bg-white/[0.06]" /><div className="mt-2 h-2.5 w-24 rounded bg-white/[0.035]" /></div><div className="h-3 w-16 rounded bg-white/[0.04]" /></div>)}</div>
  </div>;
}
