import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Audit01Icon,
  Search01Icon,
  SecurityLockIcon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  ActivityEmpty,
  ActivityList,
} from "@/components/secrets/activity-list";
import {
  SecretsBadge,
  SecretsButton,
  SecretsEmptyState,
  SecretsHeader,
  SecretsNotice,
  SecretsPage,
  SecretsSelect,
  SecretsSkeleton,
  fieldClassName,
} from "@/components/secrets/secrets-ui";
import { useSecretsResource } from "@/components/secrets/use-secrets-resource";
import { formatAuditActor } from "@/components/secrets/utils";
import { secretsClient } from "@/lib/secrets-client";

export const Route = createFileRoute("/$orgSlug/secrets/audit")({
  head: () => ({ meta: [{ title: "Audit log - OutRay Secrets" }] }),
  component: SecretsAuditPage,
});

function SecretsAuditPage() {
  const { orgSlug } = Route.useParams();
  const resource = useSecretsResource(
    () => secretsClient.audit(orgSlug),
    [orgSlug],
  );
  const [query, setQuery] = useState("");
  const [resourceType, setResourceType] = useState("all");
  const [project, setProject] = useState("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const events = useMemo(
    () => resource.data?.events || [],
    [resource.data?.events],
  );

  const projectOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const event of events) {
      const slug = event.projectSlug || event.projectName || event.projectId;
      if (slug) {
        values.set(
          slug,
          event.projectName || event.projectSlug || event.projectId || slug,
        );
      }
    }
    return [
      { value: "all", label: "All vaults" },
      ...Array.from(values.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [events]);

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return events.filter((event) => {
      const searchable = [
        event.action,
        event.resourceName,
        event.projectName,
        event.projectSlug,
        event.projectId,
        event.environmentName,
        event.environmentSlug,
        event.environmentId,
        event.actorType,
        event.actorId,
        event.actorName,
        event.actorEmail,
        formatAuditActor(event),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!normalized || searchable.includes(normalized)) &&
        (resourceType === "all" || event.resourceType === resourceType) &&
        (project === "all" ||
          event.projectSlug === project ||
          event.projectName === project ||
          event.projectId === project)
      );
    });
  }, [events, project, query, resourceType]);

  const loadMore = async () => {
    const cursor = resource.data?.nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = await secretsClient.audit(orgSlug, cursor);
      resource.setData((current) =>
        current
          ? {
              events: [...current.events, ...nextPage.events],
              nextCursor: nextPage.nextCursor,
            }
          : nextPage,
      );
    } catch (error) {
      setLoadMoreError(
        error instanceof Error
          ? error.message
          : "More audit events could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SecretsPage>
      <SecretsHeader
        title="Audit log"
        description="Review reveals, copies, changes, rollbacks, imports, and deletions across the workspace. Secret values are never included."
        action={
          <SecretsBadge tone="green">
            <HugeiconsIcon
              icon={SecurityLockIcon}
              size={12}
              strokeWidth={1.8}
              className="mr-1.5"
            />{" "}
            Metadata only
          </SecretsBadge>
        }
      />

      {resource.error && resource.data && (
        <SecretsNotice message={resource.error} onDismiss={resource.reload} />
      )}
      {resource.loading && !resource.data ? (
        <SecretsSkeleton rows={7} />
      ) : resource.error && !resource.data ? (
        <SecretsEmptyState
          icon={Audit01Icon}
          title="Audit events could not be loaded"
          description={resource.error}
          action={
            <SecretsButton onClick={resource.reload}>Try again</SecretsButton>
          }
        />
      ) : events.length === 0 ? (
        <ActivityEmpty />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_220px]">
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                strokeWidth={1.7}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                className={`${fieldClassName} pl-10`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search activity"
                aria-label="Search audit activity"
              />
            </div>
            <SecretsSelect
              ariaLabel="Filter by resource type"
              value={resourceType}
              onChange={setResourceType}
              options={[
                { value: "all", label: "All resource types" },
                { value: "project", label: "Vaults" },
                { value: "environment", label: "Environments" },
                { value: "secret", label: "Secrets" },
              ]}
            />
            <SecretsSelect
              ariaLabel="Filter by vault"
              value={project}
              onChange={setProject}
              options={projectOptions}
            />
          </div>
          {visibleEvents.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] px-6 py-14 text-center text-[13px] text-zinc-600">
              No audit events match these filters.
            </div>
          ) : (
            <ActivityList events={visibleEvents} />
          )}
          {loadMoreError && (
            <SecretsNotice
              message={loadMoreError}
              onDismiss={() => setLoadMoreError(null)}
            />
          )}
          {resource.data?.nextCursor && (
            <div className="flex justify-center pt-1">
              <SecretsButton
                type="button"
                variant="secondary"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Loading activity…" : "Load more activity"}
              </SecretsButton>
            </div>
          )}
        </>
      )}
    </SecretsPage>
  );
}
