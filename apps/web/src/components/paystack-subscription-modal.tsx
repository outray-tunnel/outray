import { X, CreditCard, Calendar, AlertTriangle } from "lucide-react";
import { Modal, Button, IconButton } from "@/components/ui";
import { useState } from "react";
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

interface PaystackSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: {
    plan: string;
    status?: string;
    currentPeriodEnd?: string | Date | null;
    cancelAtPeriodEnd?: boolean;
    paystackEmail?: string | null;
    paymentProvider?: string;
  } | null;
  orgSlug: string;
  onSubscriptionUpdated: () => void;
}

export function PaystackSubscriptionModal({
  isOpen,
  onClose,
  subscription,
  orgSlug,
  onSubscriptionUpdated,
}: PaystackSubscriptionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!subscription) return null;

  const planConfig = SUBSCRIPTION_PLANS[subscription.plan as keyof typeof SUBSCRIPTION_PLANS];
  const periodEnd = subscription.currentPeriodEnd 
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "N/A";

  const handleCancelSubscription = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/subscriptions/${orgSlug}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel subscription");
      }

      onSubscriptionUpdated();
      setShowCancelConfirm(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Manage Subscription</h2>
          <IconButton
            onClick={onClose}
            icon={<X className="w-5 h-5" />}
            aria-label="Close"
          />
        </div>

        {showCancelConfirm ? (
          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-red-500 mb-1">Cancel Subscription?</h3>
                  <p className="text-sm text-gray-400">
                    Your subscription will remain active until {periodEnd}. After that, 
                    you'll be downgraded to the Free plan and lose access to premium features.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowCancelConfirm(false)}
                fullWidth
                disabled={isLoading}
              >
                Keep Subscription
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelSubscription}
                fullWidth
                disabled={isLoading}
              >
                {isLoading ? "Cancelling..." : "Yes, Cancel"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Plan */}
            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Current Plan</p>
                  <p className="text-xl font-bold text-white">{planConfig?.name || subscription.plan}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">
                    ₦{planConfig?.priceNGN?.toLocaleString() || 0}
                  </p>
                  <p className="text-sm text-gray-400">/month</p>
                </div>
              </div>
            </div>

            {/* Billing Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <CreditCard className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-400">Payment Method</p>
                  <p className="text-white">Card ending in ****</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-400">
                    {subscription.cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                  </p>
                  <p className="text-white">{periodEnd}</p>
                </div>
              </div>

              {subscription.paystackEmail && (
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                  <div className="w-5 h-5 flex items-center justify-center text-gray-400">@</div>
                  <div>
                    <p className="text-sm text-gray-400">Billing Email</p>
                    <p className="text-white">{subscription.paystackEmail}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Status */}
            {subscription.cancelAtPeriodEnd && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <p className="text-sm text-yellow-500">
                  Your subscription is set to cancel on {periodEnd}. 
                  You'll be downgraded to the Free plan after this date.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 border-t border-white/10">
              {!subscription.cancelAtPeriodEnd && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
