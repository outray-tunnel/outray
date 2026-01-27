import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  User,
  Network,
  Globe,
  Building2,
  Mail,
  Calendar,
  Shield,
  Monitor,
  Key,
  Save,
  Loader2,
  Trash2,
} from "lucide-react";
import { appClient } from "@/lib/app-client";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/admin/users/$userId")({
  head: () => ({
    meta: [
      { title: "User Details - OutRay" },
    ],
  }),
  component: AdminUserDetailPage,
});

function AdminUserDetailPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const token = useAdminStore((s) => s.token);
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: async () => {
      const res = await appClient.admin.user(token!, userId);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    enabled: !!token,
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
      const res = await appClient.admin.updateUser(token!, userId, updates);
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
      const res = await appClient.admin.deleteUser(token!, userId);
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

  if (!token || isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse">
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
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-400">User not found</p>
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
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate({ to: "/admin/users" })}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Users
      </button>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {data.user.image ? (
            <img
              src={data.user.image}
              alt={data.user.name}
              className="w-14 h-14 rounded-full"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
              <User size={28} className="text-gray-400" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">{data.user.name}</h1>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Mail size={12} />
              {data.user.email}
            </p>
          </div>
        </div>
        <span
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
            data.user.emailVerified
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
          }`}
        >
          {data.user.emailVerified ? "Verified" : "Pending Verification"}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Organizations", value: data.stats.organizations, icon: Building2 },
          { label: "Active Tunnels", value: data.stats.activeTunnels, icon: Network },
          { label: "Total Tunnels", value: data.stats.totalTunnels, icon: Network },
          { label: "Subdomains", value: data.stats.subdomains, icon: Globe },
          { label: "Domains", value: data.stats.domains, icon: Globe },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white/2 border border-white/5 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <stat.icon size={14} />
              <span className="text-xs">{stat.label}</span>
            </div>
            <div className="text-xl font-semibold text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Edit Form */}
      <div className="bg-white/2 border border-white/5 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
          <User size={18} />
          User Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20"
            />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailVerified}
                onChange={(e) => setEmailVerified(e.target.checked)}
                className="w-5 h-5 rounded border-white/10 bg-white/5 text-accent focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-gray-300">Email Verified</span>
            </label>
          </div>
        </div>
      </div>

      {/* Timestamps & Meta */}
      <div className="bg-white/2 border border-white/5 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
          <Calendar size={18} />
          Activity
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-xs text-gray-500">Joined</span>
            <p className="text-white mt-1">{formatDate(data.user.createdAt)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Last Updated</span>
            <p className="text-white mt-1">{formatDate(data.user.updatedAt)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Last Active</span>
            <p className="text-white mt-1">
              {formatRelativeTime(data.stats.lastActive)}
            </p>
          </div>
        </div>
      </div>

      {/* Organizations */}
      {data.memberships.length > 0 && (
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
            <Building2 size={18} />
            Organizations ({data.memberships.length})
          </h2>
          <div className="space-y-3">
            {data.memberships.map((membership) => (
              <Link
                key={membership.id}
                to="/admin/organizations/$slug"
                params={{ slug: membership.organizationSlug }}
                className="flex items-center justify-between p-3 bg-white/2 rounded-xl hover:bg-white/5 transition-colors"
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
                      <Building2 size={14} className="text-gray-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-white">
                      {membership.organizationName}
                    </div>
                    <div className="text-xs text-gray-500">
                      /{membership.organizationSlug}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-medium border capitalize ${
                    membership.role === "owner"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : membership.role === "admin"
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                      : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                  }`}
                >
                  {membership.role}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Linked Accounts */}
      {data.accounts.length > 0 && (
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
            <Key size={18} />
            Linked Accounts ({data.accounts.length})
          </h2>
          <div className="space-y-3">
            {data.accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 bg-white/2 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Shield size={14} className="text-gray-400" />
                  </div>
                  <span className="text-white capitalize">
                    {account.providerId}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDate(account.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {data.sessions.length > 0 && (
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
            <Monitor size={18} />
            Recent Sessions ({data.sessions.length})
          </h2>
          <div className="space-y-3">
            {data.sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 bg-white/2 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Monitor size={14} className="text-gray-400" />
                  </div>
                  <div>
                    <div className="text-sm text-white font-mono">
                      {session.ipAddress || "Unknown IP"}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">
                      {session.userAgent
                        ? session.userAgent.substring(0, 50) + "..."
                        : "Unknown device"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">
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
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors"
        >
          <Trash2 size={16} />
          Delete User
        </button>

        <button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all ${
            hasChanges
              ? "bg-white text-black hover:bg-gray-200"
              : "bg-white/10 text-gray-500 cursor-not-allowed"
          }`}
        >
          {updateMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Save Changes
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-2">Delete User</h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to delete <strong>{data.user.name}</strong>?
              This action cannot be undone and will remove all their data
              including sessions and organization memberships.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
              >
                {deleteMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
