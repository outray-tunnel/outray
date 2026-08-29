import { Link, useParams } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowRight01Icon,
} from "@hugeicons-pro/core-stroke-rounded";

interface DomainLimitWarningProps {
  isAtLimit: boolean;
  domainLimit: number;
  currentPlan: string;
}

export function DomainLimitWarning({
  isAtLimit,
  domainLimit,
  currentPlan,
}: DomainLimitWarningProps) {
  const { orgSlug } = useParams({ from: "/$orgSlug" });

  if (!isAtLimit) return null;

  const planName =
    currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1).toLowerCase();
  const domainLabel = domainLimit === 1 ? "domain" : "domains";

  return (
    <aside
      role="status"
      className="flex flex-col gap-4 rounded-xl border border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-400/[0.08] text-amber-300">
          <HugeiconsIcon icon={Alert02Icon} size={15} strokeWidth={1.8} />
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[12px] font-medium text-zinc-200">
              Custom domains are full
            </p>
            <span className="text-[10px] text-zinc-700" aria-hidden="true">
              /
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-amber-300/70">
              {domainLimit} of {domainLimit} used
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-zinc-600">
            Your {planName} plan includes {domainLimit} custom {domainLabel}.
            Upgrade to connect more domains.
          </p>
        </div>
      </div>

      <Link
        to="/$orgSlug/billing"
        params={{ orgSlug }}
        className="group ml-11 flex w-fit shrink-0 items-center gap-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:text-white sm:ml-0"
      >
        View plans
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={13}
          strokeWidth={1.8}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </aside>
  );
}
