import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowLeft01Icon from "@outray/icons/stroke/ArrowLeft01Icon";
import UserIcon from "@outray/icons/stroke/UserIcon";
import Route03Icon from "@outray/icons/stroke/Route03Icon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import Building03Icon from "@outray/icons/stroke/Building03Icon";
import Calendar03Icon from "@outray/icons/stroke/Calendar03Icon";
import Shield01Icon from "@outray/icons/stroke/Shield01Icon";
import ComputerIcon from "@outray/icons/stroke/ComputerIcon";
import Key01Icon from "@outray/icons/stroke/Key01Icon";
import FloppyDiskIcon from "@outray/icons/stroke/FloppyDiskIcon";
import Delete02Icon from "@outray/icons/stroke/Delete02Icon";
import { appClient } from "@/lib/app-client";
import { Button } from "@/components/arc/button/button";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { WorkspaceDialog, WorkspaceNotice } from "@/components/workspace/workspace-ui";

export const Route = createFileRoute("/admin/users/$userId")({
  head: () => ({
    meta: [
      { title: "User details - OutRay" },
    ],
  }),
  component: AdminUserDetailPage,
});

function AdminUserDetailPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: async () => {
      const res = await appClient.admin.user(userId);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
  });

  // Initialize form when data loads
  if (data && !initialized) {
    setName(data.user.name);
    setEmail(data.user.email);
    setEmailVerified(data.user.emailVerified);
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async (updates: {
      name?: string;
      email?: string;
      emailVerified?: boolean;
    }) => {
      const res = await appClient.admin.updateUser(userId, updates);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await appClient.admin.deleteUser(userId);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      navigate({ to: "/admin/users" });
    },
  });

  const handleSave = () => {
    const updates: Record<string, any> = {};
    if (name !== data?.user.name) updates.name = name;
    if (email !== data?.user.email) updates.email = email;
    if (emailVerified !== data?.user.emailVerified)
      updates.emailVerified = emailVerified;
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const hasChanges =
    data &&
    (name !== data.user.name ||
      email !== data.user.email ||
      emailVerified !== data.user.emailVerified);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-5 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded mb-8" />
        <div className="space-y-6">
          <div className="h-32 bg-white/5 rounded-2xl" />
          <div className="h-48 bg-white/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-5">
        <WorkspacePageHeader appearance="compact" title="User details" description="Manage this account and its workspace memberships." />
        <WorkspaceNotice message={error ? `Could not load this user. ${error.message}` : "User not found."} action={<Button type="button" variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>Try again</Button>} />
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/users" })}><HugeiconsIcon icon={ArrowLeft01Icon} size={14} />All users</Button>
      </div>
    );
  }

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 text-[13px]">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/admin/users" })}
        className="-ml-3"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        All users
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {data.user.image ? (
            <img
              src={data.user.image}
              alt={data.user.name}
              className="size-10 rounded-full object-cover"
            />
          ) : (
            <div className="grid size-10 shrink-0 place-items-center rounded-full border border-white/[.08] bg-white/[.035]">
              <HugeiconsIcon icon={UserIcon} size={18} className="text-zinc-400" />
            </div>
          )}
          <WorkspacePageHeader appearance="compact" title={data.user.name} description={data.user.email} />
        </div>
        <Button type="button" size="md" loading={updateMutation.isPending} disabled={!hasChanges} onClick={handleSave}>
          <HugeiconsIcon icon={FloppyDiskIcon} size={15} /> Save changes
        </Button>
      </div>

      {updateMutation.isSuccess ? <WorkspaceNotice tone="success" message="User details updated." /> : null}
      {updateMutation.isError ? <WorkspaceNotice message={updateMutation.error.message} /> : null}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Organizations", value: data.stats.organizations, icon: Building03Icon },
          { label: "Active tunnels", value: data.stats.activeTunnels, icon: Route03Icon },
          { label: "Total tunnels", value: data.stats.totalTunnels, icon: Route03Icon },
          { label: "Subdomains", value: data.stats.subdomains, icon: Globe02Icon },
          { label: "Domains", value: data.stats.domains, icon: Globe02Icon },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/[.08] bg-[#101010] p-4"
          >
            <div className="flex items-center gap-2 text-zinc-500 mb-1">
              <HugeiconsIcon icon={stat.icon} size={14} />
              <span className="text-xs">{stat.label}</span>
            </div>
            <div className="text-[23px] font-normal tabular-nums text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Edit Form */}
      <div className="rounded-xl border border-white/[.08] bg-[#101010] p-5">
        <h2 className="text-[13px] font-normal text-zinc-200 mb-5 flex items-center gap-2">
          <HugeiconsIcon icon={UserIcon} size={18} />
          User details
        </h2>
        <div className="grid max-w-2xl grid-cols-1 gap-4">
          <div>
            <label htmlFor="admin-user-name" className="mb-2 block text-[12px] text-zinc-400">Name</label>
            <WorkspaceInput
              id="admin-user-name"
              size="compact"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="admin-user-email" className="mb-2 block text-[12px] text-zinc-400">Email</label>
            <WorkspaceInput
              id="admin-user-email"
              size="compact"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailVerified}
                onChange={(e) => setEmailVerified(e.target.checked)}
                className="size-3.5 rounded border-white/15 bg-white/5 accent-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <span className="text-[13px] text-zinc-300">Email verified</span>
            </label>
          </div>
        </div>
      </div>

      {/* Timestamps & Meta */}
      <div className="rounded-xl border border-white/[.08] bg-[#101010] p-5">
        <h2 className="text-[13px] font-normal text-zinc-200 mb-5 flex items-center gap-2">
          <HugeiconsIcon icon={Calendar03Icon} size={18} />
          Activity
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-xs text-zinc-500">Joined</span>
            <p className="mt-1 text-[13px] text-zinc-300">{formatDate(data.user.createdAt)}</p>
          </div>
          <div>
            <span className="text-xs text-zinc-500">Last updated</span>
            <p className="mt-1 text-[13px] text-zinc-300">{formatDate(data.user.updatedAt)}</p>
          </div>
          <div>
            <span className="text-xs text-zinc-500">Last active</span>
            <p className="mt-1 text-[13px] text-zinc-300">
              {formatRelativeTime(data.stats.lastActive)}
            </p>
          </div>
        </div>
      </div>

      {/* Organizations */}
      {data.memberships.length > 0 && (
        <div className="rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <h2 className="text-[13px] font-normal text-zinc-200 mb-5 flex items-center gap-2">
            <HugeiconsIcon icon={Building03Icon} size={18} />
            Organizations ({data.memberships.length})
          </h2>
          <div className="space-y-3">
            {data.memberships.map((membership) => (
              <Link
                key={membership.id}
                to="/admin/organizations/$slug"
                params={{ slug: membership.organizationSlug }}
                className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[.02] rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {membership.organizationLogo ? (
                    <img
                      src={membership.organizationLogo}
                      alt={membership.organizationName}
                      className="w-8 h-8 rounded-lg"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <HugeiconsIcon icon={Building03Icon} size={14} className="text-zinc-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-normal text-zinc-200">
                      {membership.organizationName}
                    </div>
                    <div className="text-xs text-zinc-500">
                      /{membership.organizationSlug}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-normal border capitalize ${
                    membership.role === "owner"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : membership.role === "admin"
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                      : "bg-gray-500/10 text-zinc-400 border-gray-500/20"
                  }`}
                >
                  {membership.role}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Linked accounts */}
      {data.accounts.length > 0 && (
        <div className="rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <h2 className="text-[13px] font-normal text-zinc-200 mb-5 flex items-center gap-2">
            <HugeiconsIcon icon={Key01Icon} size={18} />
            Linked accounts ({data.accounts.length})
          </h2>
          <div className="space-y-3">
            {data.accounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[.02] rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <HugeiconsIcon icon={Shield01Icon} size={14} className="text-zinc-400" />
                  </div>
                  <span className="text-white capitalize">
                    {account.providerId}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">
                  {formatDate(account.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {data.sessions.length > 0 && (
        <div className="rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <h2 className="text-[13px] font-normal text-zinc-200 mb-5 flex items-center gap-2">
            <HugeiconsIcon icon={ComputerIcon} size={18} />
            Recent sessions ({data.sessions.length})
          </h2>
          <div className="space-y-3">
            {data.sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[.02] rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <HugeiconsIcon icon={ComputerIcon} size={14} className="text-zinc-400" />
                  </div>
                  <div>
                    <div className="text-sm text-white font-mono">
                      {session.ipAddress || "Unknown IP"}
                    </div>
                    <div className="text-xs text-zinc-500 truncate max-w-xs">
                      {session.userAgent
                        ? session.userAgent.substring(0, 50) + "..."
                        : "Unknown device"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-400">
                    {formatRelativeTime(session.updatedAt)}
                  </div>
                  <div
                    className={`text-xs ${
                      new Date(session.expiresAt) > new Date()
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {new Date(session.expiresAt) > new Date()
                      ? "Active"
                      : "Expired"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-400/15 bg-rose-400/[.025] p-5">
        <div>
          <h2 className="text-[13px] text-zinc-200">Delete user</h2>
          <p className="mt-1 text-[12px] text-zinc-500">Permanently remove this account and its memberships.</p>
        </div>
        <Button
          type="button"
          variant="danger"
          size="md"
          onClick={() => setShowDeleteModal(true)}
        >
          <HugeiconsIcon icon={Delete02Icon} size={16} />
          Delete user
        </Button>
      </div>

      {/* Delete Confirmation Modal */}
      <WorkspaceDialog open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete user" description={`Permanently delete ${data.user.name}.`} busy={deleteMutation.isPending} size="sm" footer={<>
        <Button type="button" variant="secondary" size="sm" disabled={deleteMutation.isPending} onClick={() => setShowDeleteModal(false)}>Cancel</Button>
        <Button type="button" variant="danger" size="sm" loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}><HugeiconsIcon icon={Delete02Icon} size={14} />Delete user</Button>
      </>}>
        <p className="text-[13px] leading-6 text-zinc-400">This removes their sessions, organization memberships, and account data. This action cannot be undone.</p>
        {deleteMutation.isError ? <div className="mt-4"><WorkspaceNotice message={deleteMutation.error.message} /></div> : null}
      </WorkspaceDialog>
    </div>
  );
}
