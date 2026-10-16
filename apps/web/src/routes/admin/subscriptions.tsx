import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import WalletCardsIcon from "@outray/icons/stroke/WalletCardsIcon";
import Activity03Icon from "@outray/icons/stroke/Activity03Icon";
import Clock01Icon from "@outray/icons/stroke/Clock01Icon";
import ArrowUpRight01Icon from "@outray/icons/stroke/ArrowUpRight01Icon";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { appClient } from "@/lib/app-client";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { AdminStatsCard } from "@/components/admin/admin-stats-card";
import { SubscriptionsSkeleton } from "@/components/admin/admin-skeleton";

export const Route = createFileRoute("/admin/subscriptions")({
  head: () => ({
    meta: [
      { title: "Admin Subscriptions - OutRay" },
    ],
  }),
  component: AdminSubscriptionsPage,
});

interface Subscription {
  id: string;
  organizationId: string;
  plan: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
  orgName: string | null;
  orgSlug: string | null;
}

const planColors: Record<string, string> = {
  free: "bg-gray-500/10 text-zinc-400 border-gray-500/20",
  ray: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  beam: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pulse: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  unlimited: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  canceled: "bg-red-500/10 text-red-400 border-red-500/20",
  past_due: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  paused: "bg-gray-500/10 text-zinc-400 border-gray-500/20",
};

function AdminSubscriptionsPage() {
  const [page, setPage] = useState(1);
  const [planFilter, setPlanFilter] = useState("");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "subscriptions", page, planFilter],
    queryFn: async () => {
      const res = await appClient.admin.subscriptions({ page, plan: planFilter });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
  });

  if (isLoading && !data) return <SubscriptionsSkeleton />;
  if (error && !data) return <div className="mx-auto max-w-[1440px] space-y-5"><WorkspacePageHeader appearance="compact" title="Subscriptions" description="Plans, renewals, and recurring revenue across the platform." /><WorkspaceNotice message={error.message} action={<Button size="sm" variant="ghost" onClick={() => void refetch()} loading={isFetching}>Try again</Button>} /></div>;

  const subscriptions = data?.subscriptions ?? [];
  const stats = data?.stats;
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const columns: Column<Subscription>[] = [
    {
      key: "orgName",
      header: "Organization",
      render: (sub) => {
        const content = <><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[.07] bg-white/[.03] text-[12px] text-zinc-400">{(sub.orgName || "?").charAt(0).toUpperCase()}</span><div className="min-w-0"><div className="truncate text-[13px] text-zinc-200">{sub.orgName || "Unknown organization"}</div><div className="mt-0.5 text-[11px] text-zinc-500">/{sub.orgSlug || "—"}</div></div></>;
        return sub.orgSlug ? <Link to="/admin/organizations/$slug" params={{ slug: sub.orgSlug }} className="group flex items-center gap-3 transition-opacity hover:opacity-80">{content}</Link> : <div className="flex items-center gap-3">{content}</div>;
      },
    },
    {
      key: "plan",
      header: "Plan",
      render: (sub) => (
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-normal capitalize ${
            planColors[sub.plan] || planColors.free
          }`}
        >
          {sub.plan}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (sub) => (
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-normal capitalize ${
              statusColors[sub.status] || statusColors.paused
            }`}
          >
            {sub.status.replaceAll("_", " ")}
          </span>
          {sub.cancelAtPeriodEnd && (
            <span className="text-[11px] text-amber-400">(cancelling)</span>
          )}
        </div>
      ),
    },
    {
      key: "currentPeriodEnd",
      header: "Renews",
      render: (sub) => (
        <div className="flex items-center gap-2 text-zinc-400">
          <HugeiconsIcon icon={Clock01Icon} size={13} className="text-zinc-600" aria-hidden="true" />
          {formatDate(sub.currentPeriodEnd)}
        </div>
      ),
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (sub) => (
        <span className="text-zinc-400">{formatDate(sub.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <WorkspacePageHeader appearance="compact" title="Subscriptions" description="Plans, renewals, and recurring revenue across the platform." />
      {error && <WorkspaceNotice message={error.message} action={<Button size="sm" variant="ghost" onClick={() => void refetch()} loading={isFetching}>Try again</Button>} />}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <AdminStatsCard
          title="Monthly revenue"
          value={stats?.mrr?.toLocaleString() ?? "—"}
          icon={<HugeiconsIcon icon={WalletCardsIcon} size={17} aria-hidden="true" />}
        />
        <AdminStatsCard
          title="Annual revenue"
          value={stats?.arr?.toLocaleString() ?? "—"}
          icon={<HugeiconsIcon icon={ArrowUpRight01Icon} size={17} aria-hidden="true" />}
        />
        <AdminStatsCard
          title="Active subscriptions"
          value={stats?.totalActive?.toLocaleString() ?? "—"}
          icon={<HugeiconsIcon icon={Activity03Icon} size={17} aria-hidden="true" />}
        />
        <AdminStatsCard
          title="Recent changes"
          value={stats?.recentChanges?.toLocaleString() ?? "—"}
          icon={<HugeiconsIcon icon={Clock01Icon} size={17} aria-hidden="true" />}
          subtitle="Last 30 days"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-zinc-500">{total.toLocaleString()} {total === 1 ? "subscription" : "subscriptions"}</p>
        <SegmentedControl label="Filter subscriptions by plan" options={["", "free", "ray", "beam", "pulse", "unlimited"].map((plan) => ({ value: plan, label: plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "All plans" }))} value={planFilter} onValueChange={(plan) => { setPlanFilter(plan); setPage(1); }} />
      </div>

      <AdminDataTable
        columns={columns}
        data={subscriptions}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={isFetching}
        emptyMessage="No subscriptions found"
      />
    </div>
  );
}
