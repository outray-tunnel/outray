import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  Copy01Icon,
  LogsIcon,
  Search01Icon,
  ServerStack01Icon,
  Tick02Icon,
  WorkflowSquare06Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
} from "@/components/observability/observability-ui";
import {
  apiRequests,
  logs,
  services,
  type ApiRequestEvent,
  type RequestCaptureState,
} from "@/components/observability/mock-data";
import { JsonViewer, formatBody } from "@/components/requests/json-viewer";
import {
  CopyButton,
  DetailRow,
  InspectorSection,
} from "@/components/requests/request-tab-content";
import {
  formatBytes,
  getHttpMethodColor,
} from "@/components/requests/utils";
import { Select } from "@/components/ui/select";

export const Route = createFileRoute("/$orgSlug/observability/requests")({
  head: () => ({ meta: [{ title: "Requests - OutRay Observability" }] }),
  component: RequestsView,
});

type StatusFilter = "all" | "success" | "errors";
type CaptureFilter = "all" | RequestCaptureState;
type InspectorTab = "request" | "response" | "context";

function RequestsView() {
  const { orgSlug } = Route.useParams();
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [capture, setCapture] = useState<CaptureFilter>("all");
  const [selected, setSelected] = useState<ApiRequestEvent | null>(null);

  const visibleRequests = useMemo(() => {
    const normalized = query.toLowerCase();
    return apiRequests.filter(
      (request) =>
        (service === "all" || request.service === service) &&
        (method === "all" || request.method === method) &&
        (capture === "all" || request.captureState === capture) &&
        (status === "all" ||
          (status === "success"
            ? request.statusCode < 400
            : request.statusCode >= 400)) &&
        (!normalized ||
          request.path.toLowerCase().includes(normalized) ||
          request.route.toLowerCase().includes(normalized) ||
          request.service.toLowerCase().includes(normalized) ||
          request.traceId.includes(normalized) ||
          request.id.toLowerCase().includes(normalized)),
    );
  }, [capture, method, query, service, status]);

  const errors = apiRequests.filter((request) => request.statusCode >= 400);
  const fullCaptures = apiRequests.filter(
    (request) => request.captureState !== "metadata",
  );
  const sortedDurations = apiRequests
    .map((request) => request.duration)
    .sort((a, b) => a - b);
  const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)] ?? 0;

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Requests"
        description="Inspect every instrumented API request and move directly between payloads, traces, and correlated logs."
        action={<TimeRangeControl value="1h" />}
      />

      <section className="grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-white/[0.07]">
        <RequestStat label="Requests" value="18.4K" detail="Last hour" />
        <RequestStat
          label="Error rate"
          value="0.73%"
          detail={`${errors.length} errors in current stream`}
          tone="rose"
        />
        <RequestStat
          label="P95 duration"
          value={formatDuration(p95)}
          detail="Across all services"
          tone="amber"
        />
        <RequestStat
          label="Payload captures"
          value={`${fullCaptures.length}`}
          detail={`${apiRequests.length - fullCaptures.length} metadata only`}
          tone="emerald"
        />
      </section>

      <Panel>
        <div className="grid gap-px bg-white/[0.06] lg:grid-cols-[minmax(280px,1fr)_180px_130px_150px]">
          <label className="flex h-12 items-center gap-3 bg-[#090909] px-5 text-zinc-600 sm:px-6">
            <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.7} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search path, service, request ID, or trace ID"
              className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-zinc-300 outline-none placeholder:text-zinc-700"
            />
          </label>
          <FilterSelect
            value={service}
            onChange={setService}
            label="Service"
            options={[
              ["all", "All services"],
              ...services.map((item) => [item.id, item.name] as [string, string]),
            ]}
          />
          <FilterSelect
            value={method}
            onChange={setMethod}
            label="Method"
            options={[
              ["all", "All methods"],
              ...["GET", "POST", "PUT", "PATCH", "DELETE"].map(
                (value) => [value, value] as [string, string],
              ),
            ]}
          />
          <FilterSelect
            value={capture}
            onChange={(value) => setCapture(value as CaptureFilter)}
            label="Capture"
            options={[
              ["all", "All capture states"],
              ["full", "Full payload"],
              ["redacted", "Redacted"],
              ["metadata", "Metadata only"],
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3 sm:px-6">
          {(["all", "success", "errors"] as StatusFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`h-7 rounded-md px-2.5 text-[9px] capitalize transition-colors ${
                status === value
                  ? value === "errors"
                    ? "bg-rose-400/[0.1] text-rose-400"
                    : "bg-white/[0.08] text-zinc-200"
                  : "text-zinc-700 hover:text-zinc-400"
              }`}
            >
              {value}
            </button>
          ))}
          <span className="ml-auto text-[9px] text-zinc-700">
            {visibleRequests.length} requests shown
          </span>
        </div>
      </Panel>

      <Panel>
        <div className="hidden grid-cols-[minmax(0,1fr)_140px_70px_90px_105px_110px_24px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[9px] uppercase tracking-[0.08em] text-zinc-700 sm:px-6 lg:grid">
          <span>Request</span>
          <span>Service</span>
          <span>Status</span>
          <span>Duration</span>
          <span>Transferred</span>
          <span>Capture</span>
          <span />
        </div>
        <div className="divide-y divide-white/[0.055]">
          {visibleRequests.map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => setSelected(request)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition-colors sm:px-6 lg:grid-cols-[minmax(0,1fr)_140px_70px_90px_105px_110px_24px] lg:items-center lg:gap-4 ${
                selected?.id === request.id
                  ? "bg-white/[0.035]"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={`w-12 shrink-0 font-mono text-[10px] font-medium ${getHttpMethodColor(request.method)}`}>
                  {request.method}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-zinc-300">
                    {request.path}
                  </p>
                  <p className="mt-1 truncate font-mono text-[8px] text-zinc-800">
                    {request.timestamp} · {request.id.slice(0, 18)}
                  </p>
                </div>
              </div>
              <span className="truncate text-[10px] text-zinc-500">{request.service}</span>
              <StatusCode code={request.statusCode} />
              <span className={`font-mono text-[9px] ${request.duration > 1000 ? "text-amber-400" : "text-zinc-600"}`}>
                {formatDuration(request.duration)}
              </span>
              <span className="font-mono text-[9px] text-zinc-700">
                {formatBytes(request.request.size + request.response.size)}
              </span>
              <CapturePill state={request.captureState} />
              <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.7} className="hidden text-zinc-800 lg:block" />
            </button>
          ))}
          {!visibleRequests.length && (
            <div className="px-5 py-16 text-center sm:px-6">
              <p className="text-xs text-zinc-500">No matching requests</p>
              <p className="mt-2 text-[10px] text-zinc-700">Try removing one of the active filters.</p>
            </div>
          )}
        </div>
      </Panel>

      <RequestInspector
        key={selected?.id ?? "closed"}
        request={selected}
        orgSlug={orgSlug}
        onClose={() => setSelected(null)}
      />
    </ObservabilityPage>
  );
}

function RequestInspector({
  request,
  orgSlug,
  onClose,
}: {
  request: ApiRequestEvent | null;
  orgSlug: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("request");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, request]);

  const copy = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 1400);
  };

  return (
    <AnimatePresence>
      {request && (
        <>
          <motion.button
            type="button"
            aria-label="Close request inspector"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/65"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 340 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-white/[0.08] bg-[#080808] shadow-[-24px_0_80px_rgba(0,0,0,0.45)]"
            aria-label="Request inspector"
          >
            <header className="shrink-0 border-b border-white/[0.07] px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-700">Request inspector</p>
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusCode code={request.statusCode} />
                    <span className={`font-mono text-[11px] font-medium ${getHttpMethodColor(request.method)}`}>{request.method}</span>
                    <h2 className="truncate font-mono text-[11px] text-zinc-300">{request.path}</h2>
                  </div>
                  <p className="mt-2 truncate font-mono text-[8px] text-zinc-800">{request.id}</p>
                </div>
                <button type="button" onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300" aria-label="Close request inspector">
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
                </button>
              </div>
            </header>

            <div className="grid shrink-0 grid-cols-2 gap-px border-b border-white/[0.07] bg-white/[0.06] sm:grid-cols-4">
              <InspectorFact label="Service">{request.service}</InspectorFact>
              <InspectorFact label="Duration">{formatDuration(request.duration)}</InspectorFact>
              <InspectorFact label="Started">{request.timestamp}</InspectorFact>
              <InspectorFact label="Capture"><CapturePill state={request.captureState} /></InspectorFact>
            </div>

            <nav className="flex h-12 shrink-0 items-end gap-7 border-b border-white/[0.07] px-5 sm:px-6">
              {(["request", "response", "context"] as InspectorTab[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`h-12 border-b text-[10px] font-medium capitalize transition-colors ${tab === value ? "border-white text-zinc-200" : "border-transparent text-zinc-700 hover:text-zinc-400"}`}
                >
                  {value}
                </button>
              ))}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              {tab === "request" && (
                <RequestPayload
                  request={request}
                  copiedField={copiedField}
                  onCopy={copy}
                />
              )}
              {tab === "response" && (
                <ResponsePayload
                  request={request}
                  copiedField={copiedField}
                  onCopy={copy}
                />
              )}
              {tab === "context" && (
                <RequestContext request={request} orgSlug={orgSlug} copiedField={copiedField} onCopy={copy} />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function RequestPayload({
  request,
  copiedField,
  onCopy,
}: PayloadProps) {
  return (
    <div className="space-y-6">
      <InspectorSection
        title="General"
        action={
          <button
            type="button"
            onClick={() => onCopy(generateCurl(request), "curl")}
            className={`flex h-7 items-center gap-2 rounded-md px-2.5 text-[9px] transition-colors ${copiedField === "curl" ? "bg-emerald-400/[0.08] text-emerald-400" : "text-zinc-700 hover:bg-white/[0.04] hover:text-zinc-300"}`}
          >
            <HugeiconsIcon icon={copiedField === "curl" ? Tick02Icon : Copy01Icon} size={12} strokeWidth={1.7} />
            {copiedField === "curl" ? "Copied" : "Copy as cURL"}
          </button>
        }
      >
        <DetailRow label="URL" value={`https://api.example.com${request.path}`} />
        <DetailRow label="Route" value={request.route} />
        <DetailRow label="Method" value={request.method} valueClassName={getHttpMethodColor(request.method)} />
        <DetailRow label="Protocol" value={request.protocol} />
        <DetailRow label="Client address" value={request.clientAddress} />
      </InspectorSection>
      <HeadersSection title="Headers" headers={request.request.headers} field="request-headers" copiedField={copiedField} onCopy={onCopy} />
      {!!Object.keys(request.request.query).length && (
        <InspectorSection title="Query parameters">
          {Object.entries(request.request.query).map(([key, value]) => <DetailRow key={key} label={key} value={value} />)}
        </InspectorSection>
      )}
      <BodySection body={request.request.body} size={request.request.size} state={request.captureState} field="request-body" copiedField={copiedField} onCopy={onCopy} />
    </div>
  );
}

function ResponsePayload({ request, copiedField, onCopy }: PayloadProps) {
  return (
    <div className="space-y-6">
      <InspectorSection title="General">
        <DetailRow label="Status" value={String(request.statusCode)} valueClassName={statusCodeColor(request.statusCode)} />
        <DetailRow label="Duration" value={formatDuration(request.duration)} />
        <DetailRow label="Response size" value={formatBytes(request.response.size)} />
      </InspectorSection>
      <HeadersSection title="Headers" headers={request.response.headers} field="response-headers" copiedField={copiedField} onCopy={onCopy} />
      <BodySection body={request.response.body} size={request.response.size} state={request.captureState} field="response-body" copiedField={copiedField} onCopy={onCopy} />
    </div>
  );
}

function RequestContext({ request, orgSlug, copiedField, onCopy }: PayloadProps & { orgSlug: string }) {
  const correlatedLogs = logs.filter((event) => event.traceId === request.traceId);
  return (
    <div className="space-y-6">
      <InspectorSection title="Telemetry context" action={<CopyButton copied={copiedField === "trace-id"} onClick={() => onCopy(request.traceId, "trace-id")} label="Copy trace ID" />}>
        <DetailRow label="request.id" value={request.id} />
        <DetailRow label="trace.id" value={request.traceId} valueClassName="text-violet-400" />
        <DetailRow label="span.id" value={request.spanId} />
        <DetailRow label="service.name" value={request.service} />
        <DetailRow label="environment" value={request.environment} />
        <DetailRow label="region" value={request.region} />
      </InspectorSection>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/$orgSlug/observability/traces" params={{ orgSlug }} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-4 transition-colors hover:bg-white/[0.025]">
          <span className="flex size-8 items-center justify-center rounded-lg bg-violet-400/[0.08] text-violet-400"><HugeiconsIcon icon={WorkflowSquare06Icon} size={14} strokeWidth={1.7} /></span>
          <div><p className="text-[10px] text-zinc-300">Open trace</p><p className="mt-1 text-[8px] text-zinc-700">{request.traceId.slice(0, 12)}</p></div>
        </Link>
        <Link to="/$orgSlug/observability/services/$serviceId" params={{ orgSlug, serviceId: request.service }} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-4 transition-colors hover:bg-white/[0.025]">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-600"><HugeiconsIcon icon={ServerStack01Icon} size={14} strokeWidth={1.7} /></span>
          <div><p className="text-[10px] text-zinc-300">Open service</p><p className="mt-1 text-[8px] text-zinc-700">{request.service}</p></div>
        </Link>
      </div>
      <InspectorSection title="Correlated logs" titleAccessory={<span className="text-[8px] text-zinc-700">{correlatedLogs.length} events</span>}>
        {correlatedLogs.length ? correlatedLogs.map((event) => (
          <div key={event.id} className="px-4 py-3.5 font-mono">
            <div className="flex items-center gap-3"><span className={`text-[8px] uppercase ${event.level === "error" ? "text-rose-400" : event.level === "warn" ? "text-amber-400" : "text-cyan-400"}`}>{event.level}</span><span className="text-[8px] text-zinc-800">{event.timestamp}</span></div>
            <p className="mt-2 text-[9px] leading-4 text-zinc-400">{event.message}</p>
          </div>
        )) : (
          <div className="px-4 py-8 text-center"><HugeiconsIcon icon={LogsIcon} size={15} strokeWidth={1.7} className="mx-auto text-zinc-800" /><p className="mt-2 text-[9px] text-zinc-700">No logs linked to this trace</p></div>
        )}
      </InspectorSection>
    </div>
  );
}

interface PayloadProps {
  request: ApiRequestEvent;
  copiedField: string | null;
  onCopy: (value: string, field: string) => void;
}

function HeadersSection({ title, headers, field, copiedField, onCopy }: { title: string; headers: Record<string, string>; field: string; copiedField: string | null; onCopy: (value: string, field: string) => void }) {
  return (
    <InspectorSection title={title} action={<CopyButton copied={copiedField === field} onClick={() => onCopy(JSON.stringify(headers, null, 2), field)} label={`Copy ${title.toLowerCase()}`} />}>
      {Object.entries(headers).map(([key, value]) => <DetailRow key={key} label={key} value={value} valueClassName={value === "[REDACTED]" ? "text-amber-400/80" : "text-zinc-400"} />)}
    </InspectorSection>
  );
}

function BodySection({ body, size, state, field, copiedField, onCopy }: { body: string | null; size: number; state: RequestCaptureState; field: string; copiedField: string | null; onCopy: (value: string, field: string) => void }) {
  const bodyInfo = formatBody(body);
  return (
    <InspectorSection title="Body" titleAccessory={<span className="text-[8px] text-zinc-700">{formatBytes(size)}</span>} action={body ? <CopyButton copied={copiedField === field} onClick={() => onCopy(bodyInfo.formatted || body, field)} label="Copy body" /> : undefined}>
      {body ? (
        <div className="overflow-x-auto p-4"><JsonViewer data={bodyInfo.parsed ?? body} /></div>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-[10px] text-zinc-500">Body not retained</p>
          <p className="mt-2 text-[9px] leading-4 text-zinc-700">{state === "metadata" ? "This request was collected as metadata only." : "The request did not contain a body."}</p>
        </div>
      )}
    </InspectorSection>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: [string, string][] }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      ariaLabel={label}
      options={options.map(([optionValue, optionLabel]) => ({
        value: optionValue,
        label: optionLabel,
        className:
          label === "Method" && optionValue !== "all"
            ? getHttpMethodColor(optionValue)
            : undefined,
      }))}
      className="h-12 bg-[#090909]"
      triggerClassName="h-12 !rounded-none !border-0 !bg-white/[0.018] px-5 hover:!bg-white/[0.035] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-white/20 sm:px-6"
    />
  );
}

function RequestStat({ label, value, detail, tone = "violet" }: { label: string; value: string; detail: string; tone?: "violet" | "emerald" | "amber" | "rose" }) {
  const dots = { violet: "bg-violet-400", emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400" };
  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${dots[tone]}`} /><p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">{label}</p></div>
      <p className="mt-2.5 text-xl font-semibold tracking-[-0.035em] text-zinc-100">{value}</p>
      <p className="mt-2 text-[9px] text-zinc-700">{detail}</p>
    </div>
  );
}

function StatusCode({ code }: { code: number }) {
  return <span className={`font-mono text-[10px] font-medium ${statusCodeColor(code)}`}>{code}</span>;
}

function CapturePill({ state }: { state: RequestCaptureState }) {
  const styles = { full: "text-emerald-400", redacted: "text-amber-400", metadata: "text-zinc-700" };
  const labels = { full: "Full payload", redacted: "Redacted", metadata: "Metadata only" };
  return <span className={`inline-flex items-center gap-2 text-[9px] ${styles[state]}`}><span className="size-1.5 rounded-full bg-current" />{labels[state]}</span>;
}

function InspectorFact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="bg-[#080808] px-5 py-4 sm:px-6"><p className="text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-700">{label}</p><div className="mt-2 font-mono text-[9px] text-zinc-400">{children}</div></div>;
}

function statusCodeColor(code: number) {
  if (code >= 500) return "text-rose-400";
  if (code >= 400) return "text-amber-400";
  if (code >= 300) return "text-cyan-400";
  return "text-emerald-400";
}

function formatDuration(duration: number) {
  return duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
}

function generateCurl(request: ApiRequestEvent) {
  const headers = Object.entries(request.request.headers)
    .filter(([, value]) => value !== "[REDACTED]")
    .map(([key, value]) => `  -H '${key}: ${value}'`)
    .join(" \\\n");
  const body = request.request.body ? ` \\\n  --data '${request.request.body.replaceAll("'", "'\\''")}'` : "";
  return `curl -X ${request.method} 'https://api.example.com${request.path}'${headers ? ` \\\n${headers}` : ""}${body}`;
}
