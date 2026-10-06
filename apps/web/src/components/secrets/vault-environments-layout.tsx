import { useMemo, useState, type ReactNode } from "react";
import { Outlet, useParams } from "@tanstack/react-router";
import { Layers, RefreshCw } from "lucide-react";
import { Button } from "../arc/button/button";
import { EnvironmentKeysHeader, EnvironmentKeysSkeleton, EnvironmentKeysTabs } from "./environment-keys-content";
import { useSecretsResource } from "./use-secrets-resource";
import { VaultEnvironmentsContext } from "./vault-environments-context";
import { secretsClient, type SecretProject } from "@/lib/secrets-client";

export function VaultEnvironmentsFrame({ orgSlug, projectSlug, environmentSlug, project, loading, error, onRetry, actions, children }: {
  orgSlug: string;
  projectSlug: string;
  environmentSlug: string;
  project: SecretProject | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return <div className="outray-arc mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col gap-5 overflow-hidden" data-vault-environments-layout="">
    <EnvironmentKeysHeader orgSlug={orgSlug} projectSlug={projectSlug} environmentSlug={environmentSlug} project={project} actions={actions} />
    <section aria-label="Environment secrets" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
      {project && <EnvironmentKeysTabs orgSlug={orgSlug} projectSlug={projectSlug} environmentSlug={environmentSlug} project={project} />}
      {project && error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-400/15 bg-amber-400/[0.035] px-4 py-2 text-[12px] text-amber-100/75"><span>Could not refresh environments. Showing the last available list.</span><Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button></div>}
      {project ? children : loading ? <><div className="flex h-[43px] shrink-0 items-center justify-around gap-3 border-b border-white/[0.07] px-3 animate-pulse motion-reduce:animate-none" aria-hidden="true">{[1, 2, 3].map((index) => <span key={index} className="h-3 w-20 rounded bg-white/[0.05]" />)}</div><EnvironmentKeysSkeleton sharedLayout /></> : <div role="alert" className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center"><Layers size={22} className="text-zinc-500" aria-hidden="true" /><h2 className="mt-3 text-[14px] font-medium text-zinc-200">Vault unavailable</h2><p className="mt-1 max-w-md text-[12px] leading-5 text-zinc-500">{error || "We could not load the environments for this vault."}</p><Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button></div>}
    </section>
  </div>;
}

// This scope mounts once per vault. Only the Outlet's environment-specific
// controller remounts; no revealed plaintext is kept in the shared layout.
export function VaultEnvironmentsLayout({ orgSlug, projectSlug }: { orgSlug: string; projectSlug: string }) {
  const { environmentSlug = "" } = useParams({ strict: false });
  const [actionsContainer, setActionsContainer] = useState<HTMLDivElement | null>(null);
  const resource = useSecretsResource((signal) => secretsClient.project(orgSlug, projectSlug, signal), [orgSlug, projectSlug]);
  const context = useMemo(() => resource.data && ({ project: resource.data, actionsContainer, reloadProject: resource.reload }), [resource.data, actionsContainer, resource.reload]);
  return <VaultEnvironmentsFrame orgSlug={orgSlug} projectSlug={projectSlug} environmentSlug={environmentSlug} project={resource.data} loading={resource.loading} error={resource.error} onRetry={resource.reload}
    actions={<div ref={setActionsContainer} className="flex min-h-9 w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:min-w-[312px] sm:justify-end" role="group" aria-label="Environment actions" />}>
    {context && <VaultEnvironmentsContext.Provider value={context}>{environmentSlug ? <Outlet /> : <div className="flex min-h-0 flex-1 items-center justify-center px-5 text-[13px] text-zinc-500">Choose an environment to view its secret keys.</div>}</VaultEnvironmentsContext.Provider>}
  </VaultEnvironmentsFrame>;
}
