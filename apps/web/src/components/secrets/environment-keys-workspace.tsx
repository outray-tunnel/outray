import { useEffect, useRef, useState } from "react";
import { ImportDotenvDialog, SecretEditorDialog, ConfirmSecretActionDialog } from "./secret-dialogs";
import { EnvironmentKeysContent, type EnvironmentKeysData } from "./environment-keys-content";
import { SecretsTable } from "./secrets-table";
import { useSecretsResource } from "./use-secrets-resource";
import { secretsClient, type SecretProject } from "@/lib/secrets-client";

export interface EnvironmentKeysWorkspaceProps {
  orgSlug: string;
  projectSlug: string;
  environmentSlug: string;
  project?: SecretProject;
  sharedLayout?: boolean;
  actionsContainer?: HTMLElement | null;
  onProjectMutated?: () => void;
}

export function VaultEnvironmentPageView(props: EnvironmentKeysWorkspaceProps) {
  return <EnvironmentKeysWorkspace key={JSON.stringify([props.orgSlug, props.projectSlug, props.environmentSlug])} {...props} />;
}

export function EnvironmentKeysWorkspace({ orgSlug, projectSlug, environmentSlug, project: sharedProject, sharedLayout, actionsContainer, onProjectMutated }: EnvironmentKeysWorkspaceProps) {
  const [adding, setAdding] = useState<EnvironmentKeysData | null>(null);
  const [importing, setImporting] = useState<EnvironmentKeysData | null>(null);
  const [exportTarget, setExportTarget] = useState<EnvironmentKeysData | null>(null);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  const exportPending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const resource = useSecretsResource(async (signal) => {
    const project = sharedProject ?? await secretsClient.project(orgSlug, projectSlug, signal);
    signal.throwIfAborted();
    const environment = project.environments.find((item) => item.slug === environmentSlug);
    if (!environment) throw new Error("This environment does not exist or has been deleted.");
    const [secrets, revision] = await Promise.all([
      secretsClient.secrets(orgSlug, projectSlug, environmentSlug),
      secretsClient.revision(orgSlug, projectSlug, environmentSlug),
    ]);
    signal.throwIfAborted();
    return { project, environment, secrets, revision: revision.revision ?? environment.revision };
  }, [orgSlug, projectSlug, environmentSlug]);
  const data = resource.data;

  async function downloadExport(target: EnvironmentKeysData, confirmed: boolean, confirmation: string) {
    if (!mounted.current || exportPending.current || (target.environment.isProduction && (!confirmed || confirmation !== target.environment.name))) return;
    exportPending.current = true;
    setExporting(true);
    setActionError(null);
    try {
      const blob = await secretsClient.exportDotenv(orgSlug, projectSlug, target.environment.slug, { confirmation, confirmProduction: confirmed });
      // Changing environment must never download a late plaintext response.
      if (!mounted.current) return;
      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = `${projectSlug}.${target.environment.slug}.env`;
        anchor.rel = "noopener";
        anchor.click();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
      setExportTarget(null);
    } catch (requestError) {
      if (mounted.current) setActionError(requestError instanceof Error ? requestError.message : "Could not export this environment.");
    } finally {
      exportPending.current = false;
      if (mounted.current) setExporting(false);
    }
  }
  const afterMutation = () => { if (mounted.current) { resource.reload(); onProjectMutated?.(); } };

  return <>
    <EnvironmentKeysContent orgSlug={orgSlug} projectSlug={projectSlug} environmentSlug={environmentSlug} sharedLayout={sharedLayout} actionsContainer={actionsContainer} data={data} loading={resource.loading} refreshing={resource.refreshing} error={resource.error} actionError={actionError} exporting={exporting}
      onAdd={() => { if (data) setAdding(data); }} onImport={() => { if (data) setImporting(data); }} onRetry={resource.reload}
      onExport={() => { if (!data || exportPending.current) return; setActionError(null); if (data.environment.isProduction) setExportTarget(data); else void downloadExport(data, false, data.environment.name); }}>
      {data && <SecretsTable key={JSON.stringify([orgSlug, projectSlug, data.environment.id])} contained scrollRows={sharedLayout} orgSlug={orgSlug} projectSlug={projectSlug} environment={data.environment} environments={data.project.environments} secrets={data.secrets} revision={data.revision} onMutated={afterMutation} onAdd={() => setAdding(data)} />}
    </EnvironmentKeysContent>
    {adding && <SecretEditorDialog open onClose={() => setAdding(null)} orgSlug={orgSlug} projectSlug={projectSlug} environment={adding.environment} environments={adding.project.environments} revision={adding.revision} onSaved={afterMutation} />}
    {importing && <ImportDotenvDialog open onClose={() => setImporting(null)} orgSlug={orgSlug} projectSlug={projectSlug} environment={importing.environment} revision={importing.revision} onImported={afterMutation} />}
    {exportTarget && <ConfirmSecretActionDialog open onClose={() => { if (!exportPending.current) setExportTarget(null); }} title="Export production secrets?" description={actionError || "This downloads every plaintext value in the production environment to your device. Keep the file out of source control and delete it when finished."} confirmLabel="Export .env" confirmationText={exportTarget.environment.name} production danger={false} loading={exporting} onConfirm={(confirmed, confirmation) => void downloadExport(exportTarget, confirmed, confirmation)} />}
  </>;
}
