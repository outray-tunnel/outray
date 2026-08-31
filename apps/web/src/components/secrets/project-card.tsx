import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Folder01Icon,
  Key01Icon,
  Layers01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import type { SecretProject } from "@/lib/secrets-client";
import { SecretsBadge } from "./secrets-ui";
import { formatRelativeDate } from "./utils";

export function ProjectCard({
  orgSlug,
  project,
}: {
  orgSlug: string;
  project: SecretProject;
}) {
  return (
    <article className="group flex min-h-52 flex-col rounded-2xl border border-white/[0.085] bg-white/[0.014] p-5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.024]">
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.035] text-zinc-500 transition-colors group-hover:text-zinc-300">
          <HugeiconsIcon icon={Folder01Icon} size={20} strokeWidth={1.6} />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to="/$orgSlug/secrets/vaults/$projectSlug"
            params={{ orgSlug, projectSlug: project.slug }}
            className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
          >
            <span className="truncate">{project.name}</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={1.7}
              className="shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400"
            />
          </Link>
          <p className="mt-1 truncate font-mono text-[13px] text-zinc-500">
            {project.slug}
          </p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 min-h-10 text-[13px] leading-5 text-zinc-600">
        {project.description || "No vault description."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.environments.slice(0, 3).map((environment) => (
          <Link
            key={environment.id}
            to="/$orgSlug/secrets/vaults/$projectSlug/environments/$environmentSlug"
            params={{
              orgSlug,
              projectSlug: project.slug,
              environmentSlug: environment.slug,
            }}
            className="transition-opacity hover:opacity-80"
          >
            <SecretsBadge tone={environment.isProduction ? "amber" : "neutral"}>
              {environment.name}
            </SecretsBadge>
          </Link>
        ))}
        {project.environments.length > 3 && (
          <SecretsBadge>+{project.environments.length - 3}</SecretsBadge>
        )}
        {project.environments.length === 0 && (
          <span className="text-[13px] text-zinc-500">No environments</span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-4 border-t border-white/[0.065] pt-4 text-[13px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Layers01Icon} size={13} strokeWidth={1.7} />
          {project.environmentCount} environments
        </span>
        <span className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Key01Icon} size={13} strokeWidth={1.7} />
          {project.secretCount} secrets
        </span>
        <span className="ml-auto hidden sm:inline">
          {formatRelativeDate(project.updatedAt)}
        </span>
      </div>
    </article>
  );
}
