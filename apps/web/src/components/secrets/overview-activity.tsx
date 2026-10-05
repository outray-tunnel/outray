import { useId } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { SecretAuditEvent } from "@/lib/secrets-client";
import { formatAuditActor, formatRelativeDate } from "./utils";

function actionIcon(action: string): LucideIcon {
  const normalized = action.toLowerCase();
  if (normalized.includes("delete") || normalized.includes("purge")) return Trash2;
  if (normalized.includes("create") || normalized.includes("add")) return Plus;
  if (normalized.includes("reveal") || normalized.includes("copy")) return Eye;
  if (normalized.includes("rollback") || normalized.includes("restore")) return RotateCcw;
  if (normalized.includes("update") || normalized.includes("edit")) return Pencil;
  return KeyRound;
}

function humanizeAction(action: string): string {
  return action
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\bproject(s)?\b/gi, (_match, plural: string | undefined) =>
      plural ? "vaults" : "vault",
    )
    .toLowerCase();
}

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function fullTimestamp(value: string): string {
  if (!Number.isFinite(timestamp(value))) return "Timestamp unavailable";
  return `${new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value))} (${value})`;
}

export function SecretsOverviewActivity({
  orgSlug,
  events,
}: {
  orgSlug: string;
  events: SecretAuditEvent[];
}) {
  const headingId = useId();
  const recentEvents = [...events]
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
    .slice(0, 6);

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[13px] font-medium text-zinc-200">
            Recent activity
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-zinc-500">
            Latest changes and access across your vaults.
          </p>
        </div>
        <Link
          to="/$orgSlug/secrets/audit"
          params={{ orgSlug }}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[12px] leading-5 text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
        >
          Audit log
          <ArrowUpRight size={13} strokeWidth={1.6} aria-hidden="true" />
        </Link>
      </div>

      {recentEvents.length ? (
        <ul
          aria-label="Recent secrets activity"
          className="divide-y divide-white/[0.06] border-y border-white/[0.08]"
        >
          {recentEvents.map((event) => {
            const Icon = actionIcon(event.action);
            const actor = formatAuditActor(event);
            const resource =
              event.resourceName ||
              event.environmentName ||
              event.projectName ||
              (event.resourceType === "project" ? "vault" : event.resourceType);
            const vault = event.projectName || event.projectSlug || event.projectId;
            const environment =
              event.environmentName || event.environmentSlug || event.environmentId;
            const actorTitle =
              event.actorName && event.actorEmail
                ? `${actor} (${event.actorEmail})`
                : actor;

            return (
              <li
                key={event.id}
                data-secret-audit-event={event.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <Icon
                  size={15}
                  strokeWidth={1.6}
                  aria-hidden="true"
                  className="mt-0.5 text-zinc-500"
                />
                <div className="min-w-0">
                  <p className="break-words text-[13px] leading-5 text-zinc-400">
                    <span title={actorTitle} className="font-medium text-zinc-300">
                      {actor}
                    </span>{" "}
                    {humanizeAction(event.action)}{" "}
                    <span className={event.resourceType === "secret" ? "font-mono text-zinc-300" : "text-zinc-300"}>
                      {resource}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 break-words text-[11px] leading-4 text-zinc-500">
                    <span>{vault ? `Vault · ${vault}` : "Workspace"}</span>
                    {environment && <span>Environment · {environment}</span>}
                  </p>
                </div>
                <time
                  dateTime={Number.isFinite(timestamp(event.createdAt)) ? event.createdAt : undefined}
                  title={fullTimestamp(event.createdAt)}
                  className="col-start-2 whitespace-nowrap text-[11px] leading-4 text-zinc-500 sm:col-auto sm:pt-0.5 sm:text-right"
                >
                  {formatRelativeDate(event.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex items-start gap-3 border-y border-white/[0.08] py-6">
          <Activity size={16} strokeWidth={1.6} aria-hidden="true" className="mt-0.5 shrink-0 text-zinc-500" />
          <div>
            <p className="text-[13px] leading-5 text-zinc-400">No recent activity</p>
            <p className="mt-1 text-[12px] leading-5 text-zinc-500">
              Vault changes and secret access will appear here.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
