import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import Search01Icon from "@outray/icons/stroke/Search01Icon";
import Building03Icon from "@outray/icons/stroke/Building03Icon";
import UserGroupIcon from "@outray/icons/stroke/UserGroupIcon";
import Route03Icon from "@outray/icons/stroke/Route03Icon";
import { appClient } from "@/lib/app-client";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { UsersSkeleton } from "@/components/admin/admin-skeleton";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { Button } from "@/components/arc/button/button";
import { WorkspaceNotice } from "@/components/workspace/workspace-ui";

export const Route = createFileRoute("/admin/organizations/")({
  head: () => ({
    meta: [
      { title: "Admin Organizations - OutRay" },
    ],
  }),
  component: AdminOrganizationsPage,
});

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: Date;
  memberCount: number;
  activeTunnels: number;
  subscription: { plan: string; status: string };
}

const planColors: Record<string, string> = {
  free: "bg-gray-500/10 text-zinc-400 border-gray-500/20",
  ray: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  beam: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pulse: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function AdminOrganizationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "organizations", page, search],
    queryFn: async () => {
      const res = await appClient.admin.organizations({ page, search });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
  });

  if (isLoading && !data) {
    return <UsersSkeleton />;
  }

  const organizations = data?.organizations ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const columns: Column<Organization>[] = [
    {
      key: "name",
      header: "Organization",
      render: (org) => (
        <Link
          to="/admin/organizations/$slug"
          params={{ slug: org.slug }}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {org.logo ? (
            <img
              src={org.logo}
              alt={org.name}
              className="w-8 h-8 rounded-lg"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <HugeiconsIcon icon={Building03Icon} size={14} className="text-zinc-400" />
            </div>
          )}
          <div>
            <div className="font-normal text-zinc-200 hover:text-white">{org.name}</div>
            <div className="text-xs text-zinc-500">/{org.slug}</div>
          </div>
        </Link>
      ),
    },
    {
      key: "subscription",
      header: "Plan",
      render: (org) => (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-normal border capitalize ${
            planColors[org.subscription.plan] || planColors.free
          }`}
        >
          {org.subscription.plan}
        </span>
      ),
    },
    {
      key: "memberCount",
      header: "Members",
      render: (org) => (
        <div className="flex items-center gap-2 text-zinc-400">
          <HugeiconsIcon icon={UserGroupIcon} size={14} />
          {org.memberCount}
        </div>
      ),
    },
    {
      key: "activeTunnels",
      header: "Active tunnels",
      render: (org) => (
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Route03Icon} size={14} className={org.activeTunnels > 0 ? "text-green-400" : "text-zinc-500"} />
          <span className={org.activeTunnels > 0 ? "text-green-400" : "text-zinc-400"}>
            {org.activeTunnels}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (org) => (
        <span className="text-zinc-400">{formatDate(org.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <WorkspacePageHeader appearance="compact" title="Organizations" description={data ? `${total.toLocaleString()} workspaces and their subscriptions.` : "Manage workspaces and their subscriptions."} />
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
          <div className="relative w-full max-w-[320px]">
            <HugeiconsIcon icon={Search01Icon}
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <WorkspaceInput
              size="compact"
              type="text"
              aria-label="Search organizations by name or slug"
              placeholder="Search by name or slug…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="[--workspace-input-padding-left:36px]"
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="md"
          >
            Search
          </Button>
        </form>

      {error ? <WorkspaceNotice message={`Could not load organizations. ${error.message}`} action={<Button type="button" variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>Try again</Button>} /> : null}
      {data ? <AdminDataTable
        columns={columns}
        data={organizations}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={isFetching}
        emptyMessage="No organizations found"
      /> : null}
    </div>
  );
}
