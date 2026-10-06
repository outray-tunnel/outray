import { useId, type FormEvent } from "react";
import { Check, Layers, LockKeyhole } from "lucide-react";
import { Button } from "../arc/button/button";
import { WorkspaceInput, WorkspaceTextarea } from "../ui/workspace-input";
import type { SecretEnvironment } from "@/lib/secrets-client";
import styles from "./environment-form.module.css";

export interface EnvironmentFormContentProps {
  projectSlug: string;
  environment: SecretEnvironment | null;
  name: string;
  slug: string;
  description: string;
  confirmation: string;
  productionConfirmed: boolean;
  isProduction: boolean;
  saving: boolean;
  error: string | null;
  errors: Partial<Record<"name" | "slug" | "description" | "confirmation", string>>;
  canSubmit: boolean;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  onProductionChange: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

export function EnvironmentFormContent({ projectSlug, environment, name, slug, description, confirmation, productionConfirmed, isProduction, saving, error, errors, canSubmit, onNameChange, onSlugChange, onDescriptionChange, onConfirmationChange, onProductionChange, onSubmit, onClose }: EnvironmentFormContentProps) {
  const id = useId();
  const fieldId = (field: string) => `${id}-${field}`;
  const describedBy = (field: keyof EnvironmentFormContentProps["errors"], hint?: string) => [hint, errors[field] ? fieldId(`${field}-error`) : null].filter(Boolean).join(" ") || undefined;

  return <form className={styles.form} onSubmit={onSubmit} noValidate aria-busy={saving || undefined}>
    <div className={styles.fields}>
      <div className={styles.scope}>
        <Layers size={13} aria-hidden="true" />
        <span>Vault</span><span className={styles.vaultSlug} title={projectSlug}>{projectSlug}</span>
      </div>

      <div className={styles.identity}>
        <div className={styles.field}>
          <label htmlFor={fieldId("name")}>Environment name</label>
          <WorkspaceInput id={fieldId("name")} data-environment-name="" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="e.g. Staging" maxLength={100} disabled={saving} required autoComplete="off" aria-invalid={Boolean(errors.name) || undefined} aria-describedby={describedBy("name")} />
          {errors.name && <p id={fieldId("name-error")} className={styles.fieldError}>{errors.name}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor={fieldId("slug")}>Slug</label>
          <WorkspaceInput id={fieldId("slug")} className={styles.monospace} value={slug} onChange={(event) => onSlugChange(event.target.value)} placeholder="staging" maxLength={63} disabled={saving} required autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={Boolean(errors.slug) || undefined} aria-describedby={describedBy("slug", fieldId("slug-hint"))} />
          <p id={fieldId("slug-hint")} className={styles.hint}>Lowercase letters, numbers, and hyphens.</p>
          {errors.slug && <p id={fieldId("slug-error")} className={styles.fieldError}>{errors.slug}</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={fieldId("description")}>Description <span className={styles.optional}>Optional</span></label>
        <WorkspaceTextarea id={fieldId("description")} rows={3} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="What is this environment used for?" maxLength={500} disabled={saving} aria-invalid={Boolean(errors.description) || undefined} aria-describedby={describedBy("description")} />
        {errors.description && <p id={fieldId("description-error")} className={styles.fieldError}>{errors.description}</p>}
      </div>

      {environment && <div className={`${styles.field} ${styles.confirmation}`}>
        <label htmlFor={fieldId("confirmation")}>Confirm environment name</label>
        <p id={fieldId("confirmation-hint")} className={styles.hint}>Type <span className={styles.confirmName}>{environment.name}</span> to save these changes.</p>
        <WorkspaceInput id={fieldId("confirmation")} value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} maxLength={100} disabled={saving} required autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={Boolean(errors.confirmation) || undefined} aria-describedby={describedBy("confirmation", fieldId("confirmation-hint"))} />
        {errors.confirmation && <p id={fieldId("confirmation-error")} className={styles.fieldError}>{errors.confirmation}</p>}
      </div>}

      {isProduction && <section className={styles.production} aria-labelledby={fieldId("production-title")}>
        <h3 id={fieldId("production-title")}><LockKeyhole size={14} aria-hidden="true" />Production environment</h3>
        <p id={fieldId("production-hint")} className={styles.productionHint}>{environment ? "This environment is protected. Confirm before changing its details." : "Production operations require an extra confirmation to help prevent accidental changes."}</p>
        <label className={styles.productionChoice}>
          <span className={styles.checkbox}>
            <input type="checkbox" checked={productionConfirmed} onChange={(event) => onProductionChange(event.target.checked)} disabled={saving} required aria-describedby={fieldId("production-hint")} />
            <span className={styles.checkboxMark} aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span>
          </span>
          <span>{environment ? "I confirm this production change." : "I understand this is a production environment."}</span>
        </label>
      </section>}

      {error && <div className={styles.error} role="alert">{error}</div>}
    </div>

    <footer className={styles.footer}>
      {environment && <p className={styles.footerHint}>Secret values stay unchanged.</p>}
      <div className={styles.actions}>
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!canSubmit && !saving} loading={saving}>{environment ? "Save changes" : "Create environment"}</Button>
      </div>
    </footer>
  </form>;
}
