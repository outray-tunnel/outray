import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import Search01Icon from "@outray/icons/stroke/Search01Icon";
import UserGroupIcon from "@outray/icons/stroke/UserGroupIcon";
import Building03Icon from "@outray/icons/stroke/Building03Icon";
import Calendar03Icon from "@outray/icons/stroke/Calendar03Icon";
import { appClient } from "@/lib/app-client";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { UsersSkeleton } from "@/components/admin/admin-skeleton";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { Button } from "@/components/arc/button/button";
import { WorkspaceNotice } from "@/components/workspace/workspace-ui";

export const Route = createFileRoute("/admin/users/")({
  head: () => ({
    meta: [
      { title: "Admin Users - OutRay" },
    ],
  }),
  component: AdminUsersPage,
});

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  orgCount: number;
  lastActive: Date | null;
}

function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "users", page, search],
    queryFn: async () => {
      const res = await appClient.admin.users({ page, search });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
  });

  if (isLoading && !data) {
    return <UsersSkeleton />;
  }

  const users = data?.users ?? [];
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
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(date);
  };

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "User",
      render: (user) => (
        <Link
          to="/admin/users/$userId"
          params={{ userId: user.id }}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {user.image ? (
            <img
              src={user.image}
              alt={user.name}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <HugeiconsIcon icon={UserGroupIcon} size={14} className="text-zinc-400" />
            </div>
          )}
          <div>
            <div className="font-normal text-zinc-200 hover:text-white">{user.name}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {user.email}
            </div>
          </div>
        </Link>
      ),
    },
    {
      key: "emailVerified",
      header: "Verified",
      render: (user) => (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-normal ${
            user.emailVerified
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
          }`}
        >
          {user.emailVerified ? "Verified" : "Pending"}
        </span>
      ),
    },
    {
      key: "orgCount",
      header: "Organizations",
      render: (user) => (
        <div className="flex items-center gap-2 text-zinc-400">
          <HugeiconsIcon icon={Building03Icon} size={14} />
          {user.orgCount}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (user) => (
        <div className="flex items-center gap-2 text-zinc-400">
          <HugeiconsIcon icon={Calendar03Icon} size={14} />
          {formatDate(user.createdAt)}
        </div>
      ),
    },
    {
      key: "lastActive",
      header: "Last active",
      render: (user) => (
        <span className="text-zinc-400">{formatRelativeTime(user.lastActive)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <WorkspacePageHeader appearance="compact" title="Users" description={data ? `${total.toLocaleString()} people across OutRay.` : "Manage the people using OutRay."} />
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
          <div className="relative w-full max-w-[320px]">
            <HugeiconsIcon icon={Search01Icon}
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <WorkspaceInput
              size="compact"
              type="text"
              aria-label="Search users by name or email"
              placeholder="Search by name or email…"
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

      {error ? <WorkspaceNotice message={`Could not load users. ${error.message}`} action={<Button type="button" variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>Try again</Button>} /> : null}
      {data ? <AdminDataTable
        columns={columns}
        data={users}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={isFetching}
        emptyMessage="No users found"
      /> : null}
    </div>
  );
}
