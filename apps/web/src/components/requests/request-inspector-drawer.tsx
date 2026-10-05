import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Info, RotateCcw } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { SideSheet } from "@/components/ui/side-sheet";
import type { TunnelEvent, RequestCapture, RequestDetails, InspectorTab } from "./types";
import { formatBytes } from "./utils";
import {
  formatInspectorDuration, formatInspectorTime, requestInspectorCurl,
  requestInspectorIdentity, requestInspectorStatus, requestInspectorUrl, requestQueryEntries,
} from "./request-inspector-data";
import { RequestTabContent } from "./request-tab-content";
import { ResponseTabContent } from "./response-tab-content";
import { FullCaptureDisabledContent } from "./full-capture-disabled-content";
import { useRequestCapture } from "./use-request-capture";
import { ReplayModal } from "./replay-modal";
import "../outray-arc-theme.css";

interface RequestInspectorDrawerProps {
  request: TunnelEvent | null;
  onClose: () => void;
  fullCaptureEnabled: boolean;
  orgSlug: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function RequestInspectorDrawer({
  request, onClose, fullCaptureEnabled, orgSlug, returnFocusRef,
}: RequestInspectorDrawerProps) {
  return (
    <SideSheet
      open={Boolean(request)}
      onClose={onClose}
      title="Request details"
      returnFocusRef={returnFocusRef}
      footer={request && (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1 text-[11px] text-zinc-400">
            <span className="shrink-0">Request ID</span>
            <span className="ml-1 max-w-[180px] truncate font-mono text-zinc-300" title={request.request_id}>
              {request.request_id || "Not recorded"}
            </span>
            {request.request_id && <CopyButton value={request.request_id} label="Copy request ID" iconOnly variant="plain" />}
          </div>
          <Link
            to="/$orgSlug/tunnels/$tunnelId"
            params={{ orgSlug, tunnelId: request.tunnel_id }}
            search={{ tab: "overview", range: "24h" }}
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-[12px] text-zinc-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none"
          >
            Tunnel details <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </div>
      )}
    >
      {request && (
        <RequestInspectorSession
          key={requestInspectorIdentity(orgSlug, request)}
          request={request}
          fullCaptureEnabled={fullCaptureEnabled}
          orgSlug={orgSlug}
        />
      )}
    </SideSheet>
  );
}

function RequestInspectorSession({
  request, fullCaptureEnabled, orgSlug,
}: { request: TunnelEvent; fullCaptureEnabled: boolean; orgSlug: string }) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("request");
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const replayTrigger = useRef<HTMLButtonElement>(null);
  const { capture, loading, error, notFound, retry } = useRequestCapture(
    orgSlug, fullCaptureEnabled ? request : null,
  );
  const copied = () => setCopyError(null);
  const copyFailed = () => setCopyError("Could not copy. Check your browser’s clipboard permissions and try again.");

  return (
    <div className="space-y-5">
      <RequestInspectorSummary request={request} onCopyError={copyFailed} onCopied={copied} />
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton
          value={requestInspectorCurl(request, capture)}
          label="Copy as cURL"
          onCopyError={copyFailed}
          onCopied={copied}
          className="!min-h-8 !rounded-lg !text-xs"
        />
        {fullCaptureEnabled && (
          <Button
            ref={replayTrigger}
            type="button"
            variant="secondary"
            size="sm"
            disabled={!capture || loading}
            onClick={() => setShowReplayModal(true)}
          >
            <RotateCcw size={13} aria-hidden="true" /> Replay request
          </Button>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span className={capture ? "size-1.5 rounded-full bg-emerald-400" : "size-1.5 rounded-full bg-zinc-500"} aria-hidden="true" />
          {capture ? "Captured" : fullCaptureEnabled && loading ? "Loading capture" : "Metadata only"}
        </span>
      </div>
      {!capture && (
        <p className="!mt-2 text-[11px] leading-4 text-zinc-500">
          cURL includes recorded metadata only; captured headers and body are unavailable.
        </p>
      )}
      {copyError && <p role="alert" className="rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2 text-[12px] leading-5 text-amber-200">{copyError}</p>}

      {!fullCaptureEnabled && <FullCaptureDisabledContent request={request} orgSlug={orgSlug} />}
      {fullCaptureEnabled && !loading && !capture && (
        <div role={notFound ? "status" : "alert"} className="flex items-start gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.015] px-3.5 py-3">
          <Info size={15} className="mt-0.5 shrink-0 text-zinc-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-zinc-300">{notFound ? "No capture available" : error || "Capture unavailable"}</p>
            <p className="mt-1 text-[11px] leading-4 text-zinc-500">
              {notFound ? "It may have expired or been recorded before full capture was enabled. Your request metadata is still available." : "Your request metadata is still available. Try loading its payload again."}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={retry} className="shrink-0">
            {notFound ? "Check again" : "Retry"}
          </Button>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          if (tab === "request" || tab === "response") setActiveTab(tab);
        }}
        className="outray-arc outray-arc-tunnel-tabs"
      >
        <TabsList aria-label="Request detail sections" data-outray-tabs-list>
          <TabsTrigger value="request" data-outray-tabs-trigger>Request</TabsTrigger>
          <TabsTrigger value="response" data-outray-tabs-trigger>Response</TabsTrigger>
        </TabsList>
        {(["request", "response"] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="!mt-5">
            <RequestInspectorContent
              request={request}
              capture={capture}
              loading={fullCaptureEnabled && loading}
              tab={tab}
              onCopyError={copyFailed}
              onCopied={copied}
            />
          </TabsContent>
        ))}
      </Tabs>

      {capture && (
        <ReplayModal
          isOpen={showReplayModal}
          onClose={() => setShowReplayModal(false)}
          request={request}
          capture={capture}
          orgSlug={orgSlug}
        />
      )}
    </div>
  );
}

export function RequestInspectorContent({
  request, capture, loading = false, tab, onCopyError, onCopied,
}: {
  request: TunnelEvent;
  capture: RequestCapture | null;
  loading?: boolean;
  tab: InspectorTab;
  onCopyError?: () => void;
  onCopied?: () => void;
}) {
  if (loading) return <RequestInspectorSkeleton />;
  if (tab === "response") {
    return (
      <ResponseTabContent
        details={capture ? capture.response : { headers: null, body: null }}
        captured={Boolean(capture)}
        onCopyError={onCopyError}
        onCopied={onCopied}
      />
    );
  }
  const queryEntries = requestQueryEntries(request.path);
  const details: RequestDetails = {
    headers: capture?.request.headers ?? null,
    queryParams: Object.fromEntries(queryEntries),
    queryEntries,
    body: capture?.request.body ?? null,
    bodySize: capture?.request.bodySize,
  };
  return <RequestTabContent request={request} details={details} captured={Boolean(capture)} onCopyError={onCopyError} onCopied={onCopied} />;
}

export function RequestInspectorSummary({
  request, onCopyError, onCopied,
}: {
  request: TunnelEvent;
  onCopyError?: () => void;
  onCopied?: () => void;
}) {
  const status = requestInspectorStatus(request.status_code);
  const url = requestInspectorUrl(request);
  const time = formatInspectorTime(request.timestamp);
  const bytes = (value: number) => Number.isFinite(value) && value >= 0 ? formatBytes(value, 1) : "—";
  return (
    <section aria-label="Request summary" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex shrink-0 rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1 font-mono text-[11px] text-zinc-300">{request.method}</span>
        <span className={"inline-flex w-fit items-center rounded-md border px-2 py-1 text-[11px] font-medium " + status.tone} aria-label={"HTTP status " + status.label}>{status.label}</span>
      </div>
      <div className="mt-3 flex min-w-0 items-start gap-2">
        <h2 className="min-w-0 flex-1 break-all font-mono text-[13px] leading-6 text-zinc-200">{url}</h2>
        <CopyButton value={url} label="Copy request URL" iconOnly variant="plain" onCopyError={onCopyError} onCopied={onCopied} className="shrink-0" />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-white/[0.07] py-4 sm:grid-cols-3">
        <InspectorFact label="Duration">{formatInspectorDuration(request.request_duration_ms)}</InspectorFact>
        <InspectorFact label="Request size">{bytes(request.bytes_in)}</InspectorFact>
        <InspectorFact label="Response size">{bytes(request.bytes_out)}</InspectorFact>
        <InspectorFact label="Started"><time dateTime={time.iso}>{time.text}</time></InspectorFact>
        <InspectorFact label="Client IP"><span className="break-all font-mono text-[11px]">{request.client_ip || "—"}</span></InspectorFact>
        <InspectorFact label="User agent"><span className="block truncate text-[11px]" title={request.user_agent}>{request.user_agent || "—"}</span></InspectorFact>
      </dl>
    </section>
  );
}

function InspectorFact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[11px] text-zinc-500">{label}</dt><dd className="mt-1 text-[12px] leading-5 tabular-nums text-zinc-200">{children}</dd></div>;
}

export function RequestInspectorSkeleton() {
  return (
    <div aria-label="Loading captured payload" aria-busy="true" className="space-y-6 animate-pulse motion-reduce:animate-none">
      {[4, 1].map((count, index) => (
        <div key={index}>
          <div className="mb-3 h-3 w-24 rounded bg-white/[0.06]" />
          {Array.from({ length: count }, (_, row) => (
            <div key={row} className="flex min-h-10 gap-6 border-b border-white/[0.05] py-3">
              <div className="h-3 w-28 max-w-[35%] rounded bg-white/[0.04]" />
              <div className={index ? "h-28 flex-1 rounded bg-white/[0.03]" : "h-3 flex-1 rounded bg-white/[0.04]"} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
