import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { appClient, type Subdomain } from "@/lib/app-client";
import {
  getSubscriptionLimits,
  isUnlimitedPlanLimit,
} from "@/lib/subscription-plans";
import { SearchField } from "@/components/arc/search-field/search-field";
import { SubdomainHeader } from "@/components/subdomains/subdomain-header";
import { SubdomainLimitWarning } from "@/components/subdomains/subdomain-limit-warning";
import { CreateSubdomainModal } from "@/components/subdomains/create-subdomain-modal";
import { SubdomainCard } from "@/components/subdomains/subdomain-card";
import { LimitModal } from "@/components/limit-modal";
import {
  AddressEmptyState,
  AddressListPanel,
  AddressListSkeleton,
  AddressNotice,
} from "@/components/tunnel-addresses/address-page";
import {
  filterSubdomains,
  requireAddressResult,
} from "@/components/tunnel-addresses/address-list-state";

export const Route = createFileRoute("/$orgSlug/tunnel/subdomains")({
  head: () => ({ meta: [{ title: "Subdomains - OutRay" }] }),
  component: SubdomainsView,
});

function SubdomainsView() {
  const { orgSlug } = Route.useParams();
  return <SubdomainsPage key={orgSlug} orgSlug={orgSlug} />;
}

function SubdomainsPage({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const createTrigger = useRef<HTMLButtonElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const subscriptionQuery = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () =>
      requireAddressResult(await appClient.subscriptions.get(orgSlug)),
  });
  const listQuery = useQuery({
    queryKey: ["subdomains", orgSlug],
    queryFn: async () =>
      requireAddressResult(await appClient.subdomains.list(orgSlug)),
  });

  const createMutation = useMutation({
    mutationFn: async (subdomain: string) =>
      requireAddressResult(
        await appClient.subdomains.create({ subdomain, orgSlug }),
      ),
    onSuccess: (result) => {
      queryClient.setQueryData<{ subdomains: Subdomain[] }>(
        ["subdomains", orgSlug],
        (current) => ({
          subdomains: [
            result.subdomain,
            ...(current?.subdomains ?? []).filter(
              (item) => item.id !== result.subdomain.id,
            ),
          ],
        }),
      );
      setIsCreating(false);
      setFormError(null);
      setSearch("");
      void queryClient.invalidateQueries({ queryKey: ["subdomains", orgSlug] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      requireAddressResult(await appClient.subdomains.delete(orgSlug, id)),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<{ subdomains: Subdomain[] }>(
        ["subdomains", orgSlug],
        (current) =>
          current && {
            subdomains: current.subdomains.filter((item) => item.id !== id),
          },
      );
      void queryClient.invalidateQueries({ queryKey: ["subdomains", orgSlug] });
    },
  });

  const subdomains = listQuery.data?.subdomains ?? [];
  const filtered = filterSubdomains(subdomains, search);
  const currentPlan = subscriptionQuery.data?.subscription?.plan || "free";
  const limit = getSubscriptionLimits(subscriptionQuery.data).maxSubdomains;
  const isUnlimited = isUnlimitedPlanLimit(currentPlan, limit, !!subscriptionQuery.data?.instanceLimits);
  const isAtLimit = !isUnlimited && subdomains.length >= limit;
  const isReady = Boolean(listQuery.data && subscriptionQuery.data);

  function openCreate() {
    if (!isReady) return;
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    createMutation.reset();
    setFormError(null);
    setIsCreating(true);
  }

  return (
    <div className="outray-arc outray-arc-list mx-auto max-w-6xl space-y-6">
      <SubdomainHeader
        currentSubdomainCount={subdomains.length}
        subdomainLimit={limit}
        isUnlimited={isUnlimited}
        isAtLimit={isAtLimit}
        isReady={isReady}
        onAddClick={openCreate}
        buttonRef={createTrigger}
      />

      {subscriptionQuery.isError && (
        <AddressNotice
          message="Could not load your plan limits. Retry to add or reserve addresses."
          onRetry={() => void subscriptionQuery.refetch()}
        />
      )}
      {listQuery.isError && listQuery.data && (
        <AddressNotice
          message="Could not refresh subdomains. Showing your last loaded addresses."
          onRetry={() => void listQuery.refetch()}
        />
      )}
      {isReady && (
        <SubdomainLimitWarning
          instanceOwned={!!subscriptionQuery.data?.instanceLimits}
          isAtLimit={isAtLimit}
          subdomainLimit={limit}
          currentPlan={currentPlan}
        />
      )}

      <AddressListPanel
        label="Reserved subdomains"
        toolbar={
          <>
            <div className="outray-arc-address-search w-full sm:max-w-[360px]">
              <SearchField
                appearance="workspace"
                label="Search subdomains"
                placeholder="Search addresses…"
                value={search}
                onValueChange={setSearch}
                disabled={!listQuery.data}
              />
            </div>
            <span
              className="text-[12px] tabular-nums text-zinc-500"
              role="status"
            >
              {listQuery.data
                ? `${filtered.length} ${filtered.length === 1 ? "address" : "addresses"}`
                : ""}
            </span>
          </>
        }
      >
        {listQuery.isPending ? (
          <AddressListSkeleton label="Loading subdomains" />
        ) : listQuery.isError && !listQuery.data ? (
          <AddressEmptyState
            isError
            title="Could not load subdomains"
            description="Your addresses could not be loaded. Check your connection and try again."
            action="Try again"
            onAction={() => void listQuery.refetch()}
          />
        ) : subdomains.length === 0 ? (
          <AddressEmptyState
            title="Your address, every time"
            description="Reserve a name so your tunnel keeps the same OutRay address whenever it connects."
            action="Reserve subdomain"
            actionSize="md"
            onAction={openCreate}
            disabled={!isReady}
          />
        ) : filtered.length === 0 ? (
          <AddressEmptyState
            title="No matching addresses"
            description="Try a different name or clear your search to see all reserved subdomains."
            action="Clear search"
            onAction={() => setSearch("")}
          />
        ) : (
          filtered.map((subdomain) => (
            <SubdomainCard
              key={subdomain.id}
              subdomain={subdomain}
              onDelete={(id) => deleteMutation.mutateAsync(id)}
            />
          ))
        )}
      </AddressListPanel>

      <p className="text-[12px] leading-5 text-zinc-500">
        Reserved addresses belong to this workspace. Use{" "}
        <code className="font-mono text-zinc-400">--subdomain</code> when
        connecting a tunnel.
      </p>

      <CreateSubdomainModal
        isOpen={isCreating}
        onClose={() => {
          setIsCreating(false);
          setFormError(null);
          createMutation.reset();
        }}
        onCreate={(subdomain) => createMutation.mutateAsync(subdomain)}
        isPending={createMutation.isPending}
        error={formError}
        setError={setFormError}
        triggerRef={createTrigger}
      />
      <LimitModal
        isOpen={isLimitModalOpen}
        onClose={() => setIsLimitModalOpen(false)}
        title="Subdomain limit reached"
        description={`Your plan includes ${limit} reserved subdomains. Upgrade to reserve another address.`}
        limit={limit}
        currentPlan={currentPlan}
        resourceName="Reserved subdomains"
      />
    </div>
  );
}
