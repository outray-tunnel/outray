import type { ReactNode, Ref } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@outray/icons/stroke/Add01Icon";
import Alert02Icon from "@outray/icons/stroke/Alert02Icon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import { Button, type ButtonSize } from "@/components/arc/button/button";
import "@/components/outray-arc-theme.css";

export interface AddressPageHeaderProps {
  title: string;
  description: string;
  action: string;
  count: number;
  limit: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isReady?: boolean;
  onAddClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function AddressPageHeader({
  title,
  description,
  action,
  count,
  limit,
  isUnlimited,
  isAtLimit,
  isReady = true,
  onAddClick,
  buttonRef,
}: AddressPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[20px] font-normal tracking-[-0.025em] text-zinc-100">
          {title}
        </h1>
        <p className="mt-1.5 text-[13px] leading-5 text-zinc-500">
          {description}
        </p>
        <p
          className="mt-2.5 text-[12px] tabular-nums text-zinc-500"
          aria-live="polite"
        >
          {isReady ? (
            <>
              <span className="text-zinc-300">{count}</span>
              {isUnlimited ? " in this workspace" : ` of ${limit} used`}
            </>
          ) : (
            <span
              aria-hidden="true"
              className="block h-3 w-20 animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none"
            />
          )}
        </p>
      </div>
      <Button
        ref={buttonRef}
        type="button"
        size="md"
        onClick={onAddClick}
        disabled={!isReady}
        aria-haspopup="dialog"
        aria-label={isAtLimit ? `${action} (plan limit reached)` : action}
        className="w-fit shrink-0"
      >
        <HugeiconsIcon
          icon={Add01Icon}
          size={15}
          strokeWidth={1.9}
          aria-hidden="true"
        />
        {action}
      </Button>
    </header>
  );
}

export function AddressNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/[0.15] bg-amber-400/[0.04] px-4 py-2.5 text-[12px] text-amber-200"
    >
      <span>{message}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function AddressEmptyState({
  title,
  description,
  action,
  onAction,
  isError = false,
  disabled = false,
  actionSize = "sm",
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
  isError?: boolean;
  disabled?: boolean;
  actionSize?: ButtonSize;
}) {
  return (
    <div
      role={isError ? "alert" : undefined}
      className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center"
    >
      <span
        className={`flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] ${isError ? "text-rose-300" : "text-zinc-500"}`}
      >
        <HugeiconsIcon
          icon={isError ? Alert02Icon : Globe02Icon}
          size={21}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </span>
      <h2 className="mt-4 text-[14px] font-medium text-zinc-200">{title}</h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-zinc-500">
        {description}
      </p>
      <Button
        type="button"
        variant="secondary"
        size={actionSize}
        className="mt-5"
        onClick={onAction}
        disabled={disabled}
      >
        {action}
      </Button>
    </div>
  );
}

export function AddressListSkeleton({ label }: { label: string }) {
  return (
    <div
      aria-label={label}
      aria-busy="true"
      className="divide-y divide-white/[0.06]"
    >
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex min-h-20 items-center gap-3.5 px-4 py-4 sm:px-5"
        >
          <span
            aria-hidden="true"
            className="size-8 shrink-0 animate-pulse rounded-lg bg-white/[0.04] motion-reduce:animate-none"
          />
          <div aria-hidden="true" className="min-w-0 flex-1 space-y-2.5">
            <div className="h-3 w-48 max-w-[85%] animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
            <div className="h-2.5 w-28 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
          </div>
          <span
            aria-hidden="true"
            className="hidden h-6 w-16 animate-pulse rounded-md bg-white/[0.04] motion-reduce:animate-none sm:block"
          />
        </div>
      ))}
    </div>
  );
}

export function AddressListPanel({
  label,
  toolbar,
  children,
}: {
  label: string;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#111112]"
    >
      <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        {toolbar}
      </div>
      {children}
    </section>
  );
}
