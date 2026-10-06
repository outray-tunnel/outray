import { Search, Zap } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { appClient } from "@/lib/app-client";
import { WorkspaceInput } from "@/components/ui/workspace-input";

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

function formatDuration(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}m`;
  } else if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

interface ProtocolEvent {
  timestamp: string;
  event_type: string;
  connection_id: string;
  client_ip: string;
  client_port: number;
  bytes_in: number;
  bytes_out: number;
  duration_ms: number;
}

interface ProtocolEventsProps {
  tunnelId: string;
  protocol: "tcp" | "udp";
  orgSlug: string;
}

type TimeRange = "1h" | "24h" | "7d" | "30d";

const TIME_RANGES = [
  { value: "1h" as TimeRange, label: "1h" },
  { value: "24h" as TimeRange, label: "24h" },
  { value: "7d" as TimeRange, label: "7d" },
  { value: "30d" as TimeRange, label: "30d" },
];

export function ProtocolEvents({
  tunnelId,
  protocol,
  orgSlug,
}: ProtocolEventsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  const isTcp = protocol === "tcp";
  const activeIndex = TIME_RANGES.findIndex((r) => r.value === timeRange);

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ["protocolEvents", tunnelId, timeRange],
    queryFn: async () => {
      const response = await appClient.stats.protocol(orgSlug, {
        tunnelId,
        range: timeRange,
      });
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });

  const events: ProtocolEvent[] = (data as any)?.recentEvents || [];

  const filteredEvents = events.filter((event) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      event.client_ip.toLowerCase().includes(search) ||
      event.event_type.toLowerCase().includes(search) ||
      event.connection_id?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md group">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-zinc-300 transition-colors"
            size={16}
          />
          <WorkspaceInput
            size="compact"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${isTcp ? "connections" : "packets"}...`}
            aria-label={`Search ${isTcp ? "connections" : "packets"}`}
            style={{ "--workspace-input-padding-left": "40px" } as CSSProperties}
          />
        </div>
        <div className="flex bg-white/5 rounded-xl p-1 relative">
          <div
            className="absolute h-[calc(100%-8px)] bg-white/10 rounded-lg transition-all duration-200 ease-out"
            style={{
              width: `${100 / TIME_RANGES.length}%`,
              left: `calc(${(activeIndex * 100) / TIME_RANGES.length}% + 4px)`,
              top: "4px",
            }}
          />
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`relative z-10 px-4 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                timeRange === range.value
                  ? "text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`bg-white/2 border border-white/5 rounded-2xl overflow-hidden relative ${
          isPlaceholderData ? "opacity-70" : ""
        }`}
      >
        {isLoading && !events.length && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left border-b border-white/5 bg-white/2">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Client</th>
                {isTcp && (
                  <th className="px-4 py-3 font-medium">Connection ID</th>
                )}
                <th className="px-4 py-3 font-medium text-right">Data In</th>
                <th className="px-4 py-3 font-medium text-right">Data Out</th>
                {isTcp && (
                  <th className="px-4 py-3 font-medium text-right">Duration</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length > 0 ? (
                filteredEvents.map((event, i) => (
                  <tr
                    key={i}
                    className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          event.event_type === "connection"
                            ? "bg-blue-500/20 text-blue-400"
                            : event.event_type === "close"
                              ? "bg-red-500/20 text-red-400"
                              : event.event_type === "packet"
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {event.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                      {event.client_ip}:{event.client_port}
                    </td>
                    {isTcp && (
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {event.connection_id?.slice(0, 16) || "-"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-gray-300">
                      {event.bytes_in > 0 ? formatBytes(event.bytes_in) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {event.bytes_out > 0 ? formatBytes(event.bytes_out) : "-"}
                    </td>
                    {isTcp && (
                      <td className="px-4 py-3 text-right text-gray-300">
                        {event.duration_ms > 0
                          ? formatDuration(event.duration_ms)
                          : "-"}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={isTcp ? 7 : 5}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    <Zap size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No {isTcp ? "connections" : "packets"} found</p>
                    <p className="text-xs mt-1 text-gray-600">
                      {searchTerm
                        ? "Try adjusting your search"
                        : `${isTcp ? "TCP connections" : "UDP packets"} will appear here once traffic flows through the tunnel`}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
