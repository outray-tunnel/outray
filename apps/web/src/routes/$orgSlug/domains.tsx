import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Globe02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { DomainHeader } from "@/components/domains/domain-header";
import { DomainLimitWarning } from "@/components/domains/domain-limit-warning";
import { CreateDomainModal } from "@/components/domains/create-domain-modal";
import { DomainCard } from "@/components/domains/domain-card";
import { LimitModal } from "@/components/limit-modal";
import { AlertModal } from "@/components/alert-modal";
import { ResourceListSkeleton } from "@/components/resource-list-skeleton";

export const Route = createFileRoute("/$orgSlug/domains")({
  head: () => ({
    meta: [
      { title: "Domains - OutRay" },
    ],
  }),
  component: DomainsView,
});

function DomainsView() {
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "error" | "info" | "success";
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "error",
  });

  const { data: subscriptionData, isLoading: isLoadingSubscription } = useQuery(
    {
      queryKey: ["subscription", orgSlug],
      queryFn: async () => {
        if (!orgSlug) return null;
        const response = await appClient.subscriptions.get(orgSlug);
        if ("error" in response) throw new Error(response.error);
        return response;
      },
      enabled: !!orgSlug,
    },
  );

  const { data, isLoading: isLoadingDomains } = useQuery({
    queryKey: ["domains", orgSlug],
    queryFn: () => {
      if (!orgSlug) throw new Error("No active organization");
      return appClient.domains.list(orgSlug);
    },
    enabled: !!orgSlug,
  });

  const isLoading = isLoadingDomains || isLoadingSubscription;

  const createMutation = useMutation({
    mutationFn: async (domain: string) => {
      if (!orgSlug) throw new Error("No active organization");
      return appClient.domains.create({
        domain,
        orgSlug,
      });
    },
    onSuccess: (data) => {
      if ("error" in data) {
        setError(data.error);
      } else {
        setIsCreating(false);
        queryClient.invalidateQueries({ queryKey: ["domains"] });
      }
    },
    onError: () => {
      setError("Failed to create domain");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgSlug) throw new Error("No active organization");
      return appClient.domains.delete(orgSlug, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domains", orgSlug] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgSlug) throw new Error("No active organization");
      return appClient.domains.verify(orgSlug, id);
    },
    onSuccess: (data) => {
      if ("error" in data) {
        setAlertState({
          isOpen: true,
          title: "Verification Failed",
          message: data.error,
          type: "error",
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["domains", orgSlug] });
      }
    },
  });

  const domains = data && "domains" in data ? data.domains : [];
  const subscription = subscriptionData?.subscription;
  const currentPlan = subscription?.plan || "free";
  const planLimits = getPlanLimits(currentPlan as any);

  const currentDomainCount = domains.length;
  const domainLimit = Number(planLimits.maxDomains);
  const isAtLimit = domainLimit !== -1 && currentDomainCount >= domainLimit;
  const isUnlimited = domainLimit === -1;

  const handleAddDomainClick = () => {
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    setIsCreating(true);
  };

  if (isLoading) {
    return <ResourceListSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <DomainHeader
        currentDomainCount={currentDomainCount}
        domainLimit={domainLimit}
        isUnlimited={isUnlimited}
        isAtLimit={isAtLimit}
        onAddClick={handleAddDomainClick}
      />

      <DomainLimitWarning
        isAtLimit={isAtLimit}
        domainLimit={domainLimit}
        currentPlan={currentPlan}
      />

      <CreateDomainModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onCreate={(domain) => createMutation.mutate(domain)}
        isPending={createMutation.isPending}
        error={error}
        setError={setError}
      />

      <LimitModal
        isOpen={isLimitModalOpen}
        onClose={() => setIsLimitModalOpen(false)}
        title="Domain Limit Reached"
        description={`You've reached your plan's limit of ${domainLimit} custom domains. Upgrade your plan to add more domains.`}
        limit={domainLimit}
        currentPlan={currentPlan}
        resourceName="Custom Domains"
      />

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />

      <div className="overflow-hidden rounded-xl border border-white/[0.07]">
        {domains.map((domain: any) => (
          <DomainCard
            key={domain.id}
            domain={domain}
            onVerify={(id) => verifyMutation.mutate(id)}
            onDelete={(id) => deleteMutation.mutate(id)}
            isVerifying={verifyMutation.isPending}
          />
        ))}

        {domains.length === 0 && !isCreating && (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
            <HugeiconsIcon
              icon={Globe02Icon}
              size={27}
              strokeWidth={1.5}
              className="mb-4 text-zinc-700"
            />
            <h3 className="text-sm font-medium text-zinc-300">
              No custom domains
            </h3>
            <p className="mx-auto mb-6 mt-2 max-w-sm text-xs text-zinc-700">
              Add a custom domain to access your tunnels via your own branded
              URLs.
            </p>
            <button
              onClick={handleAddDomainClick}
              className="mx-auto flex h-9 items-center gap-2 rounded-md bg-white px-3.5 text-[12px] font-medium text-black hover:bg-zinc-200"
            >
              <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.9} />
              Add your first domain
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
