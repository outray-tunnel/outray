import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowLeft01Icon,
  Download04Icon,
  Layers01Icon,
  Upload04Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  ImportDotenvDialog,
  SecretEditorDialog,
  ConfirmSecretActionDialog,
} from "@/components/secrets/secret-dialogs";
import { SecretsTable } from "@/components/secrets/secrets-table";
import {
  SecretsBadge,
  SecretsButton,
  SecretsEmptyState,
  SecretsHeader,
  SecretsNotice,
  SecretsPage,
  SecretsSelect,
  SecretsSkeleton,
} from "@/components/secrets/secrets-ui";
import { useSecretsResource } from "@/components/secrets/use-secrets-resource";
import { secretsClient } from "@/lib/secrets-client";

export const Route = createFileRoute(
  "/$orgSlug/secrets/projects_/$projectSlug_/environments_/$environmentSlug",
)({
  head: () => ({ meta: [{ title: "Environment - OutRay Secrets" }] }),
  component: SecretEnvironmentPage,
});

function SecretEnvironmentPage() {
  const { orgSlug, projectSlug, environmentSlug } = Route.useParams();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmingExport, setConfirmingExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const resource = useSecretsResource(async () => {
    const project = await secretsClient.project(orgSlug, projectSlug);
    const environment = project.environments.find(
      (item) => item.slug === environmentSlug,
    );
    if (!environment)
      throw new Error("This environment does not exist or has been deleted.");
    const [secrets, revision] = await Promise.all([
      secretsClient.secrets(orgSlug, projectSlug, environmentSlug),
      secretsClient.revision(orgSlug, projectSlug, environmentSlug),
    ]);
    return {
      project,
      environment,
      secrets,
      revision: revision.revision || environment.revision,
    };
  }, [orgSlug, projectSlug, environmentSlug]);

  const downloadExport = async (
    productionConfirmed: boolean,
    confirmation: string,
  ) => {
    if (!resource.data) return;
    setExporting(true);
    setActionError(null);
    try {
      const blob = await secretsClient.exportDotenv(
        orgSlug,
        projectSlug,
        environmentSlug,
        { confirmation, confirmProduction: productionConfirmed },
      );
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${projectSlug}.${environmentSlug}.env`;
      anchor.rel = "noopener";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setConfirmingExport(false);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not export this environment.",
      );
    } finally {
      setExporting(false);
    }
  };

  const data =
    resource.data?.project.slug === projectSlug &&
    resource.data.environment.slug === environmentSlug
      ? resource.data
      : null;

  return (
    <SecretsPage>
      <SecretsHeader
        eyebrow={
          <Link
            to="/$orgSlug/secrets/projects/$projectSlug"
            params={{ orgSlug, projectSlug }}
            className="inline-flex items-center gap-2 transition-colors hover:text-zinc-300"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.8} />
            {data?.project.name || "Project"}
          </Link>
        }
        title={data?.environment.name || "Environment"}
        description="Secret values are encrypted and hidden by default. Revealed plaintext clears from this page after 30 seconds."
        action={
          data && (
            <div className="flex flex-wrap justify-end gap-2">
              <SecretsButton
                icon={Upload04Icon}
                onClick={() => setImporting(true)}
              >
                Import
              </SecretsButton>
              <SecretsButton
                icon={Download04Icon}
                loading={exporting}
                onClick={() =>
                  data.environment.isProduction
                    ? setConfirmingExport(true)
                    : void downloadExport(false, data.environment.name)
                }
              >
                Export .env
              </SecretsButton>
              <SecretsButton
                tone="primary"
                icon={Add01Icon}
                onClick={() => setAdding(true)}
              >
                Add secret
              </SecretsButton>
            </div>
          )
        }
      />

      {(actionError || (resource.error && data)) && (
        <SecretsNotice
          message={actionError || resource.error || "Something went wrong."}
          onDismiss={() => {
            setActionError(null);
            if (resource.error) resource.reload();
          }}
        />
      )}

      {(resource.loading || resource.refreshing) && !data ? (
        <SecretsSkeleton rows={5} />
      ) : resource.error && !data ? (
        <SecretsEmptyState
          icon={Layers01Icon}
          title="Environment could not be loaded"
          description={resource.error}
          action={
            <SecretsButton onClick={resource.reload}>Try again</SecretsButton>
          }
        />
      ) : !data ? null : (
        <>
          <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.012] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-600">
                <HugeiconsIcon
                  icon={Layers01Icon}
                  size={18}
                  strokeWidth={1.6}
                />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-medium text-zinc-300">
                    {data.project.name}
                  </p>
                  {data.environment.isProduction && (
                    <SecretsBadge tone="amber">Production</SecretsBadge>
                  )}
                  <SecretsBadge>Revision {data.revision}</SecretsBadge>
                </div>
                <p className="mt-1 text-[13px] text-zinc-500">
                  {data.secrets.length} metadata records · values hidden
                </p>
              </div>
            </div>
            <SecretsSelect
              ariaLabel="Switch environment"
              className="w-full sm:w-56"
              value={environmentSlug}
              onChange={(nextEnvironmentSlug) => {
                if (nextEnvironmentSlug === environmentSlug) return;
                void navigate({
                  to: "/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug",
                  params: {
                    orgSlug,
                    projectSlug,
                    environmentSlug: nextEnvironmentSlug,
                  },
                });
              }}
              options={data.project.environments.map((environment) => ({
                value: environment.slug,
                label: environment.name,
                description: `${environment.secretCount} secrets${environment.isProduction ? " · Production" : ""}`,
              }))}
            />
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">
                  Secret keys
                </h2>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Only key names, versions, and timestamps are loaded in this
                  table.
                </p>
              </div>
              {resource.refreshing && (
                <span className="text-[13px] text-zinc-500">Refreshing…</span>
              )}
            </div>
            <SecretsTable
              key={data.environment.slug}
              orgSlug={orgSlug}
              projectSlug={projectSlug}
              environment={data.environment}
              environments={data.project.environments}
              secrets={data.secrets}
              revision={data.revision}
              onMutated={resource.reload}
              onAdd={() => setAdding(true)}
            />
          </section>
        </>
      )}

      {data && (
        <>
          <SecretEditorDialog
            open={adding}
            onClose={() => setAdding(false)}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            environment={data.environment}
            environments={data.project.environments}
            revision={data.revision}
            onSaved={resource.reload}
          />
          <ImportDotenvDialog
            open={importing}
            onClose={() => setImporting(false)}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            environment={data.environment}
            revision={data.revision}
            onImported={resource.reload}
          />
          <ConfirmSecretActionDialog
            open={confirmingExport}
            onClose={() => setConfirmingExport(false)}
            title="Export production secrets?"
            description="This downloads every plaintext value in the production environment to your device. Keep the file out of source control and delete it when finished."
            confirmLabel="Export .env"
            confirmationText={data.environment.name}
            production
            danger={false}
            loading={exporting}
            onConfirm={(confirmed, confirmation) =>
              void downloadExport(confirmed, confirmation)
            }
          />
        </>
      )}
    </SecretsPage>
  );
}
