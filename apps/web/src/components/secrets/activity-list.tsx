import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
  Key01Icon,
  RefreshIcon,
  SecurityLockIcon,
  ViewIcon,
} from "@hugeicons-pro/core-stroke-rounded";
import type { SecretAuditEvent } from "@/lib/secrets-client";
import { avatarLabel, formatAuditActor, formatRelativeDate } from "./utils";

function actionIcon(action: string): IconSvgElement {
  const normalized = action.toLowerCase();
  if (normalized.includes("delete") || normalized.includes("purge"))
    return Delete02Icon;
  if (normalized.includes("create") || normalized.includes("add"))
    return Add01Icon;
  if (normalized.includes("reveal") || normalized.includes("copy"))
    return ViewIcon;
  if (normalized.includes("rollback") || normalized.includes("restore"))
    return RefreshIcon;
  if (normalized.includes("update") || normalized.includes("edit"))
    return Edit02Icon;
  return SecurityLockIcon;
}

function humanizeAction(action: string): string {
  return action
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\bproject(s)?\b/gi, (_match, plural: string | undefined) =>
      plural ? "vaults" : "vault",
    )
    .replace(/^./, (character) => character.toUpperCase());
}

function humanizeResourceType(resourceType: string): string {
  return resourceType.toLowerCase() === "project" ? "vault" : resourceType;
}

export function ActivityList({
  events,
  compact = false,
}: {
  events: SecretAuditEvent[];
  compact?: boolean;
}) {
  return (
    <div className="divide-y divide-white/[0.065] overflow-hidden rounded-2xl border border-white/[0.08]">
      {events.map((event) => {
        const actor = formatAuditActor(event);
        const resource =
          event.resourceName ||
          event.environmentName ||
          event.projectName ||
          humanizeResourceType(event.resourceType);
        return (
          <div
            key={event.id}
            className={`flex items-start gap-3.5 px-4 sm:px-5 ${compact ? "py-3.5" : "py-4.5"}`}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-600">
              <HugeiconsIcon
                icon={actionIcon(event.action)}
                size={16}
                strokeWidth={1.7}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-5 text-zinc-400">
                <span className="font-medium text-zinc-300">{actor}</span>{" "}
                {humanizeAction(event.action).toLowerCase()}{" "}
                <span className="font-mono text-zinc-300">{resource}</span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-zinc-500">
                <span>
                  {event.projectName ||
                    event.projectSlug ||
                    event.projectId ||
                    "Workspace"}
                </span>
                {(event.environmentName ||
                  event.environmentSlug ||
                  event.environmentId) && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span>
                      {event.environmentName ||
                        event.environmentSlug ||
                        event.environmentId}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!compact && (
                <span className="hidden size-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-xs font-medium text-zinc-600 sm:flex">
                  {avatarLabel(actor, event.actorEmail)}
                </span>
              )}
              <span className="whitespace-nowrap text-[13px] text-zinc-500">
                {formatRelativeDate(event.createdAt)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ActivityEmpty() {
  return (
    <div className="rounded-2xl border border-white/[0.08] px-6 py-12 text-center">
      <HugeiconsIcon
        icon={Key01Icon}
        size={20}
        strokeWidth={1.6}
        className="mx-auto text-zinc-500"
      />
      <p className="mt-3 text-[13px] text-zinc-600">
        Secret activity will appear here.
      </p>
    </div>
  );
}
