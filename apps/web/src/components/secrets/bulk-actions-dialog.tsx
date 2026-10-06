import { useEffect, useState, type FormEvent } from "react";
import { completeShareUrl, encryptShare } from "@outray/share-crypto";
import { secretsClient, type SecretEnvironment, type SecretMetadata } from "@/lib/secrets-client";
import { WorkspaceInput } from "../ui/workspace-input";
import {
  DialogForm, Field, ProductionConfirmation, SecretsButton, SecretsDialog,
  SecretsNotice, SecretsSelect,
} from "./secrets-ui";

export type BulkAction = "move" | "delete" | "share";

export function BulkActionsDialog({ action, onClose, onDone, orgSlug, projectSlug, environment,
  environments, secrets, revision }: {
  action: BulkAction | null;
  onClose: () => void;
  onDone: (message?: string) => void;
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  environments: SecretEnvironment[];
  secrets: SecretMetadata[];
  revision: number;
}) {
  const targets = environments.filter((item) => item.id !== environment.id);
  const [targetSlug, setTargetSlug] = useState("");
  const [conflictMode, setConflictMode] = useState<"skip" | "overwrite">("skip");
  const [durationValue, setDurationValue] = useState(7);
  const [durationUnit, setDurationUnit] = useState<"days" | "months">("days");
  const [maxViews, setMaxViews] = useState(10);
  const [confirmation, setConfirmation] = useState("");
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!action) return;
    setTargetSlug(targets[0]?.slug || "");
    setConflictMode("skip");
    setDurationValue(7);
    setDurationUnit("days");
    setMaxViews(10);
    setConfirmation("");
    setProductionConfirmed(false);
    setBusy(false);
    setError(null);
    setLink(null);
    setCopied(false);
    // Reset when opening a new action or changing the source environment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, environment.id]);

  const target = targets.find((item) => item.slug === targetSlug);
  const needsProduction = environment.isProduction || (action === "move" && !!target?.isProduction);
  const ordered = [...secrets].sort((a, b) => a.key.localeCompare(b.key));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!action || !secrets.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "share") {
        const origin = import.meta.env.VITE_SHARE_PUBLIC_ORIGIN;
        if (!origin) throw new Error("VITE_SHARE_PUBLIC_ORIGIN is not configured for the dashboard.");
        const publicUrl = new URL(origin);
        if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password ||
            (publicUrl.protocol !== "https:" && publicUrl.hostname !== "localhost")) {
          throw new Error("VITE_SHARE_PUBLIC_ORIGIN must be a bare HTTPS origin.");
        }
        const snapshot = await secretsClient.snapshotForShare(orgSlug, projectSlug, environment.slug,
          ordered.map((secret) => secret.id), productionConfirmed);
        const encrypted = await encryptShare({ type: "bundle", entries: snapshot.secrets.map(({ key, value }) => ({ key, value })) });
        const created = await secretsClient.createShare(orgSlug, {
          projectSlug, environmentSlug: environment.slug,
          secretIds: snapshot.secrets.map(({ id }) => id),
          versions: snapshot.secrets.map(({ version }) => version),
          ciphertext: encrypted.ciphertext, iv: encrypted.iv, verifier: encrypted.verifier,
          durationValue, durationUnit, maxViews, confirmProduction: productionConfirmed,
        });
        setLink(completeShareUrl(origin, created.id, encrypted.key));
      } else if (action === "delete") {
        await secretsClient.bulkAction(orgSlug, projectSlug, environment.slug, {
          action, secretIds: secrets.map((secret) => secret.id), expectedRevision: revision,
          confirmation, confirmProduction: productionConfirmed,
        });
        onDone(`${secrets.length} secrets moved to Trash. They can be restored as one batch.`);
      } else {
        if (!target) throw new Error("Choose a destination environment.");
        const targetRevision = await secretsClient.revision(orgSlug, projectSlug, target.slug);
        const result = await secretsClient.bulkAction(orgSlug, projectSlug, environment.slug, {
          action, secretIds: secrets.map((secret) => secret.id),
          expectedSourceRevision: revision, expectedTargetRevision: targetRevision.revision,
          targetEnvironmentSlug: target.slug, conflictMode, confirmProduction: productionConfirmed,
        });
        const skipped = result.skipped?.length || 0;
        onDone(`${result.moved || 0} secrets moved to ${target.name}${skipped ? `; ${skipped} duplicates skipped` : ""}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete this action.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SecretsDialog open={!!action} onClose={onClose}
      title={action === "share" ? "Share selected secrets" : action === "move" ? "Move selected secrets" : "Delete selected secrets"}
      description={`${secrets.length} selected in ${environment.name}`}>
      {link ? (
        <div className="space-y-5 px-5 py-6 sm:px-6">
          <p className="text-[13px] leading-6 text-zinc-300">Your encrypted link is ready. Copy it now—OutRay cannot recover the complete link later.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <WorkspaceInput className="min-w-0 font-mono text-xs" aria-label="Complete viewing link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} />
            <SecretsButton tone="primary" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setError("Copy failed. Select the link and copy it manually."))}>{copied ? "Copied" : "Copy link"}</SecretsButton>
          </div>
          {error && <SecretsNotice message={error} onDismiss={() => setError(null)} />}
          <p className="text-xs text-zinc-500">Anyone with the full link can reveal this frozen snapshot until either limit is reached. The fragment key is never sent to the server.</p>
          <div className="flex justify-end"><SecretsButton onClick={onClose}>Done</SecretsButton></div>
        </div>
      ) : (
        <DialogForm onSubmit={(event) => void submit(event)} footer={<>
          <SecretsButton onClick={onClose}>Cancel</SecretsButton>
          <SecretsButton type="submit" tone={action === "delete" ? "danger" : "primary"} loading={busy}
            disabled={!!needsProduction && !productionConfirmed || action === "delete" && confirmation !== `DELETE ${secrets.length}` || action === "move" && !target}>
            {action === "share" ? "Create private link" : action === "move" ? "Move secrets" : "Move to Trash"}
          </SecretsButton>
        </>}>
          {action === "move" && <>
            <Field label="Destination environment">
              <SecretsSelect ariaLabel="Destination environment" value={targetSlug} onChange={setTargetSlug}
                options={targets.map((item) => ({ value: item.slug, label: item.name, description: item.isProduction ? "Production" : undefined }))} />
            </Field>
            {targets.length === 0 && <p className="text-[13px] text-zinc-500">Create another environment in this vault to move secrets.</p>}
            <fieldset className="space-y-2"><legend className="mb-2 text-[13px] font-medium text-zinc-300">If a key already exists</legend>
              {(["skip", "overwrite"] as const).map((mode) => <label key={mode} className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 text-[13px] ${conflictMode === mode ? "border-violet-400/40 bg-violet-400/[0.06]" : "border-white/[0.08]"}`}>
                <input type="radio" name="conflict-mode" value={mode} checked={conflictMode === mode} onChange={() => setConflictMode(mode)} className="accent-[#8367c7]" />
                <span><span className="block text-zinc-200">{mode === "skip" ? "Skip duplicates" : "Overwrite destination values"}</span><span className="mt-0.5 block text-zinc-500">{mode === "skip" ? "Leave existing keys unchanged in both environments." : "Create new versions in the destination; source values go to Trash."}</span></span>
              </label>)}</fieldset>
          </>}
          {action === "delete" && <>
            <p className="text-[13px] leading-6 text-zinc-400">The selected secrets stop being available immediately and form one recoverable Trash batch.</p>
            <Field label={`Type DELETE ${secrets.length} to confirm`}><WorkspaceInput value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></Field>
          </>}
          {action === "share" && <>
            <p className="text-[13px] leading-6 text-zinc-400">We’ll take a one-time snapshot and encrypt it in your browser. Source changes won’t alter this link.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Expires after"><div className="flex gap-2"><WorkspaceInput type="number" min={1} max={durationUnit === "days" ? 90 : 3} value={durationValue} onChange={(event) => setDurationValue(Number(event.target.value))} required /><SecretsSelect ariaLabel="Expiry unit" value={durationUnit} onChange={(value) => { setDurationUnit(value as "days" | "months"); setDurationValue(value === "days" ? 7 : 1); }} options={[{value:"days",label:"Days"},{value:"months",label:"Months"}]} /></div></Field>
              <Field label="Maximum reveals"><WorkspaceInput type="number" min={1} max={100} value={maxViews} onChange={(event) => setMaxViews(Number(event.target.value))} required /></Field>
            </div>
            <p className="text-xs text-zinc-500">Defaults: 7 days and 10 reveals. Maximum: 3 months and 100 reveals.</p>
          </>}
          {needsProduction && <ProductionConfirmation checked={productionConfirmed} onChange={setProductionConfirmed} verb={action === "share" ? "share" : action === "move" ? "move" : "delete"} />}
          {error && <SecretsNotice message={error} onDismiss={() => setError(null)} />}
        </DialogForm>
      )}
    </SecretsDialog>
  );
}
