import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Globe2, Info, RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { uptimeRequest, useUptimeResource } from "@/components/uptime/uptime-client";
import { useStatusPageEditor } from "@/components/uptime/status-page-editor-context";
import { UptimeDialog } from "@/components/uptime/uptime-dialog";
import { UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { secondaryButton, UptimeError, UptimePanel } from "@/components/uptime/uptime-ui";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { statusPageUrl } from "@/lib/uptime/status-url";
import publicHosts from "../../../../../../../shared/public-hosts";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/domains")({
  head: () => ({ meta: [{ title: "Status page domains - OutRay Uptime" }] }),
  component: StatusPageDomains,
});

interface StatusDomain { id: string; domain: string; status: string }
const statusOrigin = (import.meta.env.VITE_OUTRAY_STATUS_URL || "https://status.outray.app").replace(/\/$/, "");
const cnameTarget = publicHosts.canonicalStatusHostname({ OUTRAY_STATUS_URL: statusOrigin });

function StatusPageDomains() {
  const { orgSlug, page, canManage, reload: reloadPage } = useStatusPageEditor();
  const { data, loading, error: loadError, reload } = useUptimeResource<{ domain: StatusDomain | null }>(orgSlug, "/domains");
  const [hostname, setHostname] = useState("");
  const [working, setWorking] = useState<"add" | "verify" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const pending = useRef(false);
  const domain = data?.domain;
  const canonicalUrl = statusPageUrl(statusOrigin, page.slug);

  const addDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || pending.current) return;
    pending.current = true; setWorking("add"); setError(null); setNotice(null);
    try { await uptimeRequest(orgSlug, "/domains", { method: "POST", body: JSON.stringify({ domain: hostname.trim() }) }); setHostname(""); reload(); reloadPage(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add the domain."); }
    finally { pending.current = false; setWorking(null); }
  };
  const verifyDomain = async () => {
    if (!domain || !canManage || pending.current) return;
    pending.current = true; setWorking("verify"); setError(null); setNotice(null);
    try { await uptimeRequest(orgSlug, "/domains/" + encodeURIComponent(domain.id) + "/verify", { method: "POST" }); setNotice("DNS verified. Your domain connection has been updated."); reload(); reloadPage(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "DNS verification failed."); }
    finally { pending.current = false; setWorking(null); }
  };
  const removeDomain = async () => {
    if (!domain || !canManage || pending.current) return;
    pending.current = true; setWorking("remove"); setError(null); setNotice(null);
    try { await uptimeRequest(orgSlug, "/domains/" + encodeURIComponent(domain.id), { method: "DELETE" }); setConfirmRemove(false); setNotice("Custom domain removed. Your OutRay address is unchanged."); reload(); reloadPage(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove the domain."); }
    finally { pending.current = false; setWorking(null); }
  };
  const failedCopy = () => setCopyError("Could not copy. Select the value and copy it manually.");

  return <div className="max-w-4xl space-y-4">
    <div><h2 className="text-[14px] font-medium text-zinc-200">Custom domains</h2><p className="mt-1 text-[12px] leading-5 text-zinc-500">Give your status page an address your customers recognize.</p></div>
    <UptimePanel className="p-4"><div className="flex items-start gap-3"><Globe2 size={16} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" /><div className="min-w-0 flex-1"><h3 className="text-[13px] text-zinc-200">OutRay address</h3><p className="mt-1 text-[12px] leading-5 text-zinc-500">Always reserved for your page. A custom domain is an additional address.</p><div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 py-2 pl-3 pr-2"><code className="min-w-0 flex-1 break-all text-[12px] text-zinc-300">{canonicalUrl}</code><CopyButton iconOnly variant="plain" value={canonicalUrl} label="Copy OutRay status address" onCopyError={failedCopy} />{page.published && <a href={canonicalUrl} target="_blank" rel="noopener noreferrer" className={secondaryButton}>Open <ExternalLink size={13} aria-hidden="true" /></a>}</div></div></div></UptimePanel>
    {loadError && <UptimeError message={loadError} />}
    {loadError && !data && <Button type="button" variant="secondary" size="sm" onClick={reload}>Try again</Button>}
    {error && !confirmRemove && <UptimeError message={error} />}
    {copyError && <UptimeError message={copyError} />}
    {notice && <p role="status" className="text-[12px] leading-5 text-emerald-300">{notice}</p>}
    {loading && !data && <UptimeSkeleton label="Loading custom domain"><div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111112] p-4"><div className="h-4 w-40 rounded bg-white/[0.04]" /><div className="h-3 w-3/4 rounded bg-white/[0.035]" /><div className="h-9 rounded-lg bg-white/[0.04]" /><div className="h-3 w-2/3 rounded bg-white/[0.035]" /></div></UptimeSkeleton>}
    {data && !domain && <UptimePanel className="overflow-hidden"><div className="border-b border-white/[0.06] p-4"><h3 className="text-[14px] font-medium text-zinc-200">Connect your domain</h3><p className="mt-1 text-[12px] leading-5 text-zinc-500">Use a subdomain like status.example.com. One custom domain per status page.</p></div>{canManage ? <form onSubmit={(event) => void addDomain(event)} className="space-y-4 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="block min-w-0 flex-1 text-[12px] text-zinc-300">Subdomain<WorkspaceInput className="mt-2" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="status.example.com" required maxLength={253} disabled={working !== null} /></label><Button type="submit" size="sm" loading={working === "add"} disabled={working !== null || !hostname.trim()}>Add domain</Button></div><div className="flex items-start gap-2 text-[12px] leading-5 text-zinc-500"><Info size={14} className="mt-0.5 shrink-0 text-zinc-600" aria-hidden="true" /><p>Next, add a TXT ownership record and a DNS-only CNAME. Apex domains are not supported.</p></div></form> : <p className="p-4 text-[12px] leading-5 text-zinc-500">An organization owner or admin can connect a custom domain.</p>}</UptimePanel>}
    {domain && <UptimePanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><h3 className="break-all text-[14px] font-medium text-zinc-200">{domain.domain}</h3><span className={"inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] " + (domain.status === "active" ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300" : "border-amber-400/15 bg-amber-400/[0.06] text-amber-300")}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{domain.status === "active" ? "Verified" : "Pending DNS"}</span></div><p className="mt-1.5 text-[12px] leading-5 text-zinc-500">{domain.status === "active" ? (page.published ? "DNS is verified and your page is public." : "DNS is verified. Publish your page to make it available.") : "Add both records below, then verify the connection."}</p></div>{domain.status === "active" && page.published && <a href={"https://" + domain.domain + "/"} target="_blank" rel="noopener noreferrer" className={secondaryButton}>Visit page <ExternalLink size={13} aria-hidden="true" /></a>}</div>
      <div className="p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-[13px] text-zinc-200">DNS records</h4><span className="text-[11px] text-zinc-600">Add at your DNS provider</span></div><div className="overflow-hidden rounded-lg border border-white/[0.06] divide-y divide-white/[0.06]"><DnsRecord type="TXT" label="Verify ownership" name={"_outray-challenge." + domain.domain} value={domain.id} onCopyError={failedCopy} /><DnsRecord type="CNAME" label="Route visitors" name={domain.domain} value={cnameTarget} onCopyError={failedCopy} /></div><div className="mt-3 flex items-start gap-2 text-[12px] leading-5 text-zinc-500"><Info size={14} className="mt-0.5 shrink-0 text-zinc-600" aria-hidden="true" /><p>Set the CNAME to <span className="text-zinc-300">DNS only</span>, without a proxy. If your provider adds the zone automatically, enter only the host portion for Name.</p></div>{canManage && <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">{domain.status !== "active" && <Button type="button" size="sm" loading={working === "verify"} disabled={working !== null} onClick={() => void verifyDomain()}><RefreshCw size={13} aria-hidden="true" />Verify DNS</Button>}<Button type="button" variant="ghost" size="sm" disabled={working !== null} aria-haspopup="dialog" onClick={() => { setError(null); setConfirmRemove(true); }}><Trash2 size={13} aria-hidden="true" />Remove domain</Button></div>}</div>
    </UptimePanel>}
    <UptimeDialog open={confirmRemove} onClose={() => { if (!pending.current) setConfirmRemove(false); }} title="Remove custom domain?" busy={working === "remove"} footer={<><Button type="button" variant="secondary" size="sm" data-autofocus disabled={working !== null} onClick={() => setConfirmRemove(false)}>Keep domain</Button><Button type="button" variant="danger" size="sm" loading={working === "remove"} disabled={working !== null || !canManage} onClick={() => void removeDomain()}>Remove domain</Button></>}><p className="text-[13px] leading-6 text-zinc-400">Visitors will no longer reach this status page through <span className="break-all text-zinc-200">{domain?.domain}</span>. Your OutRay address will remain available when the page is published.</p>{error && <div className="mt-3"><UptimeError message={error} /></div>}</UptimeDialog>
  </div>;
}

function DnsRecord({ type, label, name, value, onCopyError }: { type: "TXT" | "CNAME"; label: string; name: string; value: string; onCopyError: () => void }) {
  return <div className="p-3.5"><div className="mb-3 flex items-center gap-2"><span className="rounded border border-white/[0.08] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{type}</span><span className="text-[12px] text-zinc-500">{label}</span></div><div className="grid gap-3 sm:grid-cols-2"><DnsValue label="Name" value={name} copyLabel={"Copy " + type + " name"} onCopyError={onCopyError} /><DnsValue label="Value" value={value} copyLabel={"Copy " + type + " value"} onCopyError={onCopyError} /></div></div>;
}
function DnsValue({ label, value, copyLabel, onCopyError }: { label: string; value: string; copyLabel: string; onCopyError: () => void }) {
  return <div className="min-w-0"><p className="text-[11px] text-zinc-600">{label}</p><div className="mt-1 flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 pl-2.5 pr-1"><code className="min-w-0 flex-1 break-all text-[11px] text-zinc-300">{value}</code><CopyButton value={value} label={copyLabel} iconOnly variant="plain" onCopyError={onCopyError} /></div></div>;
}
