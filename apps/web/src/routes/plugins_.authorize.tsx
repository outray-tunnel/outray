import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Eye, KeyRound, Loader2, RefreshCw, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { PluginShell } from "@/components/mcp/plugin-shell";
import { ClientLogo, OrganizationLogo } from "@/components/mcp/connection-logos";
import { Button } from "@/components/arc/button/button";
import { WorkspaceEmptyState, WorkspaceNotice } from "@/components/workspace/workspace-ui";

export const Route = createFileRoute("/plugins_/authorize")({ component: AuthorizePage,
  head: () => ({ meta: [{ title: "Connect an app - OutRay" }, { name: "robots", content: "noindex" }] }),
});
type Details = { clientName: string; catalog: string; scopes: string[]; requestedClaims: string[];
  organizations: Array<{ id: string; name: string; slug: string; role: string; logo?: string | null }> };
const descriptions: Record<string, string> = {
  openid: "Identify your OutRay account", profile: "Read your name", email: "Read your verified email address",
  offline_access: "Keep the connection active until you revoke it", "outray:read": "Read resources in the organizations you select",
  "outray:write": "Manage resources within your current organization permissions",
  "outray:secrets:values": "Access secret values through this direct MCP connection",
};
const scopeIcons: Record<string, typeof UserRound> = {
  openid: UserRound, profile: UserRound, email: UserRound, offline_access: RefreshCw,
  "outray:read": Eye, "outray:write": SlidersHorizontal, "outray:secrets:values": KeyRound,
};

function AuthorizePage() {
  const [details, setDetails] = useState<Details | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const oauthQuery = window.location.search.slice(1);
    setQuery(oauthQuery);
    void fetch(`/api/mcp/consent?${new URLSearchParams({ oauth_query: oauthQuery })}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to read this connection request");
      if (active) setDetails(body);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Connection request failed"); });
    return () => { active = false; };
  }, []);
  const decide = async (accept: boolean) => {
    if (busy || (accept && !selected.length)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/mcp/consent", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ oauth_query: query, accept, organizationIds: selected }) });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "The connection could not be completed");
      window.location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Connection failed"); setBusy(false); }
  };
  return <PluginShell title={details ? `Connect ${details.clientName}` : "Connect to OutRay"}
    icon={details ? <ClientLogo name={details.clientName} className="size-14" /> : undefined}
    description="Choose which organizations this app can access and review its permissions.">
    {error && <div className="mb-4"><WorkspaceNotice message={error} /></div>}
    {!details && !error && <div role="status" className="flex items-center gap-2.5 rounded-[14px] border border-white/[.08] bg-[#101010] p-6 text-xs text-zinc-400">
      <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading the connection request…
    </div>}
    {details && <>
      <div className="overflow-hidden rounded-[14px] border border-white/[.08] bg-[#101010]">
        <fieldset disabled={busy} className="min-w-0 p-5">
          <legend className="sr-only">Organizations</legend>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><h2 className="text-[13px] font-medium text-zinc-200">Organizations</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Access follows your current role in each organization.</p>
            </div>
            <span aria-live="polite" aria-atomic="true" className="mt-0.5 shrink-0 rounded-md border border-white/[.08] bg-white/[.025] px-2 py-1 text-[11px] tabular-nums text-zinc-400">{selected.length} selected</span>
          </div>
          <div className="grid gap-2">
            {details.organizations.map((org) => <label key={org.id} className="group flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.015] px-3.5 py-3 transition-colors has-checked:border-white/20 has-checked:bg-white/[.05] hover:border-white/15 hover:bg-white/[.035] has-disabled:cursor-not-allowed has-disabled:opacity-60 motion-reduce:transition-none sm:gap-3.5">
              <span className="relative inline-flex size-4 shrink-0">
                <input type="checkbox" aria-label={`Allow ${org.name}`} checked={selected.includes(org.id)} disabled={busy}
                  onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, org.id] : previous.filter((id) => id !== org.id))} className="peer sr-only" />
                <span aria-hidden="true" className="flex size-4 items-center justify-center rounded-[4px] border border-white/20 bg-white/[.025] text-transparent transition-colors peer-checked:border-zinc-200 peer-checked:bg-zinc-200 peer-checked:text-zinc-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-accent motion-reduce:transition-none"><Check size={11} strokeWidth={2.5} /></span>
              </span>
              <OrganizationLogo name={org.name} logo={org.logo} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-zinc-200">{org.name}</span><span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500">/{org.slug}</span></span>
              <span className="shrink-0 rounded-md border border-white/[.07] px-2 py-1 text-[11px] text-zinc-400 capitalize">{org.role}</span>
            </label>)}
          </div>
          {!details.organizations.length && <WorkspaceEmptyState title="No organizations available" description="Join or create an organization in OutRay before connecting." action={<a href="/select" className="text-zinc-200 underline underline-offset-4">Open your workspaces</a>} />}
          <p className="mt-3 text-xs leading-5 text-zinc-500">Only selected organizations are shared. New organizations stay private.</p>
        </fieldset>
        <section aria-labelledby="requested-access-title" className="border-t border-white/[.07] p-5">
          <h2 id="requested-access-title" className="mb-3 text-[13px] font-medium text-zinc-200">Requested access</h2>
          <ul className="grid gap-2">{details.scopes.map((scope) => {
            const Icon = scopeIcons[scope] || ShieldCheck;
            return <li key={scope} className="flex items-start gap-3 text-xs leading-5 text-zinc-400"><Icon size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" /><span>{descriptions[scope] || scope}</span></li>;
          })}
            {details.requestedClaims.map((claim) => <li key={`claim:${claim}`} className="flex items-start gap-3 text-xs leading-5 text-zinc-400"><UserRound size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" /><span className="min-w-0 break-words">Identity claim: {claim}</span></li>)}
          </ul>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[.07] bg-white/[.015] px-5 py-4 sm:px-6">
          <p className="text-xs text-zinc-500">{selected.length ? `${selected.length} ${selected.length === 1 ? "organization" : "organizations"} selected` : "Select an organization to continue"}</p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void decide(false)} className="flex-1 sm:flex-none">Cancel</Button>
            <Button type="button" loading={busy} disabled={busy || !selected.length} onClick={() => void decide(true)} className="flex-1 sm:flex-none">{busy ? "Connecting…" : "Allow access"}</Button>
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-start gap-2.5 px-1 text-xs leading-5 text-zinc-500">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>Revoke access anytime in <a href="/plugins/connections" className="text-zinc-400 underline decoration-zinc-700 underline-offset-3 hover:text-zinc-200">Connected apps</a>. OutRay keeps activity metadata for 90 days, excluding conversations and secret values.</p>
      </div>
    </>}
  </PluginShell>;
}
