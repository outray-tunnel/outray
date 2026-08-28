interface ResourceListSkeletonProps {
  actionClassName?: string;
}

export function ResourceListSkeleton({
  actionClassName = "w-9 sm:w-36",
}: ResourceListSkeletonProps) {
  return (
    <div
      className="mx-auto max-w-6xl animate-pulse space-y-7"
      aria-busy="true"
      aria-label="Loading"
    >
      <header className="flex items-end justify-between gap-6 border-b border-white/[0.07] pb-7">
        <div className="min-w-0 flex-1">
          <div className="mb-3 h-2 w-12 rounded-full bg-white/[0.05]" />
          <div className="h-6 w-36 rounded bg-white/[0.07]" />
          <div className="mt-3 h-3 w-64 max-w-full rounded bg-white/[0.05]" />
        </div>
        <div
          className={`h-9 shrink-0 rounded-md bg-white/[0.07] ${actionClassName}`}
        />
      </header>

      <section className="border-y border-white/[0.07]">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="flex items-center gap-3.5 border-b border-white/[0.07] px-1 py-5 last:border-b-0"
          >
            <div className="size-8 shrink-0 rounded-full bg-white/[0.05]" />
            <div className="min-w-0 flex-1">
              <div
                className={`h-3 rounded bg-white/[0.07] ${
                  row === 1 ? "w-44" : "w-52"
                } max-w-[70%]`}
              />
              <div className="mt-2.5 h-2.5 w-28 rounded bg-white/[0.04]" />
            </div>
            <div className="h-2.5 w-14 rounded bg-white/[0.04]" />
          </div>
        ))}
      </section>
    </div>
  );
}
