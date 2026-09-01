import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import Cancel01Icon from "@hugeicons-pro/core-stroke-rounded/Cancel01Icon";
import Clock01Icon from "@hugeicons-pro/core-stroke-rounded/Clock01Icon";
import Search01Icon from "@hugeicons-pro/core-stroke-rounded/Search01Icon";
import WorkflowSquare06Icon from "@hugeicons-pro/core-stroke-rounded/WorkflowSquare06Icon";
import {
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
} from "@/components/observability/observability-ui";
import type { TraceEvent } from "@/components/observability/mock-data";

export const Route = createFileRoute("/$orgSlug/observability/traces")({
  validateSearch: (search: Record<string, unknown>) => ({
    search: typeof search.search === "string" ? search.search : "",
  }),
  head: () => ({ meta: [{ title: "Traces - OutRay Observability" }] }),
  component: TracesView,
});

function TracesView() {
  const { orgSlug } = Route.useParams();
  const { search: query } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [selected, setSelected] = useState<TraceEvent | null>(null);
  const [timeRange, setTimeRange] = useState("1h");
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [statistics, setStatistics] = useState({
    totalTraces: 0,
    errorTraces: 0,
    errorRate: 0,
    p95Duration: 0,
    longestDuration: 0,
  });
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const parameters = new URLSearchParams({ range: timeRange });
    if (query.trim()) parameters.set("search", query.trim());

    void fetch(`/api/${orgSlug}/observability/traces?${parameters}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load traces");
        return response.json() as Promise<{
          traces: TraceEvent[];
          statistics: typeof statistics;
          distribution: Array<{ bucket: string; count: number }>;
        }>;
      })
      .then((data) => {
        setTraces(data.traces);
        setStatistics(data.statistics);
        setDistribution(
          Object.fromEntries(data.distribution.map((item) => [item.bucket, item.count])),
        );
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError("Trace data is temporarily unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [orgSlug, query, timeRange]);

  function changeTimeRange(value: string) {
    setLoading(true);
    setError(null);
    setTimeRange(value);
  }

  async function openTrace(trace: TraceEvent) {
    setSelected(trace);
    try {
      const response = await fetch(
        `/api/${orgSlug}/observability/traces/${encodeURIComponent(trace.id)}`,
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        spans: Array<{
          name: string;
          service: string;
          duration: number;
          offset: number;
          status: "ok" | "error";
        }>;
      };
      setSelected((current) =>
        current?.id === trace.id ? { ...current, spans: data.spans } : current,
      );
    } catch {
      // The summary remains usable if its span details cannot be loaded.
    }
  }

  const visibleTraces = useMemo(
    () =>
      traces.filter(
        (trace) =>
          (!errorsOnly || trace.status === "error") &&
          (!query ||
            trace.name.toLowerCase().includes(query.toLowerCase()) ||
            trace.id.includes(query.toLowerCase()) ||
            trace.rootService.toLowerCase().includes(query.toLowerCase())),
      ),
    [errorsOnly, query, traces],
  );

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Traces"
        description="Follow requests across service boundaries and isolate the spans responsible for latency and failures."
        action={<TimeRangeControl value={timeRange} onChange={changeTimeRange} />}
      />

      <div className="grid gap-7 lg:grid-cols-4">
        {[
          ["Total traces", statistics.totalTraces.toLocaleString(), `Last ${timeRange}`],
          ["Error traces", statistics.errorTraces.toLocaleString(), `${statistics.errorRate}% of total`],
          ["P95 duration", formatDuration(statistics.p95Duration), "Across all routes"],
          ["Longest trace", formatDuration(statistics.longestDuration), `Last ${timeRange}`],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-xl border border-white/[0.07] px-5 py-5 sm:px-6">
            <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">{label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-zinc-200">{value}</p>
            <p className="mt-1 text-[10px] text-zinc-700">{detail}</p>
          </div>
        ))}
      </div>

      <Panel title="Duration distribution" description="Trace count by end-to-end duration">
        <div className="grid grid-cols-8 items-end gap-2 px-5 pb-5 pt-8 sm:px-6">
          {["<50", "50-100", "100-250", "250-500", "500-750", "750-1s", "1-2s", ">2s"].map((bucket, index, buckets) => {
            const largest = Math.max(1, ...buckets.map((item) => distribution[item] || 0));
            const height = ((distribution[bucket] || 0) / largest) * 100;
            return (
            <div key={index} className="flex flex-col items-center gap-3">
              <div className="flex h-28 w-full items-end">
                <div
                  className={`w-full rounded-t-md ${index > 5 ? "bg-rose-400/35" : "bg-violet-400/35"}`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="text-[8px] text-zinc-800">{bucket}</span>
            </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 text-zinc-600 focus-within:border-white/[0.14]">
            <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.7} />
            <input
              value={query}
              onChange={(event) =>
                void navigate({
                  search: { search: event.target.value },
                  replace: true,
                })
              }
              placeholder="Search route, service, or trace ID"
              className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-zinc-300 outline-none placeholder:text-zinc-700"
            />
          </label>
          <button
            type="button"
            onClick={() => setErrorsOnly((value) => !value)}
            className={`h-9 rounded-lg border px-3 text-[10px] transition-colors ${
              errorsOnly
                ? "border-rose-400/20 bg-rose-400/[0.08] text-rose-400"
                : "border-white/[0.07] text-zinc-600 hover:text-zinc-300"
            }`}
          >
            Errors only
          </button>
        </div>
        <div className="hidden grid-cols-[minmax(0,1fr)_150px_110px_90px_80px_24px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[9px] uppercase tracking-[0.08em] text-zinc-700 sm:px-6 lg:grid">
          <span>Trace</span><span>Root service</span><span>Started</span><span>Duration</span><span>Spans</span><span />
        </div>
        <div className="divide-y divide-white/[0.055]">
          {loading && <TraceTableSkeleton />}
          {!loading && error && (
            <div className="px-6 py-12 text-center text-[11px] text-rose-400">{error}</div>
          )}
          {!loading && !error && visibleTraces.length === 0 && (
            <div className="px-6 py-12 text-center text-[11px] text-zinc-700">
              No traces received in this time range.
            </div>
          )}
          {!loading && !error && visibleTraces.map((trace) => (
            <button
              key={trace.id}
              type="button"
              onClick={() => void openTrace(trace)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition-colors sm:px-6 lg:grid-cols-[minmax(0,1fr)_150px_110px_90px_80px_24px] lg:items-center lg:gap-4 ${
                selected?.id === trace.id
                  ? "bg-white/[0.035]"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={`size-1.5 shrink-0 rounded-full ${trace.status === "error" ? "bg-rose-400" : "bg-emerald-400"}`} />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] text-zinc-300">{trace.name}</p>
                  <p className="mt-1 truncate font-mono text-[9px] text-zinc-800">{trace.id}</p>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500">{trace.rootService}</span>
              <span className="font-mono text-[9px] text-zinc-700">{formatStartedAt(trace.startedAt)}</span>
              <span className={`font-mono text-[10px] ${trace.duration > 1000 ? "text-amber-400" : "text-zinc-500"}`}>
                {formatDuration(trace.duration)}
              </span>
              <span className="text-[10px] text-zinc-600">{trace.spanCount}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.7} className="hidden text-zinc-800 lg:block" />
            </button>
          ))}
        </div>
      </Panel>

      <TraceDetail trace={selected} onClose={() => setSelected(null)} />
    </ObservabilityPage>
  );
}

function TraceDetail({ trace, onClose }: { trace: TraceEvent | null; onClose: () => void }) {
  useEffect(() => {
    if (!trace) return;

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
  }, [onClose, trace]);

  return (
    <AnimatePresence>
      {trace && (
        <>
          <motion.button
            type="button"
            aria-label="Close trace details"
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
            aria-label="Trace details"
          >
            <header className="shrink-0 border-b border-white/[0.07] px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-700">
                    Trace details
                  </p>
                  <h2 className="truncate font-mono text-sm font-medium text-zinc-200">
                    {trace.name}
                  </h2>
                  <p className="mt-2 truncate font-mono text-[9px] text-zinc-700">
                    {trace.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
                  aria-label="Close trace details"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
                </button>
              </div>
            </header>

            <div className="grid shrink-0 grid-cols-2 gap-px border-b border-white/[0.07] bg-white/[0.06] sm:grid-cols-4">
              <TraceFact label="Status">
                <span className={`inline-flex items-center gap-2 capitalize ${trace.status === "error" ? "text-rose-400" : "text-emerald-400"}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {trace.status}
                </span>
              </TraceFact>
              <TraceFact label="Duration">{formatDuration(trace.duration)}</TraceFact>
              <TraceFact label="Spans">{trace.spanCount}</TraceFact>
              <TraceFact label="Started">{trace.startedAt}</TraceFact>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="flex flex-wrap items-center gap-5 border-b border-white/[0.07] px-5 py-4 text-[10px] sm:px-6">
                <span className="flex items-center gap-2 text-zinc-500">
                  <HugeiconsIcon icon={WorkflowSquare06Icon} size={14} strokeWidth={1.7} />
                  {trace.rootService}
                </span>
                <span className="flex items-center gap-2 text-zinc-500">
                  <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.7} />
                  End-to-end {formatDuration(trace.duration)}
                </span>
                <span className="rounded-md border border-white/[0.07] px-2 py-1 font-mono text-[9px] text-zinc-600">
                  {trace.method}
                </span>
              </div>

              <section className="px-5 py-6 sm:px-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[12px] font-medium text-zinc-300">Span waterfall</h3>
                    <p className="mt-1 text-[9px] text-zinc-700">Relative timing across the complete trace</p>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-700">0ms — {formatDuration(trace.duration)}</span>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                  <div className="grid grid-cols-[170px_minmax(220px,1fr)_58px] gap-3 border-b border-white/[0.06] px-4 py-3 text-[8px] uppercase tracking-[0.08em] text-zinc-700">
                    <span>Operation</span>
                    <span>Timeline</span>
                    <span className="text-right">Time</span>
                  </div>
                  <div className="divide-y divide-white/[0.055]">
                    {trace.spans.length === 0 && (
                      <div className="px-4 py-8 text-center text-[9px] text-zinc-700">
                        Loading trace spans…
                      </div>
                    )}
                    {trace.spans.map((span, index) => {
                      const width = Math.max(3, (span.duration / trace.duration) * 100);
                      const left = (span.offset / trace.duration) * 100;
                      return (
                        <div key={`${span.name}-${index}`} className="grid grid-cols-[170px_minmax(220px,1fr)_58px] items-center gap-3 px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[9px] text-zinc-300">{span.name}</p>
                            <p className="mt-1 truncate text-[8px] text-zinc-700">{span.service}</p>
                          </div>
                          <div className="relative h-7 overflow-hidden rounded-md bg-white/[0.025]">
                            <div
                              className={`absolute top-1.5 h-4 rounded ${span.status === "error" ? "bg-rose-400/55" : "bg-violet-400/50"}`}
                              style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                            />
                          </div>
                          <span className={`text-right font-mono text-[8px] ${span.status === "error" ? "text-rose-400" : "text-zinc-600"}`}>
                            {formatDuration(span.duration)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="border-t border-white/[0.07] px-5 py-6 sm:px-6">
                <h3 className="text-[12px] font-medium text-zinc-300">Trace context</h3>
                <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-2">
                  {[
                    ["trace.id", trace.id],
                    ["service.name", trace.rootService],
                    ["http.method", trace.method],
                    ["span.count", String(trace.spanCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-[#080808] p-4 font-mono">
                      <p className="text-[8px] text-zinc-700">{label}</p>
                      <p className="mt-2 break-all text-[9px] text-zinc-400">{value}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function TraceFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-[#080808] px-5 py-4 sm:px-6">
      <p className="text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-700">{label}</p>
      <div className="mt-2 font-mono text-[10px] text-zinc-400">{children}</div>
    </div>
  );
}

function TraceTableSkeleton() {
  return (
    <div className="divide-y divide-white/[0.055]" aria-label="Loading traces">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid animate-pulse gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_150px_110px_90px_80px_24px] lg:items-center lg:gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="size-1.5 rounded-full bg-white/[0.08]" />
            <div className="space-y-2">
              <div className="h-2.5 w-36 rounded bg-white/[0.06]" />
              <div className="h-2 w-52 rounded bg-white/[0.035]" />
            </div>
          </div>
          <div className="h-2.5 w-24 rounded bg-white/[0.05]" />
          <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
          <div className="h-2.5 w-14 rounded bg-white/[0.04]" />
          <div className="h-2.5 w-8 rounded bg-white/[0.04]" />
          <div />
        </div>
      ))}
    </div>
  );
}

function formatStartedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function formatDuration(duration: number) {
  if (!Number.isFinite(duration)) return "0ms";
  return duration >= 1000
    ? `${(duration / 1000).toFixed(2)}s`
    : `${Math.round(duration * 100) / 100}ms`;
}
