import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  Building2,
  Calendar,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { appClient } from "@/lib/app-client";
import {
  AdminDataTable,
  type Column,
} from "@/components/admin/admin-data-table";
import { AdminStatsCard } from "@/components/admin/admin-stats-card";
import { SubscriptionsSkeleton } from "@/components/admin/admin-skeleton";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/admin/subscriptions")({
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
  free: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  ray: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  beam: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pulse: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  past_due: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  paused: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function AdminSubscriptionsPage() {
  const token = useAdminStore((s) => s.token);
  const [page, setPage] = useState(1);
  const [planFilter, setPlanFilter] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "subscriptions", page, planFilter],
    queryFn: async () => {
      const res = await appClient.admin.subscriptions(token!, {
        page,
        plan: planFilter,
      });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    enabled: !!token,
  });

  if (!token || (isLoading && !data)) {
    return <SubscriptionsSkeleton />;
  }

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
      render: (sub) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <Building2 size={14} className="text-gray-400" />
          </div>
          <div>
            <div className="font-medium text-white">
              {sub.orgName || "Unknown"}
            </div>
            <div className="text-xs text-gray-500">/{sub.orgSlug || "-"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (sub) => (
        <span
          className={`px-2 py-1 rounded-lg text-xs font-medium border capitalize ${
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
            className={`px-2 py-1 rounded-lg text-xs font-medium border capitalize ${
              statusColors[sub.status] || statusColors.active
            }`}
          >
            {sub.status}
          </span>
          {sub.cancelAtPeriodEnd && (
            <span className="text-xs text-yellow-400">(cancelling)</span>
          )}
        </div>
      ),
    },
    {
      key: "currentPeriodEnd",
      header: "Renews",
      render: (sub) => (
        <div className="flex items-center gap-2 text-gray-400">
          <Calendar size={14} />
          {formatDate(sub.currentPeriodEnd)}
        </div>
      ),
    },
    {
      key: "updatedAt",
      header: "Last Updated",
      render: (sub) => (
        <span className="text-gray-400">{formatDate(sub.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Subscriptions
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Revenue and subscription analytics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <AdminStatsCard
          title="Monthly Revenue"
          value={`${stats?.mrr?.toLocaleString() || "0"}`}
          icon={<DollarSign size={20} />}
        />
        <AdminStatsCard
          title="Annual Revenue"
          value={`${stats?.arr?.toLocaleString() || "0"}`}
          icon={<TrendingUp size={20} />}
        />
        <AdminStatsCard
          title="Active Subscriptions"
          value={stats?.totalActive?.toLocaleString() || "0"}
          icon={<CreditCard size={20} />}
        />
        <AdminStatsCard
          title="Recent Changes"
          value={stats?.recentChanges?.toLocaleString() || "0"}
          icon={<Calendar size={20} />}
          subtitle="Last 30 days"
        />
      </div>

      {/* Plan Filter */}
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-gray-500">
          {total.toLocaleString()} total subscriptions
        </div>
        <div className="flex gap-2">
          {["", "free", "ray", "beam", "pulse"].map((plan) => (
            <button
              key={plan}
              onClick={() => {
                setPlanFilter(plan);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                planFilter === plan
                  ? "bg-white/10 text-white"
                  : "text-gray-500 hover:text-white hover:bg-white/5"
              }`}
            >
              {plan === ""
                ? "All"
                : plan.charAt(0).toUpperCase() + plan.slice(1)}
            </button>
          ))}
        </div>
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
