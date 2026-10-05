import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { FileText, Network, Server } from "lucide-react";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { JsonViewer, formatBody } from "@/components/requests/json-viewer";
import { formatBytes } from "@/components/requests/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SideSheet } from "@/components/ui/side-sheet";
import {
  containsHttpRequestRedaction as containsRedaction,
  fetchHttpRequestDetails,
  generateHttpRequestCurl,
} from "./http-request-inspector-data";
import {
  HttpRequestCaptureBadge,
  HttpRequestStatusBadge,
} from "./http-request-badges";
import {
  formatHttpRequestDuration,
  formatHttpRequestTime,
  type CorrelatedLog,
  type HttpRequestDetails,
  type HttpRequestSummary,
  type InspectorTab,
  type RequestCaptureState,
  type RequestDetailsResponse,
} from "./http-requests-data";

const inspectorTabs = [
  { value: "request", label: "Request" },
  { value: "response", label: "Response" },
  { value: "context", label: "Context" },
] as const;

export function HttpRequestInspector({
  request,
  orgSlug,
  onClose,
  returnFocusRef,
}: {
  request: HttpRequestSummary | null;
  orgSlug: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <SideSheet
      open={Boolean(request)}
      onClose={onClose}
      title="Request details"
      description="Inspect the captured payload and its telemetry context."
      returnFocusRef={returnFocusRef}
    >
      {request && (
        <InspectorDetails
          key={`${orgSlug}:${request.id}`}
          request={request}
          orgSlug={orgSlug}
        />
      )}
    </SideSheet>
  );
}

function InspectorDetails({
  request,
  orgSlug,
}: {
  request: HttpRequestSummary;
  orgSlug: string;
}) {
  const [tab, setTab] = useState<InspectorTab>("request");
  const [details, setDetails] = useState<RequestDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const loadDetails = async () => {
      try {
        const next = await fetchHttpRequestDetails(
          orgSlug,
          request.id,
          controller.signal,
        );
        if (disposed || controller.signal.aborted) return;
        setDetails(next);
        setError(null);
      } catch {
        if (!disposed && !controller.signal.aborted) {
          setError("Request details are temporarily unavailable.");
        }
      } finally {
        if (!disposed && !controller.signal.aborted) setLoading(false);
      }
    };

    void loadDetails();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [orgSlug, request.id, reloadKey]);

  return (
    <div className="space-y-5">
      <RequestSummary request={request} />
      <SegmentedControl
        options={inspectorTabs}
        value={tab}
        onValueChange={setTab}
        label="Request detail sections"
        fullWidth
        className="[&_button]:h-8 [&_button]:text-xs"
      />
      {copyError && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-xs leading-5 text-amber-200"
        >
          {copyError}
        </p>
      )}
      <HttpRequestInspectorContent
        details={details}
        loading={loading}
        error={error}
        tab={tab}
        orgSlug={orgSlug}
        onRetry={() => {
          setLoading(true);
          setError(null);
          setReloadKey((value) => value + 1);
        }}
        onCopyError={() =>
          setCopyError(
            "Could not copy to the clipboard. Check your browser permissions and try again.",
          )
        }
        onCopied={() => setCopyError(null)}
      />
    </div>
  );
}

function RequestSummary({ request }: { request: HttpRequestSummary }) {
  return (
    <section
      aria-label="Request summary"
      className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]"
    >
      <div className="border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <HttpRequestStatusBadge code={request.statusCode} />
          <span className="rounded-md border border-white/[0.06] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
            {request.method}
          </span>
          <h2
            className="min-w-0 truncate font-mono text-[13px] text-zinc-200"
            title={request.path || request.route || "/"}
          >
            {request.path || request.route || "/"}
          </h2>
        </div>
        <p className="mt-2 break-all font-mono text-[11px] text-zinc-400">
          {request.requestId || request.id}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-3.5 sm:grid-cols-4">
        <InspectorFact label="Service">{request.service || "—"}</InspectorFact>
        <InspectorFact label="Duration">
          {formatHttpRequestDuration(request.duration)}
        </InspectorFact>
        <InspectorFact label="Started">
          {formatHttpRequestTime(request.timestamp)}
        </InspectorFact>
        <InspectorFact label="Capture">
          <HttpRequestCaptureBadge state={request.captureState} />
        </InspectorFact>
      </dl>
    </section>
  );
}

interface CopyFeedbackProps {
  onCopyError?: () => void;
  onCopied?: () => void;
}

/** Shared content keeps loading, capture and empty states identical across tabs. */
export function HttpRequestInspectorContent({
  details,
  loading = false,
  error,
  tab,
  orgSlug,
  onRetry,
  ...copyFeedback
}: CopyFeedbackProps & {
  details: RequestDetailsResponse | null;
  loading?: boolean;
  error?: string | null;
  tab: InspectorTab;
  orgSlug: string;
  onRetry?: () => void;
}) {
  if (loading) return <InspectorSkeleton />;
  if (error || !details) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-white/[0.08] bg-white/[0.015] px-5 py-12 text-center"
      >
        <p className="text-[13px] text-zinc-300">
          {error || "Request details are unavailable."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-xs text-zinc-200 transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={`${tab[0].toUpperCase()}${tab.slice(1)} details`}
    >
      {tab === "request" && (
        <RequestPayload request={details.request} {...copyFeedback} />
      )}
      {tab === "response" && (
        <ResponsePayload request={details.request} {...copyFeedback} />
      )}
      {tab === "context" && (
        <RequestContext
          request={details.request}
          logs={details.logs}
          orgSlug={orgSlug}
          {...copyFeedback}
        />
      )}
    </div>
  );
}

function InspectorCopyButton({
  value,
  label,
  iconOnly = true,
  ...feedback
}: CopyFeedbackProps & { value: string; label: string; iconOnly?: boolean }) {
  return (
    <CopyButton
      value={value}
      label={label}
      iconOnly={iconOnly}
      variant="plain"
      className="!min-h-7 !rounded-md !text-xs"
      {...feedback}
    />
  );
}

function RequestPayload({
  request,
  ...feedback
}: CopyFeedbackProps & { request: HttpRequestDetails }) {
  return (
    <div className="space-y-5">
      <InspectorSection
        title="General"
        action={
          <InspectorCopyButton
            value={generateHttpRequestCurl(request)}
            label="Copy as cURL"
            iconOnly={false}
            {...feedback}
          />
        }
      >
        <DetailRow label="URL" value={request.url || request.path || "/"} />
        <DetailRow label="Route" value={request.route || "—"} />
        <DetailRow label="Method" value={request.method} />
        <DetailRow label="Protocol" value={request.protocol || "—"} />
        <DetailRow
          label="Client address"
          value={request.clientAddress || "—"}
        />
        <DetailRow label="User agent" value={request.userAgent || "—"} />
      </InspectorSection>
      <HeadersSection
        title="Headers"
        headers={request.request.headers}
        captured={request.request.headersCaptured}
        truncated={request.request.headersTruncated}
        {...feedback}
      />
      {Object.keys(request.request.query).length > 0 && (
        <InspectorSection title="Query parameters">
          {Object.entries(request.request.query).map(([key, value]) => (
            <DetailRow key={key} label={key} value={value} />
          ))}
        </InspectorSection>
      )}
      <BodySection
        body={request.request.body}
        captured={request.request.bodyCaptured}
        truncated={request.request.bodyTruncated}
        contentType={request.request.bodyContentType}
        size={request.request.size}
        state={request.captureState}
        {...feedback}
      />
    </div>
  );
}

function ResponsePayload({
  request,
  ...feedback
}: CopyFeedbackProps & { request: HttpRequestDetails }) {
  return (
    <div className="space-y-5">
      <InspectorSection title="General">
        <DetailRow
          label="Status"
          value={<HttpRequestStatusBadge code={request.statusCode} />}
        />
        <DetailRow
          label="Duration"
          value={formatHttpRequestDuration(request.duration)}
        />
        <DetailRow
          label="Response size"
          value={formatBytes(request.response.size)}
        />
      </InspectorSection>
      <HeadersSection
        title="Headers"
        headers={request.response.headers}
        captured={request.response.headersCaptured}
        truncated={request.response.headersTruncated}
        {...feedback}
      />
      <BodySection
        body={request.response.body}
        captured={request.response.bodyCaptured}
        truncated={request.response.bodyTruncated}
        contentType={request.response.bodyContentType}
        size={request.response.size}
        state={request.captureState}
        {...feedback}
      />
    </div>
  );
}

function RequestContext({
  request,
  logs,
  orgSlug,
  ...feedback
}: CopyFeedbackProps & {
  request: HttpRequestDetails;
  logs: CorrelatedLog[];
  orgSlug: string;
}) {
  return (
    <div className="space-y-5">
      <InspectorSection
        title="Telemetry context"
        action={
          request.traceId ? (
            <InspectorCopyButton
              value={request.traceId}
              label="Copy trace ID"
              {...feedback}
            />
          ) : undefined
        }
      >
        <DetailRow label="request.id" value={request.requestId || "—"} />
        <DetailRow label="telemetry/span ID" value={request.id} />
        <DetailRow label="trace.id" value={request.traceId || "—"} />
        <DetailRow label="span.id" value={request.spanId || "—"} />
        <DetailRow label="service.name" value={request.service} />
        <DetailRow label="environment" value={request.environment || "—"} />
        <DetailRow label="region" value={request.region || "—"} />
      </InspectorSection>
      <div className="grid gap-3 sm:grid-cols-2">
        {request.traceId && (
          <Link
            to="/$orgSlug/observability/traces"
            params={{ orgSlug }}
            search={{ search: request.traceId }}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.015] p-3.5 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <Network
              size={16}
              strokeWidth={1.75}
              className="shrink-0 text-zinc-400"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs text-zinc-200">Open trace</p>
              <p className="mt-1 truncate font-mono text-[11px] text-zinc-400">
                {request.traceId}
              </p>
            </div>
          </Link>
        )}
        <Link
          to="/$orgSlug/observability/services/$serviceId"
          params={{ orgSlug, serviceId: request.service }}
          className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.015] p-3.5 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <Server
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-zinc-400"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs text-zinc-200">Open service</p>
            <p className="mt-1 truncate text-[11px] text-zinc-400">
              {request.service}
            </p>
          </div>
        </Link>
      </div>
      <InspectorSection
        title="Correlated logs"
        titleAccessory={
          request.traceId ? (
            <Link
              to="/$orgSlug/observability/logs"
              params={{ orgSlug }}
              search={{ search: request.traceId, range: "1h" }}
              className="text-[11px] text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {logs.length} events · Open logs
            </Link>
          ) : (
            <span className="text-[11px] text-zinc-400">No trace ID</span>
          )
        }
      >
        {logs.length ? (
          logs.map((event) => (
            <div key={event.id} className="px-4 py-3 font-mono">
              <div className="flex items-center gap-3">
                <span
                  className={`text-[11px] uppercase ${logLevelColor(event.level)}`}
                >
                  {event.level}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {formatHttpRequestTime(event.timestamp)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">
                {event.message}
              </p>
            </div>
          ))
        ) : (
          <div className="px-4 py-7 text-center">
            <FileText
              size={16}
              strokeWidth={1.75}
              className="mx-auto text-zinc-400"
              aria-hidden="true"
            />
            <p className="mt-2 text-xs text-zinc-400">
              No logs linked to this trace
            </p>
          </div>
        )}
      </InspectorSection>
    </div>
  );
}

function InspectorSection({
  title,
  titleAccessory,
  action,
  children,
}: {
  title: string;
  titleAccessory?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="text-xs font-normal text-zinc-200">{title}</h3>
          {titleAccessory}
        </div>
        {action}
      </div>
      <div className="divide-y divide-white/[0.055]">{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  valueClassName = "text-zinc-300",
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(84px,0.34fr)_minmax(0,1fr)] gap-3 px-4 py-3 sm:gap-5">
      <span
        className="truncate font-mono text-[11px] leading-5 text-zinc-400"
        title={label}
      >
        {label}
      </span>
      <span
        className={`break-all text-right font-mono text-xs leading-5 ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}

function HeadersSection({
  title,
  headers,
  captured,
  truncated,
  ...feedback
}: CopyFeedbackProps & {
  title: string;
  headers: Record<string, string>;
  captured: boolean;
  truncated: boolean;
}) {
  const entries = Object.entries(headers);
  const redacted = entries.some(([, value]) => containsRedaction(value));
  return (
    <InspectorSection
      title={title}
      action={
        captured && entries.length ? (
          <InspectorCopyButton
            value={JSON.stringify(headers, null, 2)}
            label={`Copy ${title.toLowerCase()}`}
            {...feedback}
          />
        ) : undefined
      }
    >
      {!captured ? (
        <PayloadUnavailable
          title="Headers not captured"
          detail="Header capture was not enabled for this request."
        />
      ) : (
        <>
          {(truncated || redacted) && (
            <PayloadWarning
              truncated={truncated}
              redacted={redacted}
              payload="headers"
            />
          )}
          {entries.length ? (
            entries.map(([key, value]) => (
              <DetailRow
                key={key}
                label={key}
                value={value}
                valueClassName={
                  containsRedaction(value) ? "text-amber-200" : "text-zinc-300"
                }
              />
            ))
          ) : (
            <div className="px-4 py-7 text-center text-xs text-zinc-400">
              Captured header set is empty
            </div>
          )}
        </>
      )}
    </InspectorSection>
  );
}

function BodySection({
  body,
  captured,
  truncated,
  contentType,
  size,
  state,
  ...feedback
}: CopyFeedbackProps & {
  body: string | null;
  captured: boolean;
  truncated: boolean;
  contentType: string;
  size: number;
  state: RequestCaptureState;
}) {
  const bodyInfo = formatBody(body);
  const redacted = body ? containsRedaction(body) : false;
  return (
    <InspectorSection
      title="Body"
      titleAccessory={
        <span className="break-all text-[11px] text-zinc-400">
          {[contentType, formatBytes(size)].filter(Boolean).join(" · ")}
        </span>
      }
      action={
        captured && body ? (
          <InspectorCopyButton
            value={bodyInfo.formatted || body}
            label="Copy body"
            {...feedback}
          />
        ) : undefined
      }
    >
      {!captured ? (
        <PayloadUnavailable
          title="Body not captured"
          detail={
            state === "metadata"
              ? "This request was collected as metadata only."
              : "Body capture was not available for this payload."
          }
        />
      ) : (
        <>
          {(truncated || redacted) && (
            <PayloadWarning
              truncated={truncated}
              redacted={redacted}
              payload="body"
            />
          )}
          {body === "" || body === null ? (
            <PayloadUnavailable
              title="Empty body"
              detail="Capture completed and this payload did not contain a body."
            />
          ) : (
            <div className="overflow-x-auto p-4">
              <JsonViewer data={bodyInfo.parsed ?? body} />
            </div>
          )}
        </>
      )}
    </InspectorSection>
  );
}

function PayloadWarning({
  truncated,
  redacted,
  payload,
}: {
  truncated: boolean;
  redacted: boolean;
  payload: "headers" | "body";
}) {
  const messages = [
    redacted ? "Sensitive values were redacted." : "",
    truncated ? `The captured ${payload} was truncated.` : "",
  ].filter(Boolean);
  return (
    <div className="bg-amber-300/[0.04] px-4 py-2.5 text-xs leading-5 text-amber-200">
      {messages.join(" ")}
    </div>
  );
}

function PayloadUnavailable({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="px-4 py-7 text-center">
      <p className="text-xs text-zinc-300">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-zinc-400">{detail}</p>
    </div>
  );
}

function InspectorSkeleton() {
  return (
    <div
      className="animate-pulse space-y-5 motion-reduce:animate-none"
      aria-busy="true"
      role="status"
      aria-label="Loading request details"
    >
      {Array.from({ length: 3 }).map((_, section) => (
        <div
          key={section}
          className="rounded-xl border border-white/[0.08] p-4"
        >
          <div className="h-2.5 w-24 rounded bg-white/[0.06]" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: section === 0 ? 5 : 3 }).map((__, row) => (
              <div key={row} className="flex gap-5">
                <div className="h-2 w-24 rounded bg-white/[0.035]" />
                <div className="h-2 flex-1 rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function InspectorFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-zinc-400">{label}</dt>
      <dd className="mt-1.5 break-words text-xs leading-5 text-zinc-200">
        {children}
      </dd>
    </div>
  );
}

function logLevelColor(level: CorrelatedLog["level"]) {
  if (level === "error") return "text-rose-300";
  if (level === "warn") return "text-amber-300";
  return "text-zinc-400";
}
