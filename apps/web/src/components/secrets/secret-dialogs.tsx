import { useEffect, useRef, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@outray/icons/stroke/Add01Icon";
import Alert02Icon from "@outray/icons/stroke/Alert02Icon";
import Delete02Icon from "@outray/icons/stroke/Delete02Icon";
import File01Icon from "@outray/icons/stroke/File01Icon";
import Upload04Icon from "@outray/icons/stroke/Upload04Icon";
import { Button } from "../arc/button/button";
import { WorkspaceInput, WorkspaceTextarea } from "../ui/workspace-input";
import {
  secretsClient,
  type ImportReview,
  type SecretEnvironment,
  type SecretMetadata,
  type SecretProject,
} from "@/lib/secrets-client";
import {
  DialogForm,
  Field,
  ProductionConfirmation,
  SecretsBadge,
  SecretsDialog,
  SecretsNotice,
} from "./secrets-ui";

function normalizedSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ProjectDialog({
  open,
  onClose,
  orgSlug,
  project,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  project?: SecretProject | null;
  onSaved: (project: SecretProject) => void;
}) {
  const editing = !!project;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(project?.name || "");
    setSlug(project?.slug || "");
    setDescription(project?.description || "");
    setSlugTouched(!!project);
    setSaving(false);
    setError(null);
  }, [open, project]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(normalizedSlug(value));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = editing
        ? await secretsClient.updateProject(orgSlug, project.slug, {
            name: name.trim(),
            slug: normalizedSlug(slug),
            description: description.trim(),
          })
        : await secretsClient.createProject(orgSlug, {
            name: name.trim(),
            slug: normalizedSlug(slug),
            description: description.trim(),
          });
      onSaved(saved);
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save vault.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SecretsDialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit vault" : "Create a vault"}
      description="Vaults isolate secret names and environments for one application or service."
    >
      <DialogForm
        onSubmit={handleSubmit}
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={saving}
              disabled={!name.trim() || !slug.trim()}
            >
              {!editing && <HugeiconsIcon icon={Add01Icon} size={14} aria-hidden="true" />}
              {editing ? "Save changes" : "Create vault"}
            </Button>
          </>
        }
      >
        {error && (
          <SecretsNotice message={error} onDismiss={() => setError(null)} />
        )}
        <Field label="Vault name">
          <WorkspaceInput
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="Payments API"
            autoFocus
          />
        </Field>
        <Field label="Slug">
          <WorkspaceInput
            className="font-mono text-[13px]"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(normalizedSlug(event.target.value));
            }}
            placeholder="payments-api"
          />
        </Field>
        <Field label="Description" hint="Optional">
          <WorkspaceTextarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Credentials and configuration for the payments service."
          />
        </Field>
      </DialogForm>
    </SecretsDialog>
  );
}

export { EnvironmentDialog } from "./environment-dialog";

export function SecretEditorDialog({
  open,
  onClose,
  orgSlug,
  projectSlug,
  environment,
  environments,
  secret,
  revision,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  environments: SecretEnvironment[];
  secret?: SecretMetadata | null;
  revision: number;
  onSaved: () => void;
}) {
  const editing = !!secret;
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [replaceValue, setReplaceValue] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(
    [],
  );
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKey(secret?.key || "");
    setValue("");
    setReplaceValue(false);
    setShowValue(false);
    setSelectedEnvironments([environment.slug]);
    setProductionConfirmed(false);
    setSaving(false);
    setError(null);
    return () => setValue("");
  }, [environment.slug, open, secret]);

  const keyError =
    key && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
      ? "Use letters, numbers, and underscores; the first character cannot be a number."
      : undefined;
  const selected = environments.filter((item) =>
    selectedEnvironments.includes(item.slug),
  );
  const touchesProduction = editing
    ? environment.isProduction
    : selected.some((item) => item.isProduction);
  const canSubmit =
    !!key.trim() &&
    !keyError &&
    (editing || selectedEnvironments.length > 0) &&
    (!touchesProduction || productionConfirmed);

  const toggleEnvironment = (slug: string) => {
    if (editing || slug === environment.slug) return;
    setSelectedEnvironments((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await secretsClient.updateSecret(
          orgSlug,
          projectSlug,
          environment.slug,
          secret.id,
          {
            key: key.trim(),
            ...(replaceValue ? { value } : {}),
            expectedRevision: revision,
            expectedVersion: secret.version,
            confirmProduction: productionConfirmed,
          },
        );
      } else {
        await secretsClient.createSecret(
          orgSlug,
          projectSlug,
          environment.slug,
          {
            key: key.trim(),
            value,
            environmentSlugs: selectedEnvironments,
            expectedRevisions: Object.fromEntries(
              selected.map((item) => [
                item.slug,
                item.slug === environment.slug ? revision : item.revision,
              ]),
            ),
            expectedRevision: revision,
            confirmProduction: productionConfirmed,
          },
        );
      }
      setValue("");
      onSaved();
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save secret.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SecretsDialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${secret.key}` : "Add secret"}
      description={
        editing
          ? "Rename the key or explicitly replace its encrypted value. Replacements create immutable history."
          : "Values are encrypted before storage and never returned in list responses."
      }
      size={editing ? "md" : "lg"}
    >
      <DialogForm
        onSubmit={handleSubmit}
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={saving}
              disabled={!canSubmit}
            >
              {editing
                ? "Save changes"
                : `Add to ${selectedEnvironments.length} environment${selectedEnvironments.length === 1 ? "" : "s"}`}
            </Button>
          </>
        }
      >
        {error && (
          <SecretsNotice message={error} onDismiss={() => setError(null)} />
        )}
        <div className="space-y-5">
          <Field label="Key" error={keyError}>
            <WorkspaceInput
              className="font-mono text-[13px] uppercase"
              value={key}
              onChange={(event) =>
                setKey(event.target.value.toUpperCase().replace(/\s+/g, "_"))
              }
              placeholder="DATABASE_URL"
              autoFocus
              spellCheck={false}
              autoCapitalize="characters"
            />
          </Field>
          {editing && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.1] bg-white/[0.025] p-4">
              <input
                type="checkbox"
                checked={replaceValue}
                onChange={(event) => {
                  setReplaceValue(event.target.checked);
                  if (!event.target.checked) setValue("");
                }}
                className="mt-0.5 size-4 rounded border-white/20 bg-black accent-[#b7ff78]"
              />
              <span>
                <span className="block text-[13px] font-medium text-zinc-300">
                  Replace the encrypted value
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-zinc-600">
                  Leave this off to rename the key without creating a new value
                  version. Turn it on to replace the value, including with an
                  empty value.
                </span>
              </span>
            </label>
          )}
          <Field
            label={editing ? "Replacement value" : "Value"}
            hint={
              editing
                ? replaceValue
                  ? "Empty is a valid value"
                  : "Current value remains unchanged"
                : "Empty values are allowed"
            }
          >
            <WorkspaceTextarea
              className={`font-mono ${showValue ? "" : "[-webkit-text-security:disc]"}`}
              style={{ minHeight: 128 }}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                editing
                  ? replaceValue
                    ? "Enter a replacement, or leave empty intentionally"
                    : "Enable replacement to edit the value"
                  : "Enter a secret value, or leave empty intentionally"
              }
              disabled={editing && !replaceValue}
              autoComplete="new-password"
              spellCheck={false}
            />
            <button
              type="button"
              disabled={editing && !replaceValue}
              onClick={() => setShowValue((current) => !current)}
              className="mt-2 text-[13px] text-zinc-600 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {showValue ? "Mask value" : "Show while editing"}
            </button>
          </Field>
        </div>

        {!editing && (
          <Field
            label="Environments"
            hint="Add the same key and value to several environments"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {environments.map((item) => {
                const checked = selectedEnvironments.includes(item.slug);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={item.slug === environment.slug}
                    onClick={() => toggleEnvironment(item.slug)}
                    className={`flex min-h-14 items-center gap-3 rounded-xl border px-3.5 text-left transition-colors ${
                      checked
                        ? "border-accent/35 bg-accent/[0.06]"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]"
                    }`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-accent bg-accent" : "border-white/20 bg-black"}`}
                    >
                      {checked && (
                        <span className="size-1.5 rounded-full bg-black" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-zinc-300">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-zinc-500">
                        {item.secretCount} secrets
                      </span>
                    </span>
                    {item.isProduction && (
                      <SecretsBadge tone="amber">Production</SecretsBadge>
                    )}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {touchesProduction && (
          <ProductionConfirmation
            checked={productionConfirmed}
            onChange={setProductionConfirmed}
            verb={editing ? "change" : "create"}
          />
        )}
      </DialogForm>
    </SecretsDialog>
  );
}

export function ImportDotenvDialog({
  open,
  onClose,
  orgSlug,
  projectSlug,
  environment,
  revision,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  projectSlug: string;
  environment: SecretEnvironment;
  revision: number;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [envText, setEnvText] = useState("");
  const [review, setReview] = useState<ImportReview | null>(null);
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEnvText("");
    setReview(null);
    setProductionConfirmed(false);
    setLoading(false);
    setError(null);
    return () => setEnvText("");
  }, [open]);

  const runImport = async (dryRun: boolean) => {
    if (!envText.trim()) return;
    if (!dryRun && environment.isProduction && !productionConfirmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await secretsClient.importDotenv(
        orgSlug,
        projectSlug,
        environment.slug,
        {
          envText,
          dryRun,
          expectedRevision: revision,
          confirmProduction: productionConfirmed,
        },
      );
      if (dryRun) {
        setReview(result);
      } else {
        setEnvText("");
        onImported();
        onClose();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not import this file.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 1_048_576) {
      setError("Dotenv files must be 1 MiB or smaller.");
      return;
    }
    setEnvText(await file.text());
    setReview(null);
    setError(null);
  };

  return (
    <SecretsDialog
      open={open}
      onClose={onClose}
      title={`Import into ${environment.name}`}
      description="Review a .env file before encrypted values are created or updated. Comments and blank lines are ignored."
      size="lg"
    >
      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        {error && (
          <SecretsNotice message={error} onDismiss={() => setError(null)} />
        )}
        {!review && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".env,text/plain"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-20 w-full items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.13] bg-white/[0.02] text-[13px] text-zinc-500 transition-colors hover:border-white/[0.22] hover:bg-white/[0.04] hover:text-zinc-300"
            >
              <HugeiconsIcon icon={Upload04Icon} size={18} strokeWidth={1.7} />
              Choose a .env file
            </button>
            <Field
              label="Dotenv contents"
              hint="Values stay in this dialog until submitted"
            >
              <WorkspaceTextarea
                className="font-mono"
                style={{ minHeight: 192 }}
                value={envText}
                onChange={(event) => setEnvText(event.target.value)}
                placeholder={
                  "DATABASE_URL=postgres://…\nSTRIPE_SECRET_KEY=sk_…"
                }
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
          </>
        )}

        {review && (
          <div className="rounded-xl border border-white/[0.09] bg-white/[0.02] p-4">
            <div className="flex flex-wrap gap-2">
              <SecretsBadge tone="green">{review.created} create</SecretsBadge>
              <SecretsBadge tone="violet">{review.updated} update</SecretsBadge>
              <SecretsBadge>{review.unchanged} unchanged</SecretsBadge>
              {review.skipped > 0 && (
                <SecretsBadge tone="amber">
                  {review.skipped} skipped
                </SecretsBadge>
              )}
            </div>
            {review.keys.length > 0 && (
              <div className="mt-4 max-h-40 divide-y divide-white/[0.06] overflow-y-auto border-t border-white/[0.06]">
                {review.keys.map((item, index) => (
                  <div
                    key={`${item.key}-${index}`}
                    className="flex items-center gap-3 py-2.5 text-[13px]"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-zinc-400">
                      {item.key}
                    </span>
                    <SecretsBadge
                      tone={
                        item.action === "create"
                          ? "green"
                          : item.action === "update"
                            ? "violet"
                            : item.action === "skip"
                              ? "amber"
                              : "neutral"
                      }
                    >
                      {item.action}
                    </SecretsBadge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {environment.isProduction && (
          <ProductionConfirmation
            checked={productionConfirmed}
            onChange={setProductionConfirmed}
            verb="import or overwrite"
          />
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-white/[0.08] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        {review ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setReview(null)}>
            Edit dotenv
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void runImport(true)}
            loading={loading}
            disabled={!envText.trim()}
          >
            <HugeiconsIcon icon={File01Icon} size={14} aria-hidden="true" />
            Review changes
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void runImport(false)}
          loading={loading && !!review}
          disabled={
            !review || (environment.isProduction && !productionConfirmed)
          }
        >
          Apply import
        </Button>
      </div>
    </SecretsDialog>
  );
}

export function ConfirmSecretActionDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  confirmationText,
  production = false,
  danger = true,
  loading = false,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmationText?: string;
  production?: boolean;
  danger?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: (productionConfirmed: boolean, confirmation: string) => void;
}) {
  return (
    <SecretsDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
    >
      {open && (
        <ConfirmSecretActionContent
          onClose={onClose}
          confirmLabel={confirmLabel}
          confirmationText={confirmationText}
          production={production}
          danger={danger}
          loading={loading}
          error={error}
          onConfirm={onConfirm}
        />
      )}
    </SecretsDialog>
  );
}

function ConfirmSecretActionContent({
  onClose,
  confirmLabel,
  confirmationText,
  production,
  danger,
  loading,
  error,
  onConfirm,
}: {
  onClose: () => void;
  confirmLabel: string;
  confirmationText?: string;
  production: boolean;
  danger: boolean;
  loading: boolean;
  error?: string | null;
  onConfirm: (productionConfirmed: boolean, confirmation: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [productionConfirmed, setProductionConfirmed] = useState(false);

  const enabled =
    (!confirmationText || typed === confirmationText) &&
    (!production || productionConfirmed);

  return (
    <>
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] px-3.5 py-3 text-[13px] leading-5 text-rose-300">{error}</p>}
        <div className="flex items-start gap-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.045] p-3.5">
          <HugeiconsIcon
            icon={danger ? Delete02Icon : Alert02Icon}
            size={17}
            strokeWidth={1.7}
            className={danger ? "text-rose-400" : "text-amber-400"}
          />
          <p className="text-[13px] leading-5 text-zinc-500">
            This operation is recorded in the audit log.
          </p>
        </div>
        {confirmationText && (
          <Field label={`Type ${confirmationText} to continue`}>
            <WorkspaceInput
              className="font-mono text-[13px]"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoFocus
            />
          </Field>
        )}
        {production && (
          <ProductionConfirmation
            checked={productionConfirmed}
            onChange={setProductionConfirmed}
            verb={confirmLabel.toLowerCase()}
          />
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-white/[0.08] px-5 py-4 sm:px-6">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          variant={danger ? "danger" : "primary"}
          size="sm"
          loading={loading}
          disabled={!enabled}
          onClick={() => onConfirm(productionConfirmed, typed)}
        >
          {confirmLabel}
        </Button>
      </div>
    </>
  );
}
