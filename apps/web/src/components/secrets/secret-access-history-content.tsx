import { Check, CircleAlert, Eye, ShieldCheck } from "lucide-react";
import type { SecretAuditEvent } from "@/lib/secrets-client";
import { Button } from "../arc/button/button";
import { auditActionLabel, auditActorDetail, auditActorLabel } from "./audit-data";
import { formatSecretDate } from "./utils";

const emptyStateClassName = "flex flex-col items-center gap-2.5 px-[18px] py-11 text-center [&>h4]:mt-0.5 [&>h4]:mb-0 [&>h4]:text-[13px] [&>h4]:leading-[1.6] [&>h4]:font-medium [&>h4]:text-zinc-300 [&>p]:mt-0 [&>p]:mb-1 [&>p]:max-w-[280px] [&>p]:text-xs [&>p]:leading-[1.8] [&>p]:text-zinc-500 [&>p]:[overflow-wrap:anywhere]";
const iconStateClassName = "grid size-[38px] place-items-center rounded-[11px] border border-white/[.07] bg-white/[.025] text-zinc-500";

export interface SecretAccessHistoryContentProps {
  events: SecretAuditEvent[];
  loading: boolean;
  error: string | null;
  denied: boolean;
  hasMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}

function AccessHistorySkeleton() {
  return <div className="animate-pulse motion-reduce:animate-none" role="status" aria-label="Loading access history">
    <span className="sr-only">Loading access history</span>
    {[0, 1, 2].map((item) => <div key={item} className="flex gap-[11px] border-b border-white/[.055] py-5 last:border-b-0" aria-hidden="true">
      <span className="size-[19px] basis-[19px] rounded-full bg-white/[.055]" />
      <div className="min-w-0 flex-1 [&>span]:block [&>span]:h-[15px] [&>span]:w-[130px] [&>span]:rounded [&>span]:bg-white/[.055] [&>span+span]:mt-2.25 [&>span+span]:h-3 [&>span+span]:w-3/5 [&>span+span]:bg-white/[.035]"><span /><span /></div>
    </div>)}
  </div>;
}

export function SecretAccessHistoryContent({ events, loading, error, denied, hasMore, onRetry, onLoadMore }: SecretAccessHistoryContentProps) {
  const initialLoading = loading && events.length === 0;
  return <div className="ph-no-capture w-full min-w-0 text-zinc-300" data-private-product="secrets" aria-busy={loading || undefined}>
    <div className="flex items-center justify-between gap-3 border-b border-white/[.07] py-[11px] [&>h3]:m-0 [&>h3]:text-xs [&>h3]:leading-normal [&>h3]:font-medium [&>h3]:text-zinc-400 [&>span]:text-[11px] [&>span]:text-zinc-500"><h3>Recorded access</h3>{!initialLoading && !error ? <span>{events.length} {events.length === 1 ? "event" : "events"}{hasMore ? " loaded" : ""}</span> : null}</div>
    {initialLoading ? <AccessHistorySkeleton /> : error && events.length === 0 ? <div className={emptyStateClassName} role="alert">
      <span className={iconStateClassName}>{denied ? <ShieldCheck size={20} aria-hidden="true" /> : <CircleAlert size={20} aria-hidden="true" />}</span>
      <h4>{denied ? "Access history unavailable" : "Couldn’t load access history"}</h4><p>{error}</p>
      {!denied ? <Button type="button" variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : null}
    </div> : <>
      {error ? <div className="flex items-center justify-between gap-3 border-b border-white/[.07] py-2.5 [&>p]:m-0 [&>p]:text-[11px] [&>p]:leading-[1.7] [&>p]:text-[#f0a1af] [&>p]:[overflow-wrap:anywhere]" role="alert"><p>{error}</p>{!denied ? <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={onRetry}>Retry</Button> : null}</div> : null}
      {events.length === 0 ? <div className={emptyStateClassName}><span className={iconStateClassName}><Eye size={20} aria-hidden="true" /></span><h4>No access history yet</h4><p>Recorded reveals, copies, and other reads of this secret will appear here.</p></div> : <ol className="m-0 list-none p-0" aria-label="Secret access events">
        {events.map((event) => {
          const outcome = event.result === "success" ? { label: "Success", Icon: Check } : event.result === "denied" ? { label: "Denied", Icon: ShieldCheck } : event.result === "failure" ? { label: "Failed", Icon: CircleAlert } : null;
          const version = event.metadata?.version;
          const recorded = Number.isFinite(Date.parse(event.createdAt));
          const address = typeof event.ipAddress === "string" && event.ipAddress.length <= 128 ? event.ipAddress.trim() : "";
          return <li key={event.id} data-secret-access-event={event.id} className="relative flex min-w-0 gap-[11px] border-b border-white/[.055] pt-[19px] pb-[17px] before:absolute before:top-[41px] before:bottom-[-18px] before:left-[9px] before:w-px before:bg-white/[.065] before:content-[''] last:border-b-0 last:before:hidden max-[540px]:gap-2.5">
            <span className="relative z-1 mt-px grid size-[19px] basis-[19px] place-items-center rounded-full border border-white/[.11] bg-[#121213] text-zinc-500"><Eye size={11} strokeWidth={1.7} aria-hidden="true" /></span>
            <article className="min-w-0 flex-1">
              <header className="flex flex-wrap items-center gap-x-2.25 gap-y-1.5 [&>h4]:m-0 [&>h4]:text-[13px] [&>h4]:leading-[1.6] [&>h4]:font-medium [&>h4]:text-zinc-200 [&>h4]:[overflow-wrap:anywhere]"><h4>{auditActionLabel(event.action)}</h4>{outcome ? <span className="inline-flex items-center gap-1 rounded-[5px] border border-white/[.07] bg-white/[.02] px-1.25 py-px text-[10px] leading-normal data-[outcome=success]:text-[#90bbaa] data-[outcome=denied]:text-[#c9b18b] data-[outcome=failure]:text-[#d3949f]" data-outcome={event.result}><outcome.Icon size={10} aria-hidden="true" />{outcome.label}</span> : null}</header>
              <p className="mt-1.5 mb-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px] leading-[1.7] text-zinc-500 [overflow-wrap:anywhere]"><span className="text-zinc-400">{auditActorLabel(event)}</span><span aria-hidden="true">·</span><span>{auditActorDetail(event)}</span></p>
              <p className="mt-1.5 mb-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px] leading-[1.7] text-zinc-500 [overflow-wrap:anywhere]"><time dateTime={recorded ? event.createdAt : undefined} title={recorded ? new Date(event.createdAt).toISOString() : undefined}>{recorded ? formatSecretDate(event.createdAt) : "Time not recorded"}</time>{typeof version === "number" && Number.isSafeInteger(version) && version > 0 ? <><span aria-hidden="true">·</span><span>Version {version}</span></> : null}{address ? <><span aria-hidden="true">·</span><span className="font-mono text-[10px]" aria-label={`IP address ${address}`}>{address}</span></> : null}</p>
            </article>
          </li>;
        })}
      </ol>}
      {hasMore && !denied ? <div className="flex justify-center border-t border-white/[.07] py-4"><Button type="button" variant="secondary" size="sm" loading={loading} disabled={Boolean(error) || loading} onClick={onLoadMore}>Load more</Button></div> : null}
    </>}
  </div>;
}
