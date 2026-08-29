import type { ReactNode } from "react";

export function WorkspacePageHeader({
  eyebrow = "Workspace",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-8 border-b border-white/[0.07] pb-8">
      <div className="min-w-0 flex-1">
        <p className="mb-3.5 text-xs font-medium uppercase tracking-[0.12em] text-zinc-600">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white">
          {title}
        </h1>
        <p className="mt-2.5 text-[15px] leading-6 text-zinc-400">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
