import type { CSSProperties } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { ResourceDeleteDialog } from "../resource-delete-dialog";
import "../outray-arc-theme.css";

interface Subdomain {
  id: string;
  subdomain: string;
  createdAt: string | Date;
}

interface SubdomainCardProps {
  subdomain: Subdomain;
  onDelete: (id: string) => Promise<unknown>;
}

export function SubdomainCard({ subdomain, onDelete }: SubdomainCardProps) {
  const address = `${subdomain.subdomain}.outray.app`;
  const createdAt = subdomain.createdAt instanceof Date
    ? subdomain.createdAt
    : new Date(subdomain.createdAt);
  const hasDate = Number.isFinite(createdAt.getTime());

  return (
    <article
      aria-label={`Reserved subdomain ${address}`}
      className="outray-arc flex min-h-[76px] items-center gap-3 border-b border-white/[0.06] px-4 py-3 transition-colors last:border-b-0 hover:bg-white/[0.025] motion-reduce:transition-none sm:px-5"
      style={{ "--control-height-sm": "36px" } as CSSProperties}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-500 ring-1 ring-white/[0.06]">
        <HugeiconsIcon icon={Globe02Icon} size={16} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="max-w-full truncate text-[13px] font-normal text-zinc-200" title={address}>
            {address}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/[0.07] px-2 py-0.5 text-[10px] text-emerald-300/90">
            <span className="size-1 rounded-full bg-emerald-400" aria-hidden="true" />
            Reserved
          </span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">
          <time dateTime={hasDate ? createdAt.toISOString() : undefined}>
            {hasDate
              ? `Reserved ${createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
              : "Reservation date unavailable"}
          </time>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <CopyButton value={address} label={`Copy address ${address}`} iconOnly variant="plain" />
        <ResourceDeleteDialog
          title="Release subdomain"
          description="This reserved address will become available to other workspaces. This cannot be undone."
          resourceName={address}
          triggerLabel={`Release subdomain ${address}`}
          actionLabel="Release subdomain"
          onConfirm={() => onDelete(subdomain.id)}
        />
      </div>
    </article>
  );
}
