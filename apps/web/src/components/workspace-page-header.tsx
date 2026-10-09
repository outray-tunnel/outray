import type { ReactNode } from "react";

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  action,
  appearance = "default",
}: {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  appearance?: "default" | "compact";
}) {
  const compact = appearance === "compact";
  const shownEyebrow = eyebrow ?? (compact ? undefined : "Workspace");
  return (
    <header className={compact ? "flex flex-wrap items-end justify-between gap-3 pb-1" : "flex items-end justify-between gap-8 border-b border-white/[0.07] pb-8"}>
      <div className="min-w-0 flex-1">
        {shownEyebrow ? <p className="mb-3.5 text-xs font-medium uppercase tracking-[0.12em] text-zinc-600">{shownEyebrow}</p> : null}
        <h1 data-workspace-focus-return={compact ? "" : undefined} tabIndex={compact ? -1 : undefined} className="text-xl font-normal tracking-[-0.02em] text-white">
          {title}
        </h1>
        <p className={compact ? "mt-1 text-[12px] leading-5 text-zinc-500" : "mt-2.5 text-[15px] leading-6 text-zinc-400"}>
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
