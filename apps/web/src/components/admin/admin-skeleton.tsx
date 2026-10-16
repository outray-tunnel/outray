export function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-white/[.045] rounded-md animate-pulse motion-reduce:animate-none ${className}`}
    />
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-[#101010] border border-white/[.08] rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <SkeletonBox className="w-24 h-3 rounded" />
        <SkeletonBox className="w-4 h-4 rounded" />
      </div>
      <SkeletonBox className="w-24 h-7 mb-3" />
      <SkeletonBox className="w-28 h-3" />
    </div>
  );
}

export function ChartSkeleton({ height = "h-72" }: { height?: string }) {
  return (
    <div className="bg-[#101010] border border-white/[.08] rounded-xl p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <SkeletonBox className="w-40 h-6 mb-2" />
          <SkeletonBox className="w-32 h-4" />
        </div>
        <SkeletonBox className="w-32 h-8 rounded-lg" />
      </div>
      <SkeletonBox className={`w-full ${height} rounded-xl`} />
    </div>
  );
}

export function PieChartSkeleton() {
  return (
    <div className="bg-[#101010] border border-white/[.08] rounded-xl p-5">
      <SkeletonBox className="w-40 h-6 mb-2" />
      <SkeletonBox className="w-32 h-4 mb-6" />
      <div className="flex justify-center mb-4">
        <SkeletonBox className="w-36 h-36 rounded-full" />
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SkeletonBox className="w-3 h-3 rounded-full" />
              <SkeletonBox className="w-16 h-4" />
            </div>
            <SkeletonBox className="w-8 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-[#101010] border border-white/[.08] rounded-xl overflow-hidden">
      <div className="border-b border-white/[.06] px-4 py-3">
        <div className="flex gap-5">
          {[...Array(5)].map((_, i) => (
            <SkeletonBox key={i} className="w-24 h-4" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-white/[.06]">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-5">
            {[...Array(5)].map((_, j) => (
              <SkeletonBox
                key={j}
                className={`h-4 ${j === 0 ? "w-40" : "w-20"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <SkeletonBox className="w-48 h-8 mb-2" />
        <SkeletonBox className="w-32 h-4" />
      </div>
      <SkeletonBox className="w-64 h-10 rounded-xl" />
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5" aria-label="Loading platform overview" aria-busy="true">
      <div>
        <SkeletonBox className="mb-2 h-6 w-28" />
        <SkeletonBox className="h-3 w-72 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(290px,1fr)]">
        <ChartSkeleton height="h-[260px]" />
        <div className="rounded-xl border border-white/[.08] bg-[#101010] p-5"><SkeletonBox className="mb-2 h-4 w-28" /><SkeletonBox className="h-3 w-44" /><SkeletonBox className="mt-6 h-7 w-20" /><SkeletonBox className="mt-5 h-2 w-full" /><div className="mt-6 space-y-4">{[0, 1, 2, 3].map((row) => <div key={row} className="flex justify-between gap-3"><SkeletonBox className="h-3 w-16" /><SkeletonBox className="h-3 w-12" /></div>)}</div></div>
      </div>
    </div>
  );
}

export function UsersSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}

export function ChartsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <div className="mb-5">
        <SkeletonBox className="w-48 h-8 mb-2" />
        <SkeletonBox className="w-64 h-4" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="lg:col-span-2">
          <ChartSkeleton />
        </div>
        <ChartSkeleton height="h-64" />
        <ChartSkeleton height="h-64" />
        <ChartSkeleton height="h-64" />
        <ChartSkeleton height="h-64" />
        <PieChartSkeleton />
        <PieChartSkeleton />
        <PieChartSkeleton />
        <div className="lg:col-span-2">
          <ChartSkeleton />
        </div>
      </div>
    </div>
  );
}

export function SubscriptionsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <div className="mb-5">
        <SkeletonBox className="w-48 h-8 mb-2" />
        <SkeletonBox className="w-64 h-4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        {[...Array(4)].map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>

      <div className="flex items-center justify-between mb-6">
        <SkeletonBox className="w-40 h-4" />
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <SkeletonBox key={i} className="w-16 h-8 rounded-lg" />
          ))}
        </div>
      </div>

      <TableSkeleton rows={8} />
    </div>
  );
}

export function TunnelsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <div className="mb-5">
        <SkeletonBox className="w-32 h-8 mb-2" />
        <SkeletonBox className="w-56 h-4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        {[...Array(4)].map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <SkeletonBox className="w-64 h-10 rounded-xl" />
          <SkeletonBox className="w-24 h-5" />
        </div>
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <SkeletonBox key={i} className="w-14 h-8 rounded-lg" />
          ))}
        </div>
      </div>

      <TableSkeleton rows={8} />
    </div>
  );
}
