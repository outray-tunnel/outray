import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BillingInterval } from "@/lib/subscription-plans";
import { initiateCheckout, POLAR_PRODUCT_IDS } from "@/lib/polar";
import { isNigerianUser } from "@/lib/geolocation";
import { authClient, usePermission } from "@/lib/auth-client";
import { PaystackSubscriptionModal } from "@/components/paystack-subscription-modal";
import { appClient } from "@/lib/app-client";
import { Button as ArcButton } from "@/components/arc/button/button";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceEmptyState, WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { BillingContent, BillingSkeleton } from "@/components/workspace/billing-content";
import type { BillingCurrency, BillingSubscription, PaidBillingPlan } from "@/components/workspace/billing-state";

export const Route = createFileRoute("/$orgSlug/billing")({
  head: () => ({ meta: [{ title: "Billing - OutRay" }] }),
  component: BillingView,
  validateSearch: (search?: Record<string, unknown>): { success?: boolean } => ({ success: search?.success === "true" || search?.success === true ? true : undefined }),
});

function BillingView() {
  const { orgSlug } = Route.useParams();
  const { success } = Route.useSearch();
  return <BillingWorkspace key={orgSlug} orgSlug={orgSlug} success={success} />;
}

function BillingWorkspace({ orgSlug, success }: { orgSlug: string; success?: boolean }) {
  const { data: orgs, isPending: isOrganizationsPending } = authClient.useListOrganizations();
  const selectedOrganizationId = orgs?.find(org => org.slug === orgSlug)?.id;
  const [showPaystack, setShowPaystack] = useState(false);
  const [currency, setCurrency] = useState<BillingCurrency>("USD");
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  const [checkoutPlan, setCheckoutPlan] = useState<PaidBillingPlan | null>(null);
  const [showPaystackModal, setShowPaystackModal] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "info" } | null>(null);
  const checkoutBusy = useRef(false);
  const mounted = useRef(true);
  const queryClient = useQueryClient();
  const { data: canManageBilling, isPending: isCheckingPermission } = usePermission({ billing: ["manage"] });
  const { data: session, isPending: isSessionLoading } = authClient.useSession();
  const query = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () => {
      const response = await appClient.subscriptions.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!selectedOrganizationId && !!canManageBilling && !!orgSlug,
  });
  const subscription = (query.data?.subscription ?? null) as BillingSubscription | null;
  const provider = subscription?.paymentProvider;
  const providerLocked = subscription?.plan !== "free" && subscription?.status === "active";
  const effectiveCurrency = providerLocked ? provider === "paystack" ? "NGN" : "USD" : currency;
  const effectiveInterval = providerLocked ? subscription?.billingInterval === "year" ? "year" : "month" : billingInterval;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    void isNigerianUser().then(isNigerian => {
      if (!alive) return;
      setShowPaystack(isNigerian);
      if (isNigerian && !provider) setCurrency("NGN");
    }).catch(() => { /* USD checkout remains available when geolocation is unavailable. */ });
    return () => { alive = false; };
  }, [provider]);

  const finishCheckout = () => {
    checkoutBusy.current = false;
    if (mounted.current) setCheckoutPlan(null);
  };
  const reportCheckoutError = (message: string) => {
    if (mounted.current) setNotice({ message, tone: "error" });
  };

  const handleCheckout = async (plan: PaidBillingPlan) => {
    // Synchronous guarding also covers repeated clicks before React commits
    // and remains active through the Paystack popup and verification.
    if (checkoutBusy.current) return;
    if (isSessionLoading) { setNotice({ message: "Your session is still loading. Please try again in a moment.", tone: "info" }); return; }
    if (!selectedOrganizationId || !session?.user || !canManageBilling) { reportCheckoutError("Please sign in with billing access to change this plan."); return; }
    if (!query.data || query.isError) { reportCheckoutError("Refresh your subscription details before starting checkout."); return; }
    if (effectiveCurrency === "NGN" && !showPaystack && provider !== "paystack") { reportCheckoutError("NGN checkout is available to customers in Nigeria."); return; }
    checkoutBusy.current = true;
    setCheckoutPlan(plan);
    setNotice(null);
    if (effectiveCurrency === "USD") {
      const productKey = effectiveInterval === "year" ? `${plan}_yearly` : plan;
      const productId = POLAR_PRODUCT_IDS[productKey as keyof typeof POLAR_PRODUCT_IDS];
      if (!productId) { reportCheckoutError("This checkout is not configured yet. Please contact support."); finishCheckout(); return; }
      try {
        const checkoutUrl = await initiateCheckout(productId, selectedOrganizationId, session.user.email, session.user.name || session.user.email);
        if (!mounted.current) { finishCheckout(); return; }
        window.location.href = checkoutUrl;
      } catch { reportCheckoutError("Couldn't open checkout. Please try again."); finishCheckout(); }
      return;
    }
    try {
      const response = await fetch(`/api/checkout/paystack?plan=${plan}&orgSlug=${orgSlug}&interval=${effectiveInterval}`);
      const transaction = await response.json();
      if (!response.ok || !transaction.success) throw new Error(transaction.error || "Failed to initialize payment");
      if (!mounted.current) { finishCheckout(); return; }
      const PaystackPop = (await import("@paystack/inline-js")).default;
      if (!mounted.current) { finishCheckout(); return; }
      new PaystackPop().resumeTransaction(transaction.accessCode, {
        onSuccess: async () => {
          try {
            const response = await fetch("/api/checkout/paystack-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: transaction.reference }) });
            const result = await response.json();
            if (response.ok && result.success) {
              if (mounted.current) window.location.href = `/${orgSlug}/billing?success=true`;
            } else reportCheckoutError(result.error || "Payment verification failed. Please contact support before paying again.");
          } catch { reportCheckoutError("Payment was successful, but verification failed. Please contact support before paying again."); }
          finally { finishCheckout(); }
        },
        onCancel: finishCheckout,
      });
    } catch (error) { reportCheckoutError(error instanceof Error ? error.message : "Couldn't open checkout. Please try again."); finishCheckout(); }
  };

  const handleManageSubscription = () => {
    if (checkoutBusy.current) return;
    if (isCheckingPermission || isSessionLoading) {
      setNotice({ message: "Your billing access is still being checked. Please try again in a moment.", tone: "info" });
      return;
    }
    if (!selectedOrganizationId || !canManageBilling || !session?.user) {
      reportCheckoutError("Please sign in with billing access to manage this subscription.");
      return;
    }
    if (provider === "paystack") setShowPaystackModal(true);
    else window.location.href = `/api/${orgSlug}/portal/polar`;
  };

  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <WorkspacePageHeader appearance="compact" title="Billing" description="Manage your plan, resource usage, and subscription." action={canManageBilling && query.data ? <ArcButton type="button" variant="ghost" size="sm" onClick={() => { void query.refetch(); }} loading={query.isFetching} disabled={Boolean(checkoutPlan)} aria-label="Refresh billing details"><RefreshCw size={14} aria-hidden="true" />Refresh</ArcButton> : undefined} />
    {success && canManageBilling ? <WorkspaceNotice tone="success" message="Payment completed. Your subscription details will update after confirmation." /> : null}
    {notice ? <WorkspaceNotice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} /> : null}
    {isCheckingPermission || isOrganizationsPending ? <BillingSkeleton /> : !canManageBilling ? <WorkspaceEmptyState icon={<CreditCard size={24} />} title="Billing access required" description="Only organization owners and administrators can manage billing. Ask an administrator to update your role if you need access." action={<ArcButton type="button" variant="secondary" size="sm" onClick={() => { void queryClient.invalidateQueries({ queryKey: ["active-member"] }); }}>Check access again</ArcButton>} /> : !selectedOrganizationId ? <WorkspaceEmptyState title="Organization unavailable" description="We couldn't find this organization. Select an organization you belong to from the workspace menu." /> : query.isPending && !query.data ? <BillingSkeleton /> : !query.data ? <WorkspaceEmptyState icon={<CreditCard size={24} />} title="Couldn't load billing" description="Your subscription and usage could not be loaded. No plan changes have been made." action={<ArcButton type="button" variant="secondary" size="sm" loading={query.isFetching} onClick={() => { void query.refetch(); }}>Try again</ArcButton>} /> : <>
      {query.isError ? <WorkspaceNotice tone="error" message="Couldn't refresh billing. The last loaded details are still shown. Refresh before starting checkout." action={<ArcButton type="button" variant="secondary" size="sm" loading={query.isFetching} onClick={() => { void query.refetch(); }}>Retry</ArcButton>} /> : null}
      <BillingContent subscription={subscription} usage={query.data.usage} currency={effectiveCurrency} interval={effectiveInterval} showPaystack={showPaystack || provider === "paystack"} checkoutPlan={checkoutPlan} checkoutDisabled={isSessionLoading || query.isError} onCurrencyChange={setCurrency} onIntervalChange={setBillingInterval} onCheckout={plan => { void handleCheckout(plan); }} onManage={handleManageSubscription} />
    </>}
    <PaystackSubscriptionModal isOpen={showPaystackModal && canManageBilling && !isCheckingPermission && !isSessionLoading && Boolean(session?.user)} onClose={() => setShowPaystackModal(false)} subscription={subscription} orgSlug={orgSlug} onSubscriptionUpdated={() => { void queryClient.invalidateQueries({ queryKey: ["subscription", orgSlug] }); }} />
  </div>;
}
