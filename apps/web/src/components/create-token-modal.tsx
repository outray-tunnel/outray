import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, RefreshCw } from "lucide-react";
import { appClient, type AuthToken } from "@/lib/app-client";
import { usePermission } from "@/lib/auth-client";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { Select } from "@/components/arc/select/select";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { WorkspaceDialog, WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { canCreateToken, tokenPermissionOptions, type TokenBoundary, type TokenExpiry, type TokenScope } from "@/components/workspace/tokens-data";

interface CreateTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgSlug: string;
  defaultName?: string;
  defaultScopes?: AuthToken["scopes"];
  actionSize?: "sm" | "md";
}

export interface TokenProjectOption { id: string; name: string; slug: string }
export interface TokenEnvironmentOption { id: string; name: string; slug: string }

const defaultTokenScopes: TokenScope[] = ["tunnel:connect"];

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

export function CreateTokenModal(props: CreateTokenModalProps) {
  const permission = usePermission({ authToken: ["create"] });
  if (!props.isOpen) return null;
  return <TokenCreationSession key={props.orgSlug} {...props} canCreate={permission.data} permissionPending={permission.isPending} />;
}

function TokenCreationSession({ onClose, orgSlug, defaultName = "", defaultScopes = defaultTokenScopes, canCreate, permissionPending }: CreateTokenModalProps & { canCreate: boolean; permissionPending: boolean }) {
  const queryClient = useQueryClient();
  const formId = useId();
  const [name, setName] = useState(defaultName);
  const [boundary, setBoundary] = useState<TokenBoundary>("organization");
  const [projectId, setProjectId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [expiresIn, setExpiresIn] = useState<TokenExpiry>("90d");
  const [scopes, setScopes] = useState<TokenScope[]>(defaultScopes);
  const [created, setCreated] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const tokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const createPendingRef = useRef(false);

  const projectsQuery = useQuery({
    queryKey: ["secrets-project-options", orgSlug],
    enabled: canCreate && !permissionPending && boundary !== "organization" && !created,
    queryFn: async () => {
      const payload = await readJson<{ projects?: TokenProjectOption[] }>(await fetch("/api/" + encodeURIComponent(orgSlug) + "/secrets/projects", { credentials: "same-origin" }));
      return payload.projects ?? [];
    },
  });
  const selectedProject = projectsQuery.data?.find((project) => project.id === projectId);
  const environmentsQuery = useQuery({
    queryKey: ["secrets-project-environments", orgSlug, selectedProject?.slug],
    enabled: canCreate && !permissionPending && boundary === "environment" && !!selectedProject && !created,
    queryFn: async () => {
      if (!selectedProject) return [];
      const payload = await readJson<{ project?: { environments?: TokenEnvironmentOption[] }; environments?: TokenEnvironmentOption[] }>(
        await fetch("/api/" + encodeURIComponent(orgSlug) + "/secrets/projects/" + encodeURIComponent(selectedProject.slug), { credentials: "same-origin" }),
      );
      return payload.environments ?? payload.project?.environments ?? [];
    },
  });
  const selectedEnvironment = environmentsQuery.data?.find((environment) => environment.id === environmentId);
  const canSubmit = canCreate && !permissionPending && canCreateToken({ name, scopes, boundary, projectValid: !!selectedProject, environmentValid: !!selectedEnvironment });

  useEffect(() => () => {
    requestRef.current += 1;
    if (tokenTimerRef.current !== null) clearTimeout(tokenTimerRef.current);
  }, []);

  const close = () => {
    if (createPendingRef.current) return;
    requestRef.current += 1;
    if (tokenTimerRef.current !== null) clearTimeout(tokenTimerRef.current);
    setCreatedToken(null);
    onClose();
  };

  const createToken = async () => {
    if (!canSubmit || created || createPendingRef.current) return;
    createPendingRef.current = true;
    const requestId = ++requestRef.current;
    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await appClient.authTokens.create({
        name: name.trim(), orgSlug, scopes, expiresIn,
        projectId: boundary === "organization" ? null : projectId,
        environmentId: boundary === "environment" ? environmentId : null,
      });
      if ("error" in response) throw new Error(response.error);
      void queryClient.invalidateQueries({ queryKey: ["auth-tokens", orgSlug] });
      if (requestId !== requestRef.current) return;
      setCreated(true);
      setCreatedToken(response.token);
      tokenTimerRef.current = setTimeout(() => {
        setCreatedToken(null);
        setCopyError(null);
        tokenTimerRef.current = null;
      }, 30_000);
    } catch (error) {
      if (requestId === requestRef.current) setCreateError(error instanceof Error ? error.message : "The token could not be created.");
    } finally {
      createPendingRef.current = false;
      if (requestId === requestRef.current) setIsCreating(false);
    }
  };

  const changeBoundary = (value: TokenBoundary) => {
    setBoundary(value);
    setProjectId("");
    setEnvironmentId("");
  };
  const toggleScope = (scope: TokenScope) => {
    const next = scopes.includes(scope) ? scopes.filter((item) => item !== scope) : [...scopes, scope];
    setScopes(next);
    if (boundary !== "organization" && !next.some((item) => item.startsWith("secrets:"))) changeBoundary("organization");
  };

  return <WorkspaceDialog open onClose={close} title={created ? "Your API token" : "Create API token"} description={created ? "This credential is shown once and cannot be recovered." : "Give a credential only the access it needs."} size="md" busy={isCreating}
    footer={created || (!canCreate && !permissionPending) ? <Button size="sm" onClick={close}>Done</Button> : <><Button variant="ghost" size="sm" onClick={close} disabled={isCreating}>Cancel</Button><Button type="submit" form={formId} size="sm" disabled={!canSubmit} loading={isCreating}>Create token</Button></>}>
    {permissionPending ? <p role="status" className="py-6 text-center text-[12px] text-zinc-500">Checking token permissions…</p> : !canCreate ? <WorkspaceNotice message="Only workspace owners and admins can create API tokens." /> : created ? <TokenReveal token={createdToken} copyError={copyError} onCopyError={() => setCopyError("Could not copy the token. Try again or copy it manually.")} onCopied={() => setCopyError(null)} /> : <TokenCreationForm formId={formId} name={name} scopes={scopes} boundary={boundary} projectId={projectId} environmentId={environmentId} expiresIn={expiresIn} busy={isCreating} error={createError}
      projects={projectsQuery.data ?? []} projectsLoading={projectsQuery.isLoading} projectsError={projectsQuery.error?.message ?? null}
      environments={environmentsQuery.data ?? []} environmentsLoading={environmentsQuery.isLoading} environmentsError={environmentsQuery.error?.message ?? null}
      onNameChange={setName} onScopeChange={toggleScope} onBoundaryChange={changeBoundary} onProjectChange={(value) => { setProjectId(value); setEnvironmentId(""); }} onEnvironmentChange={setEnvironmentId} onExpiryChange={setExpiresIn}
      onRetryProjects={() => void projectsQuery.refetch()} onRetryEnvironments={() => void environmentsQuery.refetch()} onSubmit={() => void createToken()} />}
  </WorkspaceDialog>;
}

export interface TokenCreationFormProps {
  formId: string; name: string; scopes: TokenScope[]; boundary: TokenBoundary; projectId: string; environmentId: string; expiresIn: TokenExpiry; busy: boolean; error: string | null;
  projects: TokenProjectOption[]; projectsLoading: boolean; projectsError: string | null;
  environments: TokenEnvironmentOption[]; environmentsLoading: boolean; environmentsError: string | null;
  onNameChange: (value: string) => void; onScopeChange: (value: TokenScope) => void; onBoundaryChange: (value: TokenBoundary) => void;
  onProjectChange: (value: string) => void; onEnvironmentChange: (value: string) => void; onExpiryChange: (value: TokenExpiry) => void;
  onRetryProjects: () => void; onRetryEnvironments: () => void; onSubmit: () => void;
}

export function TokenCreationForm({ formId, name, scopes, boundary, projectId, environmentId, expiresIn, busy, error, projects, projectsLoading, projectsError, environments, environmentsLoading, environmentsError, onNameChange, onScopeChange, onBoundaryChange, onProjectChange, onEnvironmentChange, onExpiryChange, onRetryProjects, onRetryEnvironments, onSubmit }: TokenCreationFormProps) {
  const fieldId = useId();
  const hasSecrets = scopes.some((scope) => scope.startsWith("secrets:"));
  return <form id={formId} className="space-y-4 [&_label]:text-[12px]" onSubmit={(event) => { event.preventDefault(); if (!busy) onSubmit(); }}>
    <div className="space-y-1.5"><label htmlFor={fieldId + "-name"} className="block text-[12px] font-medium text-zinc-300">Token name</label><WorkspaceInput id={fieldId + "-name"} name="name" size="compact" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Production deploy" maxLength={100} autoComplete="off" disabled={busy} /></div>
    <fieldset disabled={busy}>
      <legend className="text-[12px] font-medium text-zinc-300">Permissions</legend>
      <p className="mb-2 mt-1 text-[11px] leading-5 text-zinc-500">Choose at least one permission. Start with the minimum access.</p>
      <div className="overflow-hidden rounded-lg border border-white/[0.08]">{tokenPermissionOptions.map((permission) => {
        const selected = scopes.includes(permission.value);
        return <label key={permission.value} className="group relative flex cursor-pointer items-center gap-3 border-b border-white/[0.06] px-3 py-2.5 transition-colors last:border-0 hover:bg-white/[0.025] motion-reduce:transition-none">
          <input type="checkbox" name="scopes" value={permission.value} checked={selected} onChange={() => onScopeChange(permission.value)} className="peer sr-only" />
          <span aria-hidden="true" className={"flex size-4 shrink-0 items-center justify-center rounded border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent " + (selected ? "border-white/30 bg-white/90 text-zinc-950" : "border-white/[0.15] bg-white/[0.015] text-transparent")}><Check size={11} strokeWidth={2.2} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[12px] text-zinc-300">{permission.product === "Secrets" ? "Secrets · " : ""}{permission.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">{permission.description}</span></span>
          {permission.product !== "Secrets" ? <span className="hidden text-[10px] text-zinc-600 sm:inline">{permission.product}</span> : null}
        </label>;
      })}</div>
    </fieldset>
    <div className="grid gap-4 sm:grid-cols-2">
      <Select label="Resource scope" value={boundary} disabled={busy} onValueChange={(value) => { if (value === "organization" || ((value === "project" || value === "environment") && hasSecrets)) onBoundaryChange(value); }} options={[{ value: "organization", label: "Entire workspace", description: "All resources allowed by the selected permissions." }, { value: "project", label: "One vault", description: "Secrets in every environment of one vault.", disabled: !hasSecrets }, { value: "environment", label: "One environment", description: "Secrets in one environment only.", disabled: !hasSecrets }]} />
      <Select label="Expires after" value={expiresIn} disabled={busy} onValueChange={(value) => { if (value === "30d" || value === "90d" || value === "1y" || value === "never") onExpiryChange(value); }} options={[{ value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }, { value: "1y", label: "One year" }, { value: "never", label: "Never" }]} />
    </div>
    <p className="!mt-2 text-[11px] leading-5 text-zinc-500">{hasSecrets ? "Vault and environment limits apply to Secrets. Tunnels and observability remain workspace-wide." : "Add a Secrets permission to limit access to a vault or environment."}</p>
    {boundary !== "organization" ? <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={boundary === "project" ? "sm:col-span-2" : ""}><Select label="Vault" value={projectId} disabled={busy || projectsLoading || projects.length === 0} onValueChange={onProjectChange} placeholder={projectsLoading ? "Loading vaults…" : "Select vault"} options={projects.map((project) => ({ value: project.id, label: project.name, description: project.slug }))} /></div>
        {boundary === "environment" ? <Select label="Environment" value={environmentId} disabled={busy || !projectId || environmentsLoading || environments.length === 0} onValueChange={onEnvironmentChange} placeholder={!projectId ? "Select a vault first" : environmentsLoading ? "Loading environments…" : "Select environment"} options={environments.map((environment) => ({ value: environment.id, label: environment.name, description: environment.slug }))} /> : null}
      </div>
      {projectsError ? <WorkspaceNotice message={projectsError} action={<Button type="button" variant="ghost" size="sm" onClick={onRetryProjects}><RefreshCw size={12} aria-hidden="true" />Retry vaults</Button>} /> : !projectsLoading && projects.length === 0 ? <WorkspaceNotice tone="info" message="No vaults are available. Create a vault in Secrets, or choose Entire workspace." /> : null}
      {boundary === "environment" && projectId ? environmentsError ? <WorkspaceNotice message={environmentsError} action={<Button type="button" variant="ghost" size="sm" onClick={onRetryEnvironments}><RefreshCw size={12} aria-hidden="true" />Retry environments</Button>} /> : !environmentsLoading && environments.length === 0 ? <WorkspaceNotice tone="info" message="This vault has no environments. Choose another vault or resource scope." /> : null : null}
    </div> : null}
    {error ? <WorkspaceNotice message={error} /> : null}
  </form>;
}

export function TokenReveal({ token, copyError, onCopyError, onCopied }: { token: string | null; copyError: string | null; onCopyError: () => void; onCopied: () => void }) {
  return <div className="ph-no-capture space-y-4">
    {token ? <>
      <WorkspaceNotice tone="info" message="Save this token in your secret manager. It is hidden after 30 seconds or when you close this dialog." />
      <div className="space-y-1.5"><p className="text-[12px] font-medium text-zinc-300">Your token</p><div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.09] bg-black/20 px-3 py-2.5"><pre aria-label="Generated API token" tabIndex={0} className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-[12px] leading-6 text-zinc-200"><code>{token}</code></pre><CopyButton value={token} iconOnly variant="plain" label="Copy token" className="shrink-0" onCopyError={onCopyError} onCopied={onCopied} /></div></div>
      {copyError ? <WorkspaceNotice message={copyError} /> : null}
    </> : <div className="py-5 text-center"><KeyRound size={24} className="mx-auto text-zinc-500" aria-hidden="true" /><h2 className="mt-3 text-[14px] font-medium text-zinc-200">Token hidden</h2><p className="mt-1 text-[12px] leading-5 text-zinc-500">Your token was created. The full credential cannot be shown again.</p></div>}
  </div>;
}
