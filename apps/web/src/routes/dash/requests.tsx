import { createFileRoute } from "@tanstack/react-router";
import { Search, Filter, Download } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { authClient } from "../../lib/auth-client";

export const Route = createFileRoute("/dash/requests")({
  component: RequestsView,
});

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

function RequestsView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [requests, setRequests] = useState<TunnelEvent[]>([]);
  const { data: session } = authClient.useSession();
  const activeOrgId = session?.session.activeOrganizationId;
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;

    const wsUrl = import.meta.env.VITE_TUNNEL_URL;
    const ws = new WebSocket(`${wsUrl}/dashboard/events?orgId=${activeOrgId}`);
    wsRef.current = ws;

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

    return () => {
      ws.close();
    };
  }, [activeOrgId]);

  const filteredRequests = requests.filter(
    (req) =>
      req.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.method.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.host.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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
      <div className="flex items-center justify-between gap-4">
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
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-all">
            <Filter size={16} />
            Filters
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-all">
            <Download size={16} />
            Export
          </button>
        </div>
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
              {filteredRequests.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Waiting for requests...
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, i) => (
                  <tr
                    key={`${req.tunnel_id}-${req.timestamp}-${i}`}
                    className="hover:bg-white/5 transition-colors group"
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
    </div>
  );
}

function formatBytes(bytes: number, decimals = 0) {
  if (!+bytes) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
