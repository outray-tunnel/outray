import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Folder01Icon, Search01Icon } from "@hugeicons-pro/core-stroke-rounded";
import { ProjectCard } from "@/components/secrets/project-card";
import { ProjectDialog } from "@/components/secrets/secret-dialogs";
import {
  SecretsButton,
  SecretsEmptyState,
  SecretsHeader,
  SecretsNotice,
  SecretsPage,
  SecretsSkeleton,
  fieldClassName,
} from "@/components/secrets/secrets-ui";
import { useSecretsResource } from "@/components/secrets/use-secrets-resource";
import { secretsClient } from "@/lib/secrets-client";

export const Route = createFileRoute("/$orgSlug/secrets/projects")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$orgSlug/secrets/vaults",
      params: { orgSlug: params.orgSlug },
      replace: true,
    });
  },
});

export function VaultsPageView({ orgSlug }: { orgSlug: string }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const resource = useSecretsResource(() => secretsClient.projects(orgSlug), [orgSlug]);
  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return resource.data || [];
    return (resource.data || []).filter(
      (project) =>
        project.name.toLowerCase().includes(normalized) ||
        project.slug.toLowerCase().includes(normalized) ||
        project.description?.toLowerCase().includes(normalized),
    );
  }, [query, resource.data]);

  return (
    <SecretsPage>
      <SecretsHeader
        title="Vaults"
        description="Create one vault per application or service, then organize its secret values by environment."
        action={<SecretsButton tone="primary" icon={Add01Icon} onClick={() => setCreating(true)}>New vault</SecretsButton>}
      />
      {resource.error && resource.data && <SecretsNotice message={resource.error} onDismiss={resource.reload} />}
      {resource.loading && !resource.data ? (
        <SecretsSkeleton rows={6} />
      ) : resource.error && !resource.data ? (
        <SecretsEmptyState icon={Folder01Icon} title="Vaults could not be loaded" description={resource.error} action={<SecretsButton onClick={resource.reload}>Try again</SecretsButton>} />
      ) : (resource.data || []).length === 0 ? (
        <SecretsEmptyState
          icon={Folder01Icon}
          title="No vaults yet"
          description="Create a vault for an application, then add its development, staging, and production environments."
          action={<SecretsButton tone="primary" icon={Add01Icon} onClick={() => setCreating(true)}>Create vault</SecretsButton>}
        />
      ) : (
        <>
          <div className="relative max-w-sm">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.7} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input className={`${fieldClassName} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vaults" aria-label="Search vaults" />
          </div>
          {visibleProjects.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] px-6 py-14 text-center text-[13px] text-zinc-600">No vaults match “{query}”.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((project) => <ProjectCard key={project.id} orgSlug={orgSlug} project={project} />)}
            </div>
          )}
        </>
      )}
      <ProjectDialog open={creating} onClose={() => setCreating(false)} orgSlug={orgSlug} onSaved={() => resource.reload()} />
    </SecretsPage>
  );
}
