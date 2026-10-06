import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { EnvironmentFormContent } from "./environment-form-content";
import styles from "./environment-form.module.css";
import { secretsClient, type SecretEnvironment } from "@/lib/secrets-client";
import "../outray-arc-theme.css";

type Field = "name" | "slug" | "description" | "confirmation";
type FieldErrors = Partial<Record<Field, string>>;
type Draft = {
  open: boolean;
  scope: string;
  session: number;
  environment: SecretEnvironment | null;
  name: string;
  slug: string;
  description: string;
  confirmation: string;
  productionConfirmed: boolean;
  slugTouched: boolean;
  touched: Partial<Record<Field, boolean>>;
  attempted: boolean;
  saving: boolean;
  error: string | null;
};

function initialDraft(open: boolean, scope: string, environment: SecretEnvironment | null, session: number): Draft {
  const snapshot = open ? environment : null;
  return { open, scope, session, environment: snapshot, name: snapshot?.name ?? "", slug: snapshot?.slug ?? "",
    description: snapshot?.description ?? "", confirmation: "", productionConfirmed: false, slugTouched: !!snapshot,
    touched: {}, attempted: false, saving: false, error: null };
}

function suggestedSlug(name: string): string {
  return name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/g, "");
}

function validationErrors(draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  const name = draft.name.trim(), slug = draft.slug.trim().toLowerCase();
  if (!name) errors.name = "Enter an environment name.";
  else if (name.length > 100) errors.name = "Use 100 characters or fewer.";
  if (!slug) errors.slug = "Enter an environment slug.";
  else if (slug.length > 63) errors.slug = "Use 63 characters or fewer.";
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = "Use lowercase letters, numbers, and single hyphens between words.";
  if (draft.description.trim().length > 500) errors.description = "Use 500 characters or fewer.";
  if (draft.environment && draft.confirmation !== draft.environment.name) errors.confirmation = `Type ${draft.environment.name} exactly to confirm changes.`;
  return errors;
}

export function EnvironmentDialog({ open, onClose, orgSlug, projectSlug, environment = null, onSaved }: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  projectSlug: string;
  environment?: SecretEnvironment | null;
  onSaved: (environment: SecretEnvironment) => void;
}) {
  const scope = JSON.stringify([orgSlug, projectSlug, environment?.id ?? null]);
  const [draft, setDraft] = useState(() => initialDraft(open, scope, environment, 0));
  const mounted = useRef(true);
  const sessionRef = useRef(draft.session);
  const pending = useRef<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const callbacks = useRef({ onSaved, onClose });
  callbacks.current = { onSaved, onClose };
  sessionRef.current = draft.session;
  // Reset a new modal session synchronously, without resetting an open form
  // when a background refresh supplies newer metadata for the same environment.
  if (draft.open !== open || draft.scope !== scope) {
    const next = initialDraft(open, scope, environment, draft.session + 1);
    sessionRef.current = next.session;
    pending.current = null;
    setDraft(next);
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const session = draft.session;
  const snapshot = draft.environment;
  const isProduction = snapshot ? snapshot.isProduction : [draft.name.trim(), draft.slug.trim().toLowerCase()].some((value) => /^(prod|production|live)$/i.test(value));
  const invalid = validationErrors(draft);
  const errors = Object.fromEntries(Object.entries(invalid).filter(([field]) => draft.attempted || draft.touched[field as Field])) as FieldErrors;
  const canSubmit = open && !draft.saving && Object.keys(invalid).length === 0 && (!isProduction || draft.productionConfirmed);
  const active = () => mounted.current && sessionRef.current === session && open;
  const change = (update: (previous: Draft) => Draft) => {
    if (!active() || pending.current === session) return;
    setDraft((previous) => previous.session === session ? update(previous) : previous);
  };
  const dismiss = () => { if (active() && pending.current !== session) callbacks.current.onClose(); };
  const preventPendingClose = (event: { preventDefault: () => void }) => { if (pending.current === session || draft.saving) event.preventDefault(); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active() || pending.current === session) return;
    const failures = validationErrors(draft);
    if (Object.keys(failures).length || (isProduction && !draft.productionConfirmed)) {
      setDraft((previous) => ({ ...previous, attempted: true }));
      return;
    }
    pending.current = session;
    setDraft((previous) => ({ ...previous, saving: true, error: null, attempted: true }));
    const input = { name: draft.name.trim(), slug: draft.slug.trim().toLowerCase(), description: draft.description.trim(),
      confirmation: snapshot ? draft.confirmation : draft.name.trim(), confirmProduction: draft.productionConfirmed };
    try {
      const saved = snapshot
        ? await secretsClient.updateEnvironment(orgSlug, projectSlug, snapshot.slug, { ...input, expectedRevision: snapshot.revision })
        : await secretsClient.createEnvironment(orgSlug, projectSlug, input);
      if (!active()) return;
      callbacks.current.onSaved(saved);
      if (active()) callbacks.current.onClose();
    } catch (requestError) {
      if (active()) setDraft((previous) => ({ ...previous, error: requestError instanceof Error ? requestError.message : "Could not save environment." }));
    } finally {
      if (pending.current === session) pending.current = null;
      if (active()) setDraft((previous) => ({ ...previous, saving: false }));
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
    <DialogContent title={snapshot ? "Edit environment" : "Add environment"}
      description={snapshot ? "Update this environment’s name and description." : "Keep a separate set of secret values in this vault."}
      className={`workspace-ui outray-arc ph-no-capture ${styles.dialog}`} data-private-product="secrets" aria-busy={draft.saving} closeDisabled={draft.saving}
      onEscapeKeyDown={preventPendingClose} onPointerDownOutside={preventPendingClose} onInteractOutside={preventPendingClose}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        if (typeof HTMLElement === "undefined" || !(event.target instanceof HTMLElement)) return;
        const current = document.activeElement;
        if (current instanceof HTMLElement && current !== document.body && !event.target.contains(current)) opener.current = current;
        event.target.querySelector<HTMLElement>("[data-environment-name]")?.focus();
      }}
      onCloseAutoFocus={(event) => {
        if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
        opener.current = null;
      }}>
      <EnvironmentFormContent projectSlug={projectSlug} environment={snapshot} name={draft.name} slug={draft.slug} description={draft.description} confirmation={draft.confirmation}
        productionConfirmed={draft.productionConfirmed} isProduction={isProduction} saving={draft.saving} error={draft.error} errors={errors} canSubmit={canSubmit}
        onNameChange={(name) => change((previous) => ({ ...previous, name, slug: previous.slugTouched ? previous.slug : suggestedSlug(name), touched: { ...previous.touched, name: true, ...(!previous.slugTouched ? { slug: true } : {}) }, error: null }))}
        onSlugChange={(slug) => change((previous) => ({ ...previous, slug: slug.toLowerCase(), slugTouched: true, touched: { ...previous.touched, slug: true }, error: null }))}
        onDescriptionChange={(description) => change((previous) => ({ ...previous, description, touched: { ...previous.touched, description: true }, error: null }))}
        onConfirmationChange={(confirmation) => change((previous) => ({ ...previous, confirmation, touched: { ...previous.touched, confirmation: true }, error: null }))}
        onProductionChange={(productionConfirmed) => change((previous) => ({ ...previous, productionConfirmed, error: null }))} onSubmit={(event) => void submit(event)} onClose={dismiss} />
    </DialogContent>
  </Dialog>;
}
