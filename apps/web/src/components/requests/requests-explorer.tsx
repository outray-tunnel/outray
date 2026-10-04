import { useState } from "react";
import { ArrowUpRight, RefreshCw, Search, Radio } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import PauseIcon from "@hugeicons-pro/core-solid-rounded/PauseIcon";
import PlayIcon from "@hugeicons-pro/core-solid-rounded/PlayIcon";
import { Button } from "@/components/arc/button/button";
import { SearchField } from "@/components/arc/search-field/search-field";
import { SegmentedControl } from "../ui/segmented-control";
import "../outray-arc-theme.css";
import type { TimeRange, TunnelEvent } from "./types";
import { formatBytes, getHttpMethodColor } from "./utils";
import { RequestInspectorDrawer } from "./request-inspector-drawer";
import { REQUESTS_LIMIT, requestKey } from "./requests-feed-state";
import { useRequestsFeed, type RequestsFeed } from "./use-requests-feed";

const TIME_RANGES = [
  { value: "live", label: "Live" },
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
] satisfies { value: TimeRange; label: string }[];

const CONNECTION_LABELS = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

export interface RequestsExplorerProps {
  orgSlug: string;
  orgId?: string;
  tunnelId?: string;
  inspectorEnabled: boolean;
  fullCaptureEnabled: boolean;
}

export function RequestsExplorer({
  orgSlug,
  orgId,
  tunnelId,
  inspectorEnabled,
  fullCaptureEnabled,
}: RequestsExplorerProps) {
  const feed = useRequestsFeed({ orgSlug, orgId, tunnelId });
  const [selection, setSelection] = useState<{
    scopeKey: string;
    request: TunnelEvent;
  } | null>(null);
  // Never show an inspector selected in another organization or tunnel.
  const selectedRequest =
    inspectorEnabled && selection?.scopeKey === feed.scopeKey
      ? selection.request
      : null;

  return (
    <section
      aria-label="Request activity"
      className="outray-arc outray-arc-requests min-w-0 space-y-4"
      style={{ fontFamily: '"Geom", sans-serif' }}
    >
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="outray-arc-requests-search min-w-0 w-full sm:w-72">
          <SearchField
            label="Search requests"
            value={feed.search}
            onValueChange={feed.setSearch}
            placeholder={
              tunnelId ? "Search method or path" : "Search method, path or host"
            }
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {feed.range === "live" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={feed.togglePause}
              aria-pressed={feed.paused}
              disabled={feed.isLoading}
              title={
                feed.paused
                  ? "Resume showing incoming requests"
                  : "Freeze the visible rows; incoming requests stay buffered"
              }
            >
              <HugeiconsIcon
                icon={feed.paused ? PlayIcon : PauseIcon}
                size={13}
                aria-hidden="true"
              />
              {feed.paused ? "Resume" : "Pause"}
            </Button>
          )}
          <SegmentedControl
            label="Request time range"
            options={TIME_RANGES}
            value={feed.range}
            onValueChange={feed.setRange}
          />
        </div>
      </div>

      <RequestsResults
        feed={feed}
        showHost={!tunnelId}
        inspectorEnabled={inspectorEnabled}
        onInspect={(request) =>
          setSelection({ scopeKey: feed.scopeKey, request })
        }
      />

      {inspectorEnabled && (
        <RequestInspectorDrawer
          key={feed.scopeKey}
          request={selectedRequest}
          onClose={() => setSelection(null)}
          fullCaptureEnabled={fullCaptureEnabled}
          orgSlug={orgSlug}
        />
      )}
    </section>
  );
}

type RequestsResultsFeed = Pick<
  RequestsFeed,
  | "requests"
  | "range"
  | "search"
  | "totalCount"
  | "connection"
  | "isLoading"
  | "isUpdating"
  | "error"
  | "paused"
  | "pendingCount"
  | "retry"
  | "togglePause"
  | "setSearch"
>;

/** Kept separate from the feed so table/error/empty states can be rendered in tests. */
export function RequestsResults({
  feed,
  showHost,
  inspectorEnabled,
  onInspect,
}: {
  feed: RequestsResultsFeed;
  showHost: boolean;
  inspectorEnabled: boolean;
  onInspect: (request: TunnelEvent) => void;
}) {
  const isLive = feed.range === "live";
  const hasRows = feed.requests.length > 0;
  const disconnected = isLive && feed.connection === "disconnected";
  const showErrorBanner = !!feed.error && hasRows;

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/40">
      {showErrorBanner && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-amber-500/[0.035] px-4 py-2.5 text-[12px] text-zinc-400"
        >
          <span>{feed.error}{!isLive && " Showing previously loaded requests."}</span>
          {(!isLive || disconnected) && (
            <Button type="button" size="sm" variant="ghost" onClick={feed.retry}>
              <RefreshCw size={13} aria-hidden="true" />
              Retry
            </Button>
          )}
        </div>
      )}

      <div className="max-h-[560px] min-w-0 overflow-auto overscroll-contain">
        <table
          className={`w-full table-fixed text-left ${showHost ? "min-w-[820px]" : "min-w-[760px]"}`}
          aria-label={showHost ? "Workspace requests" : "Tunnel requests"}
          aria-busy={feed.isLoading || feed.isUpdating || undefined}
        >
          <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-zinc-950 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th scope="col" className="w-[76px] px-4 py-3 font-medium">Status</th>
              <th scope="col" className="w-[82px] px-3 py-3 font-medium">Method</th>
              <th scope="col" className="px-3 py-3 font-medium">Path</th>
              <th scope="col" className="w-[118px] px-3 py-3 font-medium">Client</th>
              <th scope="col" className="w-[95px] px-3 py-3 text-right font-medium">Duration</th>
              <th scope="col" className="w-[78px] px-3 py-3 text-right font-medium">Size</th>
              <th scope="col" className="w-[110px] px-4 py-3 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.055] text-[12px]">
            {feed.isLoading ? (
              <RequestsSkeleton showHost={showHost} />
            ) : hasRows ? (
              feed.requests.map((request) => (
                <tr
                  key={requestKey(request)}
                  onClick={inspectorEnabled ? () => onInspect(request) : undefined}
                  className={`group transition-colors motion-reduce:transition-none ${inspectorEnabled ? "cursor-pointer hover:bg-white/[0.025] focus-within:bg-white/[0.025]" : ""}`}
                >
                  <td className="px-4 py-3.5">
                    <StatusChip status={request.status_code} />
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`font-mono text-[10px] font-medium ${getHttpMethodColor(request.method)}`}
                    >
                      {request.method}
                    </span>
                  </td>
                  <td className="min-w-0 px-3 py-3.5">
                    {inspectorEnabled ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onInspect(request);
                        }}
                        aria-label={`Inspect ${request.method} ${request.path}, status ${request.status_code}`}
                        className="flex w-full min-w-0 items-center gap-2 rounded-sm text-left text-zinc-200 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                      >
                        <span className="truncate" title={request.path}>{request.path}</span>
                        <ArrowUpRight
                          size={12}
                          aria-hidden="true"
                          className="shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                        />
                      </button>
                    ) : (
                      <span className="block truncate text-zinc-200" title={request.path}>{request.path}</span>
                    )}
                    {showHost && (
                      <span className="mt-1 block truncate text-[10px] text-zinc-500" title={request.host}>
                        {request.host || "—"}
                      </span>
                    )}
                  </td>
                  <td className="truncate px-3 py-3.5 font-mono text-[10px] text-zinc-500" title={request.client_ip}>
                    {request.client_ip || "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-zinc-400">
                    {formatRequestDuration(request.request_duration_ms)}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-zinc-500">
                    {formatBytes(request.bytes_out, 1)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-zinc-500">
                    <time dateTime={new Date(request.timestamp).toISOString()} title={new Date(request.timestamp).toLocaleString()}>
                      {new Date(request.timestamp).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </time>
                    {!isLive && (
                      <span className="mt-1 block text-[10px] text-zinc-600">
                        {new Date(request.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : null}
          </tbody>
        </table>
      </div>

      {!feed.isLoading && !hasRows && (
        <div className="px-5 py-14">
          <RequestsEmptyState feed={feed} showHost={showHost} />
        </div>
      )}

      <footer className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-white/[0.07] px-4 py-2.5 text-[11px] text-zinc-500">
        <span>
          {feed.isLoading
            ? "Loading requests…"
            : feed.isUpdating
              ? `${feed.requests.length} ${feed.requests.length === 1 ? "request" : "requests"} · Updating…`
              : !isLive && feed.error
                ? `${feed.requests.length} ${feed.requests.length === 1 ? "request" : "requests"} · Last loaded`
              : feed.search.trim()
              ? `${feed.requests.length} matching ${feed.requests.length === 1 ? "request" : "requests"}`
              : `${feed.requests.length} ${feed.requests.length === 1 ? "request" : "requests"}`}
          {!feed.isLoading && feed.totalCount >= REQUESTS_LIMIT && (
            <span className="text-zinc-600"> · Latest {REQUESTS_LIMIT}</span>
          )}
        </span>
        {isLive ? (
          <div className="flex flex-wrap items-center gap-3">
            {feed.paused && (
              <button
                type="button"
                onClick={feed.togglePause}
                className="text-zinc-400 transition-colors hover:text-zinc-200"
              >
                {feed.pendingCount > 0 ? `${feed.pendingCount} new · Resume` : "Display paused"}
              </button>
            )}
            <span className="inline-flex items-center gap-1.5" role="status">
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${feed.connection === "live" ? "bg-emerald-400" : feed.connection === "disconnected" ? "bg-zinc-600" : "bg-amber-400"}`}
              />
              {CONNECTION_LABELS[feed.connection]}
            </span>
          </div>
        ) : (
          <span>Last {feed.range} · Newest first</span>
        )}
      </footer>
    </div>
  );
}

function StatusChip({ status }: { status: number }) {
  const color =
    !status
      ? "bg-white/[0.05] text-zinc-500"
      : status >= 500
      ? "bg-rose-400/[0.08] text-rose-400"
      : status >= 400
        ? "bg-amber-400/[0.08] text-amber-400"
        : status >= 300
          ? "bg-sky-400/[0.08] text-sky-400"
          : "bg-emerald-400/[0.08] text-emerald-400";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${color}`}>
      {status || "—"}
    </span>
  );
}

function formatRequestDuration(duration: number): string {
  return duration >= 1_000
    ? `${(duration / 1_000).toFixed(1)} s`
    : `${Math.round(duration)} ms`;
}

function RequestsSkeleton({ showHost }: { showHost: boolean }) {
  return (
    <>
      <tr className="sr-only"><td colSpan={7}>Loading requests</td></tr>
      {Array.from({ length: 6 }, (_, index) => (
        <tr key={index} aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
          <td className="px-4 py-3.5"><div className="h-5 w-8 rounded bg-white/[0.055]" /></td>
          <td className="px-3 py-3.5"><div className="h-2.5 w-8 rounded-sm bg-white/[0.055]" /></td>
          <td className="px-3 py-3.5">
            <div className="h-3 rounded-sm bg-white/[0.055]" style={{ width: `${48 + (index % 3) * 16}%` }} />
            {showHost && <div className="mt-2 h-2 w-24 rounded-sm bg-white/[0.035]" />}
          </td>
          <td className="px-3 py-3.5"><div className="h-2.5 w-16 rounded-sm bg-white/[0.035]" /></td>
          <td className="px-3 py-3.5"><div className="ml-auto h-2.5 w-11 rounded-sm bg-white/[0.035]" /></td>
          <td className="px-3 py-3.5"><div className="ml-auto h-2.5 w-9 rounded-sm bg-white/[0.035]" /></td>
          <td className="px-4 py-3.5"><div className="ml-auto h-2.5 w-14 rounded-sm bg-white/[0.035]" /></td>
        </tr>
      ))}
    </>
  );
}

function RequestsEmptyState({
  feed,
  showHost,
}: {
  feed: RequestsResultsFeed;
  showHost: boolean;
}) {
  const isLive = feed.range === "live";
  const disconnected = isLive && feed.connection === "disconnected";
  const failed = disconnected || (!!feed.error && !isLive);
  const searching = !!feed.search.trim();
  const reconnecting = isLive && feed.connection === "reconnecting";
  const Icon = failed || reconnecting ? RefreshCw : searching ? Search : Radio;
  const title = failed
    ? disconnected ? "Live requests disconnected" : "Requests could not be loaded"
    : reconnecting
      ? "Reconnecting to live requests"
      : searching
        ? "No matching requests"
        : isLive
          ? feed.paused ? "Request display paused" : "Waiting for requests"
          : "No requests in this period";
  const description = failed
    ? disconnected
      ? "The stream is unavailable. Retry to start receiving requests again."
      : "Try again to load request activity for this time range."
    : reconnecting
      ? "The stream was interrupted. We’re trying to reconnect automatically."
      : searching
        ? "Try a different method, path or host, or clear your search."
        : isLive
          ? feed.paused
            ? "Resume to show incoming requests. The live feed is still running."
            : `Requests will appear as traffic reaches ${showHost ? "your workspace" : "this tunnel"}.`
          : "Choose a wider time range to check for request activity.";

  return (
    <div className="flex flex-col items-center text-center" role={failed ? "alert" : "status"}>
      <Icon size={20} strokeWidth={1.5} className="mb-3 text-zinc-600" aria-hidden="true" />
      <p className="text-[13px] font-medium text-zinc-300">{title}</p>
      <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-zinc-500">{description}</p>
      {failed ? (
        <Button type="button" size="sm" variant="secondary" onClick={feed.retry} className="mt-4">
          <RefreshCw size={13} aria-hidden="true" />Retry
        </Button>
      ) : searching ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => feed.setSearch("")} className="mt-4">Clear search</Button>
      ) : feed.paused ? (
        <Button type="button" size="sm" variant="ghost" onClick={feed.togglePause} className="mt-4"><HugeiconsIcon icon={PlayIcon} size={13} aria-hidden="true" />Resume</Button>
      ) : null}
    </div>
  );
}
