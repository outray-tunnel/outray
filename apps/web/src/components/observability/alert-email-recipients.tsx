import { useEffect, useMemo, useState } from "react";

interface MemberOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function AlertEmailRecipients({
  orgSlug,
  value,
  onChange,
}: {
  orgSlug: string;
  value: string[];
  onChange: (emails: string[]) => void;
}) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/${encodeURIComponent(orgSlug)}/observability/alerts/members`, {
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load team members.");
      return response.json() as Promise<{ members: MemberOption[]; currentUserId: string }>;
    }).then((result) => {
      if (controller.signal.aborted) return;
      setMembers(result.members);
      setCurrentUserId(result.currentUserId);
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "Could not load team members.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [orgSlug]);

  const filtered = useMemo(() => members.filter((member) =>
    `${member.name} ${member.email}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [members, query]);
  const selected = new Set(value.map((email) => email.toLowerCase()));
  const currentMemberEmails = new Set(members.map((member) => member.email.toLowerCase()));
  const unavailableSelected = value.filter((email) => !currentMemberEmails.has(email.toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">Email team members</p>
        <span className="text-xs text-zinc-500">{value.length} selected</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-zinc-500">Selected members receive firing and recovery emails. You can choose more than one.</p>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a team member"
        aria-label="Find a team member"
        className="mt-4 h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.025] px-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-400/50"
      />
      <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-white/[0.09]" role="group" aria-label="Email recipients">
        {loading && <p className="px-4 py-4 text-xs text-zinc-500">Loading team members…</p>}
        {error && <p role="alert" className="px-4 py-4 text-xs text-rose-300">{error}</p>}
        {!loading && !error && !filtered.length && <p className="px-4 py-4 text-xs text-zinc-500">{members.length ? "No matching members." : "No team members found."}</p>}
        {!loading && !error && filtered.map((member) => {
          const checked = selected.has(member.email.toLowerCase());
          return (
            <label key={member.id} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-white/[0.06] px-4 py-2 last:border-b-0 hover:bg-white/[0.035]">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked
                  ? value.filter((email) => email.toLowerCase() !== member.email.toLowerCase())
                  : [...value, member.email])}
                className="size-4 accent-violet-400"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-200">{member.name}{member.id === currentUserId ? " (you)" : ""}</span>
                <span className="block truncate text-xs text-zinc-500">{member.email}</span>
              </span>
            </label>
          );
        })}
      </div>
      {!loading && !error && unavailableSelected.length > 0 && <div className="mt-3 space-y-2">
        {unavailableSelected.map((email) => <div key={email} className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/20 px-3 py-2 text-xs text-amber-200">
          <span className="min-w-0 truncate">{email} is no longer a team member</span>
          <button type="button" onClick={() => onChange(value.filter((item) => item.toLowerCase() !== email.toLowerCase()))} className="shrink-0 font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">Remove</button>
        </div>)}
      </div>}
    </div>
  );
}
