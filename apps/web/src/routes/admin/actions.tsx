import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import Delete02Icon from "@outray/icons/stroke/Delete02Icon";
import RefreshIcon from "@outray/icons/stroke/RefreshIcon";
import CheckmarkCircle02Icon from "@outray/icons/stroke/CheckmarkCircle02Icon";
import { Button } from "@/components/arc/button/button";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceDialog, WorkspaceNotice } from "@/components/workspace/workspace-ui";

export const Route = createFileRoute("/admin/actions")({
  head: () => ({ meta: [{ title: "Admin Actions - OutRay" }] }),
  component: AdminActionsPage,
});

interface CleanupResult {
  success: boolean;
  checked: number;
  removed: number;
  entries: Array<{ setKey: string; tunnelId: string; reason: string }>;
}

function AdminActionsPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/tunnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup" }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Cleanup failed");
      }
      return response.json() as Promise<CleanupResult>;
    },
    onSuccess: (data) => { setLastResult(data); setConfirmOpen(false); },
  });

  return <div className="mx-auto max-w-[1440px] space-y-5">
    <WorkspacePageHeader appearance="compact" title="Maintenance" description="Keep platform records healthy and remove stale connections." />
    <section className="max-w-3xl overflow-hidden rounded-xl border border-white/[.08] bg-[#101010]" aria-labelledby="tunnel-cleanup-heading">
      <div className="flex items-start gap-3.5 p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[.08] bg-white/[.025] text-zinc-400"><HugeiconsIcon icon={Delete02Icon} size={17} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="tunnel-cleanup-heading" className="text-[13px] font-normal text-zinc-100">Clean up stale tunnels</h2>
          <p className="mt-1.5 max-w-xl text-[12px] leading-5 text-zinc-500">Remove expired Redis entries that can prevent users from opening new tunnels. Active connections are not removed.</p>
          <ul className="mt-4 space-y-2 text-[12px] leading-5 text-zinc-400">
            <li className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-zinc-600" />Legacy records stored as hostnames instead of tunnel IDs.</li>
            <li className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-zinc-600" />Tunnel records whose <code className="text-[11px] text-zinc-300">tunnel:last_seen</code> key has expired.</li>
          </ul>
          <div className="mt-5"><Button size="md" variant="secondary" onClick={() => { cleanupMutation.reset(); setConfirmOpen(true); }} loading={cleanupMutation.isPending}><HugeiconsIcon icon={RefreshIcon} size={15} aria-hidden="true" />Run cleanup</Button></div>
        </div>
      </div>
      {lastResult && <div className="space-y-4 border-t border-white/[.07] p-5" role="status">
        <div className="flex items-center gap-2 text-[12px] text-zinc-300"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-emerald-400" aria-hidden="true" />Cleanup complete</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/[.06] px-4 py-3"><p className="text-[11px] text-zinc-500">Entries checked</p><p className="mt-1.5 text-2xl font-normal tabular-nums text-zinc-100">{lastResult.checked.toLocaleString()}</p></div>
          <div className="rounded-lg border border-white/[.06] px-4 py-3"><p className="text-[11px] text-zinc-500">Stale entries removed</p><p className="mt-1.5 text-2xl font-normal tabular-nums text-zinc-100">{lastResult.removed.toLocaleString()}</p></div>
        </div>
        {lastResult.entries.length > 0 ? <div className="max-h-64 overflow-auto rounded-lg border border-white/[.07]">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-white/[.02] text-zinc-500"><tr><th className="px-4 py-2.5 font-normal">Organization set</th><th className="px-4 py-2.5 font-normal">Tunnel ID</th><th className="px-4 py-2.5 font-normal">Reason</th></tr></thead>
            <tbody className="divide-y divide-white/[.06] text-zinc-400">{lastResult.entries.map((entry) => <tr key={`${entry.setKey}:${entry.tunnelId}`}><td className="max-w-52 truncate px-4 py-3 font-mono text-[11px]" title={entry.setKey}>{entry.setKey}</td><td className="max-w-52 truncate px-4 py-3 font-mono text-[11px]" title={entry.tunnelId}>{entry.tunnelId}</td><td className="whitespace-nowrap px-4 py-3"><span className="rounded-md bg-white/[.04] px-2 py-1 text-[11px] text-zinc-400">{entry.reason === "invalid_format_hostname" ? "Legacy hostname" : "Expired"}</span></td></tr>)}</tbody>
          </table>
        </div> : lastResult.removed === 0 ? <p className="text-[12px] text-zinc-500">No stale entries found. All tunnel records are healthy.</p> : null}
      </div>}
    </section>
    <WorkspaceDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Run tunnel cleanup?" description="This removes stale Redis records across the platform. Active tunnel connections will remain online." busy={cleanupMutation.isPending} size="sm" footer={<><Button size="sm" variant="secondary" disabled={cleanupMutation.isPending} onClick={() => setConfirmOpen(false)}>Cancel</Button><Button size="sm" variant="danger" loading={cleanupMutation.isPending} onClick={() => cleanupMutation.mutate()}>Run cleanup</Button></>}>
      <p className="text-[12px] leading-5 text-zinc-400">Expired records and legacy hostname entries will be removed immediately.</p>
      {cleanupMutation.isError && <div className="mt-4"><WorkspaceNotice message={cleanupMutation.error.message || "Cleanup failed"} /></div>}
    </WorkspaceDialog>
  </div>;
}
