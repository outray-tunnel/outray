import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Clock3, FolderKey, KeyRound, Layers, LockKeyhole, Plus, RefreshCw, Search } from "lucide-react";
import Edit02Icon from "@hugeicons-pro/core-stroke-rounded/Edit02Icon";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { ActionMenu } from "./secrets-ui";
import { vaultUpdatedAt } from "./overview-data";
import { formatRelativeDate, formatSecretDate } from "./utils";
import type { SecretEnvironment, SecretProject } from "@/lib/secrets-client";
import "../outray-arc-theme.css";

export interface VaultContentProps {
  orgSlug: string;
  project: SecretProject | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  onCreateEnvironment: () => void;
  onEditVault: () => void;
  onDeleteVault: () => void;
  onEditEnvironment: (environment: SecretEnvironment) => void;
  onDeleteEnvironment: (environment: SecretEnvironment) => void;
}

const columns = "@[720px]/vault-environments:grid-cols-[minmax(0,1fr)_76px_76px_100px_36px]";
// Only persisted, supported color names may affect the UI; never interpolate CSS
// from metadata or infer production protection from an environment's name.
const environmentColors: Record<string, string> = {
  emerald: "border-emerald-400/10 bg-emerald-400/[0.04] text-emerald-300/70",
  amber: "border-amber-400/10 bg-amber-400/[0.04] text-amber-300/70",
  rose: "border-rose-400/10 bg-rose-400/[0.04] text-rose-300/70",
  violet: "border-violet-400/10 bg-violet-400/[0.04] text-violet-300/70",
  blue: "border-blue-400/10 bg-blue-400/[0.04] text-blue-300/70",
};
const neutralColor = "border-white/[0.07] bg-white/[0.025] text-zinc-500";

export function VaultContent({ orgSlug, project, loading, refreshing, error, search, onSearchChange, onRetry, onCreateEnvironment, onEditVault, onDeleteVault, onEditEnvironment, onDeleteEnvironment }: VaultContentProps) {
  const environments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (project?.environments ?? []).filter((environment) => !needle || [environment.name, environment.slug, environment.description].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [project, search]);
  const updatedAt = project ? vaultUpdatedAt(project) : null;

  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <header>
      <Link to="/$orgSlug/secrets/vaults" params={{ orgSlug }} className="inline-flex min-h-8 items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-zinc-200 motion-reduce:transition-none focus-visible:rounded focus-visible:outline-2 focus-visible:outline-accent">
        <ArrowLeft size={13} aria-hidden="true" />Vaults
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <h1 className="break-words text-[20px] font-normal tracking-[-0.035em] text-white">{project?.name || "Vault"}</h1>
          <p className="mt-1 max-w-2xl break-words text-[12px] leading-5 text-zinc-500">{project?.description || "Choose an environment to manage its secret keys."}</p>
        </div>
        {project && <div className="flex items-center gap-2">
          <ActionMenu compact label="Vault actions" items={[
            { label: "Edit vault", icon: Edit02Icon, onSelect: onEditVault },
            { label: "Delete vault", icon: Delete02Icon, onSelect: onDeleteVault, danger: true },
          ]} />
          <Button size="sm" aria-haspopup="dialog" onClick={onCreateEnvironment}><Plus size={14} aria-hidden="true" />Add environment</Button>
        </div>}
      </div>
    </header>

    {loading && !project ? <VaultSkeleton /> : !project ? <section role="alert" className="rounded-xl border border-white/[0.08] bg-[#111112] px-5 py-12 text-center">
      <FolderKey size={24} className="mx-auto text-zinc-500" aria-hidden="true" />
      <h2 className="mt-3 text-[14px] font-medium text-zinc-200">Vault unavailable</h2>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-zinc-500">{error || "We could not load the environments for this vault."}</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button>
    </section> : <>
      <dl aria-label="Vault summary" className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-white/[0.07] py-3 text-[12px]">
        <div className="inline-flex items-center gap-2"><dt className="inline-flex items-center gap-1.5 text-zinc-500"><Layers size={13} aria-hidden="true" />Environments</dt><dd className="tabular-nums text-zinc-300">{project.environmentCount.toLocaleString()}</dd></div>
        <div className="inline-flex items-center gap-2"><dt className="inline-flex items-center gap-1.5 text-zinc-500"><KeyRound size={13} aria-hidden="true" />Stored secrets</dt><dd className="tabular-nums text-zinc-300">{project.secretCount.toLocaleString()}</dd></div>
        <div className="inline-flex items-center gap-2"><dt className="inline-flex items-center gap-1.5 text-zinc-500"><Clock3 size={13} aria-hidden="true" />Last changed</dt><dd className="text-zinc-400"><MetadataTime value={updatedAt} /></dd></div>
      </dl>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75"><span>Could not refresh this vault. Showing the last available metadata.</span><Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button></div>}
      <section aria-label="Vault environments" className="@container/vault-environments space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-[14px] font-medium text-zinc-200">Environments</h2><p className="mt-0.5 text-[12px] leading-5 text-zinc-500">Separate values, revisions, and history for each environment.</p></div>
          <p role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-zinc-500">{refreshing && <RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{refreshing ? "Updating" : search.trim() ? `${environments.length} of ${project.environments.length} environments` : `${project.environments.length} ${project.environments.length === 1 ? "environment" : "environments"}`}</p>
        </div>
        {project.environments.length === 0 ? <div className="rounded-xl border border-dashed border-white/[0.12] px-5 py-12 text-center">
          <Layers size={24} className="mx-auto text-zinc-500" aria-hidden="true" /><h3 className="mt-3 text-[14px] font-medium text-zinc-200">Add your first environment</h3><p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-zinc-500">Start with development, staging, or production. Each keeps its own set of values.</p><Button variant="secondary" size="sm" className="mt-4" aria-haspopup="dialog" onClick={onCreateEnvironment}><Plus size={13} aria-hidden="true" />Add environment</Button>
        </div> : <>
          <div className="outray-arc-requests-search max-w-sm"><SearchField appearance="workspace" label="Search environments" value={search} onValueChange={onSearchChange} placeholder="Find an environment…" maxLength={200} autoComplete="off" spellCheck={false} /></div>
          {environments.length === 0 ? <div className="rounded-xl border border-white/[0.08] bg-[#111112] px-5 py-12 text-center"><Search size={22} className="mx-auto text-zinc-500" aria-hidden="true" /><h3 className="mt-3 text-[14px] font-medium text-zinc-200">No matching environments</h3><p className="mt-1 text-[12px] leading-5 text-zinc-500">Try another name or clear your search.</p><Button variant="ghost" size="sm" className="mt-3" onClick={() => onSearchChange("")}>Clear search</Button></div> : <div className="rounded-xl border border-white/[0.08] bg-[#111112]">
            <div aria-hidden="true" className={`hidden items-center gap-4 rounded-t-xl border-b border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-500 @[720px]/vault-environments:grid ${columns}`}><span>Environment</span><span className="text-right">Secrets</span><span className="text-right">Revision</span><span className="text-right">Updated</span><span /></div>
            <ul className="divide-y divide-white/[0.06]">{environments.map((environment) => <EnvironmentRow key={environment.id} orgSlug={orgSlug} projectSlug={project.slug} environment={environment} onEdit={() => onEditEnvironment(environment)} onDelete={() => onDeleteEnvironment(environment)} />)}</ul>
          </div>}
        </>}
      </section>
    </>}
  </div>;
}

function EnvironmentRow({ orgSlug, projectSlug, environment, onEdit, onDelete }: { orgSlug: string; projectSlug: string; environment: SecretEnvironment; onEdit: () => void; onDelete: () => void }) {
  const color = Object.hasOwn(environmentColors, environment.color ?? "") ? environmentColors[environment.color!] : neutralColor;
  const Icon = environment.isProduction ? LockKeyhole : Layers;
  return <li className={`group relative grid min-h-[88px] min-w-0 grid-cols-[minmax(0,1fr)_36px] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.025] focus-within:bg-white/[0.025] motion-reduce:transition-none ${columns}`}>
    <div className="flex min-w-0 items-center gap-3">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${color}`}><Icon size={15} aria-hidden="true" /></span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link to="/$orgSlug/secrets/vaults/$projectSlug/environments/$environmentSlug" params={{ orgSlug, projectSlug, environmentSlug: environment.slug }} aria-label={`Open ${environment.name} environment${environment.isProduction ? " (production)" : ""}`} title={`Open ${environment.name} secrets`} className="min-w-0 max-w-full text-[13px] font-medium text-zinc-200 outline-none after:absolute after:inset-0 after:z-[1] group-hover:text-white focus-visible:after:rounded-xl focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"><span className="block truncate">{environment.name}</span></Link>
          {environment.isProduction && <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/[0.06] px-1.5 py-0.5 text-[10px] text-amber-300/75"><LockKeyhole size={10} aria-hidden="true" />Production</span>}
          <ArrowUpRight size={11} className="shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none" aria-hidden="true" />
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-5 text-zinc-500" title={environment.description || environment.slug}>{environment.description || environment.slug}</p>
      </div>
    </div>
    <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11 text-[11px] tabular-nums text-zinc-500 @[720px]/vault-environments:contents">
      <span className="@[720px]/vault-environments:text-right"><span className="text-zinc-300">{environment.secretCount.toLocaleString()}</span><span className="@[720px]/vault-environments:sr-only"> {environment.secretCount === 1 ? "secret" : "secrets"}</span></span>
      <span className="@[720px]/vault-environments:text-right"><span className="@[720px]/vault-environments:sr-only">Revision </span><span aria-hidden="true" className="@[720px]/vault-environments:hidden">r</span>{environment.revision.toLocaleString()}</span>
      <span className="@[720px]/vault-environments:text-right"><span className="sr-only">Updated </span><MetadataTime value={environment.updatedAt} /></span>
    </div>
    <div className="relative z-[2] col-start-2 row-start-1 justify-self-end focus-within:z-[3] @[720px]/vault-environments:col-start-5">
      <ActionMenu compact label={`Actions for ${environment.name}`} items={[
        { label: "Edit environment", icon: Edit02Icon, onSelect: onEdit },
        { label: "Delete environment", icon: Delete02Icon, onSelect: onDelete, danger: true },
      ]} />
    </div>
  </li>;
}

function MetadataTime({ value }: { value: string | null }) {
  return value && Number.isFinite(Date.parse(value)) ? <time dateTime={value} title={formatSecretDate(value)}>{formatRelativeDate(value)}</time> : <>Unknown</>;
}

function VaultSkeleton() {
  return <div aria-label="Loading vault" aria-busy="true" className="@container/vault-environments space-y-5 animate-pulse motion-reduce:animate-none">
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-white/[0.07] py-3" aria-hidden="true">{[1, 2, 3].map((index) => <span key={index} className="h-4 w-32 rounded bg-white/[0.04]" />)}</div>
    <div aria-hidden="true"><div className="h-3.5 w-24 rounded bg-white/[0.05]" /><div className="mt-2 h-3 w-72 max-w-full rounded bg-white/[0.035]" /></div>
    <div className="h-9 max-w-sm rounded-lg bg-white/[0.04]" aria-hidden="true" />
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]" aria-hidden="true"><div className="hidden h-9 border-b border-white/[0.07] bg-white/[0.015] @[720px]/vault-environments:block" />{[1, 2, 3].map((index) => <div key={index} className={`grid min-h-[88px] grid-cols-[minmax(0,1fr)_36px] items-center gap-x-4 gap-y-2 border-b border-white/[0.06] px-4 py-3.5 last:border-0 ${columns}`}>
      <div className="flex min-w-0 items-center gap-3"><div className="size-8 shrink-0 rounded-lg bg-white/[0.04]" /><div className="min-w-0 flex-1"><div className="h-3 w-28 max-w-full rounded bg-white/[0.06]" /><div className="mt-2 h-2.5 w-44 max-w-full rounded bg-white/[0.035]" /></div></div>
      <div className="col-span-2 flex gap-4 pl-11 @[720px]/vault-environments:contents">{[1, 2, 3].map((item) => <div key={item} className="h-2.5 w-12 rounded bg-white/[0.04] @[720px]/vault-environments:ml-auto" />)}</div>
      <div className="col-start-2 row-start-1 size-8 rounded-lg bg-white/[0.025] @[720px]/vault-environments:col-start-5" />
    </div>)}</div>
  </div>;
}
