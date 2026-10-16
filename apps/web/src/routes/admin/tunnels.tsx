import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import Search01Icon from "@outray/icons/stroke/Search01Icon";
import Route03Icon from "@outray/icons/stroke/Route03Icon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import Building03Icon from "@outray/icons/stroke/Building03Icon";
import UserCircleIcon from "@outray/icons/stroke/UserCircleIcon";
import Clock01Icon from "@outray/icons/stroke/Clock01Icon";
import Copy01Icon from "@outray/icons/stroke/Copy01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { toast } from "sonner";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { appClient } from "@/lib/app-client";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { AdminStatsCard } from "@/components/admin/admin-stats-card";
import { TunnelsSkeleton } from "@/components/admin/admin-skeleton";

export const Route = createFileRoute("/admin/tunnels")({
  head: () => ({
    meta: [
      { title: "Admin Tunnels - OutRay" },
    ],
  }),
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "tunnels", page, search, protocolFilter, activeOnly],
    queryFn: async () => {
      const res = await appClient.admin.tunnels({
        page,
        search,
        protocol: protocolFilter,
        active: activeOnly,
      });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  if (isLoading && !data) return <TunnelsSkeleton />;
  if (error && !data) return <div className="mx-auto max-w-[1440px] space-y-5"><WorkspacePageHeader appearance="compact" title="Tunnels" description="Live connections and tunnel activity across the platform." /><WorkspaceNotice message={error.message} action={<Button size="sm" variant="ghost" onClick={() => void refetch()} loading={isFetching}>Try again</Button>} /></div>;

  const tunnels = data?.tunnels ?? [];
  const stats = data?.stats;
  const totalPages = data?.totalPages ?? 1;

  const handleSearch = (e: FormEvent) => {
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

  const copyToClipboard = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      setCopiedId(id);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1500);
    } catch { toast.error("Could not copy the tunnel URL."); }
  };

  const columns: Column<Tunnel>[] = [
    {
      key: "url",
      header: "Tunnel",
      render: (tunnel) => {
        const hasProtocol = tunnel.url.startsWith("http://") || tunnel.url.startsWith("https://");
        const fullUrl = hasProtocol ? tunnel.url : `https://${tunnel.url}`;
        const isHttp = tunnel.protocol === "http";
        
        return (
          <div className="flex items-center gap-3">
            <div className={`size-1.5 shrink-0 rounded-full ${tunnel.isOnline ? "bg-emerald-400" : "bg-zinc-600"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-normal text-zinc-200">
                <HugeiconsIcon icon={Globe02Icon} size={14} aria-hidden="true" className="text-zinc-500 flex-shrink-0" />
                {isHttp ? (
                  <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="truncate transition-colors hover:text-white hover:underline">
                    {tunnel.url}
                  </a>
                ) : (
                  <span className="truncate">{tunnel.url}</span>
                )}
                <button
                  onClick={() => void copyToClipboard(tunnel.id, isHttp ? fullUrl : tunnel.url)}
                  className={`grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/[.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8367c7] ${copiedId === tunnel.id ? "text-emerald-400" : "text-zinc-600 hover:text-zinc-200"}`}
                  type="button"
                  aria-label={copiedId === tunnel.id ? "Copied URL" : `Copy ${tunnel.url}`}
                  title="Copy URL"
                >
                  {copiedId === tunnel.id ? <HugeiconsIcon icon={Tick02Icon} size={12} aria-hidden="true" /> : <HugeiconsIcon icon={Copy01Icon} size={12} aria-hidden="true" />}
                </button>
              </div>
              {tunnel.name && <div className="mt-1 text-[11px] text-zinc-500">{tunnel.name}</div>}
            </div>
          </div>
        );
      },
    },
    {
      key: "protocol",
      header: "Protocol",
      render: (tunnel) => (
        <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-normal uppercase ${protocolColors[tunnel.protocol] || protocolColors.http}`}>
          {tunnel.protocol}{tunnel.remotePort && `:${tunnel.remotePort}`}
        </span>
      ),
    },
    {
      key: "orgName",
      header: "Organization",
      render: (tunnel) => (
        <div className="flex items-center gap-2 text-zinc-400">
          <HugeiconsIcon icon={Building03Icon} size={14} aria-hidden="true" />
          {tunnel.orgName || "-"}
        </div>
      ),
    },
    {
      key: "userName",
      header: "User",
      render: (tunnel) => (
        <div className="flex items-center gap-2 text-zinc-400">
          <HugeiconsIcon icon={UserCircleIcon} size={14} aria-hidden="true" />
          <div>
            <div>{tunnel.userName || "-"}</div>
            {tunnel.userEmail && <div className="mt-0.5 text-[11px] text-zinc-600">{tunnel.userEmail}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "lastSeenAt",
      header: "Last seen",
      render: (tunnel) => (
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Clock01Icon} size={14} aria-hidden="true" className="text-zinc-500" />
          <span className={tunnel.isOnline ? "text-emerald-400" : "text-zinc-400"}>
            {formatRelativeTime(tunnel.lastSeenAt)}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <WorkspacePageHeader appearance="compact" title="Tunnels" description="Live connections and tunnel activity across the platform." action={<span className="flex items-center gap-1.5 text-[11px] text-zinc-500"><span className="size-1.5 rounded-full bg-emerald-400" />Updates every 30 seconds</span>} />
      {error && <WorkspaceNotice message={error.message} action={<Button size="sm" variant="ghost" onClick={() => void refetch()} loading={isFetching}>Try again</Button>} />}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <AdminStatsCard title="Active tunnels" value={stats?.active?.toLocaleString() ?? "—"} icon={<HugeiconsIcon icon={Route03Icon} size={17} aria-hidden="true" />} />
        <AdminStatsCard title="Total tunnels" value={stats?.total?.toLocaleString() ?? "—"} icon={<HugeiconsIcon icon={Globe02Icon} size={17} aria-hidden="true" />} />
        <AdminStatsCard title="HTTP tunnels" value={stats ? (stats.byProtocol?.http ?? 0).toLocaleString() : "—"} icon={<HugeiconsIcon icon={Globe02Icon} size={17} aria-hidden="true" />} />
        <AdminStatsCard title="TCP / UDP tunnels" value={stats ? ((stats.byProtocol?.tcp || 0) + (stats.byProtocol?.udp || 0)).toLocaleString() : "—"} icon={<HugeiconsIcon icon={Route03Icon} size={17} aria-hidden="true" />} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <form onSubmit={handleSearch} className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0"><HugeiconsIcon icon={Search01Icon} size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" aria-hidden="true" /><WorkspaceInput size="compact" aria-label="Search tunnels by URL" placeholder="Search tunnels…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="w-full [--workspace-input-padding-left:36px] sm:w-64" /></div>
            <Button type="submit" variant="secondary" size="sm">Search</Button>
          </form>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400"><input type="checkbox" checked={activeOnly} onChange={(event) => { setActiveOnly(event.target.checked); setPage(1); }} className="size-3.5 rounded border-white/15 bg-zinc-900 accent-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8367c7]" />Active only</label>
        </div>
        <SegmentedControl label="Filter tunnels by protocol" options={[{ value: "", label: "All protocols" }, { value: "http", label: "HTTP" }, { value: "tcp", label: "TCP" }, { value: "udp", label: "UDP" }]} value={protocolFilter} onValueChange={(protocol) => { setProtocolFilter(protocol); setPage(1); }} />
      </div>

      <AdminDataTable columns={columns} data={tunnels} page={page} totalPages={totalPages} onPageChange={setPage} isLoading={isFetching} emptyMessage="No tunnels found" />
    </div>
  );
}
