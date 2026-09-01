import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import CheckmarkCircle02Icon from "@hugeicons-pro/core-stroke-rounded/CheckmarkCircle02Icon";
import Clock01Icon from "@hugeicons-pro/core-stroke-rounded/Clock01Icon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import RefreshIcon from "@hugeicons-pro/core-stroke-rounded/RefreshIcon";
import ViewIcon from "@hugeicons-pro/core-stroke-rounded/ViewIcon";
import ViewOffIcon from "@hugeicons-pro/core-stroke-rounded/ViewOffIcon";
import {
  secretsClient,
  type SecretEnvironment,
  type SecretMetadata,
  type SecretVersion,
} from "@/lib/secrets-client";
import {
  ConfirmSecretActionDialog,
} from "./secret-dialogs";
import {
  SecretsBadge,
  SecretsButton,
  SecretsIconButton,
  SecretsNotice,
  SecretsSheet,
} from "./secrets-ui";
import { formatSecretDate } from "./utils";

interface RevealedVersion {
  version: number;
  value: string;
  expiresAt: number;
}

export function SecretHistorySheet({
  open,
  onClose,
  orgSlug,
  projectSlug,
  environment,
  secret,
  revision,
  onRolledBack,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  secret: SecretMetadata | null;
  revision: number;
  onRolledBack: () => void;
}) {
  const [versions, setVersions] = useState<SecretVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedVersion | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const revealTimer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open || !secret) return;
    const controller = new AbortController();
    let disposed = false;
    setLoading(true);
    setError(null);
    setVersions([]);
    setRevealed(null);

    void secretsClient
      .versions(orgSlug, projectSlug, environment.slug, secret.id)
      .then((items) => {
        if (!disposed) setVersions(items.sort((a, b) => b.version - a.version));
      })
      .catch((requestError) => {
        if (!disposed) {
          setError(requestError instanceof Error ? requestError.message : "Could not load version history.");
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [environment.slug, open, orgSlug, projectSlug, secret]);

  useEffect(() => {
    if (!revealed) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [revealed]);

  useEffect(
    () => () => {
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      setRevealed(null);
    },
    [],
  );

  const visibleReveal = useMemo(
    () => (revealed && revealed.expiresAt > now ? revealed : null),
    [now, revealed],
  );

  const revealVersion = async (version: number) => {
    if (!secret) return;
    setError(null);
    try {
      const result = await secretsClient.revealSecret(
        orgSlug,
        projectSlug,
        environment.slug,
        secret.id,
        { intent: "reveal", version },
      );
      const expiresAt = Date.now() + result.expiresIn * 1_000;
      setNow(Date.now());
      setRevealed({ version, value: result.value, expiresAt });
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(() => setRevealed(null), result.expiresIn * 1_000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not reveal this version.");
    }
  };

  const copyVersion = async (version: number) => {
    if (!secret) return;
    setError(null);
    try {
      const result = await secretsClient.revealSecret(
        orgSlug,
        projectSlug,
        environment.slug,
        secret.id,
        { intent: "copy", version },
      );
      await navigator.clipboard.writeText(result.value);
      setCopiedVersion(version);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedVersion(null), 2_000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not copy this version.");
    }
  };

  const rollback = async (productionConfirmed: boolean) => {
    if (!secret || rollbackVersion === null) return;
    setRollingBack(true);
    setError(null);
    try {
      await secretsClient.rollback(orgSlug, projectSlug, environment.slug, secret.id, {
        version: rollbackVersion,
        expectedRevision: revision,
        expectedVersion: secret.version,
        confirmProduction: productionConfirmed,
      });
      setRollbackVersion(null);
      setRevealed(null);
      onRolledBack();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not roll back this secret.");
    } finally {
      setRollingBack(false);
    }
  };

  const secondsRemaining = visibleReveal
    ? Math.max(0, Math.ceil((visibleReveal.expiresAt - now) / 1_000))
    : 0;

  return (
    <>
      <SecretsSheet
        open={open}
        onClose={onClose}
        title={secret ? `${secret.key} history` : "Version history"}
        description="Versions contain metadata only until you explicitly reveal one."
      >
        <div className="space-y-4 p-5 sm:p-6">
          {error && <SecretsNotice message={error} onDismiss={() => setError(null)} />}
          {visibleReveal && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.045] p-4">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-amber-200">
                  {visibleReveal.value}
                </span>
                <span className="text-[13px] tabular-nums text-amber-400">{secondsRemaining}s</span>
                <SecretsIconButton icon={ViewOffIcon} label="Hide value" tone="quiet" onClick={() => setRevealed(null)} />
              </div>
              <p className="mt-2 text-[13px] text-amber-200/45">
                Version {visibleReveal.version}. This plaintext is held only in memory and clears automatically.
              </p>
            </div>
          )}

          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 rounded-xl border border-white/[0.07] bg-white/[0.025]" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="rounded-xl border border-white/[0.08] px-5 py-12 text-center">
              <HugeiconsIcon icon={Clock01Icon} size={21} strokeWidth={1.6} className="mx-auto text-zinc-500" />
              <p className="mt-3 text-[13px] text-zinc-500">No versions are available.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((version, index) => {
                const current = version.isCurrent || version.version === secret?.version || index === 0;
                return (
                  <article key={version.id} className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                        <HugeiconsIcon icon={current ? CheckmarkCircle02Icon : Clock01Icon} size={17} strokeWidth={1.7} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-medium text-zinc-300">Version {version.version}</p>
                          {current && <SecretsBadge tone="green">Current</SecretsBadge>}
                        </div>
                        <p className="mt-1.5 text-[13px] leading-4 text-zinc-500">
                          {formatSecretDate(version.createdAt)}{version.createdBy ? ` by ${version.createdBy}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-3">
                      <SecretsButton icon={ViewIcon} className="h-9 px-3" onClick={() => void revealVersion(version.version)}>
                        Reveal
                      </SecretsButton>
                      <SecretsButton icon={copiedVersion === version.version ? CheckmarkCircle02Icon : Copy01Icon} className="h-9 px-3" onClick={() => void copyVersion(version.version)}>
                        {copiedVersion === version.version ? "Copied" : "Copy"}
                      </SecretsButton>
                      {!current && (
                        <SecretsButton icon={RefreshIcon} className="h-9 px-3" onClick={() => setRollbackVersion(version.version)}>
                          Roll back
                        </SecretsButton>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </SecretsSheet>

      <ConfirmSecretActionDialog
        open={rollbackVersion !== null}
        onClose={() => setRollbackVersion(null)}
        title={`Roll back to version ${rollbackVersion ?? ""}?`}
        description="Rollback creates a new version from the selected value. Existing version history remains intact."
        confirmLabel="Roll back"
        production={environment.isProduction}
        danger={false}
        loading={rollingBack}
        onConfirm={(confirmed) => void rollback(confirmed)}
      />
    </>
  );
}
