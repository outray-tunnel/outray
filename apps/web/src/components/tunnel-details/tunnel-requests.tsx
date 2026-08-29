import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity03Icon,
  Search01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { appClient } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { getHttpMethodColor } from "@/components/requests";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  } else if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  } else if (bytes >= 1_024) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

interface TunnelEvent {
  timestamp: number;
  tunnel_id: string;
  organization_id: string;
  host: string;
  method: string;
  path: string;
  status_code: number;
  request_duration_ms: number;
  bytes_in: number;
  bytes_out: number;
  client_ip: string;
  user_agent: string;
}

interface TunnelRequestsProps {
  tunnelId: string;
}

type TimeRange = "live" | "1h" | "24h" | "7d" | "30d";

const TIME_RANGES = [
  { value: "live" as TimeRange, label: "Live" },
  { value: "1h" as TimeRange, label: "1h" },
  { value: "24h" as TimeRange, label: "24h" },
  { value: "7d" as TimeRange, label: "7d" },
  { value: "30d" as TimeRange, label: "30d" },
];

export function TunnelRequests({ tunnelId }: TunnelRequestsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [requests, setRequests] = useState<TunnelEvent[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>("live");
  const [isLoading, setIsLoading] = useState(false);
  const { orgSlug } = useParams({ from: "/$orgSlug/tunnels/$tunnelId" });
  const { data: organizations = [] } = authClient.useListOrganizations();
  const activeOrgId = organizations?.find((org) => org.slug === orgSlug)?.id;
  const wsRef = useRef<WebSocket | null>(null);

  const fetchHistoricalRequests = useCallback(
    async (range: TimeRange) => {
      if (!orgSlug || range === "live") return;

      setIsLoading(true);
      try {
        const response = await appClient.requests.list(orgSlug, {
          tunnelId,
          range,
          limit: 100,
          search: searchTerm,
        });
        if ("error" in response) throw new Error(response.error);
        setRequests(response.requests || []);
      } catch (error) {
        console.error("Failed to fetch historical requests:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [orgSlug, searchTerm, tunnelId],
  );

  useEffect(() => {
    if (timeRange === "live") {
      setRequests([]);
    } else {
      const timer = setTimeout(() => {
        void fetchHistoricalRequests(timeRange);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [timeRange, activeOrgId, fetchHistoricalRequests]);

  useEffect(() => {
    if (!activeOrgId || timeRange !== "live") {
      return;
    }

    const wsUrl = import.meta.env.VITE_TUNNEL_URL;
    const ws = new WebSocket(`${wsUrl}/dashboard/events?orgId=${activeOrgId}`);

    ws.onopen = () => {
      wsRef.current = ws;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "history") {
          const tunnelRequests = message.data.filter(
            (request: TunnelEvent) => request.tunnel_id === tunnelId,
          );
          setRequests(tunnelRequests);
        } else if (message.type === "log") {
          if (message.data.tunnel_id === tunnelId) {
            setRequests((prev) => [message.data, ...prev].slice(0, 100));
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message", e);
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };

    return () => {
      ws.close();
    };
  }, [activeOrgId, timeRange, tunnelId]);

  const filteredRequests =
    timeRange === "live"
      ? requests.filter(
          (req) =>
            req.path?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.method?.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : requests;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="flex h-9 max-w-sm flex-1 items-center gap-2 border-b border-white/[0.09] text-zinc-600 transition-colors focus-within:border-white/20 focus-within:text-zinc-400">
          <HugeiconsIcon
            icon={Search01Icon}
            size={15}
            strokeWidth={1.7}
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search method or path"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-300 outline-none placeholder:text-zinc-700"
          />
        </label>

        <div className="flex items-center border-b border-white/[0.07]">
          {TIME_RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTimeRange(value)}
              className={`relative border-b px-3 py-2 text-[11px] font-medium transition-colors ${
                timeRange === value
                  ? "border-accent text-zinc-200"
                  : "border-transparent text-zinc-700 hover:text-zinc-400"
              }`}
            >
              {value === "live" && (
                <span
                  className={`mr-1.5 inline-block size-1.5 rounded-full ${
                    timeRange === "live" ? "bg-emerald-500" : "bg-zinc-700"
                  }`}
                />
              )}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex max-h-150 flex-col overflow-hidden border-y border-white/[0.07]">
        <div className="overflow-auto overscroll-contain">
          <table className="w-full min-w-185 text-left">
            <thead className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#080808]/95 text-[9px] uppercase tracking-[0.1em] text-zinc-700 backdrop-blur-md">
              <tr>
                <th className="w-20 px-4 py-3 font-medium">Status</th>
                <th className="w-20 px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Path</th>
                <th className="w-30 px-4 py-3 font-medium">Client</th>
                <th className="w-24 px-4 py-3 text-right font-medium">
                  Duration
                </th>
                <th className="w-20 px-4 py-3 text-right font-medium">Size</th>
                <th className="w-24 px-4 py-3 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-[11px]">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-14 text-center text-zinc-700"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="size-3.5 animate-spin rounded-full border border-zinc-700 border-t-zinc-300" />
                      Loading requests
                    </div>
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-16 text-center text-zinc-700"
                  >
                    <HugeiconsIcon
                      icon={Activity03Icon}
                      size={22}
                      strokeWidth={1.5}
                      className="mx-auto mb-3"
                      aria-hidden="true"
                    />
                    <p className="text-xs">
                      {timeRange === "live"
                        ? "Waiting for requests"
                        : "No requests found"}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-800">
                      {timeRange === "live"
                        ? "Incoming traffic will appear here in real time."
                        : "Try another time range or search term."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, i) => (
                  <tr
                    key={`${req.tunnel_id}-${req.timestamp}-${i}`}
                    className="group transition-colors hover:bg-white/[0.025]"
                  >
                    <td className="px-4 py-3.5">
                      <span
                        className={`font-medium tabular-nums ${
                          req.status_code >= 500
                            ? "text-red-400"
                            : req.status_code >= 400
                              ? "text-amber-400"
                              : req.status_code >= 300
                                ? "text-sky-400"
                                : "text-emerald-400"
                        }`}
                      >
                        {req.status_code}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3.5 font-mono font-medium ${getHttpMethodColor(req.method)}`}
                    >
                      {req.method}
                    </td>
                    <td
                      className="max-w-80 truncate px-4 py-3.5 font-mono text-zinc-300"
                      title={req.path}
                    >
                      {req.path}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[10px] text-zinc-700">
                      {req.client_ip || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-zinc-500">
                      {req.request_duration_ms}ms
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-zinc-600">
                      {formatBytes(req.bytes_in + req.bytes_out)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-zinc-700">
                      {new Date(req.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
