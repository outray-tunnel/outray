import { useEffect, useRef, useState, type FormEvent } from "react";
import { completeShareUrl, encryptShare } from "@outray/share-crypto";
import { secretsClient, type SecretEnvironment, type SecretMetadata } from "@/lib/secrets-client";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { BulkActionContent } from "./bulk-action-content";
import styles from "./bulk-actions.module.css";
import "../outray-arc-theme.css";

export type BulkAction = "move" | "delete" | "share";

type Props = {
  action: BulkAction | null;
  onClose: () => void;
  onDone: (message?: string) => void;
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  environments: SecretEnvironment[];
  secrets: SecretMetadata[];
  revision: number;
};
type FieldErrors = { target?: string; expiry?: string; maxViews?: string };
type Draft = {
  action: BulkAction | null;
  scope: string;
  session: number;
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  targets: SecretEnvironment[];
  selected: Array<Pick<SecretMetadata, "id" | "key">>;
  revision: number;
  targetSlug: string;
  conflictMode: "skip" | "overwrite";
  expiry: string;
  maxViews: string;
  productionConfirmed: boolean;
  busy: boolean;
  error: string | null;
  link: string | null;
};
const expiryPresets: Record<string, { durationValue: number; durationUnit: "days" | "months" }> = {
  "1d": { durationValue: 1, durationUnit: "days" },
  "7d": { durationValue: 7, durationUnit: "days" },
  "30d": { durationValue: 30, durationUnit: "days" },
  "1m": { durationValue: 1, durationUnit: "months" },
  "3m": { durationValue: 3, durationUnit: "months" },
};

function initialDraft(props: Props, scope: string, session: number): Draft {
  const targets = props.environments.filter((item) => item.id !== props.environment.id && !item.deletedAt).map((item) => ({ ...item }));
  return {
    action: props.action, scope, session, orgSlug: props.orgSlug, projectSlug: props.projectSlug,
    environment: { ...props.environment }, targets,
    selected: props.secrets.map(({ id, key }) => ({ id, key })).sort((a, b) => a.key.localeCompare(b.key)),
    revision: props.revision, targetSlug: targets[0]?.slug ?? "", conflictMode: "skip",
    expiry: "7d", maxViews: "10", productionConfirmed: false, busy: false, error: null, link: null,
  };
}

function validationErrors(draft: Draft): FieldErrors {
  if (draft.action === "move") return draft.targets.some((item) => item.slug === draft.targetSlug) ? {} : { target: "Choose another environment in this vault." };
  if (draft.action !== "share") return {};
  const errors: FieldErrors = {};
  if (!Object.hasOwn(expiryPresets, draft.expiry)) errors.expiry = "Choose an expiry for this link.";
  if (!/^\d+$/.test(draft.maxViews) || !Number.isSafeInteger(Number(draft.maxViews)) || Number(draft.maxViews) < 1 || Number(draft.maxViews) > 100) {
    errors.maxViews = "Choose between 1 and 100 reveals.";
  }
  return errors;
}

export function BulkActionsDialog(props: Props) {
  const { action, orgSlug, projectSlug, environment, onClose, onDone } = props;
  const scope = JSON.stringify([orgSlug, projectSlug, environment.id]);
  const [draft, setDraft] = useState(() => initialDraft(props, scope, 0));
  const mounted = useRef(true);
  const sessionRef = useRef(draft.session);
  const pending = useRef<number | null>(null);
  const completed = useRef<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const callbacks = useRef({ onClose, onDone });
  callbacks.current = { onClose, onDone };
  sessionRef.current = draft.session;
  // Capture the selection and revisions once per action, not on a background refresh.
  // A tenant/environment change starts a new session and fences off old requests.
  if (draft.action !== action || draft.scope !== scope) {
    const next = initialDraft(props, scope, draft.session + 1);
    sessionRef.current = next.session;
    pending.current = null;
    completed.current = null;
    setDraft(next);
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const session = draft.session;
  const target = draft.targets.find((item) => item.slug === draft.targetSlug);
  const needsProduction = draft.environment.isProduction || (draft.action === "move" && !!target?.isProduction);
  const fieldErrors = validationErrors(draft);
  const selectedLimit = draft.action === "share" ? 50 : 100;
  const selectionValid = draft.selected.length > 0 && draft.selected.length <= selectedLimit && new Set(draft.selected.map(({ id }) => id)).size === draft.selected.length;
  const selectionError = selectionValid ? null : `Select between 1 and ${selectedLimit} secrets, then try again.`;
  const canSubmit = !!action && !draft.busy && !draft.link && completed.current !== session && selectionValid && !Object.keys(fieldErrors).length && (!needsProduction || draft.productionConfirmed);
  const active = () => mounted.current && sessionRef.current === session && !!action;
  const change = (update: (previous: Draft) => Draft) => {
    if (!active() || pending.current === session || completed.current === session || draft.link) return;
    setDraft((previous) => previous.session === session ? update(previous) : previous);
  };
  const dismiss = () => { if (active() && pending.current !== session) callbacks.current.onClose(); };
  const preventPendingClose = (event: { preventDefault: () => void }) => { if (pending.current === session || draft.busy) event.preventDefault(); };

  async function perform(deleteConfirmed = false) {
    if (!active() || pending.current === session || completed.current === session || !canSubmit || (draft.action === "delete" && !deleteConfirmed)) return;
    pending.current = session;
    setDraft((previous) => ({ ...previous, busy: true, error: null }));
    const ids = draft.selected.map(({ id }) => id);
    try {
      if (draft.action === "share") {
        const origin = import.meta.env.VITE_SHARE_PUBLIC_ORIGIN;
        if (!origin) throw new Error("Share links are not configured. Set VITE_SHARE_PUBLIC_ORIGIN for the dashboard.");
        const publicUrl = new URL(origin);
        const localHttp = publicUrl.protocol === "http:" && publicUrl.hostname === "localhost";
        if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password || (publicUrl.protocol !== "https:" && !localHttp)) {
          throw new Error("VITE_SHARE_PUBLIC_ORIGIN must be a bare HTTPS origin.");
        }
        const snapshot = await secretsClient.snapshotForShare(draft.orgSlug, draft.projectSlug, draft.environment.slug, ids, draft.productionConfirmed);
        if (!active()) return;
        // The server returns a key-sorted snapshot. Keep its ID/version ordering together.
        const secretIds = snapshot.secrets.map(({ id }) => id);
        const versions = snapshot.secrets.map(({ version }) => version);
        const encrypted = await encryptShare({ type: "bundle", entries: snapshot.secrets.map(({ key, value }) => ({ key, value })) });
        if (!active()) return;
        const created = await secretsClient.createShare(draft.orgSlug, {
          projectSlug: draft.projectSlug, environmentSlug: draft.environment.slug, secretIds, versions,
          ciphertext: encrypted.ciphertext, iv: encrypted.iv, verifier: encrypted.verifier,
          ...expiryPresets[draft.expiry], maxViews: Number(draft.maxViews), confirmProduction: draft.productionConfirmed,
        });
        if (active()) {
          completed.current = session;
          setDraft((previous) => ({ ...previous, link: completeShareUrl(publicUrl.origin, created.id, encrypted.key) }));
        }
      } else if (draft.action === "delete") {
        await secretsClient.bulkAction(draft.orgSlug, draft.projectSlug, draft.environment.slug, {
          action: "delete", secretIds: ids, expectedRevision: draft.revision,
          confirmation: `DELETE ${ids.length}`, confirmProduction: draft.productionConfirmed,
        });
        if (active()) {
          completed.current = session;
          callbacks.current.onDone(`${ids.length} ${ids.length === 1 ? "secret" : "secrets"} moved to Trash. ${ids.length === 1 ? "It can" : "They can"} be restored as one batch.`);
        }
      } else if (draft.action === "move" && target) {
        const targetRevision = await secretsClient.revision(draft.orgSlug, draft.projectSlug, target.slug);
        if (!active()) return;
        const result = await secretsClient.bulkAction(draft.orgSlug, draft.projectSlug, draft.environment.slug, {
          action: "move", secretIds: ids,
          expectedSourceRevision: draft.revision, expectedTargetRevision: targetRevision.revision,
          targetEnvironmentSlug: target.slug, conflictMode: draft.conflictMode, confirmProduction: draft.productionConfirmed,
        });
        if (active()) {
          completed.current = session;
          const moved = result.moved ?? 0, skipped = result.skipped?.length ?? 0;
          callbacks.current.onDone(`${moved} ${moved === 1 ? "secret" : "secrets"} moved to ${target.name}${skipped ? `; ${skipped} duplicates skipped` : ""}.`);
        }
      }
    } catch (cause) {
      if (active()) setDraft((previous) => ({ ...previous, error: cause instanceof Error ? cause.message : "Could not complete this action. Try again." }));
    } finally {
      if (pending.current === session) pending.current = null;
      if (active()) setDraft((previous) => ({ ...previous, busy: false }));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter in a field or a normal form submission must never bypass the hold gesture.
    if (draft.action !== "delete") void perform();
  }

  const count = draft.selected.length;
  const title = draft.link ? "Share link" : draft.action === "share" ? "Share secrets" : draft.action === "delete" ? "Delete secrets" : "Move secrets";
  return <Dialog open={!!action} onOpenChange={(next) => { if (!next) dismiss(); }}>
    <DialogContent title={title} description={`${count} ${count === 1 ? "secret" : "secrets"} selected from ${draft.environment.name}.`}
      className={`workspace-ui outray-arc ph-no-capture ${styles.dialog}`} data-private-product="secrets" aria-busy={draft.busy} closeDisabled={draft.busy}
      onEscapeKeyDown={preventPendingClose} onPointerDownOutside={preventPendingClose} onInteractOutside={preventPendingClose}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        if (typeof HTMLElement === "undefined" || !(event.target instanceof HTMLElement)) return;
        const current = document.activeElement;
        if (current instanceof HTMLElement && current !== document.body && !event.target.contains(current)) opener.current = current;
        const first = event.target.querySelector<HTMLElement>("[data-bulk-autofocus]")
          ?? event.target.querySelector<HTMLElement>("form [role='combobox']:not([disabled]), form input:not([disabled]), form button:not([disabled])")
          ?? event.target.querySelector<HTMLElement>("button:not([disabled])");
        first?.focus();
      }}
      onCloseAutoFocus={(event) => {
        if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
        opener.current = null;
      }}>
      <BulkActionContent action={draft.action ?? "move"} selectedKeys={draft.selected.map(({ key }) => key)} environment={draft.environment}
        targets={draft.targets} targetSlug={draft.targetSlug} conflictMode={draft.conflictMode} expiry={draft.expiry} maxViews={draft.maxViews}
        productionConfirmed={draft.productionConfirmed} needsProduction={needsProduction} busy={draft.busy} error={draft.error ?? selectionError} link={draft.link}
        canSubmit={canSubmit} fieldErrors={fieldErrors}
        onTargetChange={(targetSlug) => change((previous) => ({ ...previous, targetSlug, productionConfirmed: false, error: null }))}
        onConflictChange={(conflictMode) => change((previous) => ({ ...previous, conflictMode, error: null }))}
        onExpiryChange={(expiry) => change((previous) => ({ ...previous, expiry, error: null }))}
        onMaxViewsChange={(maxViews) => change((previous) => ({ ...previous, maxViews, error: null }))}
        onProductionChange={(productionConfirmed) => change((previous) => ({ ...previous, productionConfirmed, error: null }))}
        onCopyError={(error) => { if (active()) setDraft((previous) => ({ ...previous, error })); }}
        onSubmit={submit} onDeleteConfirmed={() => void perform(true)} onClose={dismiss} />
    </DialogContent>
  </Dialog>;
}
