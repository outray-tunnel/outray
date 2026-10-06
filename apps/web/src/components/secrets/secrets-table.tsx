import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import CheckmarkCircle02Icon from "@hugeicons-pro/core-stroke-rounded/CheckmarkCircle02Icon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import Edit02Icon from "@hugeicons-pro/core-stroke-rounded/Edit02Icon";
import HistoryIcon from "@hugeicons-pro/core-stroke-rounded/HistoryIcon";
import Key01Icon from "@hugeicons-pro/core-stroke-rounded/Key01Icon";
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
import { SecretsNotice } from "./secrets-ui";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { formatRelativeDate, formatSecretDate } from "./utils";
import { usePermission } from "@/lib/auth-client";
import { BulkActionsDialog, type BulkAction } from "./bulk-actions-dialog";
import "../outray-arc-theme.css";

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
  contained = false,
  scrollRows = false,
}: {
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  environments: SecretEnvironment[];
  secrets: SecretMetadata[];
  revision: number;
  onMutated: () => void;
  onAdd: () => void;
  contained?: boolean;
  scrollRows?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Record<string, RevealedSecret>>({});
  const [now, setNow] = useState(Date.now());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    secret: SecretMetadata;
    environment: SecretEnvironment;
    environments: SecretEnvironment[];
    revision: number;
  } | null>(null);
  const [history, setHistory] = useState<SecretMetadata | null>(null);
  const [deleting, setDeleting] = useState<SecretMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const { data: canShare } = usePermission({ secretShare: ["create"] });
  const revealTimers = useRef(new Map<string, number>());
  const copyTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

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
      return () => {
        mounted.current = false;
        timers.forEach((timer) => window.clearTimeout(timer));
        timers.clear();
        if (copyTimer.current) window.clearTimeout(copyTimer.current);
      };
    },
    [],
  );

  const reveal = async (secret: SecretMetadata) => {
    if (!mounted.current) return;
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
      if (!mounted.current) return;
      const expiresAt = Date.now() + result.expiresIn * 1_000;
      setNow(Date.now());
      setRevealed((current) => ({
        ...current,
        [secret.id]: { value: result.value, expiresAt },
      }));
      const existing = revealTimers.current.get(secret.id);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        if (!mounted.current) return;
        setRevealed((current) => {
          const next = { ...current };
          delete next[secret.id];
          return next;
        });
        revealTimers.current.delete(secret.id);
      }, result.expiresIn * 1_000);
      revealTimers.current.set(secret.id, timer);
    } catch (requestError) {
      if (!mounted.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reveal this secret.",
      );
    } finally {
      if (mounted.current) setBusyId(null);
    }
  };

  const copy = async (secret: SecretMetadata) => {
    if (!mounted.current) return;
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
      if (!mounted.current) return;
      await navigator.clipboard.writeText(result.value);
      if (!mounted.current) return;
      setCopiedId(secret.id);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => { if (mounted.current) setCopiedId(null); }, 2_000);
    } catch (requestError) {
      if (!mounted.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not copy this secret.",
      );
    } finally {
      if (mounted.current) setBusyId(null);
    }
  };

  const remove = async (productionConfirmed: boolean, confirmation: string) => {
    if (!deleting || !mounted.current) return;
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

  const rowActions = (secret: SecretMetadata) => [
    {
      label: "Edit secret",
      icon: Edit02Icon,
      onSelect: () => setEditing({ secret: { ...secret }, environment: { ...environment }, environments: environments.map((item) => ({ ...item })), revision }),
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

  const surfaceClassName = `outray-arc ph-no-capture @container/secret-table min-w-0 ${scrollRows ? "flex h-full min-h-0 flex-col overflow-hidden" : ""} ${contained ? "" : "overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]"}`;
  const messageClassName = scrollRows ? "flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-6 text-center" : "px-5 py-12 text-center";
  if (secrets.length === 0) {
    return <div className={surfaceClassName}>
      <div className={messageClassName}>
        <HugeiconsIcon icon={Key01Icon} size={22} strokeWidth={1.7} className="mx-auto text-zinc-500" aria-hidden="true" />
        <h3 className="mt-3 text-[14px] font-medium text-zinc-200">No secrets in this environment</h3>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-zinc-500">Add a secret or import a dotenv file. Values stay encrypted and hidden by default.</p>
        <Button type="button" variant="secondary" size="sm" className="mt-4" aria-haspopup="dialog" onClick={onAdd}><Plus size={13} aria-hidden="true" />Add first secret</Button>
      </div>
    </div>;
  }

  return (
    <div className={surfaceClassName}>
      {(error || notice) && <div className={`space-y-2 px-4 pt-4 ${scrollRows ? "shrink-0" : ""}`}>
        {error && <SecretsNotice message={error} onDismiss={() => setError(null)} />}
        {notice && <SecretsNotice tone="success" message={notice} onDismiss={() => setNotice(null)} />}
      </div>}
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 ${scrollRows ? "shrink-0" : ""}`}>
        <div className="outray-arc-requests-search min-w-0 flex-1 sm:max-w-sm"><SearchField appearance="workspace" label="Search secret keys" value={query} onValueChange={setQuery} placeholder="Search keys…" autoComplete="off" spellCheck={false} /></div>
        {query.trim() && <span role="status" className="text-[11px] tabular-nums text-zinc-500">{visibleSecrets.length.toLocaleString()} of {secrets.length.toLocaleString()} keys</span>}
      </div>

      {selected.length > 0 && <div className={`flex flex-wrap items-center gap-2 border-b border-white/[0.07] bg-white/[0.025] px-4 py-2.5 ${scrollRows ? "shrink-0" : ""}`} role="toolbar" aria-label="Selected secrets actions">
        <span className="mr-auto text-[12px] tabular-nums text-zinc-300">{selected.length.toLocaleString()} selected</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setBulkAction("move")}>Move to</Button>
        {canShare && selected.length <= 50 && <Button type="button" variant="ghost" size="sm" onClick={() => setBulkAction("share")}>Share</Button>}
        <Button type="button" variant="danger" size="sm" onClick={() => setBulkAction("delete")}>Delete</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
      </div>}

      {visibleSecrets.length === 0 ? <div className={messageClassName}>
        <Search size={21} className="mx-auto text-zinc-500" aria-hidden="true" />
        <h3 className="mt-3 text-[14px] font-medium text-zinc-200">No matching keys</h3>
        <p className="mt-1 text-[12px] leading-5 text-zinc-500">No secret keys match “{query}”.</p>
        <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setQuery("")}>Clear search</Button>
      </div> : <div role="table" aria-label="Secret keys" className={scrollRows ? "flex min-h-0 flex-1 flex-col overflow-hidden" : undefined}>
        <div role="rowgroup" className={`border-b border-white/[0.06] bg-white/[0.015] ${scrollRows ? "shrink-0 overflow-y-hidden [scrollbar-gutter:stable]" : ""}`}>
          <div role="row" className={`grid grid-cols-[16px_minmax(0,1fr)_96px] items-center gap-3 px-4 py-2.5 text-[11px] text-zinc-500 ${secretColumns}`}>
            <span role="columnheader">{selectionControl("Select all visible secrets", allVisibleSelected, toggleVisible, someVisibleSelected && !allVisibleSelected)}</span>
            <span role="columnheader" className="col-span-2 @[680px]/secret-table:col-span-1">Key</span>
            <span role="columnheader" className="hidden @[680px]/secret-table:block">Value</span>
            <span role="columnheader" className="hidden @[680px]/secret-table:block">Updated</span>
            <span role="columnheader" className="hidden text-right @[680px]/secret-table:block">Actions</span>
          </div>
        </div>
        <div role="rowgroup" aria-label={scrollRows ? "Secret key rows" : undefined} tabIndex={scrollRows ? 0 : undefined}
          data-scroll-restoration-id={scrollRows ? `secrets-rows:${[orgSlug, projectSlug, environment.id].map(encodeURIComponent).join(":")}` : undefined}
          className={`divide-y divide-white/[0.06] ${scrollRows ? "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" : ""}`}>
          {visibleSecrets.map((secret) => {
          const visible = revealFor(secret);
          const seconds = visible ? Math.max(0, Math.ceil((visible.expiresAt - now) / 1_000)) : 0;
          const isSelected = selectedIds.includes(secret.id);
          return <div role="row" key={secret.id} aria-selected={isSelected} className={`grid min-h-[76px] grid-cols-[16px_minmax(0,1fr)_96px] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-white/[0.025] motion-reduce:transition-none ${secretColumns} ${isSelected ? "bg-white/[0.035]" : ""}`}>
            <div role="cell" className="row-start-1 @[680px]/secret-table:row-auto">{selectionControl(`Select ${secret.key}`, isSelected, () => toggleSelected(secret.id))}</div>
            <div role="cell" className="col-start-2 row-start-1 min-w-0 @[680px]/secret-table:col-auto @[680px]/secret-table:row-auto">
              <p className="truncate font-mono text-[13px] text-zinc-200" title={secret.key}>{secret.key}</p>
              <p className="mt-1 truncate text-[11px] text-zinc-500"><span className="tabular-nums">v{secret.version}</span><span className="@[680px]/secret-table:hidden"> · Updated {formatRelativeDate(secret.updatedAt)}</span></p>
            </div>
            <div role="cell" className="col-span-2 col-start-2 row-start-2 flex min-w-0 items-center gap-2 @[680px]/secret-table:col-auto @[680px]/secret-table:row-auto @[680px]/secret-table:col-span-1">
              <span className="sr-only">Value</span>
              <span className={`min-w-0 flex-1 truncate font-mono text-[13px] ${visible ? "text-amber-200" : "tracking-[0.12em] text-zinc-500"}`}>{visible ? visible.value : "••••••••••••••••"}</span>
              {visible && <span className="shrink-0 text-[11px] tabular-nums text-amber-300/70">{seconds}s</span>}
              <div className="flex shrink-0 items-center gap-0.5">
                <Button type="button" variant="ghost" size="sm" className={iconButtonClassName} aria-label={visible ? `Hide value for ${secret.key}` : `Reveal ${secret.key} for 30 seconds`} title={visible ? "Hide value" : "Reveal for 30 seconds"} disabled={busyId === secret.id} onClick={() => void reveal(secret)}>
                  <HugeiconsIcon icon={visible ? ViewOffIcon : ViewIcon} size={15} strokeWidth={1.7} aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className={iconButtonClassName} aria-label={copiedId === secret.id ? `Copied ${secret.key}` : `Copy value for ${secret.key}`} title={copiedId === secret.id ? "Copied" : "Copy value"} disabled={busyId === secret.id} onClick={() => void copy(secret)}>
                  <HugeiconsIcon icon={copiedId === secret.id ? CheckmarkCircle02Icon : Copy01Icon} size={15} strokeWidth={1.7} aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div role="cell" className="hidden min-w-0 text-[11px] tabular-nums text-zinc-500 @[680px]/secret-table:block"><time dateTime={Number.isFinite(Date.parse(secret.updatedAt)) ? secret.updatedAt : undefined} title={formatSecretDate(secret.updatedAt)}>{formatRelativeDate(secret.updatedAt)}</time></div>
            <div role="cell" className="col-start-3 row-start-1 flex items-center justify-end gap-1 @[680px]/secret-table:col-auto @[680px]/secret-table:row-auto">
              {rowActions(secret).map((action) => <Button key={action.label} type="button" variant="ghost" size="sm" className={`${iconButtonClassName} ${action.danger ? "!text-rose-300/70 hover:!bg-rose-400/[0.07]" : ""}`} aria-label={`${action.label} ${secret.key}`} title={action.label} aria-haspopup="dialog" disabled={busyId === secret.id} onClick={action.onSelect}>
                <HugeiconsIcon icon={action.icon} size={15} strokeWidth={1.7} aria-hidden="true" />
              </Button>)}
            </div>
          </div>;
        })}</div>
      </div>}

      <SecretEditorDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        environment={editing?.environment ?? environment}
        environments={editing?.environments ?? environments}
        secret={editing?.secret ?? null}
        revision={editing?.revision ?? revision}
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
      <BulkActionsDialog action={bulkAction} onClose={() => setBulkAction(null)}
        onDone={(message) => { if (!mounted.current) return; setBulkAction(null); setSelectedIds([]); setNotice(message || null); onMutated(); }}
        orgSlug={orgSlug} projectSlug={projectSlug} environment={environment}
        environments={environments} secrets={selected} revision={revision} />
    </div>
  );
}

const secretColumns = "@[680px]/secret-table:grid-cols-[16px_minmax(160px,1.15fr)_minmax(160px,1fr)_78px_96px]";
const iconButtonClassName = "!size-7 !min-h-7 !rounded-md !p-0";

function selectionControl(label: string, checked: boolean, onChange: () => void, partial = false) {
  return <span className="relative inline-flex size-4 shrink-0">
    <input type="checkbox" aria-label={label} aria-checked={partial ? "mixed" : checked} checked={checked} onChange={onChange}
      className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0" />
    <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded-[4px] border text-transparent transition-colors peer-checked:border-zinc-200 peer-checked:bg-zinc-200 peer-checked:text-zinc-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-accent motion-reduce:transition-none ${partial ? "border-zinc-200 bg-zinc-200 !text-zinc-950" : "border-white/20 bg-white/[0.025]"}`}>
      {partial ? <Minus size={11} strokeWidth={2.5} /> : <Check size={11} strokeWidth={2.5} />}
    </span>
  </span>;
}
