import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Network,
  Globe,
  Building2,
  User,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { appClient } from "@/lib/app-client";
import {
  AdminDataTable,
  type Column,
} from "@/components/admin/admin-data-table";
import { AdminStatsCard } from "@/components/admin/admin-stats-card";
import { TunnelsSkeleton } from "@/components/admin/admin-skeleton";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/admin/tunnels")({
  component: AdminTunnelsPage,
});

interface Tunnel {
  id: string;
  url: string;
  name: string | null;
  protocol: string;
  remotePort: number | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  userName: string | null;
  userEmail: string | null;
  orgName: string | null;
  orgSlug: string | null;
  isOnline: boolean;
}

const protocolColors: Record<string, string> = {
  http: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  tcp: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  udp: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function AdminTunnelsPage() {
  const token = useAdminStore((s) => s.token);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "tunnels", page, search, protocolFilter, activeOnly],
    queryFn: async () => {
      const res = await appClient.admin.tunnels(token!, {
        page,
        search,
        protocol: protocolFilter,
        active: activeOnly,
      });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    enabled: !!token,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  if (!token || (isLoading && !data)) {
    return <TunnelsSkeleton />;
  }

  const tunnels = data?.tunnels ?? [];
  const stats = data?.stats;
  const totalPages = data?.totalPages ?? 1;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const formatRelativeTime = (date: Date | string | null) => {
    if (!date) return "Never";
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const columns: Column<Tunnel>[] = [
    {
      key: "url",
      header: "Tunnel",
      render: (tunnel) => {
        const hasProtocol =
          tunnel.url.startsWith("http://") || tunnel.url.startsWith("https://");
        const fullUrl = hasProtocol ? tunnel.url : `https://${tunnel.url}`;
        const isHttp = tunnel.protocol === "http";

        return (
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${tunnel.isOnline ? "bg-green-400" : "bg-gray-500"}`}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white flex items-center gap-2">
                <Globe size={14} className="text-gray-500 flex-shrink-0" />
                {isHttp ? (
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent hover:underline truncate"
                  >
                    {tunnel.url}
                  </a>
                ) : (
                  <span className="truncate">{tunnel.url}</span>
                )}
                <button
                  onClick={() =>
                    copyToClipboard(tunnel.id, isHttp ? fullUrl : tunnel.url)
                  }
                  className={`transition-colors flex-shrink-0 ${copiedId === tunnel.id ? "text-green-400" : "text-gray-500 hover:text-white"}`}
                  title="Copy URL"
                >
                  {copiedId === tunnel.id ? (
                    <Check size={12} />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              </div>
              {tunnel.name && (
                <div className="text-xs text-gray-500">{tunnel.name}</div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "protocol",
      header: "Protocol",
      render: (tunnel) => (
        <span
          className={`px-2 py-1 rounded-lg text-xs font-medium border uppercase ${protocolColors[tunnel.protocol] || protocolColors.http}`}
        >
          {tunnel.protocol}
          {tunnel.remotePort && `:${tunnel.remotePort}`}
        </span>
      ),
    },
    {
      key: "orgName",
      header: "Organization",
      render: (tunnel) => (
        <div className="flex items-center gap-2 text-gray-400">
          <Building2 size={14} />
          {tunnel.orgName || "-"}
        </div>
      ),
    },
    {
      key: "userName",
      header: "User",
      render: (tunnel) => (
        <div className="flex items-center gap-2 text-gray-400">
          <User size={14} />
          <div>
            <div>{tunnel.userName || "-"}</div>
            {tunnel.userEmail && (
              <div className="text-xs text-gray-600">{tunnel.userEmail}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "lastSeenAt",
      header: "Last Seen",
      render: (tunnel) => (
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-gray-500" />
          <span
            className={tunnel.isOnline ? "text-green-400" : "text-gray-400"}
          >
            {formatRelativeTime(tunnel.lastSeenAt)}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Tunnels
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Live tunnel monitoring and management
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <AdminStatsCard
          title="Active Tunnels"
          value={stats?.active?.toLocaleString() || "0"}
          icon={<Network size={20} />}
        />
        <AdminStatsCard
          title="Total Tunnels"
          value={stats?.total?.toLocaleString() || "0"}
          icon={<Globe size={20} />}
        />
        <AdminStatsCard
          title="HTTP Tunnels"
          value={stats?.byProtocol?.http?.toLocaleString() || "0"}
          icon={<Globe size={20} />}
        />
        <AdminStatsCard
          title="TCP/UDP Tunnels"
          value={(
            (stats?.byProtocol?.tcp || 0) + (stats?.byProtocol?.udp || 0)
          ).toLocaleString()}
          icon={<Network size={20} />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="text"
                placeholder="Search by URL..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/20 w-64"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-all"
            >
              Search
            </button>
          </form>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => {
                setActiveOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
            />
            Active only
          </label>
        </div>
        <div className="flex gap-2">
          {["", "http", "tcp", "udp"].map((protocol) => (
            <button
              key={protocol}
              onClick={() => {
                setProtocolFilter(protocol);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${protocolFilter === protocol ? "bg-white/10 text-white" : "text-gray-500 hover:text-white hover:bg-white/5"}`}
            >
              {protocol === "" ? "All" : protocol.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <AdminDataTable
        columns={columns}
        data={tunnels}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={isFetching}
        emptyMessage="No tunnels found"
      />
    </div>
  );
}
