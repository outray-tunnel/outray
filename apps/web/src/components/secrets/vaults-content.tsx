import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FolderKey, Layers, LockKeyhole, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { filterOverviewVaults, vaultUpdatedAt, type SecretsVaultSort } from "./overview-data";
import { formatRelativeDate, formatSecretDate } from "./utils";
import type { SecretProject } from "@/lib/secrets-client";
import "../outray-arc-theme.css";

export interface VaultsContentProps {
  orgSlug: string;
  projects: SecretProject[] | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  search: string;
  sort: SecretsVaultSort;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SecretsVaultSort) => void;
  onCreate: () => void;
  onRetry: () => void;
}

const columns = "@[820px]/vault-catalog:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_64px_92px_12px]";

export function VaultsContent({ orgSlug, projects, loading, refreshing, error, search, sort, onSearchChange, onSortChange, onCreate, onRetry }: VaultsContentProps) {
  const vaults = useMemo(() => filterOverviewVaults(projects ?? [], search, sort), [projects, search, sort]);
  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5"><h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Vaults</h1>{projects && <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-500" aria-label={`${projects.length} ${projects.length === 1 ? "vault" : "vaults"}`}>{projects.length.toLocaleString()}</span>}</div>
        <p className="mt-1 text-[12px] leading-5 text-zinc-500">Application secrets, organized by environment.</p>
      </div>
      <Button size="sm" aria-haspopup="dialog" onClick={onCreate}><Plus size={14} aria-hidden="true" />New vault</Button>
    </header>
    {error && projects && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75"><span>Could not refresh vaults. Showing the last available metadata.</span><Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button></div>}
    {loading && !projects ? <VaultsSkeleton /> : !projects ? <section role="alert" className="rounded-xl border border-white/[0.08] bg-[#111112] px-5 py-12 text-center"><FolderKey size={24} className="mx-auto text-zinc-500" aria-hidden="true" /><h2 className="mt-3 text-[14px] font-medium text-zinc-200">Vaults could not be loaded</h2><p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-zinc-500">{error || "Try again to load your vaults."}</p><Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button></section> : projects.length === 0 ? <section className="rounded-xl border border-dashed border-white/[0.12] px-5 py-14 text-center"><FolderKey size={26} className="mx-auto text-zinc-500" aria-hidden="true" /><h2 className="mt-3 text-[14px] font-medium text-zinc-200">Create your first vault</h2><p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-zinc-500">Give an application a home for its secrets, then add separate environments for development and production.</p><Button variant="secondary" size="sm" className="mt-4" aria-haspopup="dialog" onClick={onCreate}><Plus size={13} aria-hidden="true" />Create vault</Button></section> : <section aria-label="Vault catalog" className="@container/vault-catalog space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="outray-arc-requests-search min-w-0 flex-1 basis-[180px] sm:max-w-sm"><SearchField label="Search vaults" value={search} onValueChange={onSearchChange} placeholder="Find a vault or environment…" maxLength={200} autoComplete="off" spellCheck={false} /></div>
        <div className="outray-arc-address-filter w-[164px] shrink-0"><Select label="Sort vaults" value={sort} onValueChange={(value) => onSortChange(value === "name" ? "name" : "updated")} options={[{ value: "updated", label: "Recently updated" }, { value: "name", label: "Name" }]} /></div>
        <p role="status" aria-live="polite" className="ml-auto inline-flex min-h-9 items-center gap-1.5 text-[11px] tabular-nums text-zinc-500">{refreshing && <RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{refreshing ? "Updating" : search.trim() ? `${vaults.length.toLocaleString()} of ${projects.length.toLocaleString()} vaults` : "All vaults"}</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
        {vaults.length === 0 ? <div className="px-5 py-12 text-center"><Search size={22} className="mx-auto text-zinc-500" aria-hidden="true" /><h2 className="mt-3 text-[14px] font-medium text-zinc-200">No matching vaults</h2><p className="mt-1 text-[12px] leading-5 text-zinc-500">Try another name, description, or environment.</p><Button variant="ghost" size="sm" className="mt-3" onClick={() => onSearchChange("")}>Clear search</Button></div> : <>
          <div aria-hidden="true" className={`hidden gap-4 border-b border-white/[0.07] bg-white/[0.015] px-5 py-2.5 text-[11px] text-zinc-500 @[820px]/vault-catalog:grid ${columns}`}><span>Vault</span><span>Environments</span><span className="text-right">Secrets</span><span className="text-right">Updated</span><span /></div>
          <ul className="divide-y divide-white/[0.06]">{vaults.map((project) => <VaultCatalogRow key={project.id} orgSlug={orgSlug} project={project} />)}</ul>
        </>}
      </div>
    </section>}
  </div>;
}

function VaultCatalogRow({ orgSlug, project }: { orgSlug: string; project: SecretProject }) {
  const updatedAt = vaultUpdatedAt(project);
  return <li className={`group relative grid min-h-[88px] min-w-0 grid-cols-[minmax(0,1fr)_12px] items-center gap-x-4 gap-y-2.5 px-5 py-4 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025] motion-reduce:transition-none ${columns}`}>
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-zinc-500 transition-colors group-hover:text-zinc-300 motion-reduce:transition-none"><FolderKey size={16} aria-hidden="true" /></div>
      <div className="min-w-0"><Link to="/$orgSlug/secrets/vaults/$projectSlug" params={{ orgSlug, projectSlug: project.slug }} className="block text-[13px] font-medium text-zinc-200 outline-none after:absolute after:inset-0 after:z-[1] group-hover:text-white focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent" title={project.name}><span className="block truncate">{project.name}</span></Link><p className="mt-0.5 truncate text-[11px] leading-5 text-zinc-500" title={project.description || project.slug}>{project.description || project.slug}</p></div>
    </div>
    <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 @[820px]/vault-catalog:col-span-1">
      {project.environments.length > 0 && <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 pr-1 text-[11px] tabular-nums text-zinc-500" title={`${project.environmentCount} ${project.environmentCount === 1 ? "environment" : "environments"}`}><Layers size={12} aria-hidden="true" />{project.environmentCount.toLocaleString()}<span className="sr-only"> {project.environmentCount === 1 ? "environment" : "environments"}</span></span>}
      {project.environments.slice(0, 3).map((environment) => <Link key={environment.id} to="/$orgSlug/secrets/vaults/$projectSlug/environments/$environmentSlug" params={{ orgSlug, projectSlug: project.slug, environmentSlug: environment.slug }}
        className={`relative z-[2] inline-flex min-h-7 max-w-[160px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${environment.isProduction ? "border-amber-400/10 bg-amber-400/[0.04] text-amber-200/75 hover:border-amber-400/20 hover:bg-amber-400/[0.07] hover:text-amber-100" : "border-white/[0.06] bg-white/[0.015] text-zinc-400 hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-zinc-200"}`} aria-label={`Open ${environment.name} in ${project.name}${environment.isProduction ? " (production environment)" : ""}`} title={`Open ${environment.name} in ${project.name}`}>
        {environment.isProduction && <LockKeyhole size={11} className="shrink-0" aria-hidden="true" />}<span className="truncate">{environment.name}</span>{environment.isProduction && <span className="sr-only">Production environment</span>}
      </Link>)}
      {project.environments.length > 3 && <Link to="/$orgSlug/secrets/vaults/$projectSlug" params={{ orgSlug, projectSlug: project.slug }} aria-label={`View all ${project.environmentCount} environments in ${project.name}`} className="relative z-[2] inline-flex min-h-7 items-center rounded-md px-1.5 text-[11px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">+{project.environments.length - 3}</Link>}
      {project.environments.length === 0 && <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600"><Layers size={12} aria-hidden="true" />{project.environmentCount ? `${project.environmentCount} ${project.environmentCount === 1 ? "environment" : "environments"}` : "No environments yet"}</span>}
    </div>
    <div className="col-span-2 flex items-center gap-3 text-[11px] tabular-nums text-zinc-500 @[820px]/vault-catalog:contents">
      <span className="@[820px]/vault-catalog:text-right"><span className="@[820px]/vault-catalog:sr-only">Secrets </span><span className="text-zinc-400">{project.secretCount.toLocaleString()}</span></span>
      <span className="@[820px]/vault-catalog:text-right">{updatedAt ? <time dateTime={updatedAt} title={formatSecretDate(updatedAt)}><span className="sr-only">Updated </span>{formatRelativeDate(updatedAt)}</time> : "Updated unknown"}</span>
    </div>
    <ArrowRight size={13} className="col-start-2 row-start-1 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none @[820px]/vault-catalog:col-start-5" aria-hidden="true" />
  </li>;
}

function VaultsSkeleton() {
  return <div aria-label="Loading vaults" aria-busy="true" className="@container/vault-catalog space-y-3 animate-pulse motion-reduce:animate-none">
    <div className="flex flex-wrap gap-2" aria-hidden="true"><div className="h-9 min-w-[180px] flex-1 rounded-lg bg-white/[0.04] sm:max-w-sm" /><div className="h-9 w-[164px] rounded-lg bg-white/[0.04]" /></div>
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]" aria-hidden="true"><div className="hidden h-9 border-b border-white/[0.07] bg-white/[0.015] @[820px]/vault-catalog:block" />{Array.from({ length: 6 }, (_, index) => <div key={index} className={`grid min-h-[88px] grid-cols-[minmax(0,1fr)_12px] items-center gap-x-4 gap-y-2.5 border-b border-white/[0.06] px-5 py-4 last:border-0 ${columns}`}>
      <div className="flex items-center gap-3"><div className="size-8 shrink-0 rounded-lg bg-white/[0.04]" /><div className="min-w-0 flex-1"><div className="h-3 w-28 max-w-full rounded bg-white/[0.06]" /><div className="mt-2 h-2.5 w-44 max-w-full rounded bg-white/[0.035]" /></div></div>
      <div className="col-span-2 flex gap-1.5 @[820px]/vault-catalog:col-span-1"><div className="h-7 w-20 rounded-md bg-white/[0.04]" /><div className="h-7 w-20 rounded-md bg-white/[0.04]" /></div>
      <div className="col-span-2 flex gap-3 @[820px]/vault-catalog:contents"><div className="h-2.5 w-9 rounded bg-white/[0.04] @[820px]/vault-catalog:ml-auto" /><div className="h-2.5 w-14 rounded bg-white/[0.04] @[820px]/vault-catalog:ml-auto" /></div>
      <div className="col-start-2 row-start-1 size-3 rounded bg-white/[0.025] @[820px]/vault-catalog:col-start-5" />
    </div>)}</div>
  </div>;
}
