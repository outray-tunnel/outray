import { useEffect, useRef, useState } from "react";
import { Button as ArcButton } from "@/components/arc/button/button";
import { WorkspaceDialog, WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { formatBillingDate, formatBillingPrice, knownBillingPlan, type BillingSubscription } from "@/components/workspace/billing-state";
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

interface PaystackSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: BillingSubscription | null;
  orgSlug: string;
  onSubscriptionUpdated: () => void;
}

export function PaystackSubscriptionDetails({ subscription }: { subscription: BillingSubscription }) {
  const plan = knownBillingPlan(subscription.plan);
  const interval = subscription.billingInterval === "year" ? "year" : "month";
  const periodEnd = formatBillingDate(subscription.currentPeriodEnd);
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
      <div><p className="text-[11px] text-zinc-500">Current plan</p><h3 className="mt-1 text-[16px] font-medium text-zinc-200">{plan ? SUBSCRIPTION_PLANS[plan].name : subscription.plan}</h3></div>
      <p className="text-[20px] font-medium tracking-tight text-zinc-200">{plan ? formatBillingPrice(plan, interval, "NGN") : "—"}<span className="ml-1 text-[11px] font-normal text-zinc-500">/{interval === "year" ? "year" : "month"}</span></p>
    </div>
    <dl className="space-y-3 text-[12px]">
      <div className="flex justify-between gap-5"><dt className="text-zinc-500">Billing cycle</dt><dd className="text-zinc-300">{interval === "year" ? "Yearly" : "Monthly"}</dd></div>
      <div className="flex justify-between gap-5"><dt className="text-zinc-500">Payment provider</dt><dd className="text-zinc-300">Paystack</dd></div>
      <div className="flex justify-between gap-5"><dt className="text-zinc-500">{subscription.cancelAtPeriodEnd ? "Access until" : "Next renewal"}</dt><dd className="text-zinc-300">{periodEnd}</dd></div>
      {subscription.paystackEmail ? <div className="flex justify-between gap-5"><dt className="shrink-0 text-zinc-500">Billing email</dt><dd className="min-w-0 break-all text-right text-zinc-300">{subscription.paystackEmail}</dd></div> : null}
    </dl>
    {subscription.cancelAtPeriodEnd ? <WorkspaceNotice tone="info" message={`Your subscription is set to cancel on ${periodEnd}. You'll move to the Free plan after this date.`} /> : null}
  </div>;
}

export function PaystackSubscriptionModal({ isOpen, onClose, subscription, orgSlug, onSubscriptionUpdated }: PaystackSubscriptionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const close = () => {
    if (busy.current) return;
    setShowCancelConfirm(false);
    setError(null);
    onClose();
  };
  const handleCancelSubscription = async () => {
    if (busy.current || !subscription || subscription.cancelAtPeriodEnd) return;
    busy.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/subscriptions/${orgSlug}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to cancel subscription");
      if (mounted.current) {
        onSubscriptionUpdated();
        setShowCancelConfirm(false);
        onClose();
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Couldn't cancel your subscription. Please try again.");
    } finally {
      busy.current = false;
      if (mounted.current) setIsLoading(false);
    }
  };
  if (!subscription) return null;
  const periodEnd = formatBillingDate(subscription.currentPeriodEnd);
  return <WorkspaceDialog open={isOpen} onClose={close} title={showCancelConfirm ? "Cancel subscription" : "Manage subscription"} description={showCancelConfirm ? "Review what changes when this billing period ends." : "Your subscription is billed in NGN through Paystack."} busy={isLoading} size="sm" footer={showCancelConfirm ? <><ArcButton type="button" variant="secondary" size="sm" disabled={isLoading} onClick={() => { setShowCancelConfirm(false); setError(null); }}>Keep subscription</ArcButton><ArcButton type="button" variant="danger" size="sm" loading={isLoading} onClick={() => { void handleCancelSubscription(); }}>{isLoading ? "Cancelling…" : "Cancel subscription"}</ArcButton></> : <><ArcButton type="button" variant="ghost" size="sm" onClick={close}>Done</ArcButton>{!subscription.cancelAtPeriodEnd ? <ArcButton type="button" variant="danger" size="sm" onClick={() => setShowCancelConfirm(true)}>Cancel subscription</ArcButton> : null}</>}>
    {showCancelConfirm ? <div className="space-y-4"><p className="text-[13px] leading-6 text-zinc-400">Your subscription remains active until <span className="text-zinc-200">{periodEnd}</span>. After that, you'll move to the Free plan and lose access to premium features.</p>{error ? <WorkspaceNotice tone="error" message={error} /> : null}</div> : <PaystackSubscriptionDetails subscription={subscription} />}
  </WorkspaceDialog>;
}
