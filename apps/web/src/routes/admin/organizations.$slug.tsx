import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowLeft01Icon from "@outray/icons/stroke/ArrowLeft01Icon";
import Building03Icon from "@outray/icons/stroke/Building03Icon";
import UserGroupIcon from "@outray/icons/stroke/UserGroupIcon";
import Route03Icon from "@outray/icons/stroke/Route03Icon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import CrownIcon from "@outray/icons/stroke/CrownIcon";
import FloppyDiskIcon from "@outray/icons/stroke/FloppyDiskIcon";
import UserIcon from "@outray/icons/stroke/UserIcon";
import Alert02Icon from "@outray/icons/stroke/Alert02Icon";
import { appClient } from "@/lib/app-client";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/arc/button/button";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { WorkspaceDialog, WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { AdminOrganizationProductUsage } from "@/components/admin/admin-product-usage";

export const Route = createFileRoute("/admin/organizations/$slug")({
  head: () => ({
    meta: [
      { title: "Organization details - OutRay" },
    ],
  }),
  component: AdminOrganizationDetailPage,
});

const PLANS = ["free", "ray", "beam", "pulse", "unlimited"] as const;
const STATUSES = ["active", "cancelled", "past_due", "paused"] as const;

const planColors: Record<string, string> = {
  free: "bg-gray-500/10 text-zinc-400 border-gray-500/20",
  ray: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  beam: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pulse: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  unlimited: "bg-green-500/10 text-green-400 border-green-500/20",
};

type ModalType = "members" | "activeTunnels" | "totalTunnels" | "subdomains" | "domains" | null;

function AdminOrganizationDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "organization", slug],
    queryFn: async () => {
      const res = await appClient.admin.organization(slug);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
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
      const res = await appClient.admin.updateOrganization(slug, updates);
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

  const resetToFreeMutation = useMutation({
    mutationFn: async () => {
      const res = await appClient.admin.resetToFree(slug);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organization", slug] });
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      setPlan("free");
      setStatus("active");
    },
  });

  const handleResetToFree = () => {
    setShowResetModal(true);
  };

  const confirmResetToFree = () => {
    resetToFreeMutation.mutate();
    setShowResetModal(false);
  };

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
        <WorkspacePageHeader appearance="compact" title="Organization details" description="Manage this workspace and its subscription." />
        <WorkspaceNotice message={error ? `Could not load this organization. ${error.message}` : "Organization not found."} action={<Button type="button" variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>Try again</Button>} />
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/organizations" })}><HugeiconsIcon icon={ArrowLeft01Icon} size={14} />All organizations</Button>
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
    <div className="mx-auto max-w-[1100px] space-y-5 text-[13px]">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/admin/organizations" })}
        className="-ml-3"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        All organizations
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {data.organization.logo ? (
            <img src={data.organization.logo} alt={data.organization.name} className="size-10 rounded-xl object-cover" />
          ) : (
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.035]">
              <HugeiconsIcon icon={Building03Icon} size={18} className="text-zinc-400" />
            </div>
          )}
          <WorkspacePageHeader appearance="compact" title={data.organization.name} description={`/${data.organization.slug}`} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data.owner && (
            <Link
              to="/admin/users/$userId"
              params={{ userId: data.owner.id }}
              className="flex items-center gap-2 rounded-xl border border-white/[.08] bg-[#101010] px-3 py-2 transition-colors hover:bg-white/[.04]"
            >
              {data.owner.image ? (
                <img src={data.owner.image} alt={data.owner.name} className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                  <HugeiconsIcon icon={UserIcon} size={12} className="text-zinc-400" />
                </div>
              )}
              <div className="text-left">
                <div className="text-xs text-zinc-500">Owner</div>
                <div className="text-[12px] text-zinc-300">{data.owner.name}</div>
              </div>
            </Link>
          )}
          <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-normal border capitalize ${planColors[data.subscription.plan] || planColors.free}`}>
            {data.subscription.plan}
          </span>
          <Button type="button" size="md" disabled={!hasChanges} loading={updateMutation.isPending} onClick={handleSave}><HugeiconsIcon icon={FloppyDiskIcon} size={15} />Save changes</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Members", value: data.stats.members, icon: UserGroupIcon, modalKey: "members" as const },
          { label: "Active tunnels", value: data.stats.activeTunnels, icon: Route03Icon, modalKey: "activeTunnels" as const },
          { label: "Total tunnels", value: data.stats.totalTunnels, icon: Route03Icon, modalKey: "totalTunnels" as const },
          { label: "Subdomains", value: data.stats.subdomains, icon: Globe02Icon, modalKey: "subdomains" as const },
          { label: "Domains", value: data.stats.domains, icon: Globe02Icon, modalKey: "domains" as const },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => setActiveModal(stat.modalKey)}
            className="group rounded-xl border border-white/[.08] bg-[#101010] p-4 text-left transition-colors hover:border-white/15 hover:bg-white/[.025] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
          >
            <div className="flex items-center gap-2 text-zinc-500 mb-1 group-hover:text-zinc-400">
              <HugeiconsIcon icon={stat.icon} size={14} />
              <span className="text-xs">{stat.label}</span>
            </div>
            <div className="text-[23px] font-normal tabular-nums text-white">{stat.value}</div>
          </button>
        ))}
      </div>

      <AdminOrganizationProductUsage organizationId={data.organization.id} />

      {/* Edit Form */}
      <div className="rounded-xl border border-white/[.08] bg-[#101010] p-5">
        <h2 className="text-[13px] font-normal text-zinc-200 mb-5 flex items-center gap-2">
          <HugeiconsIcon icon={Building03Icon} size={18} />
          Organization details
        </h2>
        <div className="grid max-w-2xl grid-cols-1 gap-4">
          <div>
            <label htmlFor="admin-organization-name" className="mb-2 block text-[12px] text-zinc-400">Name</label>
            <WorkspaceInput id="admin-organization-name" size="compact" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="admin-organization-slug" className="mb-2 block text-[12px] text-zinc-400">Slug</label>
            <WorkspaceInput id="admin-organization-slug" size="compact" type="text" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className="rounded-xl border border-white/[.08] bg-[#101010] p-5">
        <h2 className="text-[13px] font-normal text-zinc-200 mb-5 flex items-center gap-2">
          <HugeiconsIcon icon={CrownIcon} size={18} />
          Subscription
        </h2>
        <div className="grid max-w-2xl grid-cols-1 gap-4">
          <div>
            <label className="mb-2 block text-[12px] text-zinc-400">Plan</label>
            <Select
              value={plan}
              onChange={setPlan}
              options={PLANS.map((planOption) => ({
                value: planOption,
                label: planOption.charAt(0).toUpperCase() + planOption.slice(1),
              }))}
              ariaLabel="Subscription plan"
              triggerClassName="h-9 min-h-9 rounded-2xl bg-[#0b0b0b] px-3.5 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-2 block text-[12px] text-zinc-400">Status</label>
            <Select
              value={status}
              onChange={setStatus}
              options={STATUSES.map((statusOption) => ({
                value: statusOption,
                label: statusOption.charAt(0).toUpperCase() + statusOption.slice(1).replace("_", " "),
              }))}
              ariaLabel="Subscription status"
              triggerClassName="h-9 min-h-9 rounded-2xl bg-[#0b0b0b] px-3.5 text-[13px]"
            />
          </div>
        </div>
        {data.subscription.polarSubscriptionId && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-xs text-zinc-500">Polar Subscription: <span className="text-zinc-400">{data.subscription.polarSubscriptionId}</span></p>
            {data.subscription.currentPeriodEnd && (
              <p className="text-xs text-zinc-500 mt-1">Current Period Ends: <span className="text-zinc-400">{formatDate(data.subscription.currentPeriodEnd)}</span></p>
            )}
          </div>
        )}

        {/* Reset to free Button */}
        {data.subscription.plan !== "free" && (
          <div className="mt-6 pt-6 border-t border-white/5">
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={handleResetToFree}
              loading={resetToFreeMutation.isPending}
            >
              <HugeiconsIcon icon={Alert02Icon} size={14} />
              Reset to free plan
            </Button>
            <p className="text-xs text-zinc-600 mt-2">
              Removes subscription, domains, extra subdomains, and tunnels.
            </p>
          </div>
        )}

        {resetToFreeMutation.isSuccess && (
          <WorkspaceNotice tone="success" message="Organization reset to free plan successfully." />
        )}

        {resetToFreeMutation.isError && (
          <WorkspaceNotice message={resetToFreeMutation.error.message} />
        )}
      </div>

      {updateMutation.isSuccess && (
        <WorkspaceNotice tone="success" message="Organization updated successfully." />
      )}

      {updateMutation.isError && (
        <WorkspaceNotice message={updateMutation.error.message} />
      )}

      {/* Meta Info */}
      <div className="space-y-1 text-[11px] text-zinc-600">
        <p>Created: {formatDate(data.organization.createdAt)}</p>
        <p>Organization ID: {data.organization.id}</p>
      </div>

      {/* Members Modal */}
      {activeModal === "members" && (
        <StatsModal
          title="Members"
          icon={UserGroupIcon}
          onClose={() => setActiveModal(null)}
        >
          {data.members.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No members found</p>
          ) : (
            <div className="space-y-2">
              {data.members.map((member) => (
                <Link
                  key={member.id}
                  to="/admin/users/$userId"
                  params={{ userId: member.userId }}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[.02] rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {member.userImage ? (
                      <img src={member.userImage} alt={member.userName} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <HugeiconsIcon icon={UserIcon} size={14} className="text-zinc-400" />
                      </div>
                    )}
                    <div>
                      <div className="font-normal text-zinc-200">{member.userName}</div>
                      <div className="text-xs text-zinc-500">{member.userEmail}</div>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-normal border capitalize ${
                    member.role === "owner"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : member.role === "admin"
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                      : "bg-gray-500/10 text-zinc-400 border-gray-500/20"
                  }`}>
                    {member.role}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </StatsModal>
      )}

      {/* Active tunnels Modal */}
      {activeModal === "activeTunnels" && (
        <StatsModal
          title="Active tunnels"
          icon={Route03Icon}
          onClose={() => setActiveModal(null)}
        >
          {(() => {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const activeTunnels = data.tunnels.filter(t => t.lastSeenAt && new Date(t.lastSeenAt) >= fiveMinutesAgo);
            if (activeTunnels.length === 0) {
              return <p className="text-zinc-500 text-center py-8">No active tunnels</p>;
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

      {/* Total tunnels Modal */}
      {activeModal === "totalTunnels" && (
        <StatsModal
          title="All tunnels"
          icon={Route03Icon}
          onClose={() => setActiveModal(null)}
        >
          {data.tunnels.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No tunnels found</p>
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
          icon={Globe02Icon}
          onClose={() => setActiveModal(null)}
        >
          {data.subdomains.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No subdomains found</p>
          ) : (
            <div className="space-y-2">
              {data.subdomains.map((subdomain) => (
                <div
                  key={subdomain.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[.02] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <HugeiconsIcon icon={Globe02Icon} size={14} className="text-zinc-400" />
                    </div>
                    <div>
                      <div className="font-normal text-zinc-200 font-mono">{subdomain.subdomain}.outray.io</div>
                      <div className="text-xs text-zinc-500">by {subdomain.userName}</div>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500">{formatDate(subdomain.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </StatsModal>
      )}

      {/* Domains Modal */}
      {activeModal === "domains" && (
        <StatsModal
          title="Custom domains"
          icon={Globe02Icon}
          onClose={() => setActiveModal(null)}
        >
          {data.domains.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No custom domains found</p>
          ) : (
            <div className="space-y-2">
              {data.domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[.02] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <HugeiconsIcon icon={Globe02Icon} size={14} className="text-zinc-400" />
                    </div>
                    <div>
                      <div className="font-normal text-zinc-200 font-mono">{domain.domain}</div>
                      <div className="text-xs text-zinc-500">by {domain.userName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-normal border capitalize ${
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

      <WorkspaceDialog open={showResetModal} onClose={() => setShowResetModal(false)} title="Reset to free plan" description={`Reset ${data.organization.name} and remove paid-plan resources.`} busy={resetToFreeMutation.isPending} size="sm" footer={<>
        <Button type="button" variant="secondary" size="sm" disabled={resetToFreeMutation.isPending} onClick={() => setShowResetModal(false)}>Cancel</Button>
        <Button type="button" variant="danger" size="sm" loading={resetToFreeMutation.isPending} onClick={confirmResetToFree}><HugeiconsIcon icon={Alert02Icon} size={14} />Reset to free</Button>
      </>}>
        <div className="space-y-3 text-[13px] leading-6 text-zinc-400">
          <p>This action cannot be undone. It will:</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Delete all custom domains.</li>
            <li>Remove the current subscription.</li>
            <li>Keep one subdomain and delete the rest.</li>
            <li>Keep two tunnels and close the rest.</li>
          </ul>
        </div>
      </WorkspaceDialog>
    </div>
  );
}

// All resource lists share the workspace dialog's focus and keyboard handling.
function StatsModal({ title, icon, onClose, children }: {
  title: string;
  icon: typeof UserGroupIcon;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return <WorkspaceDialog open onClose={onClose} title={title} size="lg">
    <div className="mb-4 flex items-center gap-2 text-[12px] text-zinc-500"><HugeiconsIcon icon={icon} size={15} />Organization resources</div>
    {children}
  </WorkspaceDialog>;
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
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[.02] rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          isActive ? "bg-green-500/10" : "bg-white/10"
        }`}>
          <HugeiconsIcon icon={Route03Icon} size={14} className={isActive ? "text-green-400" : "text-zinc-400"} />
        </div>
        <div>
          <div className="font-normal text-zinc-200 flex items-center gap-2">
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
          <div className="text-xs text-zinc-500">
            by {tunnel.userName} • {tunnel.remotePort ? `Port ${tunnel.remotePort}` : tunnel.url}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-xs font-medium ${isActive ? "text-green-400" : "text-zinc-500"}`}>
          {isActive ? "Online" : "Offline"}
        </div>
        <div className="text-xs text-zinc-600">{formatDate(tunnel.lastSeenAt)}</div>
      </div>
    </div>
  );
}
