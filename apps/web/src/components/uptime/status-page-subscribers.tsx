import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { SearchField } from "@/components/arc/search-field/search-field";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { useStatusPageEditor } from "./status-page-editor-context";
import { formatTime, statusPagePath, uptimeRequest, UptimeRequestError, type UptimeSubscriber, type UptimeSubscribersResponse } from "./uptime-client";
import { UptimeDialog } from "./uptime-dialog";
import { UptimeRowsSkeleton, UptimeSkeleton } from "./uptime-skeleton";
import { UptimeError, UptimePanel } from "./uptime-ui";

export function StatusPageSubscribers() {
  const { orgSlug, page, canManage, reload } = useStatusPageEditor();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [confirmation, setConfirmation] = useState<{ kind: "disable" } | { kind: "unsubscribe"; subscriber: UptimeSubscriber } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  const queryPrefix = ["uptime", orgSlug, "subscribers", page.id];
  const resource = useQuery({
    queryKey: [...queryPrefix, search.trim(), status, cursor],
    enabled: canManage,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: "25" });
      if (search.trim()) params.set("q", search.trim());
      if (status !== "all") params.set("status", status);
      if (cursor) params.set("cursor", cursor);
      return uptimeRequest<UptimeSubscribersResponse>(orgSlug, statusPagePath(`/subscribers?${params}`, page.id), { signal });
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const forbidden = resource.error instanceof UptimeRequestError && [401, 403].includes(resource.error.status);
  const enabled = resource.data?.subscriptionsEnabled ?? page.subscriptionsEnabled !== false;
  const subscribers = resource.data?.subscribers ?? [];

  const closeConfirmation = () => {
    if (!pending.current) { setConfirmation(null); setError(null); }
  };
  const changeSetting = async (subscriptionsEnabled: boolean) => {
    if (!canManage || forbidden || pending.current) return;
    pending.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await uptimeRequest<{ subscriptionsEnabled: boolean }>(orgSlug, statusPagePath("/subscribers/settings", page.id), {
        method: "PATCH", body: JSON.stringify({ subscriptionsEnabled }),
      });
      queryClient.setQueriesData<UptimeSubscribersResponse>({ queryKey: queryPrefix }, (current) => current ? { ...current, subscriptionsEnabled: result.subscriptionsEnabled } : current);
      setConfirmation(null);
      setNotice(result.subscriptionsEnabled ? "Subscriptions are on. Visitors can sign up and confirmed subscribers can receive updates." : "Subscriptions are off. New signups and subscriber emails are paused; your subscriber list is retained.");
      reload();
      await queryClient.invalidateQueries({ queryKey: queryPrefix });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change subscriptions. Your settings are unchanged."); }
    finally { pending.current = false; setBusy(false); }
  };
  const unsubscribe = async (subscriber: UptimeSubscriber) => {
    if (!canManage || forbidden || pending.current) return;
    pending.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await uptimeRequest(orgSlug, statusPagePath(`/subscribers/${encodeURIComponent(subscriber.id)}`, page.id), {
        method: "PATCH", body: JSON.stringify({ status: "unsubscribed" }),
      });
      setConfirmation(null);
      setNotice("The address is unsubscribed. It will no longer receive updates for this status page.");
      await queryClient.invalidateQueries({ queryKey: queryPrefix });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not unsubscribe this address. Its subscription is unchanged."); }
    finally { pending.current = false; setBusy(false); }
  };
  const resetPaging = () => { setCursor(null); setHistory([]); };

  if (!canManage || forbidden) return <UptimePanel className="p-6">
    <ShieldCheck size={20} className="mb-3 text-zinc-500" aria-hidden="true" />
    <h2 className="text-[14px] font-medium text-zinc-200">Subscriber access is restricted</h2>
    <p className="mt-2 text-[12px] leading-6 text-zinc-500">Only workspace owners and admins can view subscriber email addresses or manage subscriptions.</p>
  </UptimePanel>;

  return <div className="space-y-5">
    <UptimePanel className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0 max-w-2xl">
        <h2 className="flex items-center gap-2 text-[14px] font-medium text-zinc-200"><Mail size={16} aria-hidden="true" />Email subscriptions</h2>
        <p id="subscriptions-setting-help" className="mt-2 text-[12px] leading-6 text-zinc-500">{enabled ? "Visitors can subscribe using Get updates. Only confirmed subscribers receive published incident updates." : "Get updates is hidden. New signups and subscriber emails are paused. Existing subscribers are retained."}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-zinc-400">{enabled ? "On" : "Off"}</span>
        <Button type="button" variant="ghost" size="sm" role="switch" aria-label="Allow subscriptions" aria-checked={enabled} aria-describedby="subscriptions-setting-help" disabled={busy || !resource.data || resource.isError}
          className={`relative h-7! min-h-7! w-12! min-w-12! rounded-full! border! border-white/10! px-1! ${enabled ? "bg-zinc-200!" : "bg-white/[0.08]!"}`}
          onClick={() => { if (enabled) { setError(null); setConfirmation({ kind: "disable" }); } else void changeSetting(true); }}>
          <span aria-hidden="true" className="relative block h-[18px] w-[38px]">
            <motion.span className={`absolute left-0 top-0 size-[18px] rounded-full ${enabled ? "bg-zinc-950" : "bg-zinc-400"}`}
              animate={{ x: enabled ? 20 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }} />
          </span>
        </Button>
      </div>
    </UptimePanel>

    {notice ? <p role="status" className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[12px] leading-6 text-zinc-300">{notice}</p> : null}
    {error && !confirmation ? <UptimeError message={error} /> : null}
    <section aria-labelledby="subscribers-heading" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
      <header className="space-y-4 border-b border-white/[0.07] p-5">
        <div><h2 id="subscribers-heading" className="text-[14px] font-medium text-zinc-200">Subscribers</h2><p className="mt-1.5 text-[12px] leading-6 text-zinc-500">Customer email subscriptions for this status page, separate from team notification channels.</p></div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl label="Filter subscribers by status" value={status} onValueChange={(next) => { setStatus(next); resetPaging(); }} options={[
            { value: "all", label: "All" }, { value: "confirmed", label: "Confirmed" }, { value: "pending", label: "Pending" }, { value: "unsubscribed", label: "Unsubscribed" },
          ].map((option) => ({ ...option, accessory: <span className="text-[10px] tabular-nums opacity-70">{resource.data?.counts[option.value as keyof UptimeSubscribersResponse["counts"]] ?? "—"}</span> }))} />
          <div className="w-full sm:w-64 [&>div>label]:sr-only"><SearchField appearance="workspace" label="Search subscribers by email" placeholder="Search email addresses…" value={search} maxLength={254} onValueChange={(next) => { setSearch(next); resetPaging(); }} /></div>
        </div>
      </header>
      {resource.isError ? <div className="space-y-3 p-5"><UptimeError message={`${resource.data ? "Could not refresh subscribers. Showing the last loaded list. " : ""}${resource.error.message}`} /><Button type="button" variant="secondary" size="sm" onClick={() => void resource.refetch()} loading={resource.isFetching}>Try again</Button></div> : null}
      {resource.isPending ? <UptimeSkeleton label="Loading subscribers" className="p-5"><UptimeRowsSkeleton rows={5} /></UptimeSkeleton> : resource.data ? <>
        {subscribers.length ? <div className="overflow-x-auto"><table className="w-full text-left text-[12px]"><thead className="border-b border-white/[0.07] text-[11px] text-zinc-500"><tr><th scope="col" className="px-5 py-3 font-normal">Email address</th><th scope="col" className="px-4 py-3 font-normal">Status</th><th scope="col" className="px-4 py-3 font-normal">Joined</th><th scope="col" className="px-4 py-3 font-normal">Last update sent</th><th scope="col" className="px-5 py-3 font-normal"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-white/[0.06]">
          {subscribers.map((subscriber) => <tr key={subscriber.id}><th scope="row" className="max-w-80 break-all px-5 py-4 font-normal text-zinc-300">{subscriber.email}</th><td className="px-4 py-4"><span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] ${subscriber.status === "confirmed" ? "bg-emerald-400/[0.06] text-emerald-300" : subscriber.status === "pending" ? "bg-amber-400/[0.06] text-amber-300" : "bg-white/[0.04] text-zinc-500"}`}>{subscriber.status === "confirmed" ? "Confirmed" : subscriber.status === "pending" ? "Pending" : "Unsubscribed"}</span></td><td className="whitespace-nowrap px-4 py-4 text-zinc-500"><time dateTime={subscriber.createdAt}>{formatTime(subscriber.createdAt)}</time></td><td className="whitespace-nowrap px-4 py-4 text-zinc-500">{subscriber.lastSentAt ? <time dateTime={subscriber.lastSentAt}>{formatTime(subscriber.lastSentAt)}</time> : "Never"}</td><td className="px-5 py-4 text-right">{subscriber.status !== "unsubscribed" ? <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Unsubscribe ${subscriber.email}`} onClick={() => { setError(null); setConfirmation({ kind: "unsubscribe", subscriber }); }}>Unsubscribe</Button> : null}</td></tr>)}
        </tbody></table></div> : <div className="px-5 py-10 text-center"><Mail size={22} className="mx-auto mb-3 text-zinc-600" aria-hidden="true" /><p className="text-[13px] text-zinc-300">{search || status !== "all" ? "No subscribers match your filters" : "No subscribers yet"}</p><p className="mt-2 text-[12px] text-zinc-500">{search || status !== "all" ? "Try another email or subscription status." : "Visitors can subscribe on your published status page when subscriptions are on."}</p></div>}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3"><p role="status" className="text-[11px] text-zinc-500">{subscribers.length} {subscribers.length === 1 ? "subscriber" : "subscribers"} shown</p><div className="flex gap-2"><Button type="button" variant="secondary" size="sm" disabled={!history.length || resource.isFetching || busy} onClick={() => { setCursor(history.at(-1) ?? null); setHistory((previous) => previous.slice(0, -1)); }}>Previous</Button><Button type="button" variant="secondary" size="sm" disabled={!resource.data.nextCursor || resource.isFetching || busy} onClick={() => { if (resource.data?.nextCursor) { setHistory((previous) => [...previous, cursor]); setCursor(resource.data.nextCursor); } }}>Next</Button></div></footer>
      </> : null}
    </section>

    <UptimeDialog open={confirmation !== null} onClose={closeConfirmation} title={confirmation?.kind === "disable" ? "Turn off subscriptions?" : "Unsubscribe this address?"} busy={busy} footer={<>
      <Button type="button" variant="secondary" size="sm" data-autofocus disabled={busy} onClick={closeConfirmation}>Cancel</Button>
      <Button type="button" variant="danger" size="sm" loading={busy} onClick={() => { if (confirmation?.kind === "disable") void changeSetting(false); else if (confirmation?.kind === "unsubscribe") void unsubscribe(confirmation.subscriber); }}>{confirmation?.kind === "disable" ? "Turn off subscriptions" : "Unsubscribe"}</Button>
    </>}>
      <p className="text-[13px] leading-6 text-zinc-400">{confirmation?.kind === "disable" ? "Get updates will be hidden. New signups and subscriber emails will pause. Your subscriber list and existing consent are retained; turning subscriptions on resumes them." : confirmation?.kind === "unsubscribe" ? <>Stop status updates to <span className="break-all text-zinc-200">{confirmation.subscriber.email}</span>? The address will stay in your subscriber history and must sign up and confirm again to receive updates.</> : null}</p>
      {error ? <div className="mt-4"><UptimeError message={error} /></div> : null}
    </UptimeDialog>
  </div>;
}
