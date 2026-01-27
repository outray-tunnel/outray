import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowLeft, Building2, Users, Network, Globe, Crown, Save, Loader2, X, User } from "lucide-react";
import { appClient } from "@/lib/app-client";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/admin/organizations/$slug")({
  head: () => ({
    meta: [
      { title: "Organization Details - OutRay" },
    ],
  }),
  component: AdminOrganizationDetailPage,
});

const PLANS = ["free", "ray", "beam", "pulse", "unlimited"] as const;
const STATUSES = ["active", "cancelled", "past_due", "paused"] as const;

const planColors: Record<string, string> = {
  free: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  ray: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  beam: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pulse: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  unlimited: "bg-green-500/10 text-green-400 border-green-500/20",
};

type ModalType = "members" | "activeTunnels" | "totalTunnels" | "subdomains" | "domains" | null;

function AdminOrganizationDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const token = useAdminStore((s) => s.token);
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "organization", slug],
    queryFn: async () => {
      const res = await appClient.admin.organization(token!, slug);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    enabled: !!token,
  });

  // Initialize form when data loads
  if (data && !initialized) {
    setName(data.organization.name);
    setOrgSlug(data.organization.slug);
    setPlan(data.subscription.plan);
    setStatus(data.subscription.status);
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async (updates: { name?: string; slug?: string; plan?: string; status?: string }) => {
      const res = await appClient.admin.updateOrganization(token!, slug, updates);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organization", slug] });
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      if (orgSlug !== slug) {
        navigate({ to: "/admin/organizations/$slug", params: { slug: orgSlug } });
      }
    },
  });

  const handleSave = () => {
    const updates: Record<string, string> = {};
    if (name !== data?.organization.name) updates.name = name;
    if (orgSlug !== data?.organization.slug) updates.slug = orgSlug;
    if (plan !== data?.subscription.plan) updates.plan = plan;
    if (status !== data?.subscription.status) updates.status = status;
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const hasChanges = data && (
    name !== data.organization.name ||
    orgSlug !== data.organization.slug ||
    plan !== data.subscription.plan ||
    status !== data.subscription.status
  );

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
        <p className="text-gray-400">Organization not found</p>
      </div>
    );
  }

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate({ to: "/admin/organizations" })}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Organizations
      </button>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {data.organization.logo ? (
            <img src={data.organization.logo} alt={data.organization.name} className="w-12 h-12 rounded-xl" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Building2 size={24} className="text-gray-400" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">{data.organization.name}</h1>
            <p className="text-sm text-gray-500">/{data.organization.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {data.owner && (
            <Link
              to="/admin/users/$userId"
              params={{ userId: data.owner.id }}
              className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              {data.owner.image ? (
                <img src={data.owner.image} alt={data.owner.name} className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                  <User size={12} className="text-gray-400" />
                </div>
              )}
              <div className="text-left">
                <div className="text-xs text-gray-500">Owner</div>
                <div className="text-sm text-white font-medium">{data.owner.name}</div>
              </div>
            </Link>
          )}
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium border capitalize ${planColors[data.subscription.plan] || planColors.free}`}>
            {data.subscription.plan}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Members", value: data.stats.members, icon: Users, modalKey: "members" as const },
          { label: "Active Tunnels", value: data.stats.activeTunnels, icon: Network, modalKey: "activeTunnels" as const },
          { label: "Total Tunnels", value: data.stats.totalTunnels, icon: Network, modalKey: "totalTunnels" as const },
          { label: "Subdomains", value: data.stats.subdomains, icon: Globe, modalKey: "subdomains" as const },
          { label: "Domains", value: data.stats.domains, icon: Globe, modalKey: "domains" as const },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => setActiveModal(stat.modalKey)}
            className="bg-white/2 border border-white/5 rounded-xl p-4 text-left hover:bg-white/5 hover:border-white/10 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2 text-gray-500 mb-1 group-hover:text-gray-400">
              <stat.icon size={14} />
              <span className="text-xs">{stat.label}</span>
            </div>
            <div className="text-xl font-semibold text-white">{stat.value}</div>
          </button>
        ))}
      </div>

      {/* Edit Form */}
      <div className="bg-white/2 border border-white/5 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
          <Building2 size={18} />
          Organization Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Slug</label>
            <input type="text" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20" />
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className="bg-white/2 border border-white/5 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
          <Crown size={18} />
          Subscription
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20">
              {PLANS.map((p) => (
                <option key={p} value={p} className="bg-[#0a0a0a]">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/20">
              {STATUSES.map((s) => (
                <option key={s} value={s} className="bg-[#0a0a0a]">{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>
              ))}
            </select>
          </div>
        </div>
        {data.subscription.polarSubscriptionId && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-xs text-gray-500">Polar Subscription: <span className="text-gray-400">{data.subscription.polarSubscriptionId}</span></p>
            {data.subscription.currentPeriodEnd && (
              <p className="text-xs text-gray-500 mt-1">Current Period Ends: <span className="text-gray-400">{formatDate(data.subscription.currentPeriodEnd)}</span></p>
            )}
          </div>
        )}
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent text-black rounded-xl font-medium hover:bg-accent/90 transition-all disabled:opacity-50">
            {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      )}

      {updateMutation.isSuccess && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
          Organization updated successfully
        </div>
      )}

      {updateMutation.isError && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          Failed to update organization
        </div>
      )}

      {/* Meta Info */}
      <div className="mt-8 pt-6 border-t border-white/5 text-xs text-gray-600">
        <p>Created: {formatDate(data.organization.createdAt)}</p>
        <p>Organization ID: {data.organization.id}</p>
      </div>

      {/* Members Modal */}
      {activeModal === "members" && (
        <StatsModal
          title="Members"
          icon={Users}
          onClose={() => setActiveModal(null)}
        >
          {data.members.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No members found</p>
          ) : (
            <div className="space-y-2">
              {data.members.map((member) => (
                <Link
                  key={member.id}
                  to="/admin/users/$userId"
                  params={{ userId: member.userId }}
                  className="flex items-center justify-between p-3 bg-white/2 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {member.userImage ? (
                      <img src={member.userImage} alt={member.userName} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <User size={14} className="text-gray-400" />
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-white">{member.userName}</div>
                      <div className="text-xs text-gray-500">{member.userEmail}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium border capitalize ${
                    member.role === "owner"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : member.role === "admin"
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                      : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                  }`}>
                    {member.role}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </StatsModal>
      )}

      {/* Active Tunnels Modal */}
      {activeModal === "activeTunnels" && (
        <StatsModal
          title="Active Tunnels"
          icon={Network}
          onClose={() => setActiveModal(null)}
        >
          {(() => {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const activeTunnels = data.tunnels.filter(t => t.lastSeenAt && new Date(t.lastSeenAt) >= fiveMinutesAgo);
            if (activeTunnels.length === 0) {
              return <p className="text-gray-500 text-center py-8">No active tunnels</p>;
            }
            return (
              <div className="space-y-2">
                {activeTunnels.map((tunnel) => (
                  <TunnelItem key={tunnel.id} tunnel={tunnel} formatDate={formatDate} />
                ))}
              </div>
            );
          })()}
        </StatsModal>
      )}

      {/* Total Tunnels Modal */}
      {activeModal === "totalTunnels" && (
        <StatsModal
          title="All Tunnels"
          icon={Network}
          onClose={() => setActiveModal(null)}
        >
          {data.tunnels.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No tunnels found</p>
          ) : (
            <div className="space-y-2">
              {data.tunnels.map((tunnel) => (
                <TunnelItem key={tunnel.id} tunnel={tunnel} formatDate={formatDate} />
              ))}
            </div>
          )}
        </StatsModal>
      )}

      {/* Subdomains Modal */}
      {activeModal === "subdomains" && (
        <StatsModal
          title="Subdomains"
          icon={Globe}
          onClose={() => setActiveModal(null)}
        >
          {data.subdomains.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No subdomains found</p>
          ) : (
            <div className="space-y-2">
              {data.subdomains.map((subdomain) => (
                <div
                  key={subdomain.id}
                  className="flex items-center justify-between p-3 bg-white/2 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <Globe size={14} className="text-gray-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white font-mono">{subdomain.subdomain}.outray.io</div>
                      <div className="text-xs text-gray-500">by {subdomain.userName}</div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{formatDate(subdomain.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </StatsModal>
      )}

      {/* Domains Modal */}
      {activeModal === "domains" && (
        <StatsModal
          title="Custom Domains"
          icon={Globe}
          onClose={() => setActiveModal(null)}
        >
          {data.domains.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No custom domains found</p>
          ) : (
            <div className="space-y-2">
              {data.domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between p-3 bg-white/2 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <Globe size={14} className="text-gray-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white font-mono">{domain.domain}</div>
                      <div className="text-xs text-gray-500">by {domain.userName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium border capitalize ${
                      domain.status === "active"
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : domain.status === "pending"
                        ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}>
                      {domain.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </StatsModal>
      )}
    </div>
  );
}

// Stats Modal Component
function StatsModal({
  title,
  icon: Icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ElementType;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col relative z-10 shadow-2xl"
      >
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Icon size={20} />
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

// Tunnel Item Component
function TunnelItem({
  tunnel,
  formatDate,
}: {
  tunnel: {
    id: string;
    url: string;
    name: string | null;
    protocol: string;
    remotePort: number | null;
    lastSeenAt: Date | null;
    createdAt: Date;
    userId: string;
    userName: string;
    userEmail: string;
  };
  formatDate: (date: Date | string | null) => string;
}) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const isActive = tunnel.lastSeenAt && new Date(tunnel.lastSeenAt) >= fiveMinutesAgo;

  return (
    <div className="flex items-center justify-between p-3 bg-white/2 rounded-xl">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          isActive ? "bg-green-500/10" : "bg-white/10"
        }`}>
          <Network size={14} className={isActive ? "text-green-400" : "text-gray-400"} />
        </div>
        <div>
          <div className="font-medium text-white flex items-center gap-2">
            {tunnel.name || tunnel.url}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
              tunnel.protocol === "http"
                ? "bg-blue-500/10 text-blue-400"
                : tunnel.protocol === "tcp"
                ? "bg-purple-500/10 text-purple-400"
                : "bg-orange-500/10 text-orange-400"
            }`}>
              {tunnel.protocol}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            by {tunnel.userName} • {tunnel.remotePort ? `Port ${tunnel.remotePort}` : tunnel.url}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-xs font-medium ${isActive ? "text-green-400" : "text-gray-500"}`}>
          {isActive ? "Online" : "Offline"}
        </div>
        <div className="text-xs text-gray-600">{formatDate(tunnel.lastSeenAt)}</div>
      </div>
    </div>
  );
}
