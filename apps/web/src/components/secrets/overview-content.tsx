import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FolderKey, KeyRound, Layers, LockKeyhole, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { UsageNumber } from "../overview/usage-number";
import type { SecretProject, SecretsOverview } from "@/lib/secrets-client";
import { SecretsOverviewActivity } from "./overview-activity";
import { filterOverviewVaults, vaultUpdatedAt, type SecretsVaultSort } from "./overview-data";
import { formatRelativeDate, formatSecretDate } from "./utils";
import "../outray-arc-theme.css";

const PREVIEW_LIMIT = 6;

export interface SecretsOverviewContentProps {
  orgSlug: string;
  data?: SecretsOverview;
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  searchInput: string;
  sort: SecretsVaultSort;
  onSearchInputChange: (value: string) => void;
  onSortChange: (value: SecretsVaultSort) => void;
  onClearSearch: () => void;
  onCreate: () => void;
  onRetry: () => void;
}

export function SecretsOverviewContent({ orgSlug, data, loading, isFetching, error, searchInput, sort,
  onSearchInputChange, onSortChange, onClearSearch, onCreate, onRetry }: SecretsOverviewContentProps) {
  const matches = useMemo(() => filterOverviewVaults(data?.projects ?? [], searchInput, sort), [data?.projects, searchInput, sort]);
  const vaults = matches.slice(0, PREVIEW_LIMIT);
  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Overview</h1>
        <p className="mt-1 text-[12px] text-zinc-500">Vaults, environments, and recent changes.</p>
      </div>
      <Button size="sm" aria-haspopup="dialog" onClick={onCreate}><Plus size={14} aria-hidden="true" />New vault</Button>
    </header>

    {error && data && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75">
      <span>Could not refresh Secrets. Showing the last available data.</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
    </div>}

    {loading && !data ? <SecretsOverviewSkeleton /> : !data ? <section role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.035] px-5 py-10 text-center">
      <LockKeyhole size={22} className="mx-auto text-zinc-500" aria-hidden="true" />
      <h2 className="mt-3 text-[14px] font-medium text-zinc-200">Secrets unavailable</h2>
      <p className="mt-1 text-[12px] text-zinc-500">{error || "We could not load your vaults. Try again in a moment."}</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button>
    </section> : <>
      <section aria-label="Secrets summary" className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Vaults", value: data.projectCount, detail: "Applications and services", icon: FolderKey },
          { label: "Environments", value: data.environmentCount, detail: "Separate configuration for each stage", icon: Layers },
          { label: "Stored secrets", value: data.secretCount, detail: "Across all environments", icon: KeyRound }].map(({ label, value, detail, icon: Icon }) => <div key={label} className="min-h-[120px] min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.025] px-5 py-4">
            <div className="flex items-center justify-between gap-2"><p className="truncate text-[12px] text-zinc-400">{label}</p><Icon size={14} className="shrink-0 text-zinc-500" aria-hidden="true" /></div>
            <p className="mt-3 text-[28px] font-normal leading-none tracking-[-0.04em] text-zinc-100"><UsageNumber value={value} metric={label} /></p>
            <p className="mt-2 truncate text-[11px] leading-5 text-zinc-500" title={detail}>{detail}</p>
          </div>)}
      </section>

      <div className="grid min-w-0 gap-7 pt-2 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <section className="min-w-0 space-y-3" aria-label="Vaults">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5"><h2 className="text-[14px] font-medium text-zinc-200">Vaults</h2>
              {isFetching && <span role="status" className="text-[11px] text-zinc-500">Updating</span>}
            </div>
            <Link to="/$orgSlug/secrets/vaults" params={{ orgSlug }} className={linkClassName}>View all<ArrowRight size={13} aria-hidden="true" /></Link>
          </div>

          {data.projects.length === 0 ? <div className="rounded-xl border border-dashed border-white/[0.12] px-5 py-12 text-center">
            <FolderKey size={24} className="mx-auto text-zinc-500" aria-hidden="true" />
            <h3 className="mt-3 text-[14px] font-medium text-zinc-200">Create your first vault</h3>
            <p className="mx-auto mt-1 max-w-xs text-[12px] leading-5 text-zinc-500">Give an application a home for its secrets, then separate values by environment.</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={onCreate}><Plus size={13} aria-hidden="true" />Create vault</Button>
          </div> : <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="outray-arc-requests-search min-w-0 flex-1 basis-[180px]"><SearchField appearance="workspace" label="Search vaults" value={searchInput} onValueChange={onSearchInputChange} placeholder="Find a vault or environment…" maxLength={200} autoComplete="off" spellCheck={false} /></div>
              <div className="outray-arc-address-filter w-[164px] shrink-0"><Select label="Sort vaults" value={sort} onValueChange={(value) => onSortChange(value as SecretsVaultSort)} options={[{ value: "updated", label: "Recently updated" }, { value: "name", label: "Name" }]} /></div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              {vaults.length === 0 ? <div className="px-5 py-10 text-center">
                <Search size={20} className="mx-auto text-zinc-500" aria-hidden="true" />
                <h3 className="mt-3 text-[13px] font-medium text-zinc-200">No matching vaults</h3>
                <p className="mt-1 text-[12px] text-zinc-500">Try another name, description, or environment.</p>
                <Button variant="ghost" size="sm" className="mt-3" onClick={onClearSearch}>Clear search</Button>
              </div> : <>
                <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(100px,.65fr)_62px_78px_12px] gap-3 border-b border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-500 md:grid">
                  <span>Vault</span><span>Environments</span><span className="text-right">Secrets</span><span className="text-right">Updated</span><span />
                </div>
                <div className="divide-y divide-white/[0.06]">{vaults.map((project) => <VaultRow key={project.id} orgSlug={orgSlug} project={project} />)}</div>
              </>}
            </div>
            {matches.length > PREVIEW_LIMIT && <p className="text-[11px] text-zinc-500">Showing {PREVIEW_LIMIT} of {matches.length.toLocaleString()} {searchInput.trim() ? "matching " : ""}vaults. Open View all to browse the complete list.</p>}
          </>}
        </section>
        <SecretsOverviewActivity orgSlug={orgSlug} events={data.recentActivity} />
      </div>
    </>}
  </div>;
}

const linkClassName = "inline-flex min-h-8 items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-zinc-200 motion-reduce:transition-none focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function VaultRow({ orgSlug, project }: { orgSlug: string; project: SecretProject }) {
  const updatedAt = vaultUpdatedAt(project);
  const environmentNames = project.environments.map((environment) => environment.name).join(", ");
  return <Link to="/$orgSlug/secrets/vaults/$projectSlug" params={{ orgSlug, projectSlug: project.slug }}
    className="group grid min-h-[76px] min-w-0 grid-cols-[minmax(0,1fr)_12px] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:grid-cols-[minmax(0,1fr)_minmax(100px,.65fr)_62px_78px_12px]">
    <div className="flex min-w-0 items-center gap-2.5">
      <FolderKey size={16} className="shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300 motion-reduce:transition-none" aria-hidden="true" />
      <div className="min-w-0"><p className="truncate text-[13px] text-zinc-200 group-hover:text-white">{project.name}</p><p className="mt-0.5 truncate text-[11px] text-zinc-500" title={project.description || project.slug}>{project.description || project.slug}</p></div>
    </div>
    <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 md:contents">
      <span className="min-w-0 truncate" title={environmentNames || undefined}>{project.environments.length ? project.environments.slice(0, 2).map((environment, index) => <span key={environment.id}>
        {index > 0 && <span className="text-zinc-600"> · </span>}{environment.name}
      </span>) : `${project.environmentCount} ${project.environmentCount === 1 ? "environment" : "environments"}`}{project.environments.length > 2 && <span className="text-zinc-500"> +{project.environments.length - 2}</span>}</span>
      <span className="tabular-nums md:text-right"><span className="md:sr-only">Secrets </span>{project.secretCount.toLocaleString()}</span>
      <span className="tabular-nums text-zinc-500 md:text-right">{updatedAt ? <time dateTime={updatedAt} title={formatSecretDate(updatedAt)}><span className="sr-only">Updated </span>{formatRelativeDate(updatedAt)}</time> : "Unknown"}</span>
    </div>
    <ArrowRight size={12} className="col-start-2 row-start-1 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none md:col-start-5" aria-hidden="true" />
  </Link>;
}

function SecretsOverviewSkeleton() {
  return <div aria-label="Loading Secrets overview" aria-busy="true" className="space-y-7 animate-pulse motion-reduce:animate-none">
    <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-[120px] rounded-xl border border-white/[0.08] bg-white/[0.025] px-5 py-4"><div className="h-3 w-24 rounded bg-white/[0.06]" /><div className="mt-4 h-7 w-14 rounded bg-white/[0.07]" /><div className="mt-3 h-2.5 w-36 max-w-full rounded bg-white/[0.04]" /></div>)}</div>
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
      {[true, false].map((vaults) => <div key={String(vaults)} className="min-w-0 space-y-3"><div className={`flex items-start justify-between ${vaults ? "h-8 pt-2" : "h-11"}`}><div><div className="h-3 w-28 rounded bg-white/[0.06]" />{!vaults && <div className="mt-3 h-2.5 w-44 max-w-full rounded bg-white/[0.04]" />}</div><div className="h-3 w-12 rounded bg-white/[0.04]" /></div>
        {vaults && <div className="h-9 rounded-xl bg-white/[0.04]" />}
        <div className={vaults ? "overflow-hidden rounded-xl border border-white/[0.08]" : "border-y border-white/[0.08]"}>
          {vaults && <div className="hidden h-9 border-b border-white/[0.07] bg-white/[0.015] md:block" />}
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex min-h-[76px] items-center gap-3 border-b border-white/[0.06] px-4 last:border-b-0"><div className="size-4 rounded bg-white/[0.04]" /><div className="min-w-0 flex-1"><div className="h-3 w-28 max-w-full rounded bg-white/[0.06]" /><div className="mt-2 h-2.5 w-40 max-w-full rounded bg-white/[0.04]" /></div><div className="h-2.5 w-10 rounded bg-white/[0.04]" /></div>)}
        </div>
      </div>)}
    </div>
  </div>;
}
