import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowLeft01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowLeft01Icon";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import Cancel01Icon from "@hugeicons-pro/core-stroke-rounded/Cancel01Icon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import LogsIcon from "@hugeicons-pro/core-stroke-rounded/LogsIcon";
import PauseIcon from "@hugeicons-pro/core-stroke-rounded/PauseIcon";
import PlayIcon from "@hugeicons-pro/core-stroke-rounded/PlayIcon";
import Search01Icon from "@hugeicons-pro/core-stroke-rounded/Search01Icon";
import ServerStack01Icon from "@hugeicons-pro/core-stroke-rounded/ServerStack01Icon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";
import WorkflowSquare06Icon from "@hugeicons-pro/core-stroke-rounded/WorkflowSquare06Icon";
import {
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
} from "@/components/observability/observability-ui";
import { JsonViewer, formatBody } from "@/components/requests/json-viewer";
import { CopyButton } from "@/components/requests/request-tab-content";
import { formatBytes, getHttpMethodColor } from "@/components/requests/utils";
import { Select } from "@/components/ui/select";
import { normalizeHttpMethod } from "@/lib/observability/http-method";

type RequestCaptureState = "full" | "metadata" | "redacted";
type StatusFilter = "all" | "success" | "errors";
type CaptureFilter = "all" | RequestCaptureState;
type InspectorTab = "request" | "response" | "context";

interface HttpRequestSummary {
  id: string;
  requestId: string;
  timestamp: string;
  method: string;
  route: string;
  path: string;
  service: string;
  environment: string;
  region: string;
  statusCode: number;
  duration: number;
  traceId: string;
  spanId: string;
  captureState: RequestCaptureState;
  requestSize: number;
  responseSize: number;
}

interface HttpRequestDetails extends HttpRequestSummary {
  url: string;
  clientAddress: string;
  userAgent: string;
  protocol: string;
  request: {
    headers: Record<string, string>;
    headersCaptured: boolean;
    headersTruncated: boolean;
    query: Record<string, string>;
    body: string | null;
    bodyCaptured: boolean;
    bodyTruncated: boolean;
    bodyContentType: string;
    size: number;
  };
  response: {
    headers: Record<string, string>;
    headersCaptured: boolean;
    headersTruncated: boolean;
    body: string | null;
    bodyCaptured: boolean;
    bodyTruncated: boolean;
    bodyContentType: string;
    size: number;
  };
  attributes: Record<string, string>;
  resourceAttributes: Record<string, string>;
}

interface CorrelatedLog {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

interface RequestStatistics {
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  p95Duration: number;
  payloadCaptureCount: number;
  metadataCount: number;
}

interface RequestsResponse {
  requests: HttpRequestSummary[];
  statistics: RequestStatistics;
  services?: string[];
  methods?: string[];
  total: number;
  hasMore: boolean;
  nextCursor: RequestCursor | null;
  limit: number;
  range: string;
}

interface RequestFacets {
  services: string[];
  methods: string[];
}

interface CachedRequestFacets extends RequestFacets {
  refreshedAt: number;
}

interface RequestCursor {
  timestamp: string;
  traceId: string;
  spanId: string;
}

interface RequestDetailsResponse {
  request: HttpRequestDetails;
  logs: CorrelatedLog[];
}

export const Route = createFileRoute("/$orgSlug/observability/requests")({
  head: () => ({ meta: [{ title: "Requests - OutRay Observability" }] }),
  component: RequestsView,
});

const PAGE_SIZE = 50;
const FACET_REFRESH_INTERVAL = 60_000;
const timeRanges = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

function RequestsView() {
  const { orgSlug } = Route.useParams();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [capture, setCapture] = useState<CaptureFilter>("all");
  const [timeRange, setTimeRange] = useState("1h");
  const [isLive, setIsLive] = useState(true);
  const [cursorStack, setCursorStack] = useState<Array<RequestCursor | null>>([
    null,
  ]);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [selected, setSelected] = useState<HttpRequestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [knownTotal, setKnownTotal] = useState(0);
  const [facets, setFacets] = useState<RequestFacets>({
    services: [],
    methods: [],
  });
  const facetCache = useRef(new Map<string, CachedRequestFacets>());
  const facetAttempts = useRef(new Map<string, number>());
  const currentCursor = cursorStack.at(-1) || null;
  const page = cursorStack.length - 1;

  useEffect(() => {
    if (searchInput === query) return;

    const timeout = window.setTimeout(() => {
      setData(null);
      setLoading(true);
      setError(null);
      setCursorStack([null]);
      setKnownTotal(0);
      setQuery(searchInput);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [query, searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let requestGeneration = 0;
    let refreshTimeout: number | undefined;
    let activeFacetAttempt: number | undefined;
    const facetKey = `${orgSlug}:${timeRange}`;
    const facetEntries = facetCache.current;
    const facetAttemptEntries = facetAttempts.current;
    const cachedFacets = facetEntries.get(facetKey);
    setFacets(cachedFacets || { services: [], methods: [] });
    const parameters = new URLSearchParams({
      range: timeRange,
      limit: String(PAGE_SIZE),
    });
    if (query.trim()) parameters.set("search", query.trim());
    if (service !== "all") parameters.set("service", service);
    if (method !== "all") parameters.set("method", method);
    if (status !== "all") parameters.set("status", status);
    if (capture !== "all") parameters.set("capture", capture);
    if (currentCursor) {
      parameters.set("before_timestamp", currentCursor.timestamp);
      parameters.set("before_trace_id", currentCursor.traceId);
      parameters.set("before_span_id", currentCursor.spanId);
    }

    const facetsAreDue = () => {
      const lastSuccess = facetEntries.get(facetKey)?.refreshedAt || 0;
      const lastAttempt = facetAttemptEntries.get(facetKey) || 0;
      return (
        Date.now() - Math.max(lastSuccess, lastAttempt) >=
        FACET_REFRESH_INTERVAL
      );
    };

    const loadRequests = async (includeFacets: boolean) => {
      const generation = ++requestGeneration;
      setRefreshing(true);
      try {
        const requestParameters = new URLSearchParams(parameters);
        if (includeFacets) {
          activeFacetAttempt = Date.now();
          facetAttemptEntries.set(facetKey, activeFacetAttempt);
        } else {
          requestParameters.set("include_facets", "false");
        }
        const response = await fetch(
          `/api/${orgSlug}/observability/requests?${requestParameters}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load requests");

        const nextData = (await response.json()) as RequestsResponse;
        if (disposed || generation !== requestGeneration) return;
        setData(nextData);
        if (nextData.services && nextData.methods) {
          const nextFacets = {
            services: nextData.services,
            methods: nextData.methods,
            refreshedAt: Date.now(),
          };
          facetEntries.set(facetKey, nextFacets);
          if (facetAttemptEntries.get(facetKey) === activeFacetAttempt) {
            facetAttemptEntries.delete(facetKey);
          }
          setFacets(nextFacets);
        }
        if (includeFacets) activeFacetAttempt = undefined;
        setKnownTotal(nextData.total);
        setSelected((current) => {
          if (!current) return null;
          return (
            nextData.requests.find((request) => request.id === current.id) ||
            current
          );
        });
        setLastSuccessAt(Date.now());
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        if (includeFacets) activeFacetAttempt = undefined;
        if (disposed || generation !== requestGeneration) return;
        setError("Request telemetry is temporarily unavailable.");
      } finally {
        if (!disposed && generation === requestGeneration) {
          setLoading(false);
          setRefreshing(false);
          if (isLive) {
            refreshTimeout = window.setTimeout(
              () => void loadRequests(facetsAreDue()),
              4_000,
            );
          }
        }
      }
    };

    void loadRequests(facetsAreDue());
    return () => {
      disposed = true;
      requestGeneration += 1;
      if (
        activeFacetAttempt !== undefined &&
        facetAttemptEntries.get(facetKey) === activeFacetAttempt
      ) {
        facetAttemptEntries.delete(facetKey);
      }
      controller.abort();
      if (refreshTimeout !== undefined) {
        window.clearTimeout(refreshTimeout);
      }
    };
  }, [
    capture,
    currentCursor,
    isLive,
    method,
    orgSlug,
    page,
    query,
    reloadKey,
    service,
    status,
    timeRange,
  ]);

  const closeInspector = useCallback(() => setSelected(null), []);
  const displayTotal = data?.total ?? knownTotal;
  const totalPages = Math.max(1, Math.ceil(displayTotal / PAGE_SIZE));

  function beginQuery(resetPagination = true) {
    setData(null);
    setLoading(true);
    setError(null);
    if (resetPagination) {
      setCursorStack([null]);
      setKnownTotal(0);
    }
  }

  function changeQuery(value: string) {
    setSearchInput(value);
  }

  function changeService(value: string) {
    if (value === service) return;
    beginQuery();
    setService(value);
  }

  function changeMethod(value: string) {
    if (value === method) return;
    beginQuery();
    setMethod(value);
  }

  function changeStatus(value: StatusFilter) {
    if (value === status) return;
    beginQuery();
    setStatus(value);
  }

  function changeCapture(value: string) {
    if (value === capture) return;
    beginQuery();
    setCapture(value as CaptureFilter);
  }

  function changeTimeRange(value: string) {
    if (value === timeRange) return;
    beginQuery();
    setTimeRange(value);
  }

  function nextPage() {
    if (!data?.hasMore || !data.nextCursor) return;
    beginQuery(false);
    setCursorStack((current) => [...current, data.nextCursor]);
  }

  function previousPage() {
    if (page === 0) return;
    beginQuery(false);
    setCursorStack((current) => current.slice(0, -1));
  }

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Requests"
        description="Inspect instrumented HTTP requests and move directly between payloads, traces, and correlated logs."
        action={
          <div className="flex items-center gap-2">
            <TimeRangeControl
              value={timeRange}
              options={timeRanges}
              onChange={changeTimeRange}
            />
            <button
              type="button"
              onClick={() => setIsLive((value) => !value)}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
                isLive
                  ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-400"
                  : "border-white/[0.08] text-zinc-600"
              }`}
            >
              <HugeiconsIcon
                icon={isLive ? PauseIcon : PlayIcon}
                size={13}
                strokeWidth={1.8}
              />
              {isLive ? "Live" : "Paused"}
            </button>
          </div>
        }
      />

      {error && data && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-xs text-amber-300">
          {error} Showing the last successful result
          {lastSuccessAt ? ` from ${formatClockTime(lastSuccessAt)}.` : "."}
        </div>
      )}

      {loading && !data ? (
        <RequestStatsSkeleton />
      ) : data ? (
        <section className="grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-white/[0.07]">
          <RequestStat
            label="Requests"
            value={data.statistics.totalRequests.toLocaleString()}
            detail={`Last ${timeRange}`}
          />
          <RequestStat
            label="Error rate"
            value={`${formatNumber(data.statistics.errorRate)}%`}
            detail={`${data.statistics.errorCount.toLocaleString()} errors`}
            tone="rose"
          />
          <RequestStat
            label="P95 duration"
            value={formatDuration(data.statistics.p95Duration)}
            detail="Across matching HTTP requests"
            tone="amber"
          />
          <RequestStat
            label="Payload captures"
            value={data.statistics.payloadCaptureCount.toLocaleString()}
            detail={`${data.statistics.metadataCount.toLocaleString()} metadata only`}
            tone="emerald"
          />
        </section>
      ) : null}

      <Panel>
        <div className="grid gap-px bg-white/[0.06] lg:grid-cols-[minmax(280px,1fr)_180px_130px_150px]">
          <label className="flex h-12 items-center gap-3 bg-[#090909] px-5 text-zinc-600 sm:px-6">
            <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.7} />
            <input
              value={searchInput}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Search path, service, request ID, or trace ID"
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-300 outline-none placeholder:text-zinc-700"
            />
          </label>
          <FilterSelect
            value={service}
            onChange={changeService}
            label="Service"
            disabled={!facets.services.length}
            options={[
              ["all", "All services"],
              ...facets.services.map(
                (item) => [item, item] as [string, string],
              ),
            ]}
          />
          <FilterSelect
            value={method}
            onChange={changeMethod}
            label="Method"
            disabled={!facets.methods.length}
            options={[
              ["all", "All methods"],
              ...facets.methods.map((item) => [item, item] as [string, string]),
            ]}
          />
          <FilterSelect
            value={capture}
            onChange={changeCapture}
            label="Capture"
            disabled={!data}
            options={[
              ["all", "All capture states"],
              ["full", "Captured"],
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
              onClick={() => changeStatus(value)}
              className={`h-7 rounded-md px-2.5 text-xs capitalize transition-colors ${
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
          <span className="ml-auto text-xs text-zinc-700">
            {refreshing && data
              ? "Refreshing…"
              : data
                ? `${data.total.toLocaleString()} matching requests`
                : "Waiting for request data"}
          </span>
        </div>
      </Panel>

      <Panel>
        <div className="hidden grid-cols-[minmax(0,1fr)_140px_70px_90px_105px_110px_24px] gap-4 border-b border-white/[0.07] px-5 py-3 text-xs uppercase tracking-[0.08em] text-zinc-700 sm:px-6 lg:grid">
          <span>Request</span>
          <span>Service</span>
          <span>Status</span>
          <span>Duration</span>
          <span>Transferred</span>
          <span>Capture</span>
          <span />
        </div>
        <div className="divide-y divide-white/[0.055]">
          {loading && !data ? (
            <RequestRowsSkeleton />
          ) : error && !data ? (
            <RequestListMessage
              title="Requests unavailable"
              detail={error}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setError(null);
                    setReloadKey((value) => value + 1);
                  }}
                  className="mt-5 h-9 rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200"
                >
                  Try again
                </button>
              }
            />
          ) : !data?.requests.length ? (
            <RequestListMessage
              title="No matching requests"
              detail={
                query ||
                service !== "all" ||
                method !== "all" ||
                status !== "all" ||
                capture !== "all"
                  ? "Try removing one of the active filters."
                  : page > 0
                    ? "This page no longer contains requests. Return to the previous page."
                    : "HTTP server spans received through OTLP will appear here."
              }
            />
          ) : (
            data.requests.map((request) => (
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
                  <span
                    className={`w-12 shrink-0 font-mono text-xs font-medium ${getHttpMethodColor(request.method)}`}
                  >
                    {request.method}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-zinc-300">
                      {request.path || request.route || "/"}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-zinc-700">
                      {formatRequestTime(request.timestamp)} ·{" "}
                      {request.requestId || request.id}
                    </p>
                  </div>
                </div>
                <span className="truncate text-xs text-zinc-500">
                  {request.service}
                </span>
                <StatusCode code={request.statusCode} />
                <span
                  className={`font-mono text-xs ${request.duration > 1000 ? "text-amber-400" : "text-zinc-600"}`}
                >
                  {formatDuration(request.duration)}
                </span>
                <span className="font-mono text-xs text-zinc-700">
                  {formatBytes(request.requestSize + request.responseSize)}
                </span>
                <CapturePill state={request.captureState} />
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={13}
                  strokeWidth={1.7}
                  className="hidden text-zinc-800 lg:block"
                />
              </button>
            ))
          )}
        </div>
        {data && (page > 0 || data.hasMore || displayTotal > PAGE_SIZE) && (
          <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-4 sm:px-6">
            <span className="text-xs text-zinc-700">
              {data.requests.length
                ? `${page * PAGE_SIZE + 1}–${Math.min(
                    page * PAGE_SIZE + data.requests.length,
                    displayTotal,
                  )} of ${displayTotal.toLocaleString()}`
                : `No requests on page ${page + 1}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={previousPage}
                disabled={page === 0}
                className="flex size-8 items-center justify-center rounded-lg border border-white/[0.07] text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Previous page"
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={13}
                  strokeWidth={1.7}
                />
              </button>
              <span className="min-w-16 text-center font-mono text-xs text-zinc-600">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={nextPage}
                disabled={!data.hasMore || !data.nextCursor}
                className="flex size-8 items-center justify-center rounded-lg border border-white/[0.07] text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next page"
              >
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={13}
                  strokeWidth={1.7}
                />
              </button>
            </div>
          </div>
        )}
      </Panel>

      <RequestInspector
        key={selected?.id ?? "closed"}
        request={selected}
        orgSlug={orgSlug}
        onClose={closeInspector}
      />
    </ObservabilityPage>
  );
}

function RequestInspector({
  request,
  orgSlug,
  onClose,
}: {
  request: HttpRequestSummary | null;
  orgSlug: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("request");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [details, setDetails] = useState<RequestDetailsResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(request));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = request?.id;

  useEffect(() => {
    if (!requestId) return;

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
  }, [onClose, requestId]);

  useEffect(() => {
    if (!requestId) return;
    const controller = new AbortController();

    const loadDetails = async () => {
      try {
        const response = await fetch(
          `/api/${orgSlug}/observability/requests/${encodeURIComponent(requestId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load request details");
        setDetails((await response.json()) as RequestDetailsResponse);
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        setError("Request details are temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadDetails();
    return () => controller.abort();
  }, [orgSlug, reloadKey, requestId]);

  const copy = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 1_400);
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
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-zinc-700">
                    Request inspector
                  </p>
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusCode code={request.statusCode} />
                    <span
                      className={`font-mono text-sm font-medium ${getHttpMethodColor(request.method)}`}
                    >
                      {request.method}
                    </span>
                    <h2 className="truncate font-mono text-sm text-zinc-300">
                      {request.path || request.route || "/"}
                    </h2>
                  </div>
                  <p className="mt-2 truncate font-mono text-xs text-zinc-700">
                    {request.requestId || request.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
                  aria-label="Close request inspector"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </button>
              </div>
            </header>

            <div className="grid shrink-0 grid-cols-2 gap-px border-b border-white/[0.07] bg-white/[0.06] sm:grid-cols-4">
              <InspectorFact label="Service">{request.service}</InspectorFact>
              <InspectorFact label="Duration">
                {formatDuration(request.duration)}
              </InspectorFact>
              <InspectorFact label="Started">
                {formatRequestTime(request.timestamp)}
              </InspectorFact>
              <InspectorFact label="Capture">
                <CapturePill state={request.captureState} />
              </InspectorFact>
            </div>

            <nav className="flex h-12 shrink-0 items-end gap-7 border-b border-white/[0.07] px-5 sm:px-6">
              {(["request", "response", "context"] as InspectorTab[]).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    className={`h-12 border-b text-xs font-medium capitalize transition-colors ${
                      tab === value
                        ? "border-white text-zinc-200"
                        : "border-transparent text-zinc-700 hover:text-zinc-400"
                    }`}
                  >
                    {value}
                  </button>
                ),
              )}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              {loading ? (
                <InspectorSkeleton />
              ) : error || !details ? (
                <div className="rounded-xl border border-white/[0.07] px-6 py-16 text-center">
                  <p className="text-sm text-rose-400">
                    {error || "Request details are unavailable."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setError(null);
                      setReloadKey((value) => value + 1);
                    }}
                    className="mt-5 h-9 rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  {tab === "request" && (
                    <RequestPayload
                      request={details.request}
                      copiedField={copiedField}
                      onCopy={copy}
                    />
                  )}
                  {tab === "response" && (
                    <ResponsePayload
                      request={details.request}
                      copiedField={copiedField}
                      onCopy={copy}
                    />
                  )}
                  {tab === "context" && (
                    <RequestContext
                      request={details.request}
                      logs={details.logs}
                      orgSlug={orgSlug}
                      copiedField={copiedField}
                      onCopy={copy}
                    />
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function RequestPayload({ request, copiedField, onCopy }: PayloadProps) {
  return (
    <div className="space-y-6">
      <InspectorSection
        title="General"
        action={
          <button
            type="button"
            onClick={() => onCopy(generateCurl(request), "curl")}
            className={`flex h-7 items-center gap-2 rounded-md px-2.5 text-xs transition-colors ${
              copiedField === "curl"
                ? "bg-emerald-400/[0.08] text-emerald-400"
                : "text-zinc-700 hover:bg-white/[0.04] hover:text-zinc-300"
            }`}
          >
            <HugeiconsIcon
              icon={copiedField === "curl" ? Tick02Icon : Copy01Icon}
              size={12}
              strokeWidth={1.7}
            />
            {copiedField === "curl" ? "Copied" : "Copy as cURL"}
          </button>
        }
      >
        <DetailRow label="URL" value={request.url || request.path || "/"} />
        <DetailRow label="Route" value={request.route || "—"} />
        <DetailRow
          label="Method"
          value={request.method}
          valueClassName={getHttpMethodColor(request.method)}
        />
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
        field="request-headers"
        copiedField={copiedField}
        onCopy={onCopy}
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
        field="request-body"
        copiedField={copiedField}
        onCopy={onCopy}
      />
    </div>
  );
}

function ResponsePayload({ request, copiedField, onCopy }: PayloadProps) {
  return (
    <div className="space-y-6">
      <InspectorSection title="General">
        <DetailRow
          label="Status"
          value={formatStatusCode(request.statusCode)}
          valueClassName={statusCodeColor(request.statusCode)}
        />
        <DetailRow label="Duration" value={formatDuration(request.duration)} />
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
        field="response-headers"
        copiedField={copiedField}
        onCopy={onCopy}
      />
      <BodySection
        body={request.response.body}
        captured={request.response.bodyCaptured}
        truncated={request.response.bodyTruncated}
        contentType={request.response.bodyContentType}
        size={request.response.size}
        state={request.captureState}
        field="response-body"
        copiedField={copiedField}
        onCopy={onCopy}
      />
    </div>
  );
}

function RequestContext({
  request,
  logs,
  orgSlug,
  copiedField,
  onCopy,
}: PayloadProps & { logs: CorrelatedLog[]; orgSlug: string }) {
  return (
    <div className="space-y-6">
      <InspectorSection
        title="Telemetry context"
        action={
          request.traceId ? (
            <CopyButton
              copied={copiedField === "trace-id"}
              onClick={() => onCopy(request.traceId, "trace-id")}
              label="Copy trace ID"
            />
          ) : undefined
        }
      >
        <DetailRow label="request.id" value={request.requestId || "—"} />
        <DetailRow label="telemetry/span ID" value={request.id} />
        <DetailRow
          label="trace.id"
          value={request.traceId || "—"}
          valueClassName="text-violet-400"
        />
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
            className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-4 transition-colors hover:bg-white/[0.025]"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-400/[0.08] text-violet-400">
              <HugeiconsIcon
                icon={WorkflowSquare06Icon}
                size={14}
                strokeWidth={1.7}
              />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-zinc-300">Open trace</p>
              <p className="mt-1 truncate font-mono text-[11px] text-zinc-700">
                {request.traceId}
              </p>
            </div>
          </Link>
        )}
        <Link
          to="/$orgSlug/observability/services/$serviceId"
          params={{ orgSlug, serviceId: request.service }}
          className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-4 transition-colors hover:bg-white/[0.025]"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-600">
            <HugeiconsIcon
              icon={ServerStack01Icon}
              size={14}
              strokeWidth={1.7}
            />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-zinc-300">Open service</p>
            <p className="mt-1 truncate text-[11px] text-zinc-700">
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
              search={{ search: request.traceId }}
              className="text-[11px] text-violet-400 hover:text-violet-300"
            >
              {logs.length} events · Open logs
            </Link>
          ) : (
            <span className="text-[11px] text-zinc-700">No trace ID</span>
          )
        }
      >
        {logs.length ? (
          logs.map((event) => (
            <div key={event.id} className="px-4 py-3.5 font-mono">
              <div className="flex items-center gap-3">
                <span
                  className={`text-[11px] uppercase ${logLevelColor(event.level)}`}
                >
                  {event.level}
                </span>
                <span className="text-[11px] text-zinc-700">
                  {formatRequestTime(event.timestamp)}
                </span>
              </div>
              <p className="mt-2 text-xs leading-4 text-zinc-400">
                {event.message}
              </p>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center">
            <HugeiconsIcon
              icon={LogsIcon}
              size={15}
              strokeWidth={1.7}
              className="mx-auto text-zinc-800"
            />
            <p className="mt-2 text-xs text-zinc-700">
              No logs linked to this trace
            </p>
          </div>
        )}
      </InspectorSection>
    </div>
  );
}

interface PayloadProps {
  request: HttpRequestDetails;
  copiedField: string | null;
  onCopy: (value: string, field: string) => void;
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
    <section className="overflow-hidden rounded-xl border border-white/[0.07]">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
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
  valueClassName = "text-zinc-400",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(110px,0.34fr)_1fr] gap-5 px-4 py-3.5">
      <span className="truncate font-mono text-xs text-zinc-600" title={label}>
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
  field,
  copiedField,
  onCopy,
}: {
  title: string;
  headers: Record<string, string>;
  captured: boolean;
  truncated: boolean;
  field: string;
  copiedField: string | null;
  onCopy: (value: string, field: string) => void;
}) {
  const entries = Object.entries(headers);
  const redacted = entries.some(([, value]) => containsRedaction(value));
  return (
    <InspectorSection
      title={title}
      action={
        entries.length ? (
          <CopyButton
            copied={copiedField === field}
            onClick={() => onCopy(JSON.stringify(headers, null, 2), field)}
            label={`Copy ${title.toLowerCase()}`}
          />
        ) : undefined
      }
    >
      {!captured ? (
        <PayloadUnavailable
          title="Headers not captured"
          detail="Header capture was not enabled for this request."
        />
      ) : entries.length ? (
        <>
          {(truncated || redacted) && (
            <PayloadWarning
              truncated={truncated}
              redacted={redacted}
              payload="headers"
            />
          )}
          {entries.map(([key, value]) => (
            <DetailRow
              key={key}
              label={key}
              value={value}
              valueClassName={
                containsRedaction(value) ? "text-amber-400/80" : "text-zinc-400"
              }
            />
          ))}
        </>
      ) : (
        <div className="px-4 py-8 text-center text-xs text-zinc-700">
          Captured header set is empty
        </div>
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
  field,
  copiedField,
  onCopy,
}: {
  body: string | null;
  captured: boolean;
  truncated: boolean;
  contentType: string;
  size: number;
  state: RequestCaptureState;
  field: string;
  copiedField: string | null;
  onCopy: (value: string, field: string) => void;
}) {
  const bodyInfo = formatBody(body);
  const redacted = body ? containsRedaction(body) : false;
  return (
    <InspectorSection
      title="Body"
      titleAccessory={
        <span className="text-[11px] text-zinc-700">
          {[contentType, formatBytes(size)].filter(Boolean).join(" · ")}
        </span>
      }
      action={
        captured && body ? (
          <CopyButton
            copied={copiedField === field}
            onClick={() => onCopy(bodyInfo.formatted || body, field)}
            label="Copy body"
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
      ) : body === "" || body === null ? (
        <PayloadUnavailable
          title="Empty body"
          detail="Capture completed and this payload did not contain a body."
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
          <div className="overflow-x-auto p-4">
            <JsonViewer data={bodyInfo.parsed ?? body} />
          </div>
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
    <div className="border-b border-amber-400/10 bg-amber-400/[0.035] px-4 py-3 text-xs leading-4 text-amber-400/75">
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
    <div className="px-5 py-10 text-center">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-xs leading-4 text-zinc-700">{detail}</p>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: [string, string][];
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={onChange}
      ariaLabel={label}
      disabled={disabled}
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

function RequestStat({
  label,
  value,
  detail,
  tone = "violet",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "violet" | "emerald" | "amber" | "rose";
}) {
  const dots = {
    violet: "bg-violet-400",
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
  };
  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className={`size-1.5 rounded-full ${dots[tone]}`} />
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-700">
          {label}
        </p>
      </div>
      <p className="mt-2.5 text-xl font-semibold tracking-[-0.035em] text-zinc-100">
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-700">{detail}</p>
    </div>
  );
}

function RequestStatsSkeleton() {
  return (
    <section
      className="grid animate-pulse overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-white/[0.07]"
      aria-busy="true"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="px-5 py-5 sm:px-6">
          <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
          <div className="mt-4 h-6 w-24 rounded bg-white/[0.07]" />
          <div className="mt-3 h-2.5 w-32 rounded bg-white/[0.04]" />
        </div>
      ))}
    </section>
  );
}

function RequestRowsSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1fr)_140px_70px_90px_105px_110px_24px] items-center gap-4 px-5 py-4 sm:px-6"
        >
          {[180, 90, 30, 44, 52, 72, 12].map((width, item) => (
            <span
              key={item}
              className="h-2 rounded bg-white/[0.045]"
              style={{ width: `${Math.min(width, 100)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function RequestListMessage({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-16 text-center sm:px-6">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-700">
        {detail}
      </p>
      {action}
    </div>
  );
}

function InspectorSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true">
      {Array.from({ length: 3 }).map((_, section) => (
        <div
          key={section}
          className="rounded-xl border border-white/[0.07] p-5"
        >
          <div className="h-2.5 w-24 rounded bg-white/[0.06]" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: section === 0 ? 5 : 3 }).map((__, row) => (
              <div key={row} className="flex gap-8">
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

function StatusCode({ code }: { code: number }) {
  return (
    <span className={`font-mono text-xs font-medium ${statusCodeColor(code)}`}>
      {formatStatusCode(code)}
    </span>
  );
}

function CapturePill({ state }: { state: RequestCaptureState }) {
  const styles = {
    full: "text-emerald-400",
    redacted: "text-amber-400",
    metadata: "text-zinc-700",
  };
  const labels = {
    full: "Captured",
    redacted: "Redacted",
    metadata: "Metadata only",
  };
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${styles[state]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {labels[state]}
    </span>
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
    <div className="bg-[#080808] px-5 py-4 sm:px-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </p>
      <div className="mt-2 font-mono text-xs text-zinc-400">{children}</div>
    </div>
  );
}

function statusCodeColor(code: number) {
  if (code < 100) return "text-zinc-600";
  if (code >= 500) return "text-rose-400";
  if (code >= 400) return "text-amber-400";
  if (code >= 300) return "text-cyan-400";
  return "text-emerald-400";
}

function formatStatusCode(code: number) {
  return code >= 100 ? String(code) : "—";
}

function logLevelColor(level: CorrelatedLog["level"]) {
  if (level === "error") return "text-rose-400";
  if (level === "warn") return "text-amber-400";
  if (level === "debug") return "text-zinc-600";
  return "text-cyan-400";
}

function formatDuration(duration: number) {
  if (!Number.isFinite(duration)) return "—";
  return duration >= 1_000
    ? `${(duration / 1_000).toFixed(2)}s`
    : `${formatNumber(duration)}ms`;
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatRequestTime(value: string) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) return value || "—";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseTimestamp(value: string) {
  let timestamp = value.trim().replace(" ", "T");
  timestamp = timestamp.replace(/(\.\d{3})\d+/, "$1");
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp)) timestamp += "Z";
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function formatClockTime(value: number) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function generateCurl(request: HttpRequestDetails) {
  const method = normalizeHttpMethod(request.method);
  const headers = Object.entries(request.request.headers)
    .filter(([, value]) => value !== "[REDACTED]")
    .map(([key, value]) => `  -H '${shellEscape(`${key}: ${value}`)}'`)
    .join(" \\\n");
  const body = request.request.body
    ? ` \\\n  --data '${shellEscape(request.request.body)}'`
    : "";
  const url = request.url || request.path || "/";
  return `curl -X '${method}' '${shellEscape(url)}'${headers ? ` \\\n${headers}` : ""}${body}`;
}

function shellEscape(value: string) {
  return value.replaceAll("'", "'\\''");
}

function containsRedaction(value: string) {
  return /\[redacted\]|%5bredacted%5d/i.test(value);
}
