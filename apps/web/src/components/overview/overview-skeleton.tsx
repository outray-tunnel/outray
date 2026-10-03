export function OverviewSkeleton() {
  return (
    <div
      className="mx-auto max-w-[1440px] space-y-5"
      aria-busy="true"
      aria-label="Loading tunnels overview"
    >
      <header className="flex items-end justify-between gap-6 pb-1">
        <div className="min-w-0 flex-1">
          <div className="h-5 w-28 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
          <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
        </div>
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-white/[0.07] motion-reduce:animate-none sm:w-28" />
      </header>

      <section className="overflow-hidden rounded-xl border border-white/[0.11] bg-[#151516]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <div className="space-y-2">
            <div className="h-5 w-24 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
            <div className="h-3 w-40 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
          </div>
          <div className="h-9 w-52 animate-pulse rounded-lg bg-white/[0.04] motion-reduce:animate-none" />
        </div>
        <div className="grid grid-cols-2 border-y border-white/[0.09] lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`min-h-32 px-5 py-5 sm:px-6 ${index % 2 === 0 ? "border-r border-white/[0.09]" : ""} ${index < 2 ? "border-b border-white/[0.09] lg:border-b-0" : ""} ${index === 1 || index === 2 ? "lg:border-r lg:border-white/[0.09]" : ""}`}
            >
              <div className="h-3 w-22 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
              <div className="mt-3 h-8 w-28 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
              <div className="mt-3 h-2.5 w-30 animate-pulse rounded bg-white/[0.035] motion-reduce:animate-none" />
            </div>
          ))}
        </div>
        <div className="px-5 py-6 sm:px-6">
          <div className="h-3 w-32 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
          <div className="mt-5 h-[300px] animate-pulse rounded-md bg-white/[0.025] motion-reduce:animate-none sm:h-[390px]" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(250px,320px)]">
        {[0, 1].map((section) => (
          <section
            key={section}
            className="min-h-44 rounded-xl border border-white/[0.08] bg-[#111112]"
          >
            <div className="space-y-2 border-b border-white/[0.07] px-5 py-4">
              <div className="h-3 w-26 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
              <div className="h-2.5 w-32 animate-pulse rounded bg-white/[0.035] motion-reduce:animate-none" />
            </div>
            <div className="space-y-3 px-5 py-5">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="h-3 animate-pulse rounded bg-white/[0.035] motion-reduce:animate-none"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
