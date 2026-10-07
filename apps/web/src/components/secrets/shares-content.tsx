import type { ReactNode } from "react";
import { ArrowRight, CircleCheck, Clock3, EyeOff, Info, KeyRound, Link2, LockKeyhole, RefreshCw, Search, ShieldCheck, Unlink } from "lucide-react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import SegmentedControl from "../arc/segmented-control/segmented-control";
import type { SecretShareRecord } from "@/lib/secrets-client";
import { filterShares, remainingReveals, shareStatus, type SharesView } from "./shares-data";
import { formatRelativeDate, formatSecretDate } from "./utils";
import "../outray-arc-theme.css";

export interface SecretsSharesContentProps {
  shares?: SecretShareRecord[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  permissionPending?: boolean;
  canManage: boolean;
  now: number;
  search: string;
  view: SharesView;
  notice?: string | null;
  onDismissNotice?: () => void;
  onSearchChange: (search: string) => void;
  onViewChange: (view: SharesView) => void;
  onClearFilters: () => void;
  onChooseSecrets: () => void;
  onRetry: () => void;
  onRevoke: (share: SecretShareRecord) => void;
}

const columns = "lg:grid-cols-[minmax(0,1.5fr)_90px_100px_100px_140px_82px]";
const statusDetails = {
  active: { label: "Active", icon: CircleCheck, color: "text-emerald-400" },
  revoked: { label: "Revoked", icon: Unlink, color: "text-zinc-500" },
  expired: { label: "Expired", icon: Clock3, color: "text-zinc-500" },
  exhausted: { label: "Used up", icon: EyeOff, color: "text-zinc-500" },
};

export function SecretsSharesContent({ shares, loading, refreshing, error, permissionPending, canManage, now, search, view,
  notice, onDismissNotice, onSearchChange, onViewChange, onClearFilters, onChooseSecrets, onRetry, onRevoke }: SecretsSharesContentProps) {
  const records = shares ?? [];
  const matches = filterShares(records, search, view, now);
  const activeCount = records.filter((share) => shareStatus(share, now) === "active").length;
  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0"><h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Shares</h1>
        <p className="mt-1 text-[12px] leading-5 text-zinc-500">Temporary access to selected secrets, without a workspace invitation.</p></div>
      {canManage && !permissionPending && records.length > 0 && <Button size="md" onClick={onChooseSecrets}><Link2 size={14} aria-hidden="true" />Share secrets</Button>}
    </header>

    {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.035] px-4 py-2.5 text-[12px] text-emerald-200/80">
      <span>{notice}</span>{onDismissNotice && <Button variant="ghost" size="sm" onClick={onDismissNotice}>Dismiss</Button>}
    </div>}

    {permissionPending || canManage && loading && !shares ? <SharesSkeleton /> : !canManage ? <PageState icon={LockKeyhole} title="Shares are managed by admins"
      description="Share selected secrets without inviting someone to your organization. An owner or admin can create and revoke these links." /> : !shares ?
      <PageState role="alert" icon={Link2} title="Could not load shares" description={error || "Your shares could not be loaded. Try again in a moment."} action={<Button variant="secondary" size="sm" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button>} /> : <>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75">
        <span>Could not refresh shares. Showing the last available data.</span><Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
      </div>}

      {records.length === 0 ? <SharesEmptyState onChooseSecrets={onChooseSecrets} /> : <section aria-label="Organization shares" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl label="Share status" value={view} onValueChange={(value) => onViewChange(value as SharesView)} options={[
            { value: "all", label: "All", accessory: <Count value={records.length} /> },
            { value: "active", label: "Active", accessory: <Count value={activeCount} /> },
            { value: "ended", label: "Ended", accessory: <Count value={records.length - activeCount} /> },
          ]} />
          <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-2 sm:max-w-[340px]">
            <div className="outray-arc-requests-search min-w-0 flex-1"><SearchField appearance="workspace" label="Search shares" value={search} onValueChange={onSearchChange} placeholder="Search secret keys or share ID…" maxLength={200} autoComplete="off" spellCheck={false} /></div>
            <Button variant="ghost" size="sm" aria-label="Refresh shares" title="Refresh shares" disabled={refreshing} onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /></Button>
          </div>
        </div>
        {refreshing && <p role="status" className="sr-only">Refreshing shares</p>}
        <div className="overflow-hidden rounded-xl border border-white/[0.08]">
          {matches.length === 0 ? <PageState icon={Search} title="No matching shares" description="Try another key name or share ID, or clear your filters." action={<Button variant="ghost" size="sm" onClick={onClearFilters}>Clear filters</Button>} /> : <>
            <div aria-hidden="true" className={`hidden items-center gap-4 border-b border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-500 lg:grid ${columns}`}>
              <span>Shared secrets</span><span>Status</span><span>Reveals</span><span>Created</span><span>Expires</span><span />
            </div>
            <div role="list" aria-label="Secret shares" className="divide-y divide-white/[0.06]">{matches.map((share) => <ShareRow key={share.id} share={share} now={now} onRevoke={onRevoke} />)}</div>
          </>}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2 text-[11px] leading-5 text-zinc-500">
          <p className="flex min-w-0 items-start gap-1.5"><Info size={12} className="mt-1 shrink-0" aria-hidden="true" /><span>The complete viewing link is shown only when created. It cannot be recovered here.</span></p>
          <p className="shrink-0 tabular-nums">{matches.length} {matches.length === 1 ? "share" : "shares"}{records.length >= 200 ? " · Latest 200" : ""}</p>
        </div>
      </section>}
    </>}
  </div>;
}

function Count({ value }: { value: number }) {
  return <span className="ml-1.5 rounded-md bg-white/[0.055] px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500">{value}</span>;
}

function SharesEmptyState({ onChooseSecrets }: { onChooseSecrets: () => void }) {
  return <section className="rounded-xl border border-white/[0.08] bg-white/[0.015] px-6 py-14 text-center sm:py-20" aria-labelledby="shares-empty-title">
    <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.025] text-zinc-400"><Link2 size={22} aria-hidden="true" /></div>
    <h2 id="shares-empty-title" className="mt-5 text-[16px] font-medium tracking-[-0.02em] text-zinc-200">Share secrets without inviting a member</h2>
    <p className="mx-auto mt-2 max-w-[430px] text-[13px] leading-6 text-zinc-500">Send selected secrets to someone without inviting them to your organization. Anyone with the encrypted link can reveal them—no account needed.</p>
    <div className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-zinc-400">
      <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-zinc-500" aria-hidden="true" />Encrypted snapshot</span>
      <span className="inline-flex items-center gap-1.5"><Clock3 size={13} className="text-zinc-500" aria-hidden="true" />Expiry & reveal limits</span>
      <span className="inline-flex items-center gap-1.5"><Unlink size={13} className="text-zinc-500" aria-hidden="true" />Revoke access</span>
    </div>
    <Button size="md" className="mt-7" onClick={onChooseSecrets}>Choose secrets<ArrowRight size={14} aria-hidden="true" /></Button>
    <p className="mx-auto mt-3 max-w-sm text-[11px] leading-5 text-zinc-500">Open a vault environment, select secrets, then choose Share.</p>
  </section>;
}

function PageState({ icon: Icon, title, description, action, role }: { icon: typeof Link2; title: string; description: string; action?: ReactNode; role?: "alert" }) {
  return <section role={role} className="px-6 py-14 text-center">
    <Icon size={22} className="mx-auto text-zinc-500" aria-hidden="true" />
    <h2 className="mt-4 text-[14px] font-medium text-zinc-200">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-zinc-500">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </section>;
}

function ShareRow({ share, now, onRevoke }: { share: SecretShareRecord; now: number; onRevoke: (share: SecretShareRecord) => void }) {
  const status = shareStatus(share, now);
  const { label, icon: Icon, color } = statusDetails[status];
  const names = share.keyNames.join(", ");
  return <article role="listitem" data-secret-share={share.id} className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-white/[0.025] motion-reduce:transition-none ${columns}`}>
    <div className="flex min-w-0 items-center gap-2.5"><KeyRound size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />
      <div className="min-w-0"><h3 className="text-[13px] font-normal text-zinc-200">{share.keyNames.length} {share.keyNames.length === 1 ? "secret" : "secrets"}</h3>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={names}>{names || "Secret snapshot"}</p>
        <p className="sr-only">Share ID {share.id}</p>
      </div>
    </div>
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${color}`}><Icon size={12} aria-hidden="true" />{label}</span>
    <dl className="col-span-2 grid min-w-0 grid-cols-3 gap-3 lg:contents">
      <div className="min-w-0"><dt className="mb-1 text-[10px] text-zinc-600 lg:sr-only">Reveals</dt><dd className="text-[12px] tabular-nums text-zinc-400">{share.views} <span className="text-zinc-600">/ {share.maxViews}</span>{status === "active" && <span className="mt-0.5 block text-[10px] text-zinc-500">{remainingReveals(share)} remaining</span>}</dd></div>
      <div className="min-w-0"><dt className="mb-1 text-[10px] text-zinc-600 lg:sr-only">Created</dt><dd className="truncate text-[11px] text-zinc-500"><time dateTime={share.createdAt} title={formatSecretDate(share.createdAt)}>{formatRelativeDate(share.createdAt)}</time></dd></div>
      <div className="min-w-0"><dt className="mb-1 text-[10px] text-zinc-600 lg:sr-only">Expires</dt><dd className="text-[11px] leading-5 text-zinc-500"><time dateTime={share.expiresAt}>{formatSecretDate(share.expiresAt)}</time></dd></div>
    </dl>
    {status === "active" ? <Button variant="ghost" size="sm" className="col-start-2 justify-self-end text-zinc-500 hover:text-rose-300 lg:col-start-auto" aria-haspopup="dialog" aria-label={`Revoke share ${share.id}`} onClick={() => onRevoke(share)}><Unlink size={12} aria-hidden="true" />Revoke</Button> : <span className="hidden lg:block" aria-hidden="true" />}
  </article>;
}

function SharesSkeleton() {
  return <section aria-label="Loading shares" aria-busy="true" className="space-y-3 animate-pulse motion-reduce:animate-none">
    <div className="flex flex-wrap justify-between gap-3"><div className="h-9 w-64 rounded-xl bg-white/[0.04]" /><div className="h-9 w-72 max-w-full rounded-xl bg-white/[0.04]" /></div>
    <div className="overflow-hidden rounded-xl border border-white/[0.08]"><div className="hidden h-9 border-b border-white/[0.07] bg-white/[0.015] lg:block" />
      {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex min-h-[88px] items-center gap-3 border-b border-white/[0.06] px-4 last:border-b-0"><div className="size-4 rounded bg-white/[0.04]" /><div className="min-w-0 flex-1"><div className="h-3 w-24 rounded bg-white/[0.06]" /><div className="mt-2 h-2.5 w-44 max-w-full rounded bg-white/[0.04]" /></div><div className="h-3 w-14 rounded bg-white/[0.04]" /></div>)}
    </div>
  </section>;
}
