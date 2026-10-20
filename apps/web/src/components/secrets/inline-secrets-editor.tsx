import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Plus, X } from "lucide-react";
import { Button } from "../arc/button/button";
import { motionTokens } from "../arc/lib/motion-tokens";
import { WorkspaceInput } from "../ui/workspace-input";
import { workspaceScopeClassName } from "../ui/workspace-scope";
import {
  createEmptySecretDraft,
  parseSecretPaste,
  populateSecretDraft,
  secretDraftValues,
} from "../onboarding/secrets-draft";
import { ProductionConfirmation } from "./secrets-ui";
import type { InlineSecretEdit } from "./inline-secret-edits";
import { secretsClient, type SecretEnvironment } from "@/lib/secrets-client";
import { serializeEnvText } from "@/lib/secrets/validation";

export interface InlineSecretsEditorProps {
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  revision: number;
  existingKeys: string[];
  disabled?: boolean;
  onSaved: () => void;
  onConflict: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  edits?: Record<string, InlineSecretEdit>;
  onResetEdits?: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export function InlineSecretsEditor({ orgSlug, projectSlug, environment, revision, existingKeys, disabled = false, onSaved, onConflict, onDirtyChange, edits, onResetEdits, onSavingChange }: InlineSecretsEditorProps) {
  const [rows, setRows] = useState(createEmptySecretDraft);
  const [saving, setSaving] = useState(false);
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const id = useId();
  const formId = `${id}-secrets`;
  const reducedMotion = useReducedMotion() ?? false;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const locked = disabled || saving;
  const changedSecrets = Object.values(edits ?? {}).filter((edit) => edit.value !== edit.originalValue);
  const newDirty = rows.some((row) => row.key.trim() || row.value);
  const dirty = newDirty || changedSecrets.length > 0;
  useEffect(() => { onDirtyChange?.(dirty || saving); }, [dirty, saving, onDirtyChange]);
  const existing = new Set(existingKeys);
  const keyCounts = new Map<string, number>();
  for (const row of rows) keyCounts.set(row.key, (keyCounts.get(row.key) ?? 0) + 1);
  let values: Record<string, string> | null = null;
  let validationError: string | null = null;
  if (dirty) {
    try {
      const additions = newDirty ? secretDraftValues(rows) : {};
      const collision = Object.keys(additions).find((key) => existing.has(key));
      if (collision) {
        validationError = `${collision} already exists. Edit the existing secret below.`;
      } else {
        values = secretDraftValues([
          ...rows,
          ...changedSecrets.map((edit, index) => ({ id: -(index + 1), key: edit.key, value: edit.value })),
        ]);
      }
    } catch (validation) {
      validationError = validation instanceof Error ? validation.message : "Check the secret keys and values.";
    }
  }
  const canSave = !!values && !locked && (!environment.isProduction || productionConfirmed);
  const message = error || validationError;

  function changed() {
    setError(null);
    setNotice(null);
  }

  function reset() {
    if (pending.current || !mounted.current) return;
    setRows(createEmptySecretDraft());
    setProductionConfirmed(false);
    setError(null);
    setNotice(null);
    onResetEdits?.();
  }

  function updateRow(rowId: number, field: "key" | "value", value: string) {
    if (pending.current || disabled) return;
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, [field]: value } : row));
    changed();
  }

  function paste(event: ClipboardEvent<HTMLInputElement>, rowId: number, field: "key" | "value") {
    if (pending.current || disabled) { event.preventDefault(); return; }
    try {
      const entries = parseSecretPaste(event.clipboardData.getData("text"), field);
      if (!entries) return;
      event.preventDefault();
      const populated = populateSecretDraft(rows, rowId, entries);
      setRows(populated);
      changed();
    } catch (pasteError) {
      event.preventDefault();
      setError(pasteError instanceof Error ? pasteError.message : "Could not paste these secrets.");
      setNotice(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mounted.current || pending.current || !canSave || !values) return;
    pending.current = true;
    setSaving(true);
    onSavingChange?.(true);
    setError(null);
    setNotice(null);
    const entries = Object.entries(values);
    try {
      if (changedSecrets.length) {
        // Keep the revision from the revealed values, even after a refresh.
        // One guarded import writes additions and edits in the same transaction.
        const expectedVersions: Record<string, number | null> = Object.fromEntries(entries.map(([key]) => [key, null]));
        for (const edit of changedSecrets) expectedVersions[edit.key] = edit.version;
        await secretsClient.importDotenv(orgSlug, projectSlug, environment.slug, {
          envText: serializeEnvText(values), dryRun: false,
          expectedRevision: Math.min(revision, ...changedSecrets.map((edit) => edit.revision)),
          expectedVersions, confirmProduction: productionConfirmed,
        });
      } else if (entries.length === 1) {
        const [key, value] = entries[0];
        await secretsClient.createSecret(orgSlug, projectSlug, environment.slug, {
          key, value,
          environmentSlugs: [environment.slug],
          expectedRevisions: { [environment.slug]: revision },
          expectedRevision: revision,
          confirmProduction: productionConfirmed,
        });
      } else {
        const envText = serializeEnvText(values);
        const preview = await secretsClient.importDotenv(orgSlug, projectSlug, environment.slug, {
          envText, dryRun: true, expectedRevision: revision, confirmProduction: productionConfirmed,
        });
        if (!mounted.current) return;
        if (preview.updated || preview.unchanged) {
          throw new Error("Some keys already exist. Edit those secrets in the list below before adding this batch.");
        }
        await secretsClient.importDotenv(orgSlug, projectSlug, environment.slug, {
          envText, dryRun: false, expectedRevision: preview.revision ?? revision, confirmProduction: productionConfirmed,
        });
      }
      if (!mounted.current) return;
      setRows(createEmptySecretDraft());
      setProductionConfirmed(false);
      onResetEdits?.();
      setNotice(`Saved ${entries.length === 1 ? "1 secret" : `${entries.length} secrets`}.`);
      onSaved();
    } catch (saveError) {
      if (!mounted.current) return;
      setError(saveError instanceof Error ? saveError.message : "Could not save these secrets.");
      if (typeof saveError === "object" && saveError !== null && "status" in saveError && saveError.status === 409) onConflict();
    } finally {
      pending.current = false;
      if (mounted.current) { setSaving(false); onSavingChange?.(false); }
    }
  }

  const unsavedBar = <AnimatePresence>
    {(dirty || saving) && <motion.div key="unsaved" role="region" aria-label="Unsaved secret changes" aria-busy={saving || undefined}
      initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
      transition={{ duration: reducedMotion ? 0 : motionTokens.duration.fast, ease: [...motionTokens.ease.standard] }}
      className={`${workspaceScopeClassName} fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center justify-between gap-x-5 gap-y-2 rounded-2xl border border-white/12 bg-[#161617]/95 px-4 py-3 font-sans text-zinc-200 shadow-[0_12px_48px_rgba(0,0,0,.5)] backdrop-blur-xl md:bottom-6`}>
      <span className="flex items-center gap-2.5 whitespace-nowrap text-[13px] font-medium"><AlertCircle size={16} className="shrink-0 text-amber-400" aria-hidden="true" /><span role="status" aria-live="polite">Unsaved changes</span></span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={reset}>Reset</Button>
        <Button type="submit" form={formId} size="sm" loading={saving} disabled={!canSave}>Save</Button>
      </div>
    </motion.div>}
  </AnimatePresence>;

  return <><form id={formId} aria-label="Add secrets" onSubmit={(event) => void save(event)} aria-busy={saving || undefined} className="ph-no-capture shrink-0 border-b border-white/[0.07] p-4">
    <fieldset disabled={locked} className="min-w-0 space-y-3">
      <legend className="sr-only">New secrets</legend>
      <div aria-label="New secret rows" className="max-h-[min(32vh,16rem)] space-y-2 overflow-y-auto overscroll-contain p-px">
        {rows.map((row, index) => {
          const invalidKey = !!(row.key || row.value) && !/^[A-Z_][A-Z0-9_]{0,255}$/.test(row.key);
          const duplicate = !!row.key && (keyCounts.get(row.key) ?? 0) > 1;
          const exists = existing.has(row.key);
          return <div key={row.id} role="group" aria-label={`New secret ${index + 1}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_32px] items-center">
            <WorkspaceInput aria-label={`Secret key ${index + 1}`} value={row.key}
              onChange={(event) => updateRow(row.id, "key", event.target.value.toUpperCase().replace(/\s+/g, "_"))}
              onPaste={(event) => paste(event, row.id, "key")} placeholder="KEY" maxLength={256}
              autoComplete="off" spellCheck={false} readOnly={locked}
              aria-invalid={invalidKey || duplicate || exists} aria-describedby={message ? `${id}-error` : undefined}
              className="relative rounded-l-2xl! rounded-r-none! font-mono text-[13px]! focus:z-10" />
            <WorkspaceInput type="password" aria-label={`Secret value ${index + 1}`} value={row.value}
              onChange={(event) => updateRow(row.id, "value", event.target.value)} onPaste={(event) => paste(event, row.id, "value")}
              placeholder="Value" autoComplete="off" spellCheck={false} readOnly={locked}
              className="rounded-l-none! rounded-r-2xl! border-l-0! font-mono text-[13px]!" />
            <Button type="button" variant="ghost" size="sm" disabled={locked} aria-label={`Remove secret ${index + 1}`} className="ml-1 size-8 p-0!"
              onClick={() => {
                if (pending.current || disabled) return;
                setRows((current) => current.length === 1 ? createEmptySecretDraft() : current.filter((item) => item.id !== row.id));
                changed();
              }}><X size={14} aria-hidden="true" /></Button>
          </div>;
        })}
      </div>
      {message && <p id={`${id}-error`} role="alert" className="text-[12px] leading-5 text-rose-300">{message}</p>}
      {notice && <p role="status" className="text-[12px] text-emerald-300">{notice}</p>}
      {environment.isProduction && dirty && <ProductionConfirmation checked={productionConfirmed} onChange={(checked) => { if (!pending.current && !disabled) setProductionConfirmed(checked); }} verb={changedSecrets.length ? "update" : "add"} />}
      <div className="flex items-center">
        <Button type="button" variant="ghost" size="sm" disabled={locked} className="-ml-2"
          onClick={() => {
            if (pending.current || disabled) return;
            setRows((current) => [...current, { id: Math.max(...current.map((row) => row.id)) + 1, key: "", value: "" }]);
            changed();
          }}><Plus size={13} aria-hidden="true" />Add another</Button>
      </div>
    </fieldset>
  </form>{typeof document === "undefined" ? unsavedBar : createPortal(unsavedBar, document.body)}</>;
}
