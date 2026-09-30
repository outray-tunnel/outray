import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, Globe2, RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { uptimeRequest, useUptimeResource } from "@/components/uptime/uptime-client";
import { useStatusPageEditor } from "@/components/uptime/status-page-editor-context";
import { UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { fieldClass, primaryButton, secondaryButton, UptimeError, UptimePanel } from "@/components/uptime/uptime-ui";
import { statusPageUrl } from "@/lib/uptime/status-url";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/domains")({
  head: () => ({ meta: [{ title: "Status page domains - OutRay Uptime" }] }),
  component: StatusPageDomains,
});

interface StatusDomain {
  id: string;
  domain: string;
  status: string;
}

const statusOrigin = (import.meta.env.VITE_OUTRAY_STATUS_URL || "https://status.outray.app").replace(/\/$/, "");
const cnameTarget = "status.outray.app";

function StatusPageDomains() {
  const { orgSlug, page } = useStatusPageEditor();
  const { data, loading, error: loadError, reload } = useUptimeResource<{ domain: StatusDomain | null }>(orgSlug, "/domains");
  const [hostname, setHostname] = useState("");
  const [working, setWorking] = useState<"add" | "verify" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const domain = data?.domain;
  const canonicalUrl = statusPageUrl(statusOrigin, page.slug);
  const customUrl = domain ? `https://${domain.domain}/` : null;

  const addDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking("add"); setError(null);
    try {
      await uptimeRequest(orgSlug, "/domains", { method: "POST", body: JSON.stringify({ domain: hostname.trim() }) });
      setHostname("");
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the domain.");
    } finally { setWorking(null); }
  };

  const verifyDomain = async () => {
    if (!domain) return;
    setWorking("verify"); setError(null);
    try {
      await uptimeRequest(orgSlug, `/domains/${encodeURIComponent(domain.id)}/verify`, { method: "POST" });
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "DNS verification failed.");
    } finally { setWorking(null); }
  };

  const removeDomain = async () => {
    if (!domain) return;
    setWorking("remove"); setError(null);
    try {
      await uptimeRequest(orgSlug, `/domains/${encodeURIComponent(domain.id)}`, { method: "DELETE" });
      setConfirmRemove(false);
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the domain.");
    } finally { setWorking(null); }
  };

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch { setError("Could not copy automatically. Select the value and copy it manually."); }
  };

  return <div className="max-w-4xl space-y-5">
    <div className="mb-6">
      <h2 className="text-xl font-medium tracking-tight text-white">Domains</h2>
      <p className="mt-1 text-sm text-zinc-500">Give your public status page an address on a subdomain you own.</p>
    </div>

    <UptimePanel className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Globe2 size={18} className="mt-0.5 shrink-0 text-zinc-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-zinc-100">OutRay address</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">This address always belongs to your page. Your custom domain is an additional way to reach it.</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3">
            <span className="min-w-0 break-all font-mono text-[12px] text-zinc-300">{canonicalUrl}</span>
            {page.published && <a href={canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">Open <ExternalLink size={13} aria-hidden="true" /></a>}
          </div>
        </div>
      </div>
    </UptimePanel>

    {loadError && <UptimeError message={loadError} />}
    {error && <UptimeError message={error} />}
    {loading && !data && <UptimeSkeleton label="Loading custom domain"><div className="h-48 rounded-[20px] border border-white/[0.08] bg-white/[0.015]" /></UptimeSkeleton>}

    {data && !domain && <UptimePanel className="p-5 sm:p-6">
      <h3 className="text-sm font-medium text-zinc-100">Connect a custom domain</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">Use a subdomain such as status.example.com. One custom domain is available per status page.</p>
      <form onSubmit={(event) => void addDomain(event)} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 text-xs font-medium text-zinc-300">Subdomain
          <input className={`${fieldClass} mt-2`} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="status.example.com" required maxLength={253} />
        </label>
        <button type="submit" className={primaryButton} disabled={working !== null}>{working === "add" ? "Adding…" : "Add domain"}</button>
      </form>
      <p className="mt-4 text-xs leading-5 text-zinc-600">You’ll add a TXT record to prove ownership, then a DNS-only CNAME to route visitors to OutRay. Apex domains are not supported.</p>
    </UptimePanel>}

    {domain && <UptimePanel className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="break-all text-base font-medium text-zinc-100">{domain.domain}</h3>
            <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${domain.status === "active" ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300" : "border-amber-400/20 bg-amber-400/[0.07] text-amber-300"}`}>
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{domain.status === "active" ? "Verified" : "Pending DNS"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{domain.status === "active" ? (page.published ? "DNS is verified. Your status page can be reached from this domain." : "DNS is verified. Publish the page to make it available to visitors.") : "Add both records below, then verify the connection."}</p>
        </div>
        {domain.status === "active" && page.published && customUrl && <a href={customUrl} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} gap-2`}>Visit page <ExternalLink size={14} aria-hidden="true" /></a>}
      </div>

      <div className="px-5 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4"><h4 className="text-sm font-medium text-zinc-200">DNS records</h4><span className="text-[11px] text-zinc-600">Add these at your DNS provider</span></div>
        <div className="mt-4 space-y-3">
          <DnsRecord type="TXT" label="Ownership" name={`_outray-challenge.${domain.domain}`} value={domain.id} copied={copied} onCopy={copy} />
          <DnsRecord type="CNAME" label="Routing" name={domain.domain} value={cnameTarget} copied={copied} onCopy={copy} />
        </div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">Set the CNAME to <span className="text-zinc-300">DNS only</span> (no proxy). Some DNS providers add your zone name automatically; enter only the host portion if yours does.</p>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-5">
          {domain.status !== "active" && <button type="button" onClick={() => void verifyDomain()} disabled={working !== null} className={`${primaryButton} gap-2`}><RefreshCw size={14} aria-hidden="true" />{working === "verify" ? "Checking DNS…" : "Verify DNS"}</button>}
          {!confirmRemove ? <button type="button" onClick={() => setConfirmRemove(true)} disabled={working !== null} className={`${secondaryButton} gap-2`}><Trash2 size={14} aria-hidden="true" />Remove domain</button> : <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Confirm domain removal"><span className="text-xs text-zinc-400">Remove this domain? Your OutRay address will keep working.</span><button type="button" className="min-h-10 rounded-xl border border-rose-400/20 px-3 text-xs font-medium text-rose-300 hover:bg-rose-400/[0.07] disabled:opacity-50" disabled={working !== null} onClick={() => void removeDomain()}>{working === "remove" ? "Removing…" : "Yes, remove"}</button><button type="button" className="min-h-10 px-2 text-xs text-zinc-400 hover:text-white" onClick={() => setConfirmRemove(false)} disabled={working !== null}>Cancel</button></div>}
        </div>
      </div>
    </UptimePanel>}
    <p role="status" className="sr-only">{copied ? `${copied} copied` : ""}</p>
  </div>;
}

function DnsRecord({ type, label, name, value, copied, onCopy }: {
  type: "TXT" | "CNAME";
  label: string;
  name: string;
  value: string;
  copied: string | null;
  onCopy: (value: string, key: string) => Promise<void>;
}) {
  return <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
    <div className="flex items-center gap-2"><span className="rounded-md border border-white/[0.1] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{type}</span><span className="text-xs text-zinc-500">{label}</span></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <DnsValue label="Name" value={name} copyKey={`${type} name`} copied={copied} onCopy={onCopy} />
      <DnsValue label="Value" value={value} copyKey={`${type} value`} copied={copied} onCopy={onCopy} />
    </div>
  </div>;
}

function DnsValue({ label, value, copyKey, copied, onCopy }: {
  label: string;
  value: string;
  copyKey: string;
  copied: string | null;
  onCopy: (value: string, key: string) => Promise<void>;
}) {
  return <div className="min-w-0"><p className="text-[11px] text-zinc-600">{label}</p><div className="mt-1 flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.07] bg-[#111113] px-3"><code className="min-w-0 flex-1 break-all text-[11px] text-zinc-300">{value}</code><button type="button" onClick={() => void onCopy(value, copyKey)} className="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-violet-400" aria-label={`Copy ${copyKey}`} title={`Copy ${copyKey}`}>{copied === copyKey ? <Check size={14} className="text-emerald-300" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</button></div></div>;
}
