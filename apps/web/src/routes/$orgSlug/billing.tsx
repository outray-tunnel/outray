import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Check, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  SUBSCRIPTION_PLANS,
  getPlanLimits,
  calculatePlanCost,
} from "@/lib/subscription-plans";
import { initiateCheckout, POLAR_PRODUCT_IDS } from "@/lib/polar";
import { authClient, usePermission } from "@/lib/auth-client";
import { useState } from "react";
import { AlertModal } from "@/components/alert-modal";
import { appClient } from "@/lib/app-client";

export const Route = createFileRoute("/$orgSlug/billing")({
  component: BillingView,
  validateSearch: (search?: Record<string, unknown>): { success?: boolean } => {
    return {
      success:
        search?.success === "true" || search?.success === true
          ? true
          : undefined,
    };
  },
});

function BillingView() {
  const { orgSlug } = Route.useParams();
  const { data: orgs } = authClient.useListOrganizations();
  const selectedOrganizationId = orgs?.find((org) => org.slug == orgSlug)?.id;
  const { success } = Route.useSearch();
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "error" | "success" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  const { data: canManageBilling, isPending: isCheckingPermission } =
    usePermission({
      billing: ["manage"],
    });

  const { data: session, isPending: isSessionLoading } =
    authClient.useSession();

  const { data, isLoading } = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return null;
      const response = await appClient.subscriptions.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!selectedOrganizationId && !!canManageBilling && !!orgSlug,
  });

  if (isCheckingPermission) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <Loader2 className="w-8 h-8 animate-spin text-white/20" />
      </div>
    );
  }

  if (!canManageBilling) {
    return (
      <div className="flex flex-col items-center justify-center min-h-100 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <CreditCard className="w-8 h-8 text-gray-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-gray-400 max-w-md">
          You don't have permission to manage billing for this organization.
          Please contact an administrator if you need access.
        </p>
      </div>
    );
  }

  const subscription = data?.subscription;
  const currentPlan = subscription?.plan || "free";
  const planLimits = getPlanLimits(currentPlan as any);
  const monthlyCost = calculatePlanCost(currentPlan as any);

  const handleCheckout = async (plan: "ray" | "beam" | "pulse") => {
    if (isSessionLoading) {
      // Session is still loading, wait a moment and check again
      setAlertState({
        isOpen: true,
        title: "Please Wait",
        message: "Loading your session. Please try again in a moment.",
        type: "info",
      });
      return;
    }

    if (!selectedOrganizationId || !session?.user) {
      setAlertState({
        isOpen: true,
        title: "Authentication Required",
        message: "Please sign in to upgrade your plan",
        type: "error",
      });
      return;
    }

    const productId = POLAR_PRODUCT_IDS[plan];
    if (!productId) {
      setAlertState({
        isOpen: true,
        title: "Configuration Error",
        message: "Product ID not configured. Please contact support.",
        type: "error",
      });
      return;
    }

    try {
      const checkoutUrl = await initiateCheckout(
        productId,
        selectedOrganizationId,
        session.user.email,
        session.user.name || session.user.email,
      );

      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Checkout error:", error);
      setAlertState({
        isOpen: true,
        title: "Checkout Failed",
        message: "Failed to initiate checkout. Please try again.",
        type: "error",
      });
    }
  };

  const handleManageSubscription = () => {
    if (!selectedOrganizationId) return;

    window.location.href = `/api/${orgSlug}/portal/polar`;
  };

  return (
    <div className="max-w-6xl mx-auto">
      {success && (
        <div className="mb-6 bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-accent shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">
              Subscription activated successfully!
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Your plan has been upgraded and is now active.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Billing & Subscription
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Manage your subscription and billing details
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : (
        <>
          <div className="bg-white/2 border border-white/5 rounded-2xl overflow-hidden mb-8">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <CreditCard className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white">
                      Current Plan:{" "}
                      {
                        SUBSCRIPTION_PLANS[
                          currentPlan as keyof typeof SUBSCRIPTION_PLANS
                        ].name
                      }
                    </h3>
                    <p className="text-sm text-gray-500">
                      {subscription?.status === "active"
                        ? "Active subscription"
                        : "No active subscription"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-white">
                    ${monthlyCost}
                  </p>
                  <p className="text-sm text-gray-500">/month</p>
                </div>
              </div>
              {currentPlan !== "free" && (
                <div className="mt-4">
                  <button
                    onClick={handleManageSubscription}
                    className="text-sm text-accent hover:text-accent/80 font-medium transition-colors"
                  >
                    Manage Subscription →
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricBar
                label="Tunnels"
                value={data?.usage?.tunnels}
                limit={planLimits.maxTunnels}
              />
              <MetricBar
                label="Domains"
                value={data?.usage?.domains}
                limit={planLimits.maxDomains}
              />
              <MetricBar
                label="Subdomains"
                value={data?.usage?.subdomains}
                limit={planLimits.maxSubdomains}
              />
              <MetricBar
                label="Members"
                value={data?.usage?.members}
                limit={planLimits.maxMembers}
              />
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-white mb-6">
              Available Plans
            </h3>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {(
                Object.entries(SUBSCRIPTION_PLANS).filter(
                  ([_, plan]) => !("hidden" in plan && plan.hidden),
                ) as [
                  keyof typeof SUBSCRIPTION_PLANS,
                  (typeof SUBSCRIPTION_PLANS)[keyof typeof SUBSCRIPTION_PLANS],
                ][]
              ).map(([key, plan]) => {
                const f = plan.features as {
                  maxTunnels: number;
                  maxDomains: number;
                  maxSubdomains: number;
                  maxMembers: number;
                  bandwidthPerMonth: number;
                  retentionDays: number;
                  customDomains: boolean;
                  prioritySupport: boolean;
                };
                const formatBandwidth = (bytes: number) => {
                  const gb = bytes / (1024 * 1024 * 1024);
                  return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`;
                };
                const features: string[] = [
                  `${f.maxTunnels === -1 ? "Unlimited" : f.maxTunnels} Active Tunnel${f.maxTunnels === 1 ? "" : "s"}`,
                  `${f.maxSubdomains === -1 ? "Unlimited" : f.maxSubdomains} Subdomain${f.maxSubdomains === 1 ? "" : "s"}`,
                  `${f.maxMembers === -1 ? "Unlimited" : f.maxMembers} Team Member${f.maxMembers === 1 ? "" : "s"}`,
                  ...(f.maxDomains !== 0
                    ? [
                        `${f.maxDomains === -1 ? "Unlimited" : f.maxDomains} Custom Domain${f.maxDomains === 1 ? "" : "s"}`,
                      ]
                    : []),
                  `${formatBandwidth(f.bandwidthPerMonth)} Bandwidth`,
                  `${f.retentionDays} Days Retention`,
                  ...(f.prioritySupport ? ["Priority Support"] : []),
                ];
                const descriptions: Record<string, string> = {
                  free: "For testing & experimenting",
                  ray: "For solo devs & tiny teams",
                  beam: "For teams shipping real things",
                  pulse: "For high-scale production",
                };
                return (
                  <PlanCard
                    key={key}
                    name={plan.name}
                    price={plan.price}
                    description={descriptions[key]}
                    features={features}
                    current={currentPlan === key}
                    recommended={key === "beam"}
                    onSelect={
                      key === "free"
                        ? () => {}
                        : () => handleCheckout(key as "ray" | "beam" | "pulse")
                    }
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}

function PlanCard({
  name,
  price,
  description,
  features,
  current,
  recommended,
  onSelect,
}: {
  name: string;
  price: number;
  description: string;
  features: string[];
  current?: boolean;
  recommended?: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col p-8 rounded-3xl border transition-all duration-300 ${
        recommended
          ? "bg-gradient-to-br from-accent/10 via-white/5 to-purple-500/10 border-accent shadow-[0_0_60px_rgba(255,255,255,0.15)] ring-2 ring-accent/30 scale-[1.02]"
          : "bg-[#0c0c0c] border-white/10 hover:border-white/20"
      }`}
    >
      {recommended && (
        <>
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-accent/5 via-transparent to-purple-500/5 pointer-events-none" />
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-gradient-to-r from-accent to-yellow-400 text-black text-xs font-bold rounded-full uppercase tracking-wider shadow-lg shadow-accent/30 flex items-center gap-1.5">
            <span className="animate-pulse">✨</span>
            Recommended
            <span className="animate-pulse">✨</span>
          </div>
        </>
      )}

      <div className="mb-8 relative">
        <h3
          className={`text-xl font-bold mb-2 ${recommended ? "text-accent" : "text-white"}`}
        >
          {name}
        </h3>
        <p className="text-xs text-gray-500 mb-4">{description}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-white">${price}</span>
          <span className="text-white/40">/month</span>
        </div>
      </div>

      <div className="flex-1 space-y-3 mb-8">
        {features.map((feature, index) => (
          <div key={index} className="flex items-center gap-3 text-sm">
            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Check size={12} className="text-white" />
            </div>
            <span className="text-white/80">{feature}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onSelect}
        disabled={current}
        className={`w-full py-3 rounded-full font-bold text-center transition-all ${
          current
            ? "bg-white/10 text-gray-400 cursor-not-allowed"
            : recommended
              ? "bg-gradient-to-r from-accent to-yellow-400 text-black hover:opacity-90 shadow-lg shadow-accent/20"
              : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {current ? "Current Plan" : "Upgrade"}
      </button>
    </div>
  );
}

function MetricBar({
  label,
  value,
  limit,
}: {
  label: string;
  value?: number;
  limit: number;
}) {
  const percentage =
    limit === -1 ? 0 : Math.min(100, Math.max(0, ((value || 0) / limit) * 100));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-medium text-white">
          {value ?? "-"} / {limit === -1 ? "∞" : limit}
        </span>
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
