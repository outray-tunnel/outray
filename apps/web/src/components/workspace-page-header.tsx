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
    <header className="flex items-end justify-between gap-6 border-b border-white/[0.07] pb-7">
      <div className="min-w-0 flex-1">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-700">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      </div>
      {action}
    </header>
  );
}
