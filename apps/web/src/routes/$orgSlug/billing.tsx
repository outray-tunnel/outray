import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  CreditCardIcon,
  Loading03Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SUBSCRIPTION_PLANS,
  getPlanLimits,
  calculatePlanCost,
  calculatePlanCostNGN,
  type BillingInterval,
} from "@/lib/subscription-plans";
import { initiateCheckout, POLAR_PRODUCT_IDS } from "@/lib/polar";
import { isNigerianUser } from "@/lib/geolocation";
import { authClient, usePermission } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { AlertModal } from "@/components/alert-modal";
import { PaystackSubscriptionModal } from "@/components/paystack-subscription-modal";
import { appClient } from "@/lib/app-client";
import { Button } from "@/components/ui";
import { SlidingToggle } from "@/components/ui/sliding-toggle";
import { WorkspacePageHeader } from "@/components/workspace-page-header";

type Currency = "USD" | "NGN";

export const Route = createFileRoute("/$orgSlug/billing")({
  head: () => ({
    meta: [{ title: "Billing - OutRay" }],
  }),
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
  const selectedOrganizationId = orgs?.find((org) => org.slug === orgSlug)?.id;
  const { success } = Route.useSearch();
  const [showPaystack, setShowPaystack] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("month");
  const [isPaystackLoading, setIsPaystackLoading] = useState(false);
  const [showPaystackModal, setShowPaystackModal] = useState(false);
  const queryClient = useQueryClient();
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

  // Check if user is in Nigeria to show Paystack option
  useEffect(() => {
    isNigerianUser().then((isNigerian) => {
      setShowPaystack(isNigerian);
      // Only set default currency if there's no active subscription
      // (currency will be set based on subscription provider below)
      if (isNigerian && !data?.subscription?.paymentProvider) {
        setCurrency("NGN");
      }
    });
  }, [data?.subscription?.paymentProvider]);

  // Lock currency to match active subscription's provider
  useEffect(() => {
    if (
      data?.subscription?.status === "active" &&
      data?.subscription?.plan !== "free"
    ) {
      if (data.subscription.paymentProvider === "paystack") {
        setCurrency("NGN");
      } else {
        setCurrency("USD");
      }
      // Also sync billing interval with active subscription
      if (data.subscription.billingInterval) {
        setBillingInterval(
          data.subscription.billingInterval as BillingInterval,
        );
      }
    }
  }, [data?.subscription]);

  if (isCheckingPermission) {
    return (
      <div className="flex min-h-100 items-center justify-center text-zinc-700">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={20}
          strokeWidth={1.7}
          className="animate-spin"
        />
      </div>
    );
  }

  if (!canManageBilling) {
    return (
      <div className="flex min-h-100 flex-col items-center justify-center border-y border-white/[0.07] py-12 text-center">
        <HugeiconsIcon
          icon={CreditCardIcon}
          size={27}
          strokeWidth={1.5}
          className="mb-4 text-zinc-700"
        />
        <h2 className="text-sm font-medium text-zinc-300">Billing restricted</h2>
        <p className="mt-2 max-w-md text-xs leading-5 text-zinc-600">
          You don't have permission to manage billing for this organization.
          Please contact an administrator if you need access.
        </p>
      </div>
    );
  }

  const subscription = data?.subscription;
  const currentPlan = subscription?.plan || "free";
  const currentInterval =
    (subscription?.billingInterval as BillingInterval) || "month";
  const planLimits = getPlanLimits(currentPlan as any);
  const isPaystackSubscription = subscription?.paymentProvider === "paystack";
  const hasActiveSubscription =
    currentPlan !== "free" && subscription?.status === "active";

  // Display current subscription cost based on their actual interval
  const currentCostDisplay = isPaystackSubscription
    ? `₦${calculatePlanCostNGN(currentPlan as any, currentInterval).toLocaleString()}`
    : `$${calculatePlanCost(currentPlan as any, currentInterval)}`;
  const intervalLabel = currentInterval === "year" ? "/year" : "/month";

  // Lock currency and interval toggle if user has an active subscription
  const isProviderLocked = hasActiveSubscription;

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

    // Get the correct product ID based on billing interval
    const productKey = billingInterval === "year" ? `${plan}_yearly` : plan;
    const productId =
      POLAR_PRODUCT_IDS[productKey as keyof typeof POLAR_PRODUCT_IDS];
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

    // Check if it's a Paystack subscription
    if (subscription?.paymentProvider === "paystack") {
      setShowPaystackModal(true);
    } else {
      // Redirect to Polar portal for USD subscriptions
      window.location.href = `/api/${orgSlug}/portal/polar`;
    }
  };

  // Handle Paystack checkout
  const handlePaystackCheckout = async (plan: "ray" | "beam" | "pulse") => {
    if (isSessionLoading) {
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

    setIsPaystackLoading(true);

    try {
      // Initialize Paystack transaction with billing interval
      const response = await fetch(
        `/api/checkout/paystack?plan=${plan}&orgSlug=${orgSlug}&interval=${billingInterval}`,
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to initialize payment");
      }

      // Import Paystack popup SDK dynamically
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const popup = new PaystackPop();

      // Open Paystack popup
      popup.resumeTransaction(data.accessCode, {
        onSuccess: async () => {
          // Verify payment and activate subscription
          try {
            const verifyResponse = await fetch(
              "/api/checkout/paystack-verify",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reference: data.reference }),
              },
            );

            const verifyData = await verifyResponse.json();

            if (verifyResponse.ok && verifyData.success) {
              // Redirect to billing with success
              window.location.href = `/${orgSlug}/billing?success=true`;
            } else {
              setAlertState({
                isOpen: true,
                title: "Verification Failed",
                message: verifyData.error || "Failed to verify payment",
                type: "error",
              });
            }
          } catch (error) {
            console.error("Verification error:", error);
            setAlertState({
              isOpen: true,
              title: "Verification Error",
              message:
                "Payment was successful but verification failed. Please contact support.",
              type: "error",
            });
          }
          setIsPaystackLoading(false);
        },
        onCancel: () => {
          setIsPaystackLoading(false);
        },
      });
    } catch (error) {
      console.error("Paystack checkout error:", error);
      setAlertState({
        isOpen: true,
        title: "Checkout Failed",
        message:
          error instanceof Error ? error.message : "Failed to initiate payment",
        type: "error",
      });
      setIsPaystackLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      {success && (
        <aside className="flex items-center gap-3 border-y border-emerald-400/20 py-4">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={16}
            strokeWidth={1.8}
            className="shrink-0 text-emerald-400"
          />
          <div>
            <p className="text-xs font-medium text-zinc-200">
              Subscription activated
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Your plan has been upgraded and is now active.
            </p>
          </div>
        </aside>
      )}

      <WorkspacePageHeader
        title="Billing"
        description="Manage your subscription, usage, and billing preferences."
      />

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center border-y border-white/[0.07] text-zinc-700">
          <HugeiconsIcon
            icon={Loading03Icon}
            size={20}
            strokeWidth={1.7}
            className="animate-spin"
          />
        </div>
      ) : (
        <>
          <section className="border-y border-white/[0.07]">
            <div className="flex flex-col gap-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-zinc-600">
                  <HugeiconsIcon
                    icon={CreditCardIcon}
                    size={15}
                    strokeWidth={1.7}
                  />
                </span>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-700">
                    Current plan
                  </p>
                  <div>
                    <h2 className="mt-1 text-sm font-medium text-zinc-200">
                      {
                        SUBSCRIPTION_PLANS[
                          currentPlan as keyof typeof SUBSCRIPTION_PLANS
                        ].name
                      }
                    </h2>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      {subscription?.status === "active"
                        ? "Active subscription"
                        : "No active subscription"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-2xl font-medium tracking-[-0.04em] text-zinc-200">
                    {currentCostDisplay}
                </p>
                <p className="mt-1 text-[10px] text-zinc-700">
                  {intervalLabel}
                </p>
              </div>
              {currentPlan !== "free" && (
                <button
                  type="button"
                  onClick={handleManageSubscription}
                  className="flex w-fit items-center gap-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:text-white"
                >
                  Manage subscription
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    size={12}
                    strokeWidth={1.7}
                  />
                </button>
              )}
            </div>

            <div className="grid border-t border-white/[0.07] sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.07]">
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
          </section>

          <section>
            <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-sm font-medium text-zinc-300">
                  Available plans
                </h2>
                <p className="mt-1 text-[11px] text-zinc-600">
                  Choose capacity that matches your workload.
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
                {/* Billing Interval Toggle */}
                <SlidingToggle
                  options={[
                    {
                      value: "month" as const,
                      label: "Monthly",
                      activeColor: "bg-white",
                      activeTextColor: "text-black",
                    },
                    {
                      value: "year" as const,
                      label: (
                        <span className="flex items-center gap-1.5">
                          Yearly
                          <span className="text-[9px] text-emerald-400">
                            Save 2 months
                          </span>
                        </span>
                      ),
                      activeColor: "bg-accent",
                      activeTextColor: "text-white",
                    },
                  ]}
                  value={billingInterval}
                  onChange={setBillingInterval}
                  disabled={isProviderLocked}
                />
                {/* Currency Toggle (for Nigerian users) */}
                {showPaystack && (
                  <SlidingToggle
                    options={[
                      {
                        value: "USD" as const,
                        label: "USD",
                        activeColor: "bg-white",
                        activeTextColor: "text-black",
                      },
                      {
                        value: "NGN" as const,
                        label: "NGN",
                        activeColor: "bg-green-600",
                        activeTextColor: "text-white",
                      },
                    ]}
                    value={currency}
                    onChange={setCurrency}
                    disabled={isProviderLocked}
                  />
                )}
              </div>
            </div>
            {isProviderLocked && (
              <p className="mb-4 text-right text-[10px] text-zinc-700">
                Cancel your current subscription to change billing options
              </p>
            )}
            <div className="grid border-y border-white/[0.07] md:grid-cols-2 md:divide-x md:divide-white/[0.07] xl:grid-cols-4">
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
                    planKey={key}
                    currentPlanKey={currentPlan}
                    name={plan.name}
                    priceUSD={
                      billingInterval === "year" ? plan.priceYearly : plan.price
                    }
                    priceNGN={
                      billingInterval === "year"
                        ? plan.priceNGNYearly
                        : plan.priceNGN
                    }
                    description={descriptions[key]}
                    features={features}
                    current={
                      currentPlan === key && currentInterval === billingInterval
                    }
                    recommended={key === "beam"}
                    currency={currency}
                    billingInterval={billingInterval}
                    isLoading={isPaystackLoading}
                    onSelect={
                      key === "free"
                        ? () => {}
                        : currency === "NGN"
                          ? () =>
                              handlePaystackCheckout(
                                key as "ray" | "beam" | "pulse",
                              )
                          : () =>
                              handleCheckout(key as "ray" | "beam" | "pulse")
                    }
                  />
                );
              })}
            </div>
          </section>
        </>
      )}

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />

      <PaystackSubscriptionModal
        isOpen={showPaystackModal}
        onClose={() => setShowPaystackModal(false)}
        subscription={subscription ?? null}
        orgSlug={orgSlug}
        onSubscriptionUpdated={() => {
          queryClient.invalidateQueries({
            queryKey: ["subscription", orgSlug],
          });
        }}
      />
    </div>
  );
}

// Plan tier order for upgrade/downgrade comparison
const PLAN_TIERS: Record<string, number> = {
  free: 0,
  ray: 1,
  beam: 2,
  pulse: 3,
};

function PlanCard({
  planKey,
  currentPlanKey,
  name,
  priceUSD,
  priceNGN,
  description,
  features,
  current,
  recommended,
  currency,
  billingInterval,
  isLoading,
  onSelect,
}: {
  planKey: string;
  currentPlanKey: string;
  name: string;
  priceUSD: number;
  priceNGN: number;
  description: string;
  features: string[];
  current?: boolean;
  recommended?: boolean;
  currency: Currency;
  billingInterval: BillingInterval;
  isLoading?: boolean;
  onSelect: () => void;
}) {
  const isFree = priceUSD === 0;
  const displayPrice = currency === "NGN" ? priceNGN : priceUSD;
  const currencySymbol = currency === "NGN" ? "₦" : "$";
  const formattedPrice =
    currency === "NGN" ? displayPrice.toLocaleString() : displayPrice;
  const isDowngrade = PLAN_TIERS[planKey] < PLAN_TIERS[currentPlanKey];
  const intervalLabel = billingInterval === "year" ? "/year" : "/month";

  return (
    <div
      className={`relative flex flex-col border-b border-white/[0.07] px-5 py-6 transition-colors last:border-b-0 md:border-b-0 xl:px-6 ${
        recommended ? "bg-white/[0.025]" : "hover:bg-white/[0.015]"
      }`}
    >
      {recommended && (
        <div className="absolute right-5 top-6 text-[9px] font-medium uppercase tracking-[0.08em] text-accent">
          Recommended
        </div>
      )}

      <div className="relative mb-7">
        <h3 className="text-sm font-medium text-zinc-200">{name}</h3>
        <p className="mb-5 mt-1 text-[11px] text-zinc-600">{description}</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-medium tracking-[-0.045em] text-white">
            {currencySymbol}
            {formattedPrice}
          </span>
          <span className="text-[10px] text-zinc-700">{intervalLabel}</span>
        </div>
      </div>

      <div className="mb-7 flex-1 space-y-3">
        {features.map((feature, index) => (
          <div key={index} className="flex items-center gap-2.5 text-[11px]">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={13}
              strokeWidth={1.7}
              className="shrink-0 text-zinc-700"
            />
            <span className="text-zinc-500">{feature}</span>
          </div>
        ))}
      </div>

      <Button
        onClick={onSelect}
        disabled={current || isFree || isLoading}
        variant={
          current || isFree ? "secondary" : recommended ? "primary" : "primary"
        }
        className={`w-full !rounded-md py-2.5 text-xs font-medium ${
          current || isFree
            ? ""
            : recommended
              ? "!bg-accent hover:!bg-accent/90 !text-white"
              : ""
        }`}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={14}
              strokeWidth={1.7}
              className="animate-spin"
            />
            Processing...
          </span>
        ) : current ? (
          "Current Plan"
        ) : isFree ? (
          "Free"
        ) : isDowngrade ? (
          "Downgrade"
        ) : (
          "Upgrade"
        )}
      </Button>
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
    <div className="border-b border-white/[0.07] py-5 last:border-b-0 sm:px-5 lg:border-b-0 lg:px-6 first:pl-0">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          {label}
        </span>
        <span className="text-[10px] font-medium text-zinc-500">
          {value ?? "-"} / {limit === -1 ? "∞" : limit}
        </span>
      </div>
      <div className="h-px w-full bg-white/[0.07]">
        <div
          className="h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
