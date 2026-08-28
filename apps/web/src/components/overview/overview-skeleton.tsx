const statWidths = ["w-20", "w-10", "w-24"];

export function OverviewSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl animate-pulse space-y-7"
      aria-busy="true"
      aria-label="Loading overview"
    >
      <header className="flex items-end justify-between gap-6 border-b border-white/[0.07] pb-7">
        <div className="min-w-0 flex-1">
          <div className="mb-3 h-2 w-12 rounded-full bg-white/[0.05]" />
          <div className="h-6 w-28 rounded bg-white/[0.07]" />
          <div className="mt-3 h-3 w-72 max-w-full rounded bg-white/[0.05]" />
        </div>
        <div className="h-9 w-9 shrink-0 rounded-md bg-white/[0.07] sm:w-28" />
      </header>

      <section className="grid border-y border-white/[0.07] md:grid-cols-3 md:divide-x md:divide-white/[0.07]">
        {statWidths.map((width, index) => (
          <div
            key={width}
            className="flex items-start gap-4 border-b border-white/[0.07] py-5 last:border-b-0 md:border-b-0 md:px-6 first:pl-0"
          >
            <div className="mt-0.5 size-4 shrink-0 rounded bg-white/[0.05]" />
            <div className="flex-1">
              <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
              <div className={`mt-2.5 h-6 rounded bg-white/[0.07] ${width}`} />
              <div
                className={`mt-2 h-2 rounded bg-white/[0.04] ${
                  index === 2 ? "w-28" : "w-24"
                }`}
              />
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
        <section className="border-y border-white/[0.07] py-5 lg:col-span-2">
          <div className="mb-6 flex items-start justify-between gap-6">
            <div>
              <div className="h-3.5 w-28 rounded bg-white/[0.07]" />
              <div className="mt-2 h-2.5 w-20 rounded bg-white/[0.04]" />
            </div>
            <div className="flex gap-3 border-b border-white/[0.07] pb-2">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-2.5 w-5 rounded bg-white/[0.04]"
                />
              ))}
            </div>
          </div>

          <div className="relative h-75 overflow-hidden">
            <div className="absolute inset-x-0 top-1/4 border-t border-white/[0.035]" />
            <div className="absolute inset-x-0 top-1/2 border-t border-white/[0.035]" />
            <div className="absolute inset-x-0 top-3/4 border-t border-white/[0.035]" />
            <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-white/[0.035] to-transparent [clip-path:polygon(0_88%,12%_60%,24%_72%,38%_22%,51%_48%,65%_14%,78%_42%,90%_8%,100%_35%,100%_100%,0_100%)]" />
          </div>
        </section>

        <div className="flex flex-col gap-7">
          <section className="border-y border-white/[0.07] py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="h-3.5 w-20 rounded bg-white/[0.07]" />
                <div className="mt-2 h-2.5 w-28 rounded bg-white/[0.04]" />
              </div>
              <div className="h-2.5 w-24 rounded bg-white/[0.05]" />
            </div>
            <div className="mt-6 h-px bg-white/[0.07]" />
            <div className="mt-2 flex justify-between">
              <div className="h-2 w-12 rounded bg-white/[0.035]" />
              <div className="h-2 w-20 rounded bg-white/[0.035]" />
            </div>
          </section>

          <section className="flex-1 border-y border-white/[0.07] py-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="h-3.5 w-24 rounded bg-white/[0.07]" />
                <div className="mt-2 h-2.5 w-24 rounded bg-white/[0.04]" />
              </div>
              <div className="h-2.5 w-12 rounded bg-white/[0.04]" />
            </div>
            <div className="divide-y divide-white/[0.06]">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3 py-3.5">
                  <div className="size-1.5 shrink-0 rounded-full bg-white/[0.06]" />
                  <div className="h-2.5 w-24 rounded bg-white/[0.05]" />
                  <div className="ml-auto h-2.5 w-28 rounded bg-white/[0.035]" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
