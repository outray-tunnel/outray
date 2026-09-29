import { useEffect, useState } from "react";
import { uptimeRequest } from "./uptime-client";

interface Member { id: string; name: string; email: string }

export function UptimeEmailRecipients({ orgSlug, value, onChange }: { orgSlug: string; value: string[]; onChange: (value: string[]) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void uptimeRequest<{ members: Member[] }>(orgSlug, "/members").then((result) => { if (!cancelled) setMembers(result.members); }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load team members."); });
    return () => { cancelled = true; };
  }, [orgSlug]);
  return <fieldset><legend className="text-[12px] font-medium text-zinc-300">Email team members</legend><p className="mt-1 text-xs text-zinc-600">Selected members receive Down and Recovery alerts.</p>
    <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-white/[0.09]">
      {error && <p role="alert" className="px-3 py-3 text-xs text-rose-300">{error}</p>}
      {!error && members.length === 0 && <p className="px-3 py-3 text-xs text-zinc-500">Loading team members…</p>}
      {members.map((member) => <label key={member.id} className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-white/[0.06] px-3 py-2 last:border-0 hover:bg-white/[0.03]"><input type="checkbox" className="size-4 accent-violet-400" checked={value.includes(member.email)} onChange={(event) => onChange(event.target.checked ? [...value, member.email] : value.filter((email) => email !== member.email))} /><span className="min-w-0"><span className="block truncate text-xs text-zinc-200">{member.name}</span><span className="block truncate text-[11px] text-zinc-500">{member.email}</span></span></label>)}
    </div>
  </fieldset>;
}
