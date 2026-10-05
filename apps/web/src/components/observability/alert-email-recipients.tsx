import { useEffect, useMemo, useState } from "react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { AlertSelectionControl } from "./alert-selection-control";
import "../outray-arc-theme.css";

interface MemberOption {
  id: string;
  name: string;
  email: string;
  role: string;
}
interface RecipientProps {
  orgSlug: string;
  value: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
}

export function AlertEmailRecipients(props: RecipientProps) {
  return <RecipientPicker key={props.orgSlug} {...props} />;
}

function RecipientPicker({
  orgSlug,
  value,
  onChange,
  disabled = false,
}: RecipientProps) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/${encodeURIComponent(orgSlug)}/observability/alerts/members`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load team members.");
        return response.json() as Promise<{
          members: MemberOption[];
          currentUserId: string;
        }>;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setMembers(result.members);
        setCurrentUserId(result.currentUserId);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load team members.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [orgSlug, attempt]);

  const filtered = useMemo(
    () =>
      members.filter((member) =>
        `${member.name} ${member.email}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [members, query],
  );
  const selected = new Set(value.map((email) => email.toLowerCase()));
  const currentMemberEmails = new Set(
    members.map((member) => member.email.toLowerCase()),
  );
  const unavailableSelected = value.filter(
    (email) => !currentMemberEmails.has(email.toLowerCase()),
  );

  return (
    <div className="outray-arc space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-zinc-200">
          Email recipients
        </p>
        <span className="text-[11px] text-zinc-400">
          {value.length} selected
        </span>
      </div>
      <p className="!mt-1 text-xs leading-5 text-zinc-400">
        Notify team members when this alert fires or recovers.
      </p>
      <div className="outray-arc-requests-search">
        <SearchField
          label="Find a team member"
          value={query}
          onValueChange={setQuery}
          placeholder="Find a team member…"
          disabled={disabled}
        />
      </div>
      <div
        className="max-h-52 overflow-y-auto rounded-lg border border-white/[0.08]"
        role="group"
        aria-label="Email recipients"
      >
        {loading && (
          <div
            role="status"
            aria-label="Loading email recipients"
            aria-busy="true"
            className="divide-y divide-white/[0.06]"
          >
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                aria-hidden="true"
                className="flex items-center gap-3 px-3 py-3 animate-pulse motion-reduce:animate-none"
              >
                <span className="size-4 rounded bg-white/[0.07]" />
                <span className="space-y-2">
                  <span className="block h-3 w-28 rounded bg-white/[0.07]" />
                  <span className="block h-2 w-40 rounded bg-white/[0.04]" />
                </span>
              </div>
            ))}
          </div>
        )}
        {!loading && error && (
          <div
            role="alert"
            className="space-y-3 px-3 py-4 text-xs text-rose-300"
          >
            <p>{error}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError(null);
                setAttempt((current) => current + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}
        {!loading && !error && !filtered.length && (
          <p className="px-3 py-5 text-xs text-zinc-400">
            {members.length ? "No matching members." : "No team members found."}
          </p>
        )}
        {!loading &&
          !error &&
          filtered.map((member) => {
            const checked = selected.has(member.email.toLowerCase());
            return (
              <label
                key={member.id}
                className={`flex min-h-14 items-center gap-3 border-b border-white/[0.06] px-3 py-2 last:border-b-0 transition-colors motion-reduce:transition-none ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-white/[0.035]"} ${checked ? "bg-white/[0.025]" : ""}`}
              >
                <AlertSelectionControl
                  checked={checked}
                  disabled={disabled}
                  onChange={() =>
                    onChange(
                      checked
                        ? value.filter(
                            (email) =>
                              email.toLowerCase() !==
                              member.email.toLowerCase(),
                          )
                        : [...value, member.email],
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-zinc-200">
                    {member.name}
                    {member.id === currentUserId && (
                      <span className="ml-1 text-xs text-zinc-400">(you)</span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-400">
                    {member.email}
                  </span>
                </span>
              </label>
            );
          })}
      </div>
      {!loading && !error && unavailableSelected.length > 0 && (
        <div className="space-y-2">
          {unavailableSelected.map((email) => (
            <div
              key={email}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 px-3 py-2 text-xs text-amber-200"
            >
              <span className="min-w-0 break-all">
                {email} is no longer a team member
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    value.filter(
                      (item) => item.toLowerCase() !== email.toLowerCase(),
                    ),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
