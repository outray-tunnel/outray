import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Globe } from "lucide-react";
import { appClient } from "../../lib/app-client";
import { useAppStore } from "../../lib/store";
import { getPlanLimits } from "../../lib/subscription-plans";
import axios from "axios";
import { SubdomainHeader } from "../../components/subdomains/subdomain-header";
import { SubdomainLimitWarning } from "../../components/subdomains/subdomain-limit-warning";
import { CreateSubdomainModal } from "../../components/subdomains/create-subdomain-modal";
import { SubdomainCard } from "../../components/subdomains/subdomain-card";

export const Route = createFileRoute("/dash/subdomains")({
  component: SubdomainsView,
});

function SubdomainsView() {
  const { selectedOrganizationId } = useAppStore();
  const activeOrgId = selectedOrganizationId;
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: subscriptionData, isLoading: isLoadingSubscription } = useQuery(
    {
      queryKey: ["subscription", activeOrgId],
      queryFn: async () => {
        if (!activeOrgId) return null;
        const response = await axios.get(`/api/subscriptions/${activeOrgId}`);
        return response.data;
      },
      enabled: !!activeOrgId,
    },
  );

  const { data, isLoading: isLoadingSubdomains } = useQuery({
    queryKey: ["subdomains", activeOrgId],
    queryFn: () => {
      if (!activeOrgId) throw new Error("No active organization");
      return appClient.subdomains.list(activeOrgId);
    },
    enabled: !!activeOrgId,
  });

  const isLoading = isLoadingSubdomains || isLoadingSubscription;

  const createMutation = useMutation({
    mutationFn: async (subdomain: string) => {
      if (!activeOrgId) throw new Error("No active organization");
      return appClient.subdomains.create({
        subdomain,
        organizationId: activeOrgId,
      });
    },
    onSuccess: (data) => {
      if ("error" in data) {
        setError(data.error);
      } else {
        setIsCreating(false);
        queryClient.invalidateQueries({ queryKey: ["subdomains"] });
      }
    },
    onError: () => {
      setError("Failed to create subdomain");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return appClient.subdomains.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subdomains"] });
    },
  });

  const subdomains = data && "subdomains" in data ? data.subdomains : [];
  const subscription = subscriptionData?.subscription;
  const currentPlan = subscription?.plan || "free";
  const planLimits = getPlanLimits(currentPlan as any);

  const currentSubdomainCount = subdomains.length;
  const subdomainLimit = planLimits.maxSubdomains;
  const isAtLimit = currentSubdomainCount >= subdomainLimit;
  const isUnlimited = false;

  const handleAddSubdomainClick = () => {
    if (isAtLimit) {
      alert(
        `You've reached your subdomain limit (${subdomainLimit} subdomains). Upgrade your plan to add more subdomains.`,
      );
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
        onClose={() => setIsCreating(false)}
        onCreate={(subdomain) => createMutation.mutate(subdomain)}
        isPending={createMutation.isPending}
        error={error}
        setError={setError}
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
            className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-full transition-colors border border-white/5"
          >
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
