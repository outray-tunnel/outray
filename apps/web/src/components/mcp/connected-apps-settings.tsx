import { useEffect, useState } from "react";
import { Plug, ShieldCheck } from "lucide-react";
import { ClientLogo, OrganizationLogo } from "@/components/mcp/connection-logos";
import { Button } from "@/components/arc/button/button";
import { WorkspaceEmptyState, WorkspaceNotice } from "@/components/workspace/workspace-ui";

type Connection = { id: string; clientName: string | null; resource: string; organizationIds: string[]; revokedAt: string | null };
export function ConnectedAppsSettings() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; logo?: string | null }>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/mcp/connections").then(async (response) => {
      if (response.status === 401) { window.location.assign(`/login?${new URLSearchParams({ redirect: window.location.pathname })}`); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (active) { setConnections(data.connections); setOrganizations(data.organizations); }
    }).catch(() => { if (active) setError("Connected apps could not be loaded. Reload to try again."); });
    return () => { active = false; };
  }, []);
  const revoke = async (id: string) => {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/mcp/connections", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error();
      setConnections((current) => current?.map((connection) => connection.id === id ? { ...connection, revokedAt: new Date().toISOString() } : connection) ?? null);
    } catch { setError("Access could not be revoked. Try again."); }
    finally { setBusy(null); }
  };
  return <div className="min-w-0">
    {error && <div className="mb-4"><WorkspaceNotice message={error} /></div>}
    {!connections && !error && <div role="status" aria-label="Loading connected apps" className="space-y-3">
      {[0, 1].map((item) => <div key={item} className="rounded-[14px] border border-white/[.08] bg-[#101010] p-5 sm:p-6">
        <div className="flex items-center gap-3.5"><span className="size-10 animate-pulse rounded-xl bg-white/[.06] motion-reduce:animate-none" /><div className="space-y-2"><span className="block h-3.5 w-28 animate-pulse rounded bg-white/[.07] motion-reduce:animate-none" /><span className="block h-3 w-40 animate-pulse rounded bg-white/[.04] motion-reduce:animate-none" /></div></div>
        <span className="mt-5 block h-6 w-24 animate-pulse rounded-md bg-white/[.04] motion-reduce:animate-none" />
      </div>)}
    </div>}
    <div className="grid gap-3">{connections?.map((connection) => <article key={connection.id} className="overflow-hidden rounded-[14px] border border-white/[.08] bg-[#101010]">
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3.5">
          <ClientLogo name={connection.clientName} />
          <div className="min-w-0 flex-1"><h2 className="break-words text-[13px] font-medium text-zinc-200">{connection.clientName || "MCP client"}</h2>
            <p className="mt-1 text-xs text-zinc-500">{connection.resource.endsWith("/openai") ? "Public plugin connection" : "Direct MCP connection"}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${connection.revokedAt ? "border-white/[.08] bg-white/[.025] text-zinc-500" : "border-emerald-400/15 bg-emerald-400/[.04] text-emerald-300"}`}>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{connection.revokedAt ? "Revoked" : "Connected"}
          </span>
        </div>
        <div className="mt-5"><h3 className="mb-2 text-xs text-zinc-500">Organizations</h3><ul className="flex flex-wrap gap-1.5">{connection.organizationIds.map((id) => {
          const organization = organizations.find((org) => org.id === id);
          const name = organization?.name || "Organization no longer available";
          return <li key={id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/[.07] bg-white/[.025] px-2 py-1 text-xs text-zinc-400"><OrganizationLogo name={name} logo={organization?.logo} className="size-5" /><span className="min-w-0 break-words">{name}</span></li>;
        })}</ul></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.07] bg-white/[.015] px-5 py-3.5 sm:px-6">
        <p className="text-xs text-zinc-500">{connection.revokedAt ? "This app no longer has access." : "Access is limited to these organizations."}</p>
        {!connection.revokedAt && <Button type="button" variant="danger" size="sm" disabled={busy !== null} loading={busy === connection.id} onClick={() => void revoke(connection.id)}>{busy === connection.id ? "Revoking…" : "Revoke access"}</Button>}
      </div>
    </article>)}</div>
    {connections?.length === 0 && <div className="rounded-[14px] border border-white/[.08] bg-[#101010]"><WorkspaceEmptyState icon={<Plug size={20} />} title="No connected apps" description="Apps you connect to OutRay will appear here. You can review their organization access and disconnect them at any time." /></div>}
    {Boolean(connections?.length) && <p className="mt-5 flex items-start gap-2.5 px-1 text-xs leading-5 text-zinc-500"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Revoking access disconnects the app immediately. You can reconnect it later to choose its organizations again.</span></p>}
  </div>;
}
