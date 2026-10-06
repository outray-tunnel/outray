import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmSecretActionDialog, EnvironmentDialog, ProjectDialog } from "./secret-dialogs";
import { VaultContent } from "./vault-content";
import { useSecretsResource } from "./use-secrets-resource";
import { secretsClient, type SecretEnvironment, type SecretProject } from "@/lib/secrets-client";

type DeletionTarget =
  | { type: "project"; project: SecretProject }
  | { type: "environment"; environment: SecretEnvironment };

export function VaultPageView({ orgSlug, projectSlug }: { orgSlug: string; projectSlug: string }) {
  return <VaultWorkspace key={JSON.stringify([orgSlug, projectSlug])} orgSlug={orgSlug} projectSlug={projectSlug} />;
}

export function VaultWorkspace({ orgSlug, projectSlug }: { orgSlug: string; projectSlug: string }) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const deletePending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const resource = useSecretsResource(async (signal) => {
    const project = await secretsClient.project(orgSlug, projectSlug, signal);
    signal.throwIfAborted();
    return project;
  }, [orgSlug, projectSlug]);
  const project = resource.data?.slug === projectSlug ? resource.data : null;
  const [search, setSearch] = useState("");
  // Captured metadata keeps form drafts, revisions and confirmations stable
  // while the visible environment list refreshes in the background.
  const [editingProject, setEditingProject] = useState<SecretProject | null>(null);
  const [creatingEnvironment, setCreatingEnvironment] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState<SecretEnvironment | null>(null);
  const [deletionTarget, setDeletionTarget] = useState<DeletionTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const reload = () => { if (mounted.current) resource.reload(); };
  const openDeletion = (target: DeletionTarget) => {
    if (!mounted.current || deletePending.current) return;
    setDeleteError(null);
    setDeletionTarget(target);
  };
  const closeDeletion = () => {
    if (!mounted.current || deletePending.current) return;
    setDeletionTarget(null);
    setDeleteError(null);
  };
  const targetName = deletionTarget?.type === "project" ? deletionTarget.project.name : deletionTarget?.environment.name;
  const production = deletionTarget?.type === "project"
    ? deletionTarget.project.environments.some((environment) => environment.isProduction)
    : !!deletionTarget?.environment.isProduction;

  async function removeTarget(productionConfirmed: boolean, confirmation: string) {
    const target = deletionTarget;
    if (!mounted.current || deletePending.current || !target || confirmation !== targetName || (production && !productionConfirmed)) return;
    deletePending.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (target.type === "environment") {
        await secretsClient.deleteEnvironment(orgSlug, projectSlug, target.environment.slug, {
          confirmation, confirmProduction: productionConfirmed,
        });
        if (!mounted.current) return;
        setDeletionTarget(null);
        resource.reload();
      } else {
        await secretsClient.deleteProject(orgSlug, projectSlug, {
          confirmation, confirmProduction: productionConfirmed,
        });
        if (!mounted.current) return;
        setDeletionTarget(null);
        await navigate({ to: "/$orgSlug/secrets/vaults", params: { orgSlug } });
      }
    } catch (requestError) {
      if (mounted.current) setDeleteError(requestError instanceof Error ? requestError.message : `Could not delete ${target.type === "project" ? "vault" : "environment"}.`);
    } finally {
      deletePending.current = false;
      if (mounted.current) setDeleting(false);
    }
  }

  return <>
    <VaultContent orgSlug={orgSlug} project={project} loading={resource.loading || (resource.refreshing && !project)} refreshing={resource.refreshing} error={resource.error} search={search}
      onSearchChange={(value) => { if (mounted.current) setSearch(value); }} onRetry={reload}
      onCreateEnvironment={() => { if (mounted.current && project && !deletePending.current) setCreatingEnvironment(true); }}
      onEditVault={() => { if (mounted.current && project && !deletePending.current) setEditingProject(project); }}
      onDeleteVault={() => { if (project) openDeletion({ type: "project", project }); }}
      onEditEnvironment={(environment) => { if (mounted.current && project && !deletePending.current) setEditingEnvironment(environment); }}
      onDeleteEnvironment={(environment) => { if (project) openDeletion({ type: "environment", environment }); }} />
    <ProjectDialog open={!!editingProject} project={editingProject} orgSlug={orgSlug}
      onClose={() => { if (mounted.current) setEditingProject(null); }}
      onSaved={(savedProject) => {
        if (!mounted.current) return;
        if (savedProject.slug !== projectSlug) void navigate({ to: "/$orgSlug/secrets/vaults/$projectSlug", params: { orgSlug, projectSlug: savedProject.slug } });
        else resource.reload();
      }} />
    <EnvironmentDialog open={creatingEnvironment} orgSlug={orgSlug} projectSlug={projectSlug}
      onClose={() => { if (mounted.current) setCreatingEnvironment(false); }} onSaved={reload} />
    <EnvironmentDialog open={!!editingEnvironment} environment={editingEnvironment} orgSlug={orgSlug} projectSlug={projectSlug}
      onClose={() => { if (mounted.current) setEditingEnvironment(null); }} onSaved={reload} />
    <ConfirmSecretActionDialog key={deletionTarget ? JSON.stringify([deletionTarget.type, deletionTarget.type === "project" ? deletionTarget.project.id : deletionTarget.environment.id]) : "closed"}
      open={!!deletionTarget} onClose={closeDeletion} title={targetName ? `Delete ${targetName}?` : "Delete vault or environment?"}
      description={deletionTarget?.type === "environment" ? "Move this environment and all of its secrets to Trash. They become unavailable immediately." : "Move this vault, its environments, and its secrets to Trash. They become unavailable immediately."}
      confirmLabel={deletionTarget?.type === "environment" ? "Delete environment" : "Delete vault"} confirmationText={targetName} production={production} loading={deleting} error={deleteError}
      onConfirm={(confirmed, confirmation) => void removeTarget(confirmed, confirmation)} />
  </>;
}
