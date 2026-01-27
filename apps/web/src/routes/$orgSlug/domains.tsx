import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Globe, Plus } from "lucide-react";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { DomainHeader } from "@/components/domains/domain-header";
import { DomainLimitWarning } from "@/components/domains/domain-limit-warning";
import { CreateDomainModal } from "@/components/domains/create-domain-modal";
import { DomainCard } from "@/components/domains/domain-card";
import { LimitModal } from "@/components/limit-modal";
import { AlertModal } from "@/components/alert-modal";

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

      <div className="grid gap-4">
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
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-white/20" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              No custom domains
            </h3>
            <p className="text-white/40 max-w-sm mx-auto mb-6">
              Add a custom domain to access your tunnels via your own branded
              URLs.
            </p>
            <button
              onClick={handleAddDomainClick}
              className="px-4 py-2.5 bg-white text-black rounded-xl font-medium hover:bg-gray-200 transition-colors shadow-lg shadow-white/5 flex items-center gap-2 mx-auto"
            >
              <Plus size={18} />
              Add your first domain
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
