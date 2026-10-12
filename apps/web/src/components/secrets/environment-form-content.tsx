import { useId, type FormEvent } from "react";
import { Check, Layers, LockKeyhole } from "lucide-react";
import { Button } from "../arc/button/button";
import { WorkspaceInput, WorkspaceTextarea } from "../ui/workspace-input";
import type { SecretEnvironment } from "@/lib/secrets-client";

const fieldClassName = "flex min-w-0 flex-col gap-[7px] [&>label]:flex [&>label]:items-baseline [&>label]:gap-1.5 [&>label]:text-xs [&>label]:leading-normal [&>label]:font-medium [&>label]:text-zinc-300";
const hintClassName = "m-0 text-[11px] leading-[1.6] text-zinc-500";
const fieldErrorClassName = "m-0 text-[11px] leading-[1.6] text-rose-300 [overflow-wrap:anywhere]";

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

  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit} noValidate aria-busy={saving || undefined}>
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pt-[18px] pb-6 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin] max-[540px]:gap-[18px] max-[540px]:px-[18px] max-[540px]:pt-4 max-[540px]:pb-5">
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-normal text-zinc-500 [&>svg]:shrink-0">
        <Layers size={13} aria-hidden="true" />
        <span>Vault</span><span className="truncate text-zinc-400" title={projectSlug}>{projectSlug}</span>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 max-[540px]:gap-[18px]">
        <div className={fieldClassName}>
          <label htmlFor={fieldId("name")}>Environment name</label>
          <WorkspaceInput id={fieldId("name")} data-environment-name="" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="e.g. Staging" maxLength={100} disabled={saving} required autoComplete="off" aria-invalid={Boolean(errors.name) || undefined} aria-describedby={describedBy("name")} />
          {errors.name && <p id={fieldId("name-error")} className={fieldErrorClassName}>{errors.name}</p>}
        </div>
        <div className={fieldClassName}>
          <label htmlFor={fieldId("slug")}>Slug</label>
          <WorkspaceInput id={fieldId("slug")} className="font-mono! text-xs!" value={slug} onChange={(event) => onSlugChange(event.target.value)} placeholder="staging" maxLength={63} disabled={saving} required autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={Boolean(errors.slug) || undefined} aria-describedby={describedBy("slug", fieldId("slug-hint"))} />
          <p id={fieldId("slug-hint")} className={hintClassName}>Lowercase letters, numbers, and hyphens.</p>
          {errors.slug && <p id={fieldId("slug-error")} className={fieldErrorClassName}>{errors.slug}</p>}
        </div>
      </div>

      <div className={fieldClassName}>
        <label htmlFor={fieldId("description")}>Description <span className="text-[11px] font-normal text-zinc-500">Optional</span></label>
        <WorkspaceTextarea id={fieldId("description")} rows={3} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="What is this environment used for?" maxLength={500} disabled={saving} aria-invalid={Boolean(errors.description) || undefined} aria-describedby={describedBy("description")} />
        {errors.description && <p id={fieldId("description-error")} className={fieldErrorClassName}>{errors.description}</p>}
      </div>

      {environment && <div className={`${fieldClassName} border-t border-white/[.07] pt-[18px]`}>
        <label htmlFor={fieldId("confirmation")}>Confirm environment name</label>
        <p id={fieldId("confirmation-hint")} className={hintClassName}>Type <span className="font-mono text-zinc-300 [overflow-wrap:anywhere]">{environment.name}</span> to save these changes.</p>
        <WorkspaceInput id={fieldId("confirmation")} value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} maxLength={100} disabled={saving} required autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={Boolean(errors.confirmation) || undefined} aria-describedby={describedBy("confirmation", fieldId("confirmation-hint"))} />
        {errors.confirmation && <p id={fieldId("confirmation-error")} className={fieldErrorClassName}>{errors.confirmation}</p>}
      </div>}

      {isProduction && <section className="rounded-[10px] border border-amber-400/13 bg-amber-400/[.025] p-3 [&>h3]:m-0 [&>h3]:flex [&>h3]:items-center [&>h3]:gap-1.5 [&>h3]:text-xs [&>h3]:leading-normal [&>h3]:font-medium [&>h3]:text-[#d4b875]" aria-labelledby={fieldId("production-title")}>
        <h3 id={fieldId("production-title")}><LockKeyhole size={14} aria-hidden="true" />Production environment</h3>
        <p id={fieldId("production-hint")} className="mt-1.25 mb-2.5 text-[11px] leading-[1.7] text-[#a19a89]">{environment ? "This environment is protected. Confirm before changing its details." : "Production operations require an extra confirmation to help prevent accidental changes."}</p>
        <label className="group flex min-h-8 cursor-pointer items-center gap-2.25 text-xs leading-[1.6] text-zinc-300 has-disabled:cursor-not-allowed has-disabled:opacity-55">
          <span className="relative inline-flex size-4 basis-4">
            <input type="checkbox" className="peer absolute inset-0 z-1 m-0 size-full cursor-[inherit] opacity-0" checked={productionConfirmed} onChange={(event) => onProductionChange(event.target.checked)} disabled={saving} required aria-describedby={fieldId("production-hint")} />
            <span className="grid size-4 place-items-center rounded border border-white/25 bg-[#111112] text-transparent transition-[background-color,border-color] duration-120 group-hover:border-zinc-400 peer-checked:border-zinc-200 peer-checked:bg-zinc-200 peer-checked:text-zinc-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-zinc-400 motion-reduce:transition-none" aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span>
          </span>
          <span>{environment ? "I confirm this production change." : "I understand this is a production environment."}</span>
        </label>
      </section>}

      {error && <div className="rounded-lg border border-rose-400/20 bg-rose-400/[.04] px-3 py-2.5 text-xs leading-[1.6] text-rose-300 [overflow-wrap:anywhere]" role="alert">{error}</div>}
    </div>

    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[.07] px-6 py-4 max-[540px]:flex-col max-[540px]:items-stretch max-[540px]:gap-2.5 max-[540px]:px-[18px] max-[540px]:py-3.5">
      {environment && <p className="m-0 text-[11px] leading-[1.6] text-zinc-500">Secret values stay unchanged.</p>}
      <div className="ml-auto flex shrink-0 items-center gap-2 max-[540px]:justify-end max-[540px]:[&>button]:min-h-10">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!canSubmit && !saving} loading={saving}>{environment ? "Save changes" : "Create environment"}</Button>
      </div>
    </footer>
  </form>;
}
