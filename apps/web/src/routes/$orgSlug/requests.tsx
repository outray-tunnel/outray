import { createFileRoute } from "@tanstack/react-router";
import { Search, Radio } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { appClient } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useFeatureFlag } from "@/lib/feature-flags";
import {
  type TunnelEvent,
  type TimeRange,
  formatBytes,
  RequestInspectorDrawer,
} from "@/components/requests";

export const Route = createFileRoute("/$orgSlug/requests")({
  component: RequestsView,
});

const TIME_RANGES = [
  { value: "live" as TimeRange, label: "Live", icon: Radio },
  { value: "1h" as TimeRange, label: "1h" },
  { value: "24h" as TimeRange, label: "24h" },
  { value: "7d" as TimeRange, label: "7d" },
  { value: "30d" as TimeRange, label: "30d" },
];

function RequestsView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [requests, setRequests] = useState<TunnelEvent[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>("live");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TunnelEvent | null>(
    null,
  );
  const { orgSlug } = Route.useParams();
  const { data: organizations = [] } = authClient.useListOrganizations();
  const activeOrgId = organizations?.find((org) => org.slug === orgSlug)?.id;
  const wsRef = useRef<WebSocket | null>(null);

  const inspectorEnabled = useFeatureFlag("request_inspector");
  const fullCaptureEnabled = useFeatureFlag("full_capture");

  const activeIndex = TIME_RANGES.findIndex((r) => r.value === timeRange);

  const fetchHistoricalRequests = async (range: TimeRange) => {
    if (!orgSlug || range === "live") return;

    setIsLoading(true);
    try {
      const response = await appClient.requests.list(orgSlug, {
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
  };

  useEffect(() => {
    if (timeRange === "live") {
      setRequests([]);
    } else {
      const timer = setTimeout(() => {
        void fetchHistoricalRequests(timeRange);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [timeRange, activeOrgId, searchTerm, orgSlug]);

  useEffect(() => {
    if (!activeOrgId || timeRange !== "live") {
      return;
    }

    let ws: WebSocket | null = null;
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY_MS = 2000;

    const connectWebSocket = async () => {
      if (cancelled) return;

      try {
        // Fetch a fresh auth token for WebSocket connection
        const tokenResponse = await fetch("/api/dashboard/ws-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orgId: activeOrgId }),
        });

        if (!tokenResponse.ok) {
          console.error("Failed to get WebSocket token:", tokenResponse.status);
          if (!cancelled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
          }
          return;
        }

        const { token } = await tokenResponse.json();

        if (cancelled) return;

        const wsUrl = import.meta.env.VITE_TUNNEL_URL;
        ws = new WebSocket(`${wsUrl}/dashboard/events?token=${token}`);

        ws.onopen = () => {
          wsRef.current = ws;
          reconnectAttempts = 0; // Reset on successful connection
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "history") {
              setRequests(message.data);
            } else if (message.type === "log") {
              setRequests((prev) => [message.data, ...prev].slice(0, 100));
            }
          } catch (e) {
            console.error("Failed to parse WebSocket message", e);
          }
        };

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          // Auto-reconnect if not intentionally cancelled
          if (!cancelled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
          }
        };
      } catch (error) {
        console.error("Failed to connect to WebSocket:", error);
        // Retry on error
        if (!cancelled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
        }
      }
    };

    void connectWebSocket();

    return () => {
      cancelled = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [activeOrgId, timeRange]);

  const filteredRequests =
    timeRange === "live"
      ? requests.filter(
          (req) =>
            req.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.method.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.host.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : requests;

  if (!activeOrgId) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between gap-4 opacity-50 pointer-events-none">
          <div className="relative flex-1 max-w-md">
            <div className="h-10 bg-white/5 rounded-lg w-full" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-24 bg-white/5 rounded-lg" />
            <div className="h-10 w-24 bg-white/5 rounded-lg" />
          </div>
        </div>

        <div className="bg-white/2 border border-white/5 rounded-2xl overflow-hidden">
          <div className="h-10 bg-white/5 border-b border-white/5" />
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-14 border-b border-white/5 flex items-center px-4 gap-4"
            >
              <div className="h-6 w-16 bg-white/5 rounded" />
              <div className="h-4 w-12 bg-white/5 rounded" />
              <div className="h-4 w-48 bg-white/5 rounded flex-1" />
              <div className="h-4 w-24 bg-white/5 rounded" />
              <div className="h-4 w-20 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md group">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-accent transition-colors"
            size={16}
          />
          <input
            type="text"
            placeholder="Search requests by path, method or host..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all"
          />
        </div>

        <div className="relative grid grid-cols-5 items-center bg-white/5 border border-white/10 rounded-xl p-1">
          <div
            className="absolute top-1 bottom-1 left-1 bg-accent rounded-lg transition-all duration-300 ease-out shadow-sm"
            style={{
              width: `calc((100% - 0.5rem) / ${TIME_RANGES.length})`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />

          {TIME_RANGES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value)}
              className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                timeRange === value
                  ? "text-white"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {Icon && (
                <Icon
                  size={14}
                  className={timeRange === value ? "animate-pulse" : ""}
                />
              )}
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2" />
      </div>

      <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-white/5 border-b border-white/5">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Path</th>
                <th className="px-4 py-3 font-medium">Host</th>
                <th className="px-4 py-3 font-medium">Client IP</th>
                <th className="px-4 py-3 font-medium text-right">Duration</th>
                <th className="px-4 py-3 font-medium text-right">Size</th>
                <th className="px-4 py-3 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      Loading requests...
                    </div>
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {timeRange === "live"
                      ? "Waiting for requests..."
                      : "No requests found in this time range"}
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, i) => (
                  <tr
                    key={`${req.tunnel_id}-${req.timestamp}-${i}`}
                    onClick={() => inspectorEnabled && setSelectedRequest(req)}
                    className={`hover:bg-white/5 transition-colors group ${inspectorEnabled ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          req.status_code >= 500
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : req.status_code >= 400
                              ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                              : "bg-green-500/10 text-green-400 border border-green-500/20"
                        }`}
                      >
                        {req.status_code}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-300">
                      {req.method}
                    </td>
                    <td
                      className="px-4 py-3 text-gray-300 max-w-xs truncate"
                      title={req.path}
                    >
                      {req.path}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{req.host}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {req.client_ip}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {req.request_duration_ms}ms
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {formatBytes(req.bytes_in + req.bytes_out)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                      {new Date(req.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RequestInspectorDrawer
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        fullCaptureEnabled={fullCaptureEnabled}
        orgSlug={orgSlug}
      />
    </div>
  );
}
