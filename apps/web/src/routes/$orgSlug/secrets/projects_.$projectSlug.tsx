import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Edit02Icon,
  Folder01Icon,
  Key01Icon,
  Layers01Icon,
  Settings02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  ConfirmSecretActionDialog,
  EnvironmentDialog,
  ProjectDialog,
} from "@/components/secrets/secret-dialogs";
import {
  ActionMenu,
  SecretsBadge,
  SecretsButton,
  SecretsEmptyState,
  SecretsHeader,
  SecretsNotice,
  SecretsPage,
  SecretsSkeleton,
} from "@/components/secrets/secrets-ui";
import { formatRelativeDate } from "@/components/secrets/utils";
import { useSecretsResource } from "@/components/secrets/use-secrets-resource";
import { secretsClient, type SecretEnvironment } from "@/lib/secrets-client";

export const Route = createFileRoute(
  "/$orgSlug/secrets/projects_/$projectSlug",
)({
  head: () => ({ meta: [{ title: "Project - OutRay Secrets" }] }),
  component: SecretProjectPage,
});

function environmentTone(
  environment: SecretEnvironment,
): "amber" | "green" | "violet" | "neutral" {
  if (environment.isProduction) return "amber";
  if (environment.slug.includes("stag")) return "violet";
  if (environment.slug.includes("dev")) return "green";
  return "neutral";
}

function SecretProjectPage() {
  const { orgSlug, projectSlug } = Route.useParams();
  const navigate = useNavigate();
  const resource = useSecretsResource(
    () => secretsClient.project(orgSlug, projectSlug),
    [orgSlug, projectSlug],
  );
  const [editingProject, setEditingProject] = useState(false);
  const [creatingEnvironment, setCreatingEnvironment] = useState(false);
  const [editingEnvironment, setEditingEnvironment] =
    useState<SecretEnvironment | null>(null);
  const [deletingEnvironment, setDeletingEnvironment] =
    useState<SecretEnvironment | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const removeEnvironment = async (
    productionConfirmed: boolean,
    confirmation: string,
  ) => {
    if (!deletingEnvironment) return;
    setMutating(true);
    setMutationError(null);
    try {
      await secretsClient.deleteEnvironment(
        orgSlug,
        projectSlug,
        deletingEnvironment.slug,
        {
          confirmation,
          confirmProduction: productionConfirmed,
        },
      );
      setDeletingEnvironment(null);
      resource.reload();
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete environment.",
      );
    } finally {
      setMutating(false);
    }
  };

  const removeProject = async (
    productionConfirmed: boolean,
    confirmation: string,
  ) => {
    setMutating(true);
    setMutationError(null);
    try {
      await secretsClient.deleteProject(orgSlug, projectSlug, {
        confirmation,
        confirmProduction: productionConfirmed,
      });
      setDeletingProject(false);
      await navigate({ to: "/$orgSlug/secrets/projects", params: { orgSlug } });
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete project.",
      );
    } finally {
      setMutating(false);
    }
  };

  const project = resource.data?.slug === projectSlug ? resource.data : null;
  const hasProduction =
    project?.environments.some((environment) => environment.isProduction) ||
    false;

  return (
    <SecretsPage>
      <SecretsHeader
        eyebrow={
          <Link
            to="/$orgSlug/secrets/projects"
            params={{ orgSlug }}
            className="inline-flex items-center gap-2 transition-colors hover:text-zinc-300"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.8} />{" "}
            Projects
          </Link>
        }
        title={project?.name || "Project"}
        description={
          project?.description ||
          "Choose an environment to view and manage its secret keys."
        }
        action={
          project && (
            <div className="flex items-center gap-2">
              <ActionMenu
                label="Project actions"
                items={[
                  {
                    label: "Edit project",
                    icon: Edit02Icon,
                    onSelect: () => setEditingProject(true),
                  },
                  {
                    label: "Delete project",
                    icon: Delete02Icon,
                    onSelect: () => setDeletingProject(true),
                    danger: true,
                  },
                ]}
              />
              <SecretsButton
                tone="primary"
                icon={Add01Icon}
                onClick={() => setCreatingEnvironment(true)}
              >
                Add environment
              </SecretsButton>
            </div>
          )
        }
      />

      {(mutationError || (resource.error && resource.data)) && (
        <SecretsNotice
          message={mutationError || resource.error || "Something went wrong."}
          onDismiss={() => {
            setMutationError(null);
            if (resource.error) resource.reload();
          }}
        />
      )}

      {(resource.loading || resource.refreshing) && !project ? (
        <SecretsSkeleton />
      ) : resource.error && !project ? (
        <SecretsEmptyState
          icon={Folder01Icon}
          title="Project could not be loaded"
          description={resource.error}
          action={
            <SecretsButton onClick={resource.reload}>Try again</SecretsButton>
          }
        />
      ) : !project ? null : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.014] p-5">
              <div className="flex items-center gap-2 text-[13px] text-zinc-600">
                <HugeiconsIcon
                  icon={Layers01Icon}
                  size={14}
                  strokeWidth={1.7}
                />{" "}
                Environments
              </div>
              <p className="mt-4 text-2xl font-medium text-zinc-200">
                {project.environmentCount}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.014] p-5">
              <div className="flex items-center gap-2 text-[13px] text-zinc-600">
                <HugeiconsIcon icon={Key01Icon} size={14} strokeWidth={1.7} />{" "}
                Stored secrets
              </div>
              <p className="mt-4 text-2xl font-medium text-zinc-200">
                {project.secretCount}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.014] p-5">
              <div className="flex items-center gap-2 text-[13px] text-zinc-600">
                <HugeiconsIcon
                  icon={Settings02Icon}
                  size={14}
                  strokeWidth={1.7}
                />{" "}
                Last changed
              </div>
              <p className="mt-4 text-sm font-medium text-zinc-300">
                {formatRelativeDate(project.updatedAt)}
              </p>
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-zinc-200">
                Environments
              </h2>
              <p className="mt-1 text-[13px] text-zinc-500">
                Each environment has an independent revision and value history.
              </p>
            </div>
            {project.environments.length === 0 ? (
              <SecretsEmptyState
                icon={Layers01Icon}
                title="Add your first environment"
                description="Development, staging, and production are common starting points."
                action={
                  <SecretsButton
                    tone="primary"
                    icon={Add01Icon}
                    onClick={() => setCreatingEnvironment(true)}
                  >
                    Add environment
                  </SecretsButton>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {project.environments.map((environment) => (
                  <article key={environment.id} className="relative">
                    <Link
                      to="/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug"
                      params={{
                        orgSlug,
                        projectSlug,
                        environmentSlug: environment.slug,
                      }}
                      aria-label={`Open ${environment.name} environment`}
                      className="group block h-full rounded-2xl border border-white/[0.085] bg-white/[0.014] p-5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.024] focus:outline-none focus-visible:border-white/[0.2] focus-visible:ring-2 focus-visible:ring-white/10"
                    >
                      <div className="flex items-start gap-3 pr-12">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-zinc-600">
                          <HugeiconsIcon
                            icon={Layers01Icon}
                            size={18}
                            strokeWidth={1.6}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-zinc-200 transition-colors group-hover:text-white">
                            <span className="truncate">{environment.name}</span>
                            <HugeiconsIcon
                              icon={ArrowRight01Icon}
                              size={14}
                              strokeWidth={1.7}
                              className="shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5"
                            />
                          </span>
                          <p className="mt-1 truncate font-mono text-[13px] text-zinc-500">
                            {environment.slug}
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 min-h-10 text-[13px] leading-5 text-zinc-600">
                        {environment.description ||
                          "No environment description."}
                      </p>
                      <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-4">
                        <SecretsBadge tone={environmentTone(environment)}>
                          {environment.isProduction
                            ? "Production"
                            : environment.name}
                        </SecretsBadge>
                        <span className="ml-auto text-[13px] text-zinc-500">
                          {environment.secretCount} secrets · r
                          {environment.revision}
                        </span>
                      </div>
                    </Link>
                    <div className="absolute right-5 top-5 z-10">
                      <ActionMenu
                        label={`Actions for ${environment.name}`}
                        items={[
                          {
                            label: "Edit environment",
                            icon: Edit02Icon,
                            onSelect: () => setEditingEnvironment(environment),
                          },
                          {
                            label: "Delete environment",
                            icon: Delete02Icon,
                            onSelect: () => setDeletingEnvironment(environment),
                            danger: true,
                          },
                        ]}
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {project && (
        <>
          <ProjectDialog
            open={editingProject}
            onClose={() => setEditingProject(false)}
            orgSlug={orgSlug}
            project={project}
            onSaved={(savedProject) => {
              if (savedProject.slug !== projectSlug) {
                void navigate({
                  to: "/$orgSlug/secrets/projects/$projectSlug",
                  params: { orgSlug, projectSlug: savedProject.slug },
                });
              } else {
                resource.reload();
              }
            }}
          />
          <EnvironmentDialog
            open={creatingEnvironment}
            onClose={() => setCreatingEnvironment(false)}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            onSaved={() => resource.reload()}
          />
          <EnvironmentDialog
            open={!!editingEnvironment}
            onClose={() => setEditingEnvironment(null)}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            environment={editingEnvironment}
            onSaved={() => resource.reload()}
          />
        </>
      )}
      <ConfirmSecretActionDialog
        open={!!deletingEnvironment}
        onClose={() => setDeletingEnvironment(null)}
        title={
          deletingEnvironment
            ? `Delete ${deletingEnvironment.name}?`
            : "Delete environment?"
        }
        description="The environment and all of its secrets will become unavailable immediately."
        confirmLabel="Delete environment"
        confirmationText={deletingEnvironment?.name}
        production={!!deletingEnvironment?.isProduction}
        loading={mutating}
        onConfirm={(confirmed, confirmation) =>
          void removeEnvironment(confirmed, confirmation)
        }
      />
      <ConfirmSecretActionDialog
        open={deletingProject}
        onClose={() => setDeletingProject(false)}
        title={project ? `Delete ${project.name}?` : "Delete project?"}
        description="All environments and secrets in this project will become unavailable immediately."
        confirmLabel="Delete project"
        confirmationText={project?.name}
        production={hasProduction}
        loading={mutating}
        onConfirm={(confirmed, confirmation) =>
          void removeProject(confirmed, confirmation)
        }
      />
    </SecretsPage>
  );
}
