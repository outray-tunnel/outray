import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  Cancel01Icon,
  Loading03Icon,
  MoreVerticalIcon,
} from "@hugeicons-pro/core-stroke-rounded";
import { AnimatePresence, motion } from "motion/react";
import { Select, type SelectOption } from "@/components/ui/select";

export function SecretsPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl space-y-8">{children}</div>;
}

export function SecretsHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="mb-3.5 text-[13px] font-medium uppercase tracking-[0.13em] text-zinc-600">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-6 text-zinc-500">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

type ButtonTone = "primary" | "secondary" | "danger" | "quiet";

const buttonTones: Record<ButtonTone, string> = {
  primary:
    "border-white bg-white text-black hover:border-zinc-200 hover:bg-zinc-200 disabled:border-white/40 disabled:bg-white/40",
  secondary:
    "border-white/[0.11] bg-white/[0.045] text-zinc-200 hover:border-white/[0.18] hover:bg-white/[0.075]",
  danger:
    "border-rose-400/25 bg-rose-400/[0.08] text-rose-300 hover:border-rose-400/40 hover:bg-rose-400/[0.13]",
  quiet:
    "border-transparent bg-transparent text-zinc-500 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-zinc-200",
};

export function SecretsButton({
  children,
  icon,
  tone = "secondary",
  loading = false,
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconSvgElement;
  tone?: ButtonTone;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={props.disabled || loading}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${buttonTones[tone]} ${className}`}
    >
      {(loading || icon) && (
        <HugeiconsIcon
          icon={loading ? Loading03Icon : icon!}
          size={16}
          strokeWidth={1.8}
          className={loading ? "animate-spin" : ""}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

export function SecretsIconButton({
  icon,
  label,
  tone = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconSvgElement;
  label: string;
  tone?: ButtonTone;
}) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-10 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonTones[tone]} ${className}`}
    >
      <HugeiconsIcon
        icon={icon}
        size={16}
        strokeWidth={1.8}
        aria-hidden="true"
      />
    </button>
  );
}

export function SecretsBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "rose" | "violet";
}) {
  const tones = {
    neutral: "border-white/[0.09] bg-white/[0.04] text-zinc-500",
    green: "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-400",
    amber: "border-amber-400/15 bg-amber-400/[0.07] text-amber-400",
    rose: "border-rose-400/15 bg-rose-400/[0.07] text-rose-400",
    violet: "border-violet-400/15 bg-violet-400/[0.07] text-violet-400",
  };
  return (
    <span
      className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-[13px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SecretsNotice({
  message,
  tone = "error",
  onDismiss,
}: {
  message: string;
  tone?: "error" | "success" | "info";
  onDismiss?: () => void;
}) {
  const tones = {
    error: "border-rose-400/20 bg-rose-400/[0.06] text-rose-300",
    success: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300",
    info: "border-blue-400/20 bg-blue-400/[0.06] text-blue-300",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex min-h-11 items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] ${tones[tone]}`}
    >
      <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.7} />
      <span className="min-w-0 flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

export function SecretsEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconSvgElement;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.012] px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.035] text-zinc-500">
        <HugeiconsIcon icon={icon} size={21} strokeWidth={1.6} />
      </div>
      <h2 className="mt-5 text-sm font-medium text-zinc-200">{title}</h2>
      <p className="mt-2 max-w-sm text-[13px] leading-5 text-zinc-600">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function SecretsSelect({
  options,
  value,
  onChange,
  className = "",
  ariaLabel,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <Select
      options={options.map((option) => ({
        ...option,
        className: `${option.className || ""} !text-[13px]`,
      }))}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      className={className}
      triggerClassName="h-11 rounded-xl px-3.5 [&>span.flex-1]:!text-[13px]"
      optionClassName="min-h-11"
      menuClassName="[&_[role=option]>span.flex-1>span:first-child]:!text-[13px] [&_[role=option]>span.flex-1>span:last-child]:!text-xs"
    />
  );
}

export function SecretsSkeleton({
  rows = 4,
  cards = 4,
}: {
  rows?: number;
  cards?: number;
}) {
  return (
    <div
      className="animate-pulse space-y-7"
      aria-busy="true"
      aria-label="Loading secrets"
    >
      <div
        className={`grid gap-3 sm:grid-cols-2 ${cards === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}
      >
        {Array.from({ length: cards }).map((_, item) => (
          <div
            key={item}
            className="h-28 rounded-2xl border border-white/[0.07] bg-white/[0.025]"
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="flex h-[72px] items-center gap-4 border-b border-white/[0.06] px-5 last:border-b-0"
          >
            <div className="size-9 rounded-xl bg-white/[0.05]" />
            <div className="min-w-0 flex-1">
              <div className="h-3 w-40 max-w-[65%] rounded bg-white/[0.07]" />
              <div className="mt-2 h-2.5 w-24 rounded bg-white/[0.04]" />
            </div>
            <div className="h-8 w-20 rounded-xl bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-zinc-300">{label}</span>
        {hint && <span className="text-[13px] text-zinc-500">{hint}</span>}
      </span>
      <span className="mt-2 block">{children}</span>
      {error && (
        <span className="mt-1.5 block text-[13px] text-rose-400">{error}</span>
      )}
    </label>
  );
}

export const fieldClassName =
  "h-11 w-full rounded-xl border border-white/[0.1] bg-[#0b0b0b] px-3.5 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-500 focus:border-white/[0.22] disabled:cursor-not-allowed disabled:opacity-50";

export const textareaClassName =
  "min-h-28 w-full resize-y rounded-xl border border-white/[0.1] bg-[#0b0b0b] px-3.5 py-3 text-sm leading-6 text-zinc-200 outline-none transition-colors placeholder:text-zinc-500 focus:border-white/[0.22] disabled:cursor-not-allowed disabled:opacity-50";

export function SecretsDialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.button
            type="button"
            aria-label="Close dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="secrets-dialog-title"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#0b0b0b] shadow-[0_32px_100px_rgba(0,0,0,.7)] sm:rounded-2xl ${widths[size]}`}
          >
            <div className="flex items-start gap-5 border-b border-white/[0.08] px-5 py-5 sm:px-6">
              <div className="min-w-0 flex-1">
                <h2
                  id="secrets-dialog-title"
                  className="text-base font-semibold text-zinc-100"
                >
                  {title}
                </h2>
                {description && (
                  <p className="mt-1 text-[13px] leading-5 text-zinc-600">
                    {description}
                  </p>
                )}
              </div>
              <SecretsIconButton
                icon={Cancel01Icon}
                label="Close"
                tone="quiet"
                onClick={onClose}
              />
            </div>
            <div className="overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function DialogForm({
  children,
  onSubmit,
  footer,
}: {
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  footer: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} autoComplete="off">
      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-4 sm:px-6">
        {footer}
      </div>
    </form>
  );
}

export function SecretsSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <motion.button
            type="button"
            aria-label="Close panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-white/[0.1] bg-[#0b0b0b] shadow-[-30px_0_80px_rgba(0,0,0,.55)]"
          >
            <div className="flex items-start gap-5 border-b border-white/[0.08] px-5 py-5 sm:px-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-zinc-100">
                  {title}
                </h2>
                {description && (
                  <p className="mt-1 text-[13px] text-zinc-600">
                    {description}
                  </p>
                )}
              </div>
              <SecretsIconButton
                icon={Cancel01Icon}
                label="Close"
                tone="quiet"
                onClick={onClose}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export interface ActionMenuItem {
  label: string;
  icon: IconSvgElement;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function ActionMenu({
  items,
  label = "Open actions",
}: {
  items: ActionMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <SecretsIconButton
        icon={MoreVerticalIcon}
        label={label}
        tone="quiet"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-11 z-30 min-w-44 rounded-xl border border-white/[0.1] bg-[#111] p-1.5 shadow-[0_18px_55px_rgba(0,0,0,.65)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex min-h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger
                  ? "text-rose-400 hover:bg-rose-400/[0.08]"
                  : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
              }`}
            >
              <HugeiconsIcon icon={item.icon} size={15} strokeWidth={1.7} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductionConfirmation({
  checked,
  onChange,
  verb,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  verb: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-white/20 bg-black accent-[#b7ff78]"
      />
      <span>
        <span className="block text-[13px] font-medium text-amber-300">
          Production confirmation
        </span>
        <span className="mt-1 block text-[13px] leading-5 text-amber-200/55">
          I understand this will {verb} secrets used by the production
          environment.
        </span>
      </span>
    </label>
  );
}
