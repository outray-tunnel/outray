import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { SideSheet } from "@/components/ui/side-sheet";
import {
  secretsClient,
  type SecretEnvironment,
  type SecretMetadata,
  type SecretVersion,
} from "@/lib/secrets-client";
import {
  SecretHistoryContent,
  SecretHistoryRestoreDialog,
  type PendingHistoryAction,
  type RevealedHistoryValue,
} from "./secret-history-content";

interface HistoryProps {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  secret: SecretMetadata | null;
  revision: number;
  onRolledBack: () => void;
}
interface InteractionState { confirming: boolean; restoring: boolean }
interface RestoreTarget {
  version: number;
  currentVersion: number;
  revision: number;
  production: boolean;
}

export function SecretHistorySheet(props: HistoryProps) {
  const { open, secret, orgSlug, projectSlug, environment } = props;
  const scope = JSON.stringify([orgSlug, projectSlug, environment.id, environment.slug, secret?.id]);
  const [interaction, setInteraction] = useState<InteractionState & { scope: string } | null>(null);
  const onInteractionChange = useCallback((state: InteractionState) => {
    setInteraction({ ...state, scope });
  }, [scope]);
  const blocked = interaction?.scope === scope && (interaction.confirming || interaction.restoring);

  return <SideSheet
    open={open && Boolean(secret)}
    onClose={props.onClose}
    title="Version history"
    description="Review previous values or restore an earlier version."
    closeDisabled={blocked}
    footer={<p className="flex w-full items-center gap-2 text-[11px] leading-5 text-zinc-500">
      <LockKeyhole size={13} aria-hidden="true" />
      Values stay hidden until revealed. Access is recorded in the audit log.
    </p>}
  >
    <div className="ph-no-capture" data-private-product="secrets">
      {/* Unmount before the panel's exit animation: no plaintext lingers on close. */}
      {open && secret && <SecretHistorySession
        key={scope}
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        environment={environment}
        secret={secret}
        revision={props.revision}
        onClose={props.onClose}
        onRolledBack={props.onRolledBack}
        onInteractionChange={onInteractionChange}
      />}
    </div>
  </SideSheet>;
}

/** One open org/vault/environment/secret scope; plaintext never enters a shared cache. */
export function SecretHistorySession({
  orgSlug, projectSlug, environment, secret, revision, onClose, onRolledBack, onInteractionChange,
}: Omit<HistoryProps, "open" | "secret"> & {
  secret: SecretMetadata;
  onInteractionChange: (state: InteractionState) => void;
}) {
  const [versions, setVersions] = useState<SecretVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState<{ version: number; message: string } | null>(null);
  const [pending, setPending] = useState<PendingHistoryAction | null>(null);
  const [revealed, setRevealed] = useState<RevealedHistoryValue | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const mounted = useRef(true);
  const completed = useRef(false);
  const pendingRef = useRef<PendingHistoryAction | null>(null);
  const restoreRef = useRef<RestoreTarget | null>(null);
  const productionRef = useRef(false);
  const sequence = useRef(0);
  const actionRequest = useRef<AbortController | null>(null);
  const revealTimer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      actionRequest.current?.abort();
      if (revealTimer.current !== undefined) window.clearTimeout(revealTimer.current);
      if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current);
      onInteractionChange({ confirming: false, restoring: false });
    };
  }, [onInteractionChange]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    void secretsClient.versions(orgSlug, projectSlug, environment.slug, secret.id, controller.signal)
      .then((items) => {
        if (active && !controller.signal.aborted) setVersions([...items].sort((a, b) => b.version - a.version));
      })
      .catch((requestError: unknown) => {
        if (active && !controller.signal.aborted) setError(message(requestError, "Could not load version history."));
      })
      .finally(() => { if (active && !controller.signal.aborted) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [orgSlug, projectSlug, environment.slug, secret.id, retry]);

  useEffect(() => {
    if (!revealed) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      setRevealed((value) => value && value.expiresAt <= time ? null : value);
    };
    const timer = window.setInterval(tick, 1_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [revealed]);

  function hide() {
    if (revealTimer.current !== undefined) window.clearTimeout(revealTimer.current);
    revealTimer.current = undefined;
    setRevealed(null);
  }

  async function readValue(type: "reveal" | "copy", version: number) {
    if (!mounted.current || completed.current || pendingRef.current || restoreRef.current ||
      !versions.some((item) => item.version === version)) return;
    const action: PendingHistoryAction = { type, version };
    pendingRef.current = action;
    setPending(action);
    setActionError(null);
    const request = new AbortController();
    actionRequest.current = request;
    const generation = ++sequence.current;
    const active = () => mounted.current && sequence.current === generation && !request.signal.aborted;
    try {
      const result = await secretsClient.revealSecret(orgSlug, projectSlug, environment.slug, secret.id,
        { intent: type, version }, request.signal);
      if (!active()) return;
      if (type === "copy") {
        await navigator.clipboard.writeText(result.value);
        if (!active()) return;
        setCopiedVersion(version);
        if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => { if (mounted.current) setCopiedVersion(null); }, 2_000);
      } else {
        hide();
        const seconds = Number.isFinite(result.expiresIn) ? Math.min(30, Math.max(1, result.expiresIn)) : 30;
        const time = Date.now();
        setNow(time);
        setRevealed({ version, value: result.value, expiresAt: time + seconds * 1_000 });
        revealTimer.current = window.setTimeout(() => {
          if (mounted.current) setRevealed(null);
        }, seconds * 1_000);
      }
    } catch (requestError) {
      if (active()) setActionError({ version, message: message(requestError,
        type === "copy" ? "Could not copy this version." : "Could not reveal this version.") });
    } finally {
      if (active()) {
        pendingRef.current = null;
        actionRequest.current = null;
        setPending(null);
      }
    }
  }

  function openRestore(version: number) {
    if (!mounted.current || completed.current || pendingRef.current || restoreRef.current ||
      !versions.some((item) => item.version === version)) return;
    const currentVersion = versions.find((item) => item.isCurrent)?.version ?? secret.version;
    if (version === currentVersion) return;
    const target = { version, currentVersion, revision, production: environment.isProduction };
    restoreRef.current = target;
    productionRef.current = false;
    setRestoreTarget(target);
    setProductionConfirmed(false);
    setRestoreError(null);
    onInteractionChange({ confirming: true, restoring: false });
  }

  function closeRestore() {
    if (pendingRef.current?.type === "restore") return;
    restoreRef.current = null;
    productionRef.current = false;
    setRestoreTarget(null);
    setRestoreError(null);
    setProductionConfirmed(false);
    onInteractionChange({ confirming: false, restoring: false });
  }

  async function restore() {
    const target = restoreRef.current;
    if (!mounted.current || completed.current || pendingRef.current || !target ||
      (target.production && !productionRef.current)) return;
    const action: PendingHistoryAction = { type: "restore", version: target.version };
    pendingRef.current = action;
    setPending(action);
    setRestoreError(null);
    onInteractionChange({ confirming: true, restoring: true });
    try {
      await secretsClient.rollback(orgSlug, projectSlug, environment.slug, secret.id, {
        version: target.version,
        expectedRevision: target.revision,
        expectedVersion: target.currentVersion,
        confirmProduction: productionRef.current,
      });
      if (!mounted.current) return;
      completed.current = true;
      hide();
      restoreRef.current = null;
      setRestoreTarget(null);
      onInteractionChange({ confirming: false, restoring: false });
      try { onRolledBack(); } finally { onClose(); }
    } catch (requestError) {
      if (mounted.current && !completed.current) setRestoreError(message(requestError, "Could not restore this version."));
    } finally {
      if (mounted.current) {
        pendingRef.current = null;
        setPending(null);
        onInteractionChange({ confirming: Boolean(restoreRef.current), restoring: false });
      }
    }
  }

  const visibleReveal = revealed && revealed.expiresAt > now ? revealed : null;
  const secondsRemaining = visibleReveal ? Math.max(0, Math.ceil((visibleReveal.expiresAt - now) / 1_000)) : 0;

  return <>
    <SecretHistoryContent
      secret={secret} environment={environment} versions={versions} loading={loading}
      error={error} actionError={actionError} pending={pending} revealed={visibleReveal}
      secondsRemaining={secondsRemaining} copiedVersion={copiedVersion}
      onReveal={(version) => void readValue("reveal", version)}
      onCopy={(version) => void readValue("copy", version)}
      onHide={hide} onRestore={openRestore} onRetry={() => setRetry((value) => value + 1)}
    />
    <SecretHistoryRestoreDialog
      open={restoreTarget !== null} secretKey={secret.key} version={restoreTarget?.version ?? null}
      currentVersion={restoreTarget?.currentVersion ?? secret.version}
      production={restoreTarget?.production ?? false} productionConfirmed={productionConfirmed}
      onProductionChange={(confirmed) => {
        if (!mounted.current || pendingRef.current || !restoreRef.current) return;
        productionRef.current = confirmed;
        setProductionConfirmed(confirmed);
      }}
      pending={pending?.type === "restore"} error={restoreError}
      onClose={closeRestore} onConfirm={() => void restore()}
    />
  </>;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
