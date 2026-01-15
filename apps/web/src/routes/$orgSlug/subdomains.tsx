import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Globe, Plus } from "lucide-react";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { SubdomainHeader } from "@/components/subdomains/subdomain-header";
import { SubdomainLimitWarning } from "@/components/subdomains/subdomain-limit-warning";
import { CreateSubdomainModal } from "@/components/subdomains/create-subdomain-modal";
import { SubdomainCard } from "@/components/subdomains/subdomain-card";
import { LimitModal } from "@/components/limit-modal";

export const Route = createFileRoute("/$orgSlug/subdomains")({
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
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-white/5 rounded mb-2" />
            <div className="h-4 w-64 bg-white/5 rounded" />
          </div>
          <div className="h-10 w-40 bg-white/5 rounded-lg" />
        </div>

        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-white/2 border border-white/5 rounded-2xl p-6"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5" />
                <div>
                  <div className="h-4 w-48 bg-white/5 rounded mb-2" />
                  <div className="h-3 w-32 bg-white/5 rounded" />
                </div>
              </div>
              <div className="h-8 w-8 bg-white/5 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        <div className="text-center py-12 text-gray-500 bg-white/2 rounded-2xl border border-white/5">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-white/20" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            No subdomains reserved
          </h3>
          <p className="text-white/40 max-w-sm mx-auto mb-6">
            Reserve a subdomain to secure your preferred tunnel address.
          </p>
          <button
            onClick={handleAddSubdomainClick}
            className="px-4 py-2.5 bg-white text-black rounded-xl font-medium hover:bg-gray-200 transition-colors shadow-lg shadow-white/5 flex items-center gap-2 mx-auto"
          >
            <Plus size={18} />
            Reserve your first subdomain
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
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
