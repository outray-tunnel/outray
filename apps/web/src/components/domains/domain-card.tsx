import { useId, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { ResourceDeleteDialog } from "../resource-delete-dialog";
import "../outray-arc-theme.css";
import publicHosts from "../../../../../shared/public-hosts";

const cnameTarget = publicHosts.tunnelDnsHostname(import.meta.env?.VITE_TUNNEL_URL);

interface Domain {
  id: string;
  domain: string;
  status: "active" | "failed" | "pending";
  createdAt: string | Date;
}

interface DomainCardProps {
  domain: Domain;
  onVerify: (id: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  isVerifying: boolean;
  defaultExpanded?: boolean;
}

const statuses = {
  active: { label: "Active", className: "bg-emerald-400/[0.07] text-emerald-300/90", dot: "bg-emerald-400" },
  pending: { label: "Pending DNS", className: "bg-amber-400/[0.07] text-amber-300/90", dot: "bg-amber-400" },
  failed: { label: "Needs attention", className: "bg-rose-400/[0.07] text-rose-300/90", dot: "bg-rose-400" },
} as const;

export function DomainCard({
  domain,
  onVerify,
  onDelete,
  isVerifying,
  defaultExpanded = false,
}: DomainCardProps) {
  const dnsId = useId();
  const [isDnsOpen, setIsDnsOpen] = useState(defaultExpanded);
  const [isChecking, setIsChecking] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const verifyInFlight = useRef(false);
  const verificationPending = isChecking || isVerifying;
  const status = statuses[domain.status];
  const toggleLabel = domain.status === "active" ? "DNS records" : "Set up DNS";
  const createdAt = domain.createdAt instanceof Date
    ? domain.createdAt
    : new Date(domain.createdAt);
  const hasDate = Number.isFinite(createdAt.getTime());
  // Full owner names match the verifier without guessing the provider's DNS zone.
  const records = [
    { type: "CNAME", name: domain.domain, value: cnameTarget },
    { type: "TXT", name: `_outray-challenge.${domain.domain}`, value: domain.id },
  ];

  const handleVerify = async () => {
    if (verifyInFlight.current || isVerifying) return;
    verifyInFlight.current = true;
    setIsChecking(true);
    setVerifyError(null);
    try {
      await onVerify(domain.id);
    } catch (reason) {
      setVerifyError(
        reason instanceof Error
          ? reason.message
          : "Could not verify this domain. Check the records and try again.",
      );
    } finally {
      verifyInFlight.current = false;
      setIsChecking(false);
    }
  };

  return (
    <article
      aria-label={`Domain ${domain.domain}`}
      className="outray-arc border-b border-white/[0.06] last:border-b-0"
      style={{ "--control-height-sm": "36px" } as CSSProperties}
    >
      <div className="flex min-h-[76px] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025] motion-reduce:transition-none sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-500 ring-1 ring-white/[0.06]">
          <HugeiconsIcon icon={Globe02Icon} size={16} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="max-w-full truncate text-[13px] font-normal text-zinc-200" title={domain.domain}>
              {domain.domain}
            </h3>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] ${status.className}`}>
              <span className={`size-1 rounded-full ${status.dot}`} aria-hidden="true" />
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">
            <time dateTime={hasDate ? createdAt.toISOString() : undefined}>
              {hasDate
                ? `Added ${createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                : "Added date unavailable"}
            </time>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${toggleLabel} for ${domain.domain}`}
            aria-expanded={isDnsOpen}
            aria-controls={dnsId}
            disabled={verificationPending}
            onClick={() => setIsDnsOpen((open) => !open)}
          >
            <span className="hidden sm:inline">{toggleLabel}</span>
            <span className="sm:hidden">DNS</span>
            <ChevronDown size={13} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${isDnsOpen ? "rotate-180" : ""}`} />
          </Button>
          <ResourceDeleteDialog
            title="Remove domain"
            description="This hostname will no longer be available for new tunnels in this workspace. Your DNS records will not be changed."
            resourceName={domain.domain}
            triggerLabel={`Remove domain ${domain.domain}`}
            actionLabel="Remove domain"
            disabled={verificationPending}
            onConfirm={() => onDelete(domain.id)}
          />
        </div>
      </div>

      <div id={dnsId} hidden={!isDnsOpen} className="mx-4 mb-4 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.015] sm:mx-5">
        {isDnsOpen && (
          <>
            <div className="border-b border-white/[0.06] px-3 py-3">
              <h4 className="text-[12px] font-medium text-zinc-300">DNS records</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Point this hostname to OutRay and add the ownership token below.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                Full hostnames are shown. If your provider appends the DNS zone, enter only the relative name.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[11px]">
                <caption className="sr-only">{domain.domain} DNS records</caption>
                <thead className="border-b border-white/[0.06] text-zinc-600">
                  <tr>
                    <th scope="col" className="w-[72px] px-3 py-2 font-normal">Type</th>
                    <th scope="col" className="px-3 py-2 font-normal">Name</th>
                    <th scope="col" className="px-3 py-2 font-normal">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {records.map((record) => (
                    <tr key={record.type}>
                      <th scope="row" className="px-3 py-2.5 align-top text-[10px] font-medium text-zinc-400">{record.type}</th>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center justify-between gap-2">
                          <code className="break-all text-zinc-300">{record.name}</code>
                          <CopyButton value={record.name} label={`Copy ${record.type} name for ${domain.domain}`} iconOnly variant="plain" className="shrink-0" />
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center justify-between gap-2">
                          <code className="break-all text-zinc-300">{record.value}</code>
                          <CopyButton value={record.value} label={`Copy ${record.type} value for ${domain.domain}`} iconOnly variant="plain" className="shrink-0" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-3" aria-busy={verificationPending}>
              <div className="min-w-0 flex-1">
                {verifyError
                  ? <p role="alert" className="text-[12px] text-rose-300">{verifyError}</p>
                  : <p className="text-[11px] text-zinc-600">DNS changes may take a few minutes to appear.</p>}
              </div>
              <Button type="button" variant="secondary" size="sm" loading={verificationPending} onClick={() => void handleVerify()}>
                {verificationPending ? "Checking DNS…" : "Verify DNS"}
              </Button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
