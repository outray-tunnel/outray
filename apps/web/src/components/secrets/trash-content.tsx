import { useMemo, type ReactNode } from "react";
import { ArrowRight, ArrowRightLeft, FolderKey, Info, KeyRound, Layers, LockKeyhole, RefreshCw, Search, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import SegmentedControl from "../arc/segmented-control/segmented-control";
import type { SecretTrashItem } from "@/lib/secrets-client";
import { filterTrash, trashCountLabel, trashKind, trashLocation, type TrashView } from "./trash-data";
import { formatRelativeDate, formatSecretDate } from "./utils";
import "../outray-arc-theme.css";

export interface SecretsTrashContentProps {
  items?: SecretTrashItem[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  permissionPending?: boolean;
  canRestore: boolean;
  search: string;
  view: TrashView;
  notice?: string | null;
  onDismissNotice?: () => void;
  onSearchChange: (search: string) => void;
  onViewChange: (view: TrashView) => void;
  onClearFilters: () => void;
  onChooseVaults: () => void;
  onRetry: () => void;
  onRestore: (item: SecretTrashItem) => void;
}

const columns = "@[800px]/trash-catalog:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_108px_100px]";

export function SecretsTrashContent({ items, loading, refreshing, error, permissionPending, canRestore, search, view, notice,
  onDismissNotice, onSearchChange, onViewChange, onClearFilters, onChooseVaults, onRetry, onRestore }: SecretsTrashContentProps) {
  const records = items ?? [];
  const matches = useMemo(() => filterTrash(items ?? [], search, view), [items, search, view]);
  const secretsCount = records.filter((item) => item.type === "secret" || item.type === "bulk").length;
  const environmentsCount = records.filter((item) => item.type === "environment").length;
  const vaultsCount = records.filter((item) => item.type === "project").length;
  const readOnly = !canRestore && !permissionPending;

  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0"><div className="flex items-center gap-2.5">
        <h1 data-trash-heading tabIndex={-1} className="text-[20px] font-normal tracking-[-0.035em] text-white">Trash</h1>
        {items && <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-500" aria-label={`${items.length} recoverable entries`}>{items.length.toLocaleString()}</span>}
      </div><p className="mt-1 text-[12px] leading-5 text-zinc-500">Recover deleted secrets, environments, and vaults.</p></div>
      {readOnly && <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"><LockKeyhole size={12} aria-hidden="true" />Read-only</span>}
    </header>

    {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.035] px-4 py-2.5 text-[12px] text-emerald-200/80">
      <span>{notice}</span>{onDismissNotice && <Button variant="ghost" size="sm" onClick={onDismissNotice}>Dismiss</Button>}
    </div>}

    {loading && !items ? <TrashSkeleton /> : !items ? <PageState role="alert" icon={Trash2} title="Could not load Trash"
      description={error || "Your deleted items could not be loaded. Try again in a moment."}
      action={<Button variant="secondary" size="sm" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button>} /> : <>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75">
        <span>Could not refresh Trash. Showing the last available items.</span><Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
      </div>}

      {records.length === 0 ? <TrashEmptyState onChooseVaults={onChooseVaults} /> : <section aria-label="Deleted items" className="@container/trash-catalog space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 max-w-full"><SegmentedControl label="Deleted item type" value={view} onValueChange={(value) => onViewChange(value as TrashView)} options={[
            { value: "all", label: "All", accessory: <Count value={records.length} /> },
            { value: "secrets", label: "Secrets", accessory: <Count value={secretsCount} /> },
            { value: "environments", label: "Environments", accessory: <Count value={environmentsCount} /> },
            { value: "vaults", label: "Vaults", accessory: <Count value={vaultsCount} /> },
          ]} /></div>
          <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-2 sm:max-w-[330px]">
            <div className="outray-arc-requests-search min-w-0 flex-1"><SearchField appearance="workspace" label="Search Trash" value={search} onValueChange={onSearchChange} placeholder="Search deleted items…" maxLength={200} autoComplete="off" spellCheck={false} /></div>
            <Button variant="ghost" size="sm" aria-label="Refresh Trash" title="Refresh Trash" disabled={refreshing} onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /></Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
          {matches.length === 0 ? <PageState icon={Search} title="No matching deleted items" description="Try another name or original location, or clear your filters."
            action={<Button variant="ghost" size="sm" onClick={onClearFilters}>Clear filters</Button>} /> : <>
            <div aria-hidden="true" className={`hidden items-center gap-4 border-b border-white/[0.07] bg-white/[0.015] px-5 py-2.5 text-[11px] text-zinc-500 @[800px]/trash-catalog:grid ${columns}`}>
              <span>Deleted item</span><span>Original location</span><span>Deleted</span><span />
            </div>
            <ul aria-label="Recoverable items" className="divide-y divide-white/[0.06]">{matches.map((item) => <TrashRow key={item.batchId} item={item} canRestore={canRestore && !permissionPending} onRestore={onRestore} />)}</ul>
          </>}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-[11px] leading-5 text-zinc-500">
          <p className="flex min-w-0 items-start gap-1.5"><ShieldCheck size={12} className="mt-1 shrink-0" aria-hidden="true" /><span>{readOnly ? "Only an owner or admin can restore items. " : ""}Restored items return to their original location. Existing keys are never overwritten.</span></p>
          <p role="status" aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">{refreshing && <RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{refreshing ? "Updating" : `${matches.length.toLocaleString()} of ${records.length.toLocaleString()} entries`}</p>
        </div>
        {records.some((item) => item.type === "bulk" && item.metadata?.reason === "move") && <p className="flex items-start gap-1.5 text-[11px] leading-5 text-zinc-500"><Info size={12} className="mt-1 shrink-0" aria-hidden="true" /><span>Restoring moved secrets recovers their source values. Destination values stay unchanged.</span></p>}
      </section>}
    </>}
  </div>;
}

function Count({ value }: { value: number }) {
  return <span className="ml-1.5 rounded-md bg-white/[0.055] px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500">{value.toLocaleString()}</span>;
}

function TrashRow({ item, canRestore, onRestore }: { item: SecretTrashItem; canRestore: boolean; onRestore: (item: SecretTrashItem) => void }) {
  const kind = trashKind(item);
  const location = trashLocation(item);
  const Icon = item.type === "project" ? FolderKey : item.type === "environment" ? Layers : item.type === "bulk" && item.metadata?.reason === "move" ? ArrowRightLeft : KeyRound;
  return <li data-trash-batch={item.batchId} className={`group grid min-h-[88px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-5 py-4 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025] motion-reduce:transition-none ${columns}`}>
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-zinc-500 transition-colors group-hover:text-zinc-400 motion-reduce:transition-none"><Icon size={16} aria-hidden="true" /></div>
      <div className="min-w-0"><h2 className="truncate text-[13px] font-medium text-zinc-200" title={item.name}>{item.name}</h2>
        <p className="mt-0.5 text-[11px] leading-5 text-zinc-500">{kind}<span className="mx-1.5 text-zinc-700">·</span>{trashCountLabel(item)}</p>
      </div>
    </div>
    <dl className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 pl-11 @[800px]/trash-catalog:contents">
      <div className="min-w-0 @[800px]/trash-catalog:col-span-1"><dt className="sr-only">Original location</dt><dd className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="max-w-full truncate text-[11px] text-zinc-500" title={location || undefined}>{location || "Location not recorded"}</span>
        {item.isProduction && <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400/10 bg-amber-400/[0.04] px-1.5 py-0.5 text-[10px] text-amber-200/75"><LockKeyhole size={10} aria-hidden="true" />Production</span>}
      </dd></div>
      <div className="min-w-0 @[800px]/trash-catalog:col-span-1"><dt className="sr-only">Deleted</dt><dd className="text-[11px] tabular-nums text-zinc-500"><time dateTime={item.deletedAt} title={formatSecretDate(item.deletedAt)}>{formatRelativeDate(item.deletedAt)}</time></dd></div>
    </dl>
    {canRestore ? <Button variant="ghost" size="sm" className="col-start-2 row-start-1 justify-self-end @[800px]/trash-catalog:col-start-4" aria-haspopup="dialog" aria-label={`Restore ${item.name}`} onClick={() => onRestore(item)}><Undo2 size={13} aria-hidden="true" />Restore</Button> : <span className="hidden @[800px]/trash-catalog:block" aria-hidden="true" />}
  </li>;
}

function TrashEmptyState({ onChooseVaults }: { onChooseVaults: () => void }) {
  return <section className="rounded-xl border border-white/[0.08] bg-white/[0.015] px-6 py-14 text-center sm:py-20" aria-labelledby="trash-empty-title">
    <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.025] text-zinc-400"><Trash2 size={22} aria-hidden="true" /></div>
    <h2 id="trash-empty-title" className="mt-5 text-[16px] font-medium tracking-[-0.02em] text-zinc-200">Trash is empty</h2>
    <p className="mx-auto mt-2 max-w-[430px] text-[13px] leading-6 text-zinc-500">Deleted secrets, environments, and vaults appear here so an owner or admin can restore them. Secrets deleted together are kept in one recoverable batch.</p>
    <Button variant="secondary" size="md" className="mt-6" onClick={onChooseVaults}>View vaults<ArrowRight size={14} aria-hidden="true" /></Button>
  </section>;
}

function PageState({ icon: Icon, title, description, action, role }: { icon: typeof Trash2; title: string; description: string; action?: ReactNode; role?: "alert" }) {
  return <section role={role} className="px-6 py-14 text-center">
    <Icon size={22} className="mx-auto text-zinc-500" aria-hidden="true" /><h2 className="mt-4 text-[14px] font-medium text-zinc-200">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-zinc-500">{description}</p>{action && <div className="mt-4">{action}</div>}
  </section>;
}

function TrashSkeleton() {
  return <section aria-label="Loading Trash" aria-busy="true" className="@container/trash-catalog space-y-3 animate-pulse motion-reduce:animate-none">
    <div aria-hidden="true" className="flex flex-wrap justify-between gap-3"><div className="h-9 w-[380px] max-w-full rounded-xl bg-white/[0.04]" /><div className="h-9 w-[330px] max-w-full rounded-xl bg-white/[0.04]" /></div>
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]"><div className="hidden h-9 border-b border-white/[0.07] bg-white/[0.015] @[800px]/trash-catalog:block" />
      {Array.from({ length: 5 }, (_, index) => <div key={index} className={`grid min-h-[88px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 border-b border-white/[0.06] px-5 py-4 last:border-b-0 ${columns}`}>
        <div className="flex items-center gap-3"><div className="size-8 shrink-0 rounded-lg bg-white/[0.04]" /><div className="min-w-0 flex-1"><div className="h-3 w-32 max-w-full rounded bg-white/[0.06]" /><div className="mt-2 h-2.5 w-24 rounded bg-white/[0.04]" /></div></div>
        <div className="col-span-2 flex gap-5 pl-11 @[800px]/trash-catalog:contents"><div className="h-2.5 w-32 max-w-full rounded bg-white/[0.04]" /><div className="h-2.5 w-14 rounded bg-white/[0.04]" /></div><div className="col-start-2 row-start-1 h-8 w-20 justify-self-end rounded-lg bg-white/[0.04] @[800px]/trash-catalog:col-start-4" />
      </div>)}
    </div>
  </section>;
}
