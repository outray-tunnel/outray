import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Globe02Icon from "@hugeicons-pro/core-stroke-rounded/Globe02Icon";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import { ConfirmModal } from "../confirm-modal";

interface Subdomain {
  id: string;
  subdomain: string;
  createdAt: string;
}

interface SubdomainCardProps {
  subdomain: Subdomain;
  onDelete: (id: string) => void;
}

export function SubdomainCard({ subdomain, onDelete }: SubdomainCardProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <>
      <div className="group flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-5 last:border-b-0 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-zinc-600 ring-1 ring-white/[0.06]">
            <HugeiconsIcon icon={Globe02Icon} size={15} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[13px] font-medium text-zinc-300">
                {subdomain.subdomain}.outray.app
              </h3>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Reserved
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-700">
              Created {new Date(subdomain.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          className="p-2 text-zinc-800 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
          aria-label="Release subdomain"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.7} />
        </button>
      </div>
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => onDelete(subdomain.id)}
        title="Release Subdomain"
        message="Are you sure you want to release this subdomain?"
        isDestructive
        confirmText="Release"
      />
    </>
  );
}
