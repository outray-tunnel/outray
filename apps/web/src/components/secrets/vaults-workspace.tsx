import { useRef, useEffect, useState } from "react";
import { ProjectDialog } from "./secret-dialogs";
import { VaultsContent } from "./vaults-content";
import { useSecretsResource } from "./use-secrets-resource";
import type { SecretsVaultSort } from "./overview-data";
import { secretsClient } from "@/lib/secrets-client";

export function VaultsPageView({ orgSlug }: { orgSlug: string }) {
  return <VaultsWorkspace key={orgSlug} orgSlug={orgSlug} />;
}

export function VaultsWorkspace({ orgSlug }: { orgSlug: string }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SecretsVaultSort>("updated");
  const [creating, setCreating] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const resource = useSecretsResource(async (signal) => {
    const projects = await secretsClient.projects(orgSlug, signal);
    signal.throwIfAborted();
    return projects;
  }, [orgSlug]);
  return <>
    <VaultsContent orgSlug={orgSlug} projects={resource.data} loading={resource.loading} refreshing={resource.refreshing} error={resource.error}
      search={search} sort={sort} onSearchChange={setSearch} onSortChange={setSort} onCreate={() => setCreating(true)} onRetry={resource.reload} />
    <ProjectDialog open={creating} onClose={() => { if (mounted.current) setCreating(false); }} orgSlug={orgSlug} onSaved={() => { if (mounted.current) resource.reload(); }} />
  </>;
}
