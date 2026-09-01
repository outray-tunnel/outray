import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Add01Icon from "@hugeicons-pro/core-stroke-rounded/Add01Icon";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import Folder01Icon from "@hugeicons-pro/core-stroke-rounded/Folder01Icon";
import Key01Icon from "@hugeicons-pro/core-stroke-rounded/Key01Icon";
import Layers01Icon from "@hugeicons-pro/core-stroke-rounded/Layers01Icon";
import SecurityLockIcon from "@hugeicons-pro/core-stroke-rounded/SecurityLockIcon";
import {
  ActivityEmpty,
  ActivityList,
} from "@/components/secrets/activity-list";
import { ProjectDialog } from "@/components/secrets/secret-dialogs";
import {
  SecretsButton,
  SecretsEmptyState,
  SecretsHeader,
  SecretsNotice,
  SecretsPage,
  SecretsSkeleton,
} from "@/components/secrets/secrets-ui";
import { useSecretsResource } from "@/components/secrets/use-secrets-resource";
import { secretsClient } from "@/lib/secrets-client";

export const Route = createFileRoute("/$orgSlug/secrets/")({
  head: () => ({ meta: [{ title: "Secrets - OutRay" }] }),
  component: SecretsOverviewPage,
});

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: IconSvgElement;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.014] p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-zinc-600">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-600">
          <HugeiconsIcon icon={icon} size={15} strokeWidth={1.7} />
        </span>
      </div>
      <p className="mt-5 text-2xl font-medium tracking-[-0.04em] text-zinc-200">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[13px] text-zinc-500">{detail}</p>
    </div>
  );
}

function SecretsOverviewPage() {
  const { orgSlug } = Route.useParams();
  const [creatingProject, setCreatingProject] = useState(false);
  const resource = useSecretsResource(
    () => secretsClient.overview(orgSlug),
    [orgSlug],
  );

  return (
    <SecretsPage>
      <SecretsHeader
        title="Overview"
        description="Vaults keep each application isolated, while environments keep development and production values safely separated."
        action={
          <SecretsButton
            tone="primary"
            icon={Add01Icon}
            onClick={() => setCreatingProject(true)}
          >
            New vault
          </SecretsButton>
        }
      />

      {resource.error && resource.data && (
        <SecretsNotice message={resource.error} onDismiss={resource.reload} />
      )}

      {resource.loading && !resource.data ? (
        <SecretsSkeleton cards={3} />
      ) : resource.error && !resource.data ? (
        <SecretsEmptyState
          icon={SecurityLockIcon}
          title="Secrets could not be loaded"
          description={resource.error}
          action={
            <SecretsButton onClick={resource.reload}>Try again</SecretsButton>
          }
        />
      ) : !resource.data ? null : (
        <>
          <section
            className="grid gap-3 sm:grid-cols-3"
            aria-label="Secrets summary"
          >
            <SummaryCard
              icon={Folder01Icon}
              label="Vaults"
              value={resource.data.projectCount}
              detail="Application boundaries"
            />
            <SummaryCard
              icon={Layers01Icon}
              label="Environments"
              value={resource.data.environmentCount}
              detail="Isolated deployment stages"
            />
            <SummaryCard
              icon={Key01Icon}
              label="Stored secrets"
              value={resource.data.secretCount}
              detail="Encrypted at rest"
            />
          </section>

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium text-zinc-200">Vaults</h2>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    Open a vault to choose an environment.
                  </p>
                </div>
                <Link
                  to="/$orgSlug/secrets/vaults"
                  params={{ orgSlug }}
                  className="flex items-center gap-1.5 text-[13px] text-zinc-600 transition-colors hover:text-zinc-300"
                >
                  View all{" "}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={13}
                    strokeWidth={1.7}
                  />
                </Link>
              </div>
              {resource.data.projects.length === 0 ? (
                <SecretsEmptyState
                  icon={Folder01Icon}
                  title="Create your first vault"
                  description="Start with one application, then add development, staging, or production environments."
                  action={
                    <SecretsButton
                      tone="primary"
                      icon={Add01Icon}
                      onClick={() => setCreatingProject(true)}
                    >
                      Create vault
                    </SecretsButton>
                  }
                />
              ) : (
                <div className="divide-y divide-white/[0.065] overflow-hidden rounded-2xl border border-white/[0.08]">
                  {resource.data.projects.slice(0, 6).map((project) => (
                    <Link
                      key={project.id}
                      to="/$orgSlug/secrets/vaults/$projectSlug"
                      params={{ orgSlug, projectSlug: project.slug }}
                      className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.02] sm:px-5"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-600 group-hover:text-zinc-400">
                        <HugeiconsIcon
                          icon={Folder01Icon}
                          size={18}
                          strokeWidth={1.6}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-zinc-300">
                          {project.name}
                        </span>
                        <span className="mt-1 block text-[13px] text-zinc-500">
                          {project.environmentCount} environments ·{" "}
                          {project.secretCount} secrets
                        </span>
                      </span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={15}
                        strokeWidth={1.7}
                        className="text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium text-zinc-200">
                    Recent activity
                  </h2>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    Security-sensitive actions across the workspace.
                  </p>
                </div>
                <Link
                  to="/$orgSlug/secrets/audit"
                  params={{ orgSlug }}
                  className="text-[13px] text-zinc-600 transition-colors hover:text-zinc-300"
                >
                  Audit log
                </Link>
              </div>
              {resource.data.recentActivity.length ? (
                <ActivityList
                  events={resource.data.recentActivity.slice(0, 6)}
                  compact
                />
              ) : (
                <ActivityEmpty />
              )}
            </section>
          </div>
        </>
      )}

      <ProjectDialog
        open={creatingProject}
        onClose={() => setCreatingProject(false)}
        orgSlug={orgSlug}
        onSaved={() => resource.reload()}
      />
    </SecretsPage>
  );
}
