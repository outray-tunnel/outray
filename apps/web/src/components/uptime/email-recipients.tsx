import { memo, useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { WorkspaceInput } from "../ui/workspace-input";
import { uptimeRequest } from "./uptime-client";
import { UptimeRowsSkeleton, UptimeSkeleton } from "./uptime-skeleton";
import { secondaryButton, UptimeCheckbox, UptimeError } from "./uptime-ui";
import { toggleUptimeRecipient, uptimeRecipientPath, UPTIME_RECIPIENT_LIMIT, UPTIME_RECIPIENT_PAGE_SIZE, type UptimeRecipientPage } from "./email-recipient-data";

interface UptimeEmailRecipientsProps {
  orgSlug: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/** Memoized independently from the monitor draft so typing a URL never redraws the picker. */
export const UptimeEmailRecipients = memo(function UptimeEmailRecipients({ orgSlug, value, onChange, disabled = false }: UptimeEmailRecipientsProps) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [pagePosition, setPagePosition] = useState<{ scope: string; index: number; cursors: Array<string | null> }>({ scope: "", index: 0, cursors: [null] });
  const [actionError, setActionError] = useState<{ scope: string; message: string } | null>(null);
  const actionPending = useRef(false);
  const rowsRef = useRef<HTMLDivElement>(null);
  const searchQuery = search.trim();
  const searchPending = searchQuery !== query;
  const scope = JSON.stringify([orgSlug, query]);
  const pageIndex = pagePosition.scope === scope ? pagePosition.index : 0;
  const cursors = pagePosition.scope === scope ? pagePosition.cursors : [null];
  const cursor = cursors[pageIndex] ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchQuery), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => {
    if (rowsRef.current) rowsRef.current.scrollTop = 0;
  }, [orgSlug, query, cursor]);

  const membersQuery = useQuery({
    queryKey: ["uptime", orgSlug, "members", query, cursor],
    queryFn: ({ signal }) => uptimeRequest<UptimeRecipientPage>(orgSlug, uptimeRecipientPath(query, cursor), { signal }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const page = membersQuery.data;
  // The server also bounds pages. This cap prevents an accidental legacy response from rebuilding a giant DOM.
  const members = searchPending ? [] : (page?.members ?? []).slice(0, UPTIME_RECIPIENT_PAGE_SIZE);
  const loading = searchPending || membersQuery.isPending;
  const busy = disabled || searchPending || membersQuery.isFetching;
  const error = searchPending ? null : membersQuery.error ?? (actionError?.scope === scope ? actionError.message : null);
  const nextAvailable = Boolean(page?.nextCursor);
  const selected = new Set(value);

  const nextPage = () => {
    if (busy || actionPending.current || !nextAvailable) return;
    setActionError(null);
    setPagePosition({ scope, index: pageIndex + 1, cursors: [...cursors.slice(0, pageIndex + 1), page!.nextCursor] });
  };
  const retry = async () => {
    if (busy || actionPending.current) return;
    actionPending.current = true;
    setActionError(null);
    try {
      await membersQuery.refetch({ cancelRefetch: false });
    } catch (cause) {
      setActionError({ scope, message: cause instanceof Error ? cause.message : "Could not load team members." });
    } finally {
      actionPending.current = false;
    }
  };

  return <fieldset disabled={disabled}>
    <legend className="text-[12px] text-zinc-300">Email team members</legend>
    <p id={`${id}-help`} className="mt-1 text-[11px] leading-5 text-zinc-500">Selected members receive Down and Recovery alerts. Choose up to {UPTIME_RECIPIENT_LIMIT}.</p>
    <div className="mt-3">
      <label htmlFor={`${id}-search`} className="sr-only">Search team members by name or email</label>
      <WorkspaceInput id={`${id}-search`} type="search" size="compact" value={search} maxLength={160} autoComplete="off" placeholder="Search by name or email…" aria-describedby={`${id}-help`} onChange={(event) => { setSearch(event.target.value); setPagePosition({ scope: "", index: 0, cursors: [null] }); setActionError(null); }} />
    </div>
    <div ref={rowsRef} className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-white/[0.08] bg-black/10" aria-busy={loading || membersQuery.isFetching}>
      {loading ? <UptimeSkeleton label="Loading team members"><UptimeRowsSkeleton rows={4} /></UptimeSkeleton> : null}
      {!loading && !error && members.length === 0 ? <p className="px-3 py-3 text-xs text-zinc-500">{query ? "No members match your search." : "No team members available."}</p> : null}
      {members.map((member) => <label key={member.id} className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-white/[0.06] px-3 py-2 last:border-0 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none">
        <UptimeCheckbox disabled={disabled || (!selected.has(member.email) && value.length >= UPTIME_RECIPIENT_LIMIT)} checked={selected.has(member.email)} onChange={(event) => onChange(toggleUptimeRecipient(value, member.email, event.target.checked))} />
        <span className="min-w-0"><span className="block truncate text-xs text-zinc-200">{member.name}</span><span className="block truncate text-[11px] text-zinc-500">{member.email}</span></span>
      </label>)}
    </div>
    {error ? <div className="mt-2 space-y-2"><UptimeError message={error instanceof Error ? error.message : String(error)} /><button type="button" className={secondaryButton} disabled={busy} onClick={() => void retry()}>Try again</button></div> : null}
    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
      <span role="status" aria-live="polite">{loading ? "Finding members…" : `${value.length} selected · Page ${pageIndex + 1}`}</span>
      {pageIndex > 0 || nextAvailable ? <div className="flex gap-1.5">
        <button type="button" className={secondaryButton} aria-label="Previous members" disabled={busy || pageIndex === 0} onClick={() => setPagePosition({ scope, index: Math.max(0, pageIndex - 1), cursors })}>Previous</button>
        <button type="button" className={secondaryButton} aria-label="Next members" disabled={busy || !nextAvailable} onClick={nextPage}>Next</button>
      </div> : null}
    </div>
    {value.length > 0 ? <details className="mt-3 text-[11px] text-zinc-400">
      <summary className="cursor-pointer transition-colors hover:text-zinc-200">Selected recipients ({value.length})</summary>
      <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {value.slice(0, UPTIME_RECIPIENT_LIMIT).map((email) => <button key={email} type="button" disabled={disabled} onClick={() => onChange(toggleUptimeRecipient(value, email, false))} aria-label={`Remove ${email}`} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none"><span className="truncate">{email}</span><X size={12} className="shrink-0" aria-hidden="true" /></button>)}
      </div>
    </details> : null}
  </fieldset>;
});
