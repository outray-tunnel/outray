import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@hugeicons-pro/core-stroke-rounded/Add01Icon";
import Globe02Icon from "@hugeicons-pro/core-stroke-rounded/Globe02Icon";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { SubdomainHeader } from "@/components/subdomains/subdomain-header";
import { SubdomainLimitWarning } from "@/components/subdomains/subdomain-limit-warning";
import { CreateSubdomainModal } from "@/components/subdomains/create-subdomain-modal";
import { SubdomainCard } from "@/components/subdomains/subdomain-card";
import { LimitModal } from "@/components/limit-modal";
import { ResourceListSkeleton } from "@/components/resource-list-skeleton";

export const Route = createFileRoute("/$orgSlug/subdomains")({
  head: () => ({
    meta: [{ title: "Subdomains - OutRay" }],
  }),
  component: SubdomainsView,
});

function SubdomainsView() {
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const { data, isLoading: isLoadingSubdomains } = useQuery({
    queryKey: ["subdomains", orgSlug],
    queryFn: () => {
      if (!orgSlug) throw new Error("No active organization");
      return appClient.subdomains.list(orgSlug);
    },
    enabled: !!orgSlug,
  });

  const isLoading = isLoadingSubdomains || isLoadingSubscription;

  const createMutation = useMutation({
    mutationFn: async (subdomain: string) => {
      if (!orgSlug) throw new Error("No active organization");
      const response = await appClient.subdomains.create({
        subdomain,
        orgSlug,
      });
      if ("error" in response || "message" in response) {
        const errorMsg =
          (response as any).error ||
          (response as any).message ||
          "Failed to create subdomain";
        throw new Error(errorMsg);
      }
      return response;
    },
    onSuccess: () => {
      setIsCreating(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["subdomains", orgSlug] });
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to create subdomain");
    },
  });

  // Keep modal open when there's an error
  const modalError = createMutation.isError
    ? createMutation.error?.message || "Failed to create subdomain"
    : error;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgSlug) throw new Error("No active organization");
      return appClient.subdomains.delete(orgSlug, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subdomains", orgSlug] });
    },
  });

  const subdomains = data && "subdomains" in data ? data.subdomains : [];
  const subscription = subscriptionData?.subscription;
  const currentPlan = subscription?.plan || "free";
  const planLimits = getPlanLimits(currentPlan as any);

  const currentSubdomainCount = subdomains.length;
  const subdomainLimit = planLimits.maxSubdomains;
  const isUnlimited = subdomainLimit === -1;
  const isAtLimit = !isUnlimited && currentSubdomainCount >= subdomainLimit;

  const handleAddSubdomainClick = () => {
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    setIsCreating(true);
  };

  if (isLoading) {
    return <ResourceListSkeleton actionClassName="w-9 sm:w-40" />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <SubdomainHeader
        currentSubdomainCount={currentSubdomainCount}
        subdomainLimit={subdomainLimit}
        isUnlimited={isUnlimited}
        isAtLimit={isAtLimit}
        onAddClick={handleAddSubdomainClick}
      />

      <SubdomainLimitWarning
        isAtLimit={isAtLimit}
        subdomainLimit={subdomainLimit}
        currentPlan={currentPlan}
      />

      <CreateSubdomainModal
        isOpen={isCreating}
        onClose={() => {
          setIsCreating(false);
          setError(null);
          createMutation.reset();
        }}
        onCreate={(subdomain) => createMutation.mutate(subdomain)}
        isPending={createMutation.isPending}
        error={modalError}
        setError={setError}
      />

      <LimitModal
        isOpen={isLimitModalOpen}
        onClose={() => setIsLimitModalOpen(false)}
        title="Subdomain Limit Reached"
        description={`You've reached your plan's limit of ${subdomainLimit} reserved subdomains. Upgrade your plan to reserve more subdomains.`}
        limit={subdomainLimit}
        currentPlan={currentPlan}
        resourceName="Reserved Subdomains"
      />

      {subdomains.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-white/[0.07] py-12 text-center">
          <HugeiconsIcon
            icon={Globe02Icon}
            size={27}
            strokeWidth={1.5}
            className="mb-4 text-zinc-700"
          />
          <h3 className="text-sm font-medium text-zinc-300">
            No subdomains reserved
          </h3>
          <p className="mx-auto mb-6 mt-2 max-w-sm text-xs text-zinc-700">
            Reserve a subdomain to secure your preferred tunnel address.
          </p>
          <button
            onClick={handleAddSubdomainClick}
            className="mx-auto flex h-9 items-center gap-2 rounded-md bg-white px-3.5 text-[12px] font-medium text-black hover:bg-zinc-200"
          >
            <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.9} />
            Reserve your first subdomain
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.07]">
          {subdomains.map((sub: any) => (
            <SubdomainCard
              key={sub.id}
              subdomain={sub}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
