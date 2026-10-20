import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import Key01Icon from "@outray/icons/stroke/Key01Icon";
import {
  secretsClient,
  type SecretEnvironment,
  type SecretMetadata,
} from "@/lib/secrets-client";
import { ConfirmSecretActionDialog } from "./secret-dialogs";
import { SecretHistorySheet } from "./secret-history-sheet";
import { SecretsNotice } from "./secrets-ui";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { formatRelativeDate, formatSecretDate } from "./utils";
import { usePermission } from "@/lib/auth-client";
import { BulkActionsDialog, type BulkAction } from "./bulk-actions-dialog";
import { WorkspaceInput } from "../ui/workspace-input";
import type { InlineSecretEdit } from "./inline-secret-edits";

interface RevealedSecret {
  value: string;
  key: string;
  version: number;
  revision: number;
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
  contained = false,
  scrollRows = false,
  query: controlledQuery,
  onQueryChange,
  reserveActionsSpace = false,
  edits = {},
  onEditChange,
  disabled = false,
  hasUnsavedChanges = false,
  resetToken = 0,
}: {
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  environments: SecretEnvironment[];
  secrets: SecretMetadata[];
  revision: number;
  onMutated: () => void;
  contained?: boolean;
  scrollRows?: boolean;
  query?: string;
  onQueryChange?: (value: string) => void;
  reserveActionsSpace?: boolean;
  edits?: Record<string, InlineSecretEdit>;
  onEditChange?: (edit: InlineSecretEdit) => void;
  disabled?: boolean;
  hasUnsavedChanges?: boolean;
  resetToken?: number;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const [revealed, setRevealed] = useState<Record<string, RevealedSecret>>({});
  const [now, setNow] = useState(Date.now());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState<SecretMetadata | null>(null);
  const [deleting, setDeleting] = useState<SecretMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [shareTarget, setShareTarget] = useState<SecretMetadata | null>(null);
  const { data: canShare } = usePermission({ secretShare: ["create"] });
  const revealTimers = useRef(new Map<string, number>());
  const copyTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const generation = useRef(0);
  const pending = useRef(false);
  const mutationBlocked = disabled || hasUnsavedChanges;

  const visibleSecrets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return secrets;
    return secrets.filter((secret) =>
      secret.key.toLowerCase().includes(normalized),
    );
  }, [query, secrets]);
  const selected = secrets.filter((secret) => selectedIds.includes(secret.id));
  const allVisibleSelected = visibleSecrets.length > 0 && visibleSecrets.every((secret) => selectedIds.includes(secret.id));
  const someVisibleSelected = visibleSecrets.some((secret) => selectedIds.includes(secret.id));
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleVisible = () => setSelectedIds((current) => allVisibleSelected
    ? current.filter((id) => !visibleSecrets.some((secret) => secret.id === id))
    : [...new Set([...current, ...visibleSecrets.map((secret) => secret.id)])]);

  useEffect(() => {
    if (Object.keys(revealed).length === 0) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [revealed]);

  useEffect(
    () => {
      mounted.current = true;
      const timers = revealTimers.current;
      const requests = generation;
      return () => {
        mounted.current = false;
        requests.current++;
        timers.forEach((timer) => window.clearTimeout(timer));
        timers.clear();
        if (copyTimer.current) window.clearTimeout(copyTimer.current);
      };
    },
    [],
  );

  useEffect(() => {
    generation.current++;
    pending.current = false;
    revealTimers.current.forEach((timer) => window.clearTimeout(timer));
    revealTimers.current.clear();
    setRevealed({});
    setEditingId(null);
    setBusyId(null);
    setCopiedId(null);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, [resetToken]);

  useEffect(() => {
    if (!mutationBlocked) return;
    setHistory(null);
    setDeleting(null);
    setBulkAction(null);
    setShareTarget(null);
  }, [mutationBlocked]);

  const hide = (id: string) => {
    const timer = revealTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    revealTimers.current.delete(id);
    setEditingId((current) => current === id ? null : current);
    setRevealed((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const show = (id: string, value: Omit<RevealedSecret, "expiresAt">, seconds: number) => {
    hide(id);
    const time = Date.now();
    setNow(time);
    setRevealed((current) => ({ ...current, [id]: { ...value, expiresAt: time + seconds * 1_000 } }));
    revealTimers.current.set(id, window.setTimeout(() => { if (mounted.current) hide(id); }, seconds * 1_000));
  };

  const reveal = async (secret: SecretMetadata) => {
    if (!mounted.current || disabled || pending.current) return;
    if (revealed[secret.id]) {
      hide(secret.id);
      return;
    }
    const edit = edits[secret.id];
    if (edit) {
      show(secret.id, { value: edit.originalValue, key: edit.key, version: edit.version, revision: edit.revision }, 30);
      return;
    }
    const snapshot = { key: secret.key, version: secret.version, revision };
    const requestGeneration = generation.current;
    pending.current = true;
    setBusyId(secret.id);
    setError(null);
    try {
      const result = await secretsClient.revealSecret(
        orgSlug,
        projectSlug,
        environment.slug,
        secret.id,
        { intent: "reveal", version: snapshot.version },
      );
      if (!mounted.current || generation.current !== requestGeneration) return;
      show(secret.id, { ...snapshot, value: result.value }, result.expiresIn);
    } catch (requestError) {
      if (!mounted.current || generation.current !== requestGeneration) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reveal this secret.",
      );
    } finally {
      if (mounted.current && generation.current === requestGeneration) { pending.current = false; setBusyId(null); }
    }
  };

  const copy = async (secret: SecretMetadata) => {
    if (!mounted.current || disabled || pending.current) return;
    const requestGeneration = generation.current;
    const edit = edits[secret.id];
    pending.current = true;
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
      if (!mounted.current || generation.current !== requestGeneration) return;
      await navigator.clipboard.writeText(edit?.value ?? result.value);
      if (!mounted.current || generation.current !== requestGeneration) return;
      setCopiedId(secret.id);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => { if (mounted.current) setCopiedId(null); }, 2_000);
    } catch (requestError) {
      if (!mounted.current || generation.current !== requestGeneration) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not copy this secret.",
      );
    } finally {
      if (mounted.current && generation.current === requestGeneration) { pending.current = false; setBusyId(null); }
    }
  };

  const remove = async (productionConfirmed: boolean, confirmation: string) => {
    if (!deleting || !mounted.current || mutationBlocked) return;
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
      if (!mounted.current) return;
      setDeleting(null);
      setRevealed((current) => {
        const next = { ...current };
        delete next[deleting.id];
        return next;
      });
      onMutated();
    } catch (requestError) {
      if (!mounted.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete this secret.",
      );
    } finally {
      if (mounted.current) setBusyId(null);
    }
  };

  const revealFor = (secret: SecretMetadata) => {
    const item = revealed[secret.id];
    return item && item.expiresAt > now ? item : null;
  };

  const surfaceClassName = `ph-no-capture @container/secret-table min-w-0 ${scrollRows ? "flex h-full min-h-0 flex-col overflow-hidden" : ""} ${contained ? "" : "overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]"}`;
  const messageClassName = scrollRows ? "flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-6 text-center" : "px-5 py-12 text-center";
  if (secrets.length === 0) {
    return <div className={surfaceClassName}>
      <div className={messageClassName}>
        <HugeiconsIcon icon={Key01Icon} size={22} strokeWidth={1.7} className="mx-auto text-zinc-500" aria-hidden="true" />
        <h3 className="mt-3 text-[14px] font-medium text-zinc-200">No secrets in this environment</h3>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-zinc-500">Use the fields above to save your first secrets. Values stay encrypted and hidden by default.</p>
      </div>
    </div>;
  }

  return (
    <div className={surfaceClassName}>
      {(error || notice) && <div className={`space-y-2 px-4 pt-4 ${scrollRows ? "shrink-0" : ""}`}>
        {error && <SecretsNotice message={error} onDismiss={() => setError(null)} />}
        {notice && <SecretsNotice tone="success" message={notice} onDismiss={() => setNotice(null)} />}
      </div>}
      {controlledQuery === undefined && <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 ${scrollRows ? "shrink-0" : ""}`}>
        <div className="min-w-0 flex-1 sm:max-w-sm [&>div]:relative [&>div]:gap-0 [&_input:focus-visible]:outline-none [&_label]:sr-only"><SearchField appearance="workspace" label="Search secret keys" value={query} onValueChange={setQuery} placeholder="Search keys…" autoComplete="off" spellCheck={false} /></div>
        {query.trim() && <span role="status" className="text-[11px] tabular-nums text-zinc-500">{visibleSecrets.length.toLocaleString()} of {secrets.length.toLocaleString()} keys</span>}
      </div>}

      {selected.length > 0 && <div className={`flex flex-wrap items-center gap-2 border-b border-white/[0.07] bg-white/[0.025] px-4 py-2.5 ${scrollRows ? "shrink-0" : ""}`} role="toolbar" aria-label="Selected secrets actions">
        <span className="mr-auto text-[12px] tabular-nums text-zinc-300">{selected.length.toLocaleString()} selected</span>
        <Button type="button" variant="ghost" size="md" aria-haspopup="dialog" disabled={mutationBlocked} onClick={() => { if (!mutationBlocked) setBulkAction("move"); }}>Move to</Button>
        {canShare && selected.length <= 50 && <Button type="button" variant="ghost" size="md" aria-haspopup="dialog" disabled={mutationBlocked} onClick={() => { if (!mutationBlocked) setBulkAction("share"); }}>Share</Button>}
        <Button type="button" variant="danger" size="md" aria-haspopup="dialog" disabled={mutationBlocked} onClick={() => { if (!mutationBlocked) setBulkAction("delete"); }}>Delete</Button>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setSelectedIds([])}>Clear</Button>
      </div>}

      {visibleSecrets.length === 0 ? <div className={messageClassName}>
        <Search size={21} className="mx-auto text-zinc-500" aria-hidden="true" />
        <h3 className="mt-3 text-[14px] font-medium text-zinc-200">No matching keys</h3>
        <p className="mt-1 text-[12px] leading-5 text-zinc-500">No secret keys match “{query}”.</p>
        <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setQuery("")}>Clear search</Button>
      </div> : <div role="table" aria-label="Secret keys" className={scrollRows ? "flex min-h-0 flex-1 flex-col overflow-hidden" : undefined}>
        <div role="rowgroup" className={`border-b border-white/[0.06] bg-white/[0.015] ${scrollRows ? "shrink-0 overflow-y-hidden [scrollbar-gutter:stable]" : ""}`}>
          <div role="row" className="grid grid-cols-[16px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 text-[11px] text-zinc-500">
            <span role="columnheader">{selectionControl("Select all visible secrets", allVisibleSelected, toggleVisible, someVisibleSelected && !allVisibleSelected, disabled)}</span>
            <span role="columnheader">Key</span>
            <span role="columnheader">Value</span>
          </div>
        </div>
        <div role="rowgroup" aria-label={scrollRows ? "Secret key rows" : undefined} tabIndex={scrollRows ? 0 : undefined}
          data-scroll-restoration-id={scrollRows ? `secrets-rows:${[orgSlug, projectSlug, environment.id].map(encodeURIComponent).join(":")}` : undefined}
          className={`space-y-5 px-4 pt-9 pb-4 ${scrollRows ? "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" : ""} ${reserveActionsSpace ? "!pb-24" : ""}`}>
          {visibleSecrets.map((secret) => {
            const visible = revealFor(secret);
            const edit = edits[secret.id];
            const isEditing = editingId === secret.id && !!visible;
            const seconds = visible ? Math.max(0, Math.ceil((visible.expiresAt - now) / 1_000)) : 0;
            const isSelected = selectedIds.includes(secret.id);
            const rowDisabled = disabled || busyId === secret.id;
            return <div role="row" key={secret.id} aria-selected={isSelected} className={`grid grid-cols-[16px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 transition-colors motion-reduce:transition-none ${isSelected ? "bg-white/[0.025]" : ""}`}>
              <div role="cell" className="row-start-1 self-center">{selectionControl(`Select ${secret.key}`, isSelected, () => toggleSelected(secret.id), false, disabled)}</div>
              <div role="cell" className={`col-start-2 row-start-1 flex h-14 min-w-0 items-center gap-3 rounded-l-[16px] border border-white/[0.10] bg-black/15 px-3 sm:px-4 ${edit ? "border-amber-300/25" : ""}`}>
                <p className="min-w-0 flex-1 truncate font-mono text-[13px] text-zinc-200" title={secret.key}>{secret.key}</p>
                <span className="shrink-0 text-[10px] tabular-nums text-zinc-600" title={`Updated ${formatSecretDate(secret.updatedAt)}`}>v{secret.version}</span>
              </div>
              <div role="cell" className={`group/value relative col-start-3 row-start-1 -ml-3 min-w-0 rounded-r-[16px] border border-white/[0.10] bg-black/15 focus-within:z-10 focus-within:border-accent/50 hover:z-10 ${edit ? "border-amber-300/25" : ""}`}>
                <div className="pointer-events-none absolute bottom-full left-0 z-20 w-max max-w-[calc(100vw-5rem)] -translate-x-1/2 overflow-hidden pt-2 group-hover/value:pointer-events-auto group-focus-within/value:pointer-events-auto @[560px]/secret-table:translate-x-0">
                <div role="toolbar" aria-label={`Actions for ${secret.key}`} className="flex translate-y-full items-center rounded-t-xl border border-b-0 border-white/[0.12] bg-[#202022] px-1 opacity-0 shadow-lg transition-[translate,opacity] duration-200 ease-[cubic-bezier(.22,1,.36,1)] group-hover/value:translate-y-0 group-hover/value:opacity-100 group-focus-within/value:translate-y-0 group-focus-within/value:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none">
                  <Button type="button" variant="ghost" size="sm" className={hoverActionClassName} aria-label={copiedId === secret.id ? `Copied ${secret.key}` : `Copy value for ${secret.key}`} disabled={rowDisabled} onClick={() => void copy(secret)}>{copiedId === secret.id ? "Copied" : "Copy"}</Button>
                  {canShare && <Button type="button" variant="ghost" size="sm" className={hoverActionClassName} aria-label={`Share secret ${secret.key}`} aria-haspopup="dialog" disabled={rowDisabled || mutationBlocked} onClick={() => { if (!mutationBlocked) setShareTarget({ ...secret }); }}>Share</Button>}
                  <Button type="button" variant="ghost" size="sm" className={hoverActionClassName} aria-label={`Version history ${secret.key}`} aria-haspopup="dialog" disabled={rowDisabled || mutationBlocked} onClick={() => { if (!mutationBlocked) setHistory(secret); }}>History</Button>
                  <Button type="button" variant="ghost" size="sm" className={`${hoverActionClassName} !text-rose-300/80 hover:!bg-rose-400/[0.07]`} aria-label={`Delete secret ${secret.key}`} aria-haspopup="dialog" disabled={rowDisabled || mutationBlocked} onClick={() => { if (!mutationBlocked) setDeleting(secret); }}>Delete</Button>
                </div>
                </div>
                <div className="flex h-14 min-w-0 items-center gap-1 pr-2 sm:gap-2 sm:pr-3">
                  {visible ? <WorkspaceInput variant="bare" type="text" aria-label={`Edit ${secret.key} value`} value={edit?.value ?? visible.value} readOnly={!isEditing} disabled={rowDisabled} autoComplete="off" spellCheck={false} className="!h-full !min-w-0 !flex-1 cursor-text !rounded-none !border-0 !bg-transparent !px-3 sm:!px-4 font-mono !text-[13px] !text-zinc-200 !shadow-none !outline-none read-only:caret-transparent"
                    onFocus={() => { if (!disabled) setEditingId(secret.id); }}
                    onPointerDown={() => { if (!disabled) setEditingId(secret.id); }}
                    onChange={(event) => {
                      if (disabled || !isEditing || !onEditChange) return;
                      onEditChange({ id: secret.id, key: edit?.key ?? visible.key, version: edit?.version ?? visible.version, revision: edit?.revision ?? visible.revision, originalValue: edit?.originalValue ?? visible.value, value: event.target.value });
                    }}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); hide(secret.id); } else if (event.key === "Enter") { event.preventDefault(); setEditingId(null); } }}
                  /> : <button type="button" disabled={rowDisabled} aria-label={`Reveal ${secret.key}`} title="Click to reveal"
                    onClick={() => { if (!disabled) void reveal(secret); }}
                    className="group/reveal h-full min-w-0 flex-1 cursor-text truncate px-3 text-left sm:px-4 font-mono text-[13px] tracking-[0.12em] text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 disabled:cursor-default">
                      <span aria-hidden="true" className="group-hover/reveal:hidden group-focus-visible/reveal:hidden">••••••••••••••••</span>
                      <span aria-hidden="true" className="hidden tracking-normal group-hover/reveal:inline group-focus-visible/reveal:inline">Click to reveal</span>
                  </button>}
                  {visible && <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">{seconds}s</span>}
                </div>
              </div>
              <div className="col-span-2 col-start-2 -mt-1 text-[10px] text-zinc-600">{edit ? <span className="text-amber-300/70">Unsaved change · </span> : null}<time dateTime={Number.isFinite(Date.parse(secret.updatedAt)) ? secret.updatedAt : undefined} title={formatSecretDate(secret.updatedAt)}>{formatRelativeDate(secret.updatedAt)}</time></div>
            </div>;
          })}
        </div>
      </div>}

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
      <BulkActionsDialog action={shareTarget ? "share" : bulkAction} onClose={() => { setBulkAction(null); setShareTarget(null); }}
        onDone={(message) => { if (!mounted.current) return; setBulkAction(null); setShareTarget(null); if (!shareTarget) setSelectedIds([]); setNotice(message || null); onMutated(); }}
        orgSlug={orgSlug} projectSlug={projectSlug} environment={environment}
        environments={environments} secrets={shareTarget ? [shareTarget] : selected} revision={revision} />
    </div>
  );
}

const hoverActionClassName = "!min-h-8 !rounded-md !px-2.5 !py-1 !text-[11px] !font-medium";

function selectionControl(label: string, checked: boolean, onChange: () => void, partial = false, disabled = false) {
  return <span className="relative inline-flex size-4 shrink-0">
    <input type="checkbox" aria-label={label} aria-checked={partial ? "mixed" : checked} checked={checked} disabled={disabled} onChange={onChange}
      className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0" />
    <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded-[4px] border text-transparent transition-colors peer-checked:border-zinc-200 peer-checked:bg-zinc-200 peer-checked:text-zinc-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-accent motion-reduce:transition-none ${partial ? "border-zinc-200 bg-zinc-200 !text-zinc-950" : "border-white/20 bg-white/[0.025]"}`}>
      {partial ? <Minus size={11} strokeWidth={2.5} /> : <Check size={11} strokeWidth={2.5} />}
    </span>
  </span>;
}
