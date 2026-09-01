import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import CheckmarkCircle02Icon from "@hugeicons-pro/core-stroke-rounded/CheckmarkCircle02Icon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import Edit02Icon from "@hugeicons-pro/core-stroke-rounded/Edit02Icon";
import HistoryIcon from "@hugeicons-pro/core-stroke-rounded/HistoryIcon";
import Key01Icon from "@hugeicons-pro/core-stroke-rounded/Key01Icon";
import Search01Icon from "@hugeicons-pro/core-stroke-rounded/Search01Icon";
import ViewIcon from "@hugeicons-pro/core-stroke-rounded/ViewIcon";
import ViewOffIcon from "@hugeicons-pro/core-stroke-rounded/ViewOffIcon";
import {
  secretsClient,
  type SecretEnvironment,
  type SecretMetadata,
} from "@/lib/secrets-client";
import {
  ConfirmSecretActionDialog,
  SecretEditorDialog,
} from "./secret-dialogs";
import { SecretHistorySheet } from "./secret-history-sheet";
import {
  ActionMenu,
  SecretsBadge,
  SecretsButton,
  SecretsEmptyState,
  SecretsIconButton,
  SecretsNotice,
  fieldClassName,
} from "./secrets-ui";
import { formatRelativeDate } from "./utils";

interface RevealedSecret {
  value: string;
  expiresAt: number;
}

export function SecretsTable({
  orgSlug,
  projectSlug,
  environment,
  environments,
  secrets,
  revision,
  onMutated,
  onAdd,
}: {
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  environments: SecretEnvironment[];
  secrets: SecretMetadata[];
  revision: number;
  onMutated: () => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Record<string, RevealedSecret>>({});
  const [now, setNow] = useState(Date.now());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SecretMetadata | null>(null);
  const [history, setHistory] = useState<SecretMetadata | null>(null);
  const [deleting, setDeleting] = useState<SecretMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revealTimers = useRef(new Map<string, number>());
  const copyTimer = useRef<number | undefined>(undefined);

  const visibleSecrets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return secrets;
    return secrets.filter((secret) =>
      secret.key.toLowerCase().includes(normalized),
    );
  }, [query, secrets]);

  useEffect(() => {
    if (Object.keys(revealed).length === 0) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [revealed]);

  useEffect(
    () => () => {
      revealTimers.current.forEach((timer) => window.clearTimeout(timer));
      revealTimers.current.clear();
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      setRevealed({});
    },
    [],
  );

  const reveal = async (secret: SecretMetadata) => {
    if (revealed[secret.id]) {
      const timer = revealTimers.current.get(secret.id);
      if (timer) window.clearTimeout(timer);
      revealTimers.current.delete(secret.id);
      setRevealed((current) => {
        const next = { ...current };
        delete next[secret.id];
        return next;
      });
      return;
    }
    setBusyId(secret.id);
    setError(null);
    try {
      const result = await secretsClient.revealSecret(
        orgSlug,
        projectSlug,
        environment.slug,
        secret.id,
        { intent: "reveal" },
      );
      const expiresAt = Date.now() + result.expiresIn * 1_000;
      setNow(Date.now());
      setRevealed((current) => ({
        ...current,
        [secret.id]: { value: result.value, expiresAt },
      }));
      const existing = revealTimers.current.get(secret.id);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        setRevealed((current) => {
          const next = { ...current };
          delete next[secret.id];
          return next;
        });
        revealTimers.current.delete(secret.id);
      }, result.expiresIn * 1_000);
      revealTimers.current.set(secret.id, timer);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reveal this secret.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (secret: SecretMetadata) => {
    setBusyId(secret.id);
    setError(null);
    try {
      const result = await secretsClient.revealSecret(
        orgSlug,
        projectSlug,
        environment.slug,
        secret.id,
        { intent: "copy" },
      );
      await navigator.clipboard.writeText(result.value);
      setCopiedId(secret.id);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 2_000);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not copy this secret.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (productionConfirmed: boolean, confirmation: string) => {
    if (!deleting) return;
    setBusyId(deleting.id);
    setError(null);
    try {
      await secretsClient.deleteSecret(
        orgSlug,
        projectSlug,
        environment.slug,
        deleting.id,
        {
          expectedRevision: revision,
          confirmation,
          confirmProduction: productionConfirmed,
        },
      );
      setDeleting(null);
      setRevealed((current) => {
        const next = { ...current };
        delete next[deleting.id];
        return next;
      });
      onMutated();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete this secret.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const revealFor = (secret: SecretMetadata) => {
    const item = revealed[secret.id];
    return item && item.expiresAt > now ? item : null;
  };

  const rowActions = (secret: SecretMetadata) => [
    {
      label: "Edit secret",
      icon: Edit02Icon,
      onSelect: () => setEditing(secret),
    },
    {
      label: "Version history",
      icon: HistoryIcon,
      onSelect: () => setHistory(secret),
    },
    {
      label: "Delete secret",
      icon: Delete02Icon,
      onSelect: () => setDeleting(secret),
      danger: true,
    },
  ];

  if (secrets.length === 0) {
    return (
      <SecretsEmptyState
        icon={Key01Icon}
        title="No secrets in this environment"
        description="Add one secret or import a dotenv file. Secret values remain encrypted and are not shown in this list."
        action={
          <SecretsButton tone="primary" onClick={onAdd}>
            Add first secret
          </SecretsButton>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <SecretsNotice message={error} onDismiss={() => setError(null)} />
      )}
      <div className="relative max-w-sm">
        <HugeiconsIcon
          icon={Search01Icon}
          size={16}
          strokeWidth={1.7}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`${fieldClassName} pl-10`}
          placeholder="Search keys"
          aria-label="Search secret keys"
        />
      </div>

      {visibleSecrets.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] px-6 py-12 text-center text-[13px] text-zinc-600">
          No secret keys match “{query}”.
        </div>
      ) : (
        <>
          <div className="hidden overflow-visible rounded-2xl border border-white/[0.08] lg:block">
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.018] text-[13px] font-medium uppercase tracking-[0.09em] text-zinc-500">
                  <th className="w-[30%] px-5 py-3.5">Key</th>
                  <th className="w-[31%] px-5 py-3.5">Value</th>
                  <th className="w-[12%] px-5 py-3.5">Version</th>
                  <th className="w-[17%] px-5 py-3.5">Updated</th>
                  <th className="w-[10%] px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleSecrets.map((secret) => {
                  const visible = revealFor(secret);
                  const seconds = visible
                    ? Math.max(0, Math.ceil((visible.expiresAt - now) / 1_000))
                    : 0;
                  return (
                    <tr
                      key={secret.id}
                      className="border-b border-white/[0.065] last:border-b-0 hover:bg-white/[0.015]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-600">
                            <HugeiconsIcon
                              icon={Key01Icon}
                              size={16}
                              strokeWidth={1.7}
                            />
                          </span>
                          <span className="truncate font-mono text-[13px] font-medium text-zinc-300">
                            {secret.key}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div
                          className={`flex h-9 min-w-0 items-center gap-2 rounded-xl border px-3 ${visible ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-white/[0.07] bg-black/20"}`}
                        >
                          <span
                            className={`min-w-0 flex-1 truncate font-mono text-[13px] ${visible ? "text-amber-200" : "tracking-[0.16em] text-zinc-500"}`}
                          >
                            {visible ? visible.value : "••••••••••••••••"}
                          </span>
                          {visible && (
                            <span className="shrink-0 text-xs tabular-nums text-amber-500">
                              {seconds}s
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <SecretsBadge>v{secret.version}</SecretsBadge>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-zinc-600">
                        {formatRelativeDate(secret.updatedAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <SecretsIconButton
                            icon={visible ? ViewOffIcon : ViewIcon}
                            label={
                              visible ? "Hide value" : "Reveal for 30 seconds"
                            }
                            tone="quiet"
                            disabled={busyId === secret.id}
                            onClick={() => void reveal(secret)}
                          />
                          <SecretsIconButton
                            icon={
                              copiedId === secret.id
                                ? CheckmarkCircle02Icon
                                : Copy01Icon
                            }
                            label={
                              copiedId === secret.id ? "Copied" : "Copy value"
                            }
                            tone="quiet"
                            disabled={busyId === secret.id}
                            onClick={() => void copy(secret)}
                          />
                          <ActionMenu
                            items={rowActions(secret)}
                            label={`Actions for ${secret.key}`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {visibleSecrets.map((secret) => {
              const visible = revealFor(secret);
              const seconds = visible
                ? Math.max(0, Math.ceil((visible.expiresAt - now) / 1_000))
                : 0;
              return (
                <article
                  key={secret.id}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.012] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-600">
                      <HugeiconsIcon
                        icon={Key01Icon}
                        size={16}
                        strokeWidth={1.7}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[13px] font-medium text-zinc-300">
                        {secret.key}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[13px] text-zinc-500">
                        <SecretsBadge>v{secret.version}</SecretsBadge>
                        <span>{formatRelativeDate(secret.updatedAt)}</span>
                      </div>
                    </div>
                    <ActionMenu
                      items={rowActions(secret)}
                      label={`Actions for ${secret.key}`}
                    />
                  </div>
                  <div
                    className={`mt-4 flex min-h-10 items-center gap-2 rounded-xl border px-3 ${visible ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-white/[0.07] bg-black/20"}`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate font-mono text-[13px] ${visible ? "text-amber-200" : "tracking-[0.16em] text-zinc-500"}`}
                    >
                      {visible ? visible.value : "••••••••••••••••"}
                    </span>
                    {visible && (
                      <span className="text-xs tabular-nums text-amber-500">
                        {seconds}s
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <SecretsButton
                      icon={visible ? ViewOffIcon : ViewIcon}
                      className="h-9 flex-1 px-3"
                      disabled={busyId === secret.id}
                      onClick={() => void reveal(secret)}
                    >
                      {visible ? "Hide" : "Reveal"}
                    </SecretsButton>
                    <SecretsButton
                      icon={
                        copiedId === secret.id
                          ? CheckmarkCircle02Icon
                          : Copy01Icon
                      }
                      className="h-9 flex-1 px-3"
                      disabled={busyId === secret.id}
                      onClick={() => void copy(secret)}
                    >
                      {copiedId === secret.id ? "Copied" : "Copy"}
                    </SecretsButton>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <SecretEditorDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        environment={environment}
        environments={environments}
        secret={editing}
        revision={revision}
        onSaved={onMutated}
      />
      <SecretHistorySheet
        open={!!history}
        onClose={() => setHistory(null)}
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        environment={environment}
        secret={history}
        revision={revision}
        onRolledBack={onMutated}
      />
      <ConfirmSecretActionDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.key}?` : "Delete secret?"}
        description="The secret will stop being available to this environment immediately."
        confirmLabel="Delete secret"
        confirmationText={deleting?.key}
        production={environment.isProduction}
        loading={!!deleting && busyId === deleting.id}
        onConfirm={(confirmed, confirmation) =>
          void remove(confirmed, confirmation)
        }
      />
    </div>
  );
}
