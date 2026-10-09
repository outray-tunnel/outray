import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { appClient, type Domain } from "@/lib/app-client";
import {
  getPlanLimits,
  isUnlimitedPlanLimit,
  type SubscriptionPlan,
} from "@/lib/subscription-plans";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Select } from "@/components/arc/select/select";
import { DomainHeader } from "@/components/domains/domain-header";
import { DomainLimitWarning } from "@/components/domains/domain-limit-warning";
import { CreateDomainModal } from "@/components/domains/create-domain-modal";
import { DomainCard } from "@/components/domains/domain-card";
import { LimitModal } from "@/components/limit-modal";
import {
  AddressEmptyState,
  AddressListPanel,
  AddressListSkeleton,
  AddressNotice,
} from "@/components/tunnel-addresses/address-page";
import {
  domainStatusOptions,
  filterDomains,
  isDomainStatusFilter,
  requireAddressResult,
  type DomainStatusFilter,
} from "@/components/tunnel-addresses/address-list-state";

export const Route = createFileRoute("/$orgSlug/tunnel/domains")({
  head: () => ({ meta: [{ title: "Domains - OutRay" }] }),
  component: DomainsView,
});

function DomainsView() {
  const { orgSlug } = Route.useParams();
  return <DomainsPage key={orgSlug} orgSlug={orgSlug} />;
}

function DomainsPage({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const createTrigger = useRef<HTMLButtonElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DomainStatusFilter>("all");
  const [createdDomainId, setCreatedDomainId] = useState<string | null>(null);

  const subscriptionQuery = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () =>
      requireAddressResult(await appClient.subscriptions.get(orgSlug)),
  });
  const listQuery = useQuery({
    queryKey: ["domains", orgSlug],
    queryFn: async () =>
      requireAddressResult(await appClient.domains.list(orgSlug)),
  });

  const createMutation = useMutation({
    mutationFn: async (domain: string) =>
      requireAddressResult(await appClient.domains.create({ domain, orgSlug })),
    onSuccess: (result) => {
      queryClient.setQueryData<{ domains: Domain[] }>(
        ["domains", orgSlug],
        (current) => ({
          domains: [
            result.domain,
            ...(current?.domains ?? []).filter(
              (item) => item.id !== result.domain.id,
            ),
          ],
        }),
      );
      setIsCreating(false);
      setFormError(null);
      setSearch("");
      setStatus("all");
      setCreatedDomainId(result.domain.id);
      void queryClient.invalidateQueries({ queryKey: ["domains", orgSlug] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      requireAddressResult(await appClient.domains.delete(orgSlug, id)),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<{ domains: Domain[] }>(
        ["domains", orgSlug],
        (current) =>
          current && {
            domains: current.domains.filter((item) => item.id !== id),
          },
      );
      void queryClient.invalidateQueries({ queryKey: ["domains", orgSlug] });
    },
  });
  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = requireAddressResult(
        await appClient.domains.verify(orgSlug, id),
      );
      if (!result.verified)
        throw new Error(
          result.message ||
            "DNS records could not be verified. Check both records and try again.",
        );
      return result;
    },
    onSuccess: (_result, id) => {
      queryClient.setQueryData<{ domains: Domain[] }>(
        ["domains", orgSlug],
        (current) =>
          current && {
            domains: current.domains.map((item) =>
              item.id === id ? { ...item, status: "active" } : item,
            ),
          },
      );
      void queryClient.invalidateQueries({ queryKey: ["domains", orgSlug] });
    },
  });

  const domains = listQuery.data?.domains ?? [];
  const filtered = filterDomains(domains, search, status);
  const currentPlan = subscriptionQuery.data?.subscription?.plan || "free";
  const limit = getPlanLimits(currentPlan as SubscriptionPlan).maxDomains;
  const isUnlimited = isUnlimitedPlanLimit(currentPlan, limit);
  const isAtLimit = !isUnlimited && domains.length >= limit;
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
      <DomainHeader
        currentDomainCount={domains.length}
        domainLimit={limit}
        isUnlimited={isUnlimited}
        isAtLimit={isAtLimit}
        isReady={isReady}
        onAddClick={openCreate}
        buttonRef={createTrigger}
      />

      {subscriptionQuery.isError && (
        <AddressNotice
          message="Could not load your plan limits. Retry to connect another domain."
          onRetry={() => void subscriptionQuery.refetch()}
        />
      )}
      {listQuery.isError && listQuery.data && (
        <AddressNotice
          message="Could not refresh domains. Showing your last loaded addresses."
          onRetry={() => void listQuery.refetch()}
        />
      )}
      {isReady && (
        <DomainLimitWarning
          isAtLimit={isAtLimit}
          domainLimit={limit}
          currentPlan={currentPlan}
        />
      )}

      <AddressListPanel
        label="Custom domains"
        toolbar={
          <>
            <div className="outray-arc-address-search w-full sm:max-w-[360px]">
              <SearchField
                appearance="workspace"
                label="Search domains"
                placeholder="Search domains…"
                value={search}
                onValueChange={setSearch}
                disabled={!listQuery.data}
              />
            </div>
            <div className="flex items-center justify-between gap-4 sm:justify-end">
              <span
                className="text-[12px] tabular-nums text-zinc-500"
                role="status"
              >
                {listQuery.data
                  ? `${filtered.length} ${filtered.length === 1 ? "domain" : "domains"}`
                  : ""}
              </span>
              <div className="outray-arc-address-filter w-[164px]">
                <Select
                  label="Filter domain status"
                  options={domainStatusOptions}
                  value={status}
                  onValueChange={(value) => {
                    if (isDomainStatusFilter(value)) setStatus(value);
                  }}
                  disabled={!listQuery.data}
                />
              </div>
            </div>
          </>
        }
      >
        {listQuery.isPending ? (
          <AddressListSkeleton label="Loading domains" />
        ) : listQuery.isError && !listQuery.data ? (
          <AddressEmptyState
            isError
            title="Could not load domains"
            description="Your domains could not be loaded. Check your connection and try again."
            action="Try again"
            onAction={() => void listQuery.refetch()}
          />
        ) : domains.length === 0 ? (
          <AddressEmptyState
            title="Make the address yours"
            description="Connect a subdomain such as api.example.com, add your DNS records, and verify ownership."
            action={isAtLimit && isReady ? "View plan limits" : "Add domain"}
            actionSize="md"
            onAction={openCreate}
            disabled={!isReady}
          />
        ) : filtered.length === 0 ? (
          <AddressEmptyState
            title="No matching domains"
            description="Try another address or clear your filters to see all domains in this workspace."
            action="Clear filters"
            onAction={() => {
              setSearch("");
              setStatus("all");
            }}
          />
        ) : (
          filtered.map((domain) => (
            <DomainCard
              key={domain.id}
              domain={domain}
              onDelete={(id) => deleteMutation.mutateAsync(id)}
              onVerify={(id) => verifyMutation.mutateAsync(id)}
              isVerifying={
                verifyMutation.isPending &&
                verifyMutation.variables === domain.id
              }
              defaultExpanded={createdDomainId === domain.id}
            />
          ))
        )}
      </AddressListPanel>

      <p className="text-[12px] leading-5 text-zinc-500">
        Connect a subdomain, not a root domain. DNS records are available for
        each address.
      </p>

      <CreateDomainModal
        isOpen={isCreating}
        onClose={() => {
          setIsCreating(false);
          setFormError(null);
          createMutation.reset();
        }}
        onCreate={(domain) => createMutation.mutateAsync(domain)}
        isPending={createMutation.isPending}
        error={formError}
        setError={setFormError}
        triggerRef={createTrigger}
      />
      <LimitModal
        isOpen={isLimitModalOpen}
        onClose={() => setIsLimitModalOpen(false)}
        title="Domain limit reached"
        description={`Your plan includes ${limit} custom domains. Upgrade to connect another address.`}
        limit={limit}
        currentPlan={currentPlan}
        resourceName="Custom domains"
      />
    </div>
  );
}
