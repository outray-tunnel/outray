import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import PauseIcon from "@hugeicons-pro/core-stroke-rounded/PauseIcon";
import PlayIcon from "@hugeicons-pro/core-stroke-rounded/PlayIcon";
import Search01Icon from "@hugeicons-pro/core-stroke-rounded/Search01Icon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";
import {
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
} from "@/components/observability/observability-ui";
import { Select } from "@/components/ui/select";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEvent {
  id: string;
  timestamp: string;
  observedTimestamp: string;
  level: LogLevel;
  severityNumber: number;
  severityText: string;
  message: string;
  eventName: string;
  traceId: string;
  spanId: string;
  flags: number;
  service: string;
  serviceNamespace: string;
  serviceVersion: string;
  environment: string;
  region: string;
  scopeName: string;
  scopeVersion: string;
  attributes: Record<string, string>;
  resourceAttributes: Record<string, string>;
  scopeAttributes: Record<string, string>;
}

interface LogsResponse {
  logs: LogEvent[];
  services: string[];
}

export const Route = createFileRoute("/$orgSlug/observability/logs")({
  validateSearch: (search: Record<string, unknown>) => ({
    search: typeof search.search === "string" ? search.search : "",
  }),
  head: () => ({ meta: [{ title: "Logs - OutRay Observability" }] }),
  component: LogsView,
});

const levelStyles: Record<LogLevel, string> = {
  debug: "text-zinc-600",
  info: "text-cyan-400",
  warn: "text-amber-400",
  error: "text-rose-400",
};

function LogsView() {
  const { orgSlug } = Route.useParams();
  const { search: query } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [level, setLevel] = useState<"all" | LogLevel>("all");
  const [service, setService] = useState("all");
  const [timeRange, setTimeRange] = useState("1h");
  const [isLive, setIsLive] = useState(true);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [selected, setSelected] = useState<LogEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ range: timeRange, limit: "250" });
    if (query.trim()) parameters.set("search", query.trim());
    if (level !== "all") parameters.set("level", level);
    if (service !== "all") parameters.set("service", service);

    const loadLogs = async () => {
      try {
        const response = await fetch(
          `/api/${orgSlug}/observability/logs?${parameters}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load logs");
        const data = (await response.json()) as LogsResponse;
        setLogs(data.logs);
        setServices(data.services);
        setSelected((current) => {
          if (!current) return data.logs[0] || null;
          return (
            data.logs.find((event) => event.id === current.id) ||
            data.logs[0] ||
            null
          );
        });
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        )
          return;
        setError("Log data is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadLogs();
    const interval = isLive
      ? window.setInterval(() => void loadLogs(), 4_000)
      : undefined;

    return () => {
      controller.abort();
      if (interval) window.clearInterval(interval);
    };
  }, [isLive, level, orgSlug, query, service, timeRange]);

  function changeTimeRange(value: string) {
    setLoading(true);
    setError(null);
    setTimeRange(value);
  }

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Logs"
        description="Search structured application events and move directly from a log line into its trace context."
        action={
          <div className="flex items-center gap-2">
            <TimeRangeControl value={timeRange} onChange={changeTimeRange} />
            <button
              type="button"
              onClick={() => setIsLive((value) => !value)}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-medium transition-colors ${
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
              {isLive ? "Streaming" : "Paused"}
            </button>
          </div>
        }
      />

      <Panel>
        <div className="grid gap-px bg-white/[0.06] md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="flex h-12 items-center gap-3 bg-[#090909] px-5 text-zinc-600 sm:px-6">
            <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.7} />
            <input
              value={query}
              onChange={(event) =>
                void navigate({
                  search: { search: event.target.value },
                  replace: true,
                })
              }
              placeholder='Search logs — try "payment", a trace ID, or service name'
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-zinc-300 outline-none placeholder:text-zinc-700"
            />
            <kbd className="hidden rounded border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-zinc-700 sm:block">
              ⌘ K
            </kbd>
          </label>
          <Select
            value={service}
            onChange={setService}
            ariaLabel="Filter logs by service"
            options={[
              { value: "all", label: "All services" },
              ...services.map((item) => ({ value: item, label: item })),
            ]}
            className="h-12 bg-[#090909]"
            triggerClassName="h-12 !rounded-none !border-0 !bg-white/[0.018] px-5 hover:!bg-white/[0.035] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-white/20 sm:px-6"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3 sm:px-6">
          {(["all", "debug", "info", "warn", "error"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLevel(value)}
              className={`h-7 rounded-md px-2.5 text-[9px] uppercase tracking-[0.07em] transition-colors ${
                level === value
                  ? "bg-white/[0.08] text-zinc-200"
                  : "text-zinc-700 hover:text-zinc-400"
              }`}
            >
              {value}
            </button>
          ))}
          <span className="ml-auto text-[9px] text-zinc-700">
            {logs.length} events shown
          </span>
        </div>
      </Panel>

      <div
        className={`grid gap-7 ${selected ? "xl:grid-cols-[minmax(0,1fr)_400px]" : ""}`}
      >
        <Panel>
          <div className="hidden grid-cols-[90px_70px_150px_minmax(0,1fr)_120px_24px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[9px] uppercase tracking-[0.08em] text-zinc-700 sm:px-6 lg:grid">
            <span>Time</span>
            <span>Level</span>
            <span>Service</span>
            <span>Message</span>
            <span>Trace</span>
            <span />
          </div>
          <div className="divide-y divide-white/[0.055] font-mono">
            {loading ? (
              <LogRowsSkeleton />
            ) : error ? (
              <LogListMessage title="Logs unavailable" detail={error} />
            ) : logs.length === 0 ? (
              <LogListMessage
                title="No logs found"
                detail="Logs sent through OTLP will appear here as soon as they are received."
              />
            ) : (
              logs.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelected(event)}
                  className={`grid w-full gap-2 px-5 py-3.5 text-left text-[10px] transition-colors sm:px-6 lg:grid-cols-[90px_70px_150px_minmax(0,1fr)_120px_24px] lg:items-center lg:gap-4 ${
                    selected?.id === event.id
                      ? "bg-white/[0.035]"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <span className="tabular-nums text-zinc-700">
                    {formatTimestamp(event.timestamp)}
                  </span>
                  <span className={`uppercase ${levelStyles[event.level]}`}>
                    {event.level}
                  </span>
                  <span className="truncate text-zinc-500">
                    {event.service}
                  </span>
                  <span className="truncate text-zinc-300">
                    {event.message}
                  </span>
                  <span className="truncate text-zinc-700">
                    {event.traceId ? event.traceId.slice(0, 10) : "—"}
                  </span>
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
        </Panel>

        {selected && <LogDetail event={selected} />}
      </div>
    </ObservabilityPage>
  );
}

function LogRowsSkeleton() {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[90px_70px_150px_minmax(0,1fr)_120px_24px] items-center gap-4 px-5 py-4 sm:px-6"
        >
          {[56, 38, 92, 220, 80, 12].map((width, item) => (
            <span
              key={item}
              className="h-2 rounded bg-white/[0.045]"
              style={{ width }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function LogListMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-6 py-16 text-center font-sans">
      <p className="text-[12px] font-medium text-zinc-400">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[10px] leading-5 text-zinc-700">
        {detail}
      </p>
    </div>
  );
}

function LogDetail({ event }: { event: LogEvent }) {
  const [copied, setCopied] = useState(false);

  const copyEvent = async () => {
    await navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  };

  return (
    <Panel
      title="Event details"
      description={new Date(event.timestamp).toLocaleString()}
      action={
        <button
          type="button"
          onClick={copyEvent}
          className={`flex size-8 items-center justify-center rounded-lg transition-colors ${copied ? "bg-emerald-400/[0.1] text-emerald-400" : "text-zinc-700 hover:bg-white/[0.05] hover:text-zinc-300"}`}
          aria-label="Copy log event"
        >
          <HugeiconsIcon
            icon={copied ? Tick02Icon : Copy01Icon}
            size={14}
            strokeWidth={1.7}
          />
        </button>
      }
    >
      <div className="space-y-6 p-5 sm:p-6">
        <div>
          <span
            className={`font-mono text-[10px] uppercase ${levelStyles[event.level]}`}
          >
            {event.severityText || event.level}
          </span>
          <p className="mt-3 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-zinc-300">
            {event.message}
          </p>
        </div>
        <div className="grid grid-cols-[90px_1fr] gap-y-3 border-y border-white/[0.06] py-5 font-mono text-[10px]">
          <span className="text-zinc-700">service</span>
          <span className="text-zinc-400">{event.service}</span>
          <span className="text-zinc-700">environment</span>
          <span className="text-zinc-400">{event.environment || "—"}</span>
          <span className="text-zinc-700">region</span>
          <span className="text-zinc-400">{event.region || "—"}</span>
          <span className="text-zinc-700">trace_id</span>
          <span className="break-all text-violet-400">
            {event.traceId || "—"}
          </span>
          <span className="text-zinc-700">span_id</span>
          <span className="break-all text-zinc-500">{event.spanId || "—"}</span>
          <span className="text-zinc-700">scope</span>
          <span className="break-all text-zinc-500">
            {event.scopeName || "—"}
          </span>
        </div>
        <Attributes title="Attributes" values={event.attributes} />
        <Attributes title="Resource" values={event.resourceAttributes} />
      </div>
    </Panel>
  );
}

function Attributes({
  title,
  values,
}: {
  title: string;
  values: Record<string, string>;
}) {
  const entries = Object.entries(values || {});
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">
        {title}
      </p>
      <div className="space-y-2 rounded-lg border border-white/[0.06] bg-black/20 p-4 font-mono text-[10px]">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[110px_1fr] gap-3">
            <span className="truncate text-zinc-700">{key}</span>
            <span className="break-all text-zinc-400">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });
}
