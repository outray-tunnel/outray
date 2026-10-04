export function OverviewSkeleton() {
  return (
    <div
      className="mx-auto max-w-[1440px] space-y-5"
      aria-busy="true"
      aria-label="Loading tunnels overview"
    >
      <header aria-hidden="true" className="flex flex-wrap items-end justify-between gap-3 pb-1">
        <div className="min-w-0">
          <div className="h-7 w-28 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
          <div className="mt-1 h-4 w-64 max-w-full animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
        </div>
        <div className="h-11 w-32 shrink-0 animate-pulse rounded-xl bg-white/[0.07] motion-reduce:animate-none" />
      </header>

      <section aria-hidden="true" className="space-y-4">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="h-5 w-16 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
              <div className="h-5 w-16 animate-pulse rounded-full border border-white/[0.08] bg-white/[0.025] motion-reduce:animate-none" />
            </div>
          </div>
          <div className="h-8 w-52 animate-pulse rounded-md border border-white/[0.08] bg-white/[0.025] motion-reduce:animate-none" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              data-overview-skeleton-metric={index}
              className="h-[180px] min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112] p-4"
            >
              <div className="h-3 w-22 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
              <div className="mt-2 h-7 w-24 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
              <div className="mt-1.5 h-2.5 w-30 animate-pulse rounded bg-white/[0.035] motion-reduce:animate-none" />
              <div
                data-overview-skeleton-chart=""
                className="mt-4 flex h-16 items-end gap-1 border-b border-white/[0.06] pb-px"
              >
                {[23, 31, 28, 42, 36, 50, 43, 57, 47, 60, 53, 56].map((height, bar) => (
                  <div
                    key={bar}
                    className="min-w-0 flex-1 animate-pulse rounded-t-[2px] bg-white/[0.045] motion-reduce:animate-none"
                    style={{ height: `${height}px` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
