export function OverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="h-10 w-32 bg-white/5 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white/2 border border-white/5 rounded-2xl p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-white/5" />
              <div className="w-12 h-5 rounded-full bg-white/5" />
            </div>
            <div className="h-8 w-24 bg-white/5 rounded mb-2" />
            <div className="h-3 w-32 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="h-6 w-48 bg-white/5 rounded mb-6" />
          <div className="h-75 w-full bg-white/5 rounded" />
        </div>
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="h-6 w-32 bg-white/5 rounded mb-6" />
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-white/5 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
