export function SkeletonBox({ className = "" }: { className?: string }) {
  return <div className={`bg-white/5 rounded-lg animate-pulse ${className}`} />;
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <SkeletonBox className="w-10 h-10 rounded-xl" />
        <SkeletonBox className="w-16 h-6 rounded-lg" />
      </div>
      <SkeletonBox className="w-24 h-8 mb-2" />
      <SkeletonBox className="w-20 h-4" />
    </div>
  );
}

export function ChartSkeleton({ height = "h-72" }: { height?: string }) {
  return (
    <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
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
    <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
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
    <div className="bg-white/2 border border-white/5 rounded-2xl overflow-hidden">
      <div className="border-b border-white/5 px-6 py-4">
        <div className="flex gap-6">
          {[...Array(5)].map((_, i) => (
            <SkeletonBox key={i} className="w-24 h-4" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="px-6 py-4 flex gap-6">
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
    <div className="flex items-center justify-between mb-8">
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <SkeletonBox className="w-48 h-8 mb-2" />
        <SkeletonBox className="w-64 h-4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartSkeleton />
        </div>
        <PieChartSkeleton />
      </div>
    </div>
  );
}

export function UsersSkeleton() {
  return (
    <div className="max-w-7xl mx-auto">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}

export function ChartsSkeleton() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <SkeletonBox className="w-48 h-8 mb-2" />
        <SkeletonBox className="w-64 h-4" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <SkeletonBox className="w-48 h-8 mb-2" />
        <SkeletonBox className="w-64 h-4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <SkeletonBox className="w-32 h-8 mb-2" />
        <SkeletonBox className="w-56 h-4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
