import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Mail, Building2, Calendar } from "lucide-react";
import { appClient } from "@/lib/app-client";
import {
  AdminDataTable,
  type Column,
} from "@/components/admin/admin-data-table";
import { UsersSkeleton } from "@/components/admin/admin-skeleton";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/admin/users")({
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
  const token = useAdminStore((s) => s.token);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "users", page, search],
    queryFn: async () => {
      const res = await appClient.admin.users(token!, { page, search });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    enabled: !!token,
  });

  if (!token || (isLoading && !data)) {
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
        <div className="flex items-center gap-3">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Users size={14} className="text-gray-400" />
            </div>
          )}
          <div>
            <div className="font-medium text-white">{user.name}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <Mail size={10} />
              {user.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "emailVerified",
      header: "Verified",
      render: (user) => (
        <span
          className={`px-2 py-1 rounded-lg text-xs font-medium ${
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
        <div className="flex items-center gap-2 text-gray-400">
          <Building2 size={14} />
          {user.orgCount}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (user) => (
        <div className="flex items-center gap-2 text-gray-400">
          <Calendar size={14} />
          {formatDate(user.createdAt)}
        </div>
      ),
    },
    {
      key: "lastActive",
      header: "Last Active",
      render: (user) => (
        <span className="text-gray-400">
          {formatRelativeTime(user.lastActive)}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Users
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString()} total users
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              placeholder="Search by name or email..."
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
      </div>

      <AdminDataTable
        columns={columns}
        data={users}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={isFetching}
        emptyMessage="No users found"
      />
    </div>
  );
}
