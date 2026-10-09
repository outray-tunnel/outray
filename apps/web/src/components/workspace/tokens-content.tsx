import { KeyRound, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { WorkspacePageHeader } from "../workspace-page-header";
import { WorkspaceEmptyState, WorkspaceNotice } from "./workspace-ui";
import { filterTokens, maskedTokenPrefix, relativeTokenDate, tokenDate, tokenResourceLabel, tokenScopeGroups, tokenStatus, type TokenStatusFilter } from "./tokens-data";
import type { AuthToken } from "@/lib/app-client";
import "../outray-arc-theme.css";

export interface TokensContentProps {
  tokens: AuthToken[] | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  canManage: boolean;
  permissionPending: boolean;
  search: string;
  status: TokenStatusFilter;
  now: number;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: TokenStatusFilter) => void;
  onCreate: () => void;
  onRevoke: (token: AuthToken) => void;
  onRetry: () => void;
}

const columns = "@[960px]/token-catalog:grid-cols-[minmax(0,1.15fr)_minmax(0,1.4fr)_80px_105px_105px_32px]";

export function TokensContent({ tokens, loading, refreshing, error, canManage, permissionPending, search, status, now, onSearchChange, onStatusChange, onCreate, onRevoke, onRetry }: TokensContentProps) {
  const visibleTokens = filterTokens(tokens ?? [], search, status, now);
  const filtered = search.trim().length > 0 || status !== "all";
  const clearFilters = () => { onSearchChange(""); onStatusChange("all"); };
  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <WorkspacePageHeader appearance="compact" title="API tokens" description="Scoped credentials for the CLI, API, and automation."
      action={canManage && !permissionPending ? <Button size="md" aria-haspopup="dialog" onClick={onCreate}><Plus size={14} aria-hidden="true" />New token</Button> : undefined} />
    {permissionPending || (loading && !tokens) ? <TokensSkeleton /> : !canManage ? <WorkspaceEmptyState icon={<KeyRound size={24} aria-hidden="true" />} title="Token management is restricted" description="Only workspace owners and admins can view, create, or revoke API tokens." /> : !tokens ? <section role="alert" className="space-y-3">
      <WorkspaceNotice message={error || "API tokens could not be loaded."} />
      <WorkspaceEmptyState icon={<KeyRound size={24} aria-hidden="true" />} title="Tokens could not be loaded" description="Try again to load your workspace credentials." action={<Button variant="secondary" size="sm" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button>} />
    </section> : <>
      {error ? <WorkspaceNotice message="Could not refresh tokens. Showing the last available metadata." action={<Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>} /> : null}
      {tokens.length === 0 ? <WorkspaceEmptyState icon={<KeyRound size={24} aria-hidden="true" />} title="No API tokens yet" description="Create a scoped credential for tunnels, telemetry, Secrets, or automation." action={<Button variant="secondary" size="md" aria-haspopup="dialog" onClick={onCreate}><Plus size={14} aria-hidden="true" />Create token</Button>} /> : <section aria-label="API token catalog" className="@container/token-catalog space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="outray-arc-requests-search min-w-0 flex-1 basis-[180px] sm:max-w-sm"><SearchField appearance="workspace" label="Search API tokens" value={search} onValueChange={onSearchChange} placeholder="Find a token or permission…" maxLength={200} autoComplete="off" spellCheck={false} /></div>
          <div className="outray-arc-address-filter w-[145px] shrink-0"><Select label="Filter token status" value={status} onValueChange={(value) => onStatusChange(value === "active" || value === "expired" || value === "revoked" ? value : "all")} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "expired", label: "Expired" }, { value: "revoked", label: "Revoked" }]} /></div>
          <p role="status" aria-live="polite" className="ml-auto text-[11px] tabular-nums text-zinc-500">{refreshing ? "Updating tokens…" : `${visibleTokens.length.toLocaleString()}${filtered ? ` of ${tokens.length.toLocaleString()}` : ""} ${tokens.length === 1 && !filtered ? "token" : "tokens"}`}</p>
          <Button variant="ghost" size="sm" aria-label="Refresh tokens" loading={refreshing} onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /></Button>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
          {visibleTokens.length === 0 ? <WorkspaceEmptyState icon={<Search size={22} aria-hidden="true" />} title="No matching tokens" description="Try a different name, permission, or status." action={<Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>} /> : <>
            <div aria-hidden="true" className={`hidden gap-4 border-b border-white/[0.07] bg-white/[0.015] px-5 py-2.5 text-[11px] text-zinc-500 @[960px]/token-catalog:grid ${columns}`}><span>Token</span><span>Access</span><span>Status</span><span>Expires</span><span>Last used</span><span /></div>
            <ul className="divide-y divide-white/[0.06]">{visibleTokens.map((token) => <TokenRow key={token.id} token={token} now={now} onRevoke={onRevoke} />)}</ul>
          </>}
        </div>
        <p className="text-[11px] leading-5 text-zinc-600">Only masked prefixes are shown. Full credentials cannot be recovered.</p>
      </section>}
    </>}
  </div>;
}

function TokenRow({ token, now, onRevoke }: { token: AuthToken; now: number; onRevoke: (token: AuthToken) => void }) {
  const status = tokenStatus(token, now);
  const groups = tokenScopeGroups(token.scopes);
  return <li data-token-status={status} className={`grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-5 py-3.5 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025] motion-reduce:transition-none ${columns}`}>
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-zinc-500"><KeyRound size={15} aria-hidden="true" /></span>
      <div className="min-w-0"><h2 className="truncate text-[13px] font-medium text-zinc-200" title={token.name}>{token.name}</h2><p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">{maskedTokenPrefix(token.prefix)}</p></div>
    </div>
    <div className="col-span-2 min-w-0 @[960px]/token-catalog:col-span-1">
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-5 text-zinc-400">{groups.map((group) => <span key={group.product}><span className="text-zinc-400">{group.product}</span><span className="text-zinc-600"> · {group.permissions}</span></span>)}</p>
      <p className="mt-0.5 text-[11px] text-zinc-600" title={token.projectId ? "This resource limit applies to Secrets. Tunnels and observability remain workspace-wide." : "Selected permissions apply across this workspace."}>{token.projectId ? "Secrets · " : ""}{tokenResourceLabel(token)}</p>
    </div>
    <span className={`col-start-1 inline-flex w-fit items-center gap-1.5 text-[11px] @[960px]/token-catalog:col-start-auto ${status === "active" ? "text-emerald-300/75" : status === "expired" ? "text-amber-200/75" : "text-zinc-500"}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${status === "active" ? "bg-emerald-400/70" : status === "expired" ? "bg-amber-300/70" : "bg-zinc-600"}`} />{status === "active" ? "Active" : status === "expired" ? "Expired" : "Revoked"}</span>
    <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 @[960px]/token-catalog:contents">
      <span><span className="mr-1.5 text-zinc-600 @[960px]/token-catalog:sr-only">Expires</span>{token.expiresAt ? <TokenTime value={token.expiresAt} now={now} /> : "No expiry"}</span>
      <span><span className="mr-1.5 text-zinc-600 @[960px]/token-catalog:sr-only">Last used</span>{token.lastUsedAt ? <TokenTime value={token.lastUsedAt} now={now} /> : "Never used"}</span>
    </div>
    <div className="col-start-2 row-start-3 @[960px]/token-catalog:col-start-auto @[960px]/token-catalog:row-start-auto">{status !== "revoked" ? <Button variant="ghost" size="sm" className="!size-8 !min-w-0 !px-0 text-zinc-500 hover:text-red-300" aria-label={`Revoke ${token.name}`} aria-haspopup="dialog" onClick={() => onRevoke(token)}><Trash2 size={14} aria-hidden="true" /></Button> : <span className="block size-8" aria-hidden="true" />}</div>
  </li>;
}

function TokenTime({ value, now }: { value: string; now: number }) {
  const date = tokenDate(value);
  return date ? <time dateTime={date.toISOString()} title={date.toLocaleString()}>{relativeTokenDate(value, now)}</time> : <>Unknown</>;
}

function TokensSkeleton() {
  return <div aria-label="Loading API tokens" aria-busy="true" className="@container/token-catalog space-y-3 animate-pulse motion-reduce:animate-none">
    <div className="flex flex-wrap gap-2" aria-hidden="true"><div className="h-9 min-w-[180px] flex-1 rounded-lg bg-white/[0.04] sm:max-w-sm" /><div className="h-9 w-[145px] rounded-lg bg-white/[0.04]" /></div>
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">{[0, 1, 2, 3].map((index) => <div key={index} className={`grid min-h-[76px] gap-4 border-b border-white/[0.06] px-5 py-4 last:border-0 ${columns}`}><div className="flex items-center gap-3"><div className="size-8 rounded-lg bg-white/[0.04]" /><div className="space-y-2"><div className="h-3 w-28 rounded bg-white/[0.06]" /><div className="h-2.5 w-36 rounded bg-white/[0.035]" /></div></div><div className="h-2.5 w-32 self-center rounded bg-white/[0.04]" /><div className="h-2.5 w-12 self-center rounded bg-white/[0.04]" /></div>)}</div>
  </div>;
}
