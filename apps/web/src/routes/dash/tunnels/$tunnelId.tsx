import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/dash/tunnels/$tunnelId")({
  component: TunnelDetailView,
});

function TunnelDetailView() {
  const { tunnelId } = Route.useParams();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/dash/tunnels"
          className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-xl font-semibold text-white">{tunnelId}</h2>
          <p className="text-sm text-gray-500">Tunnel Details</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-black border border-white/5 rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Overview</h3>
          <div className="space-y-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                Status
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-white">Online</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                URL
              </div>
              <div className="font-mono text-white">https://api.outray.dev</div>
            </div>
          </div>
        </div>

        <div className="bg-black border border-white/5 rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Metrics</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                  Requests
                </div>
                <div className="text-xl font-mono text-white">1,240/m</div>
                <div className="text-xs text-green-400 mt-1">↑ 12%</div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                  Latency
                </div>
                <div className="text-xl font-mono text-white">45ms</div>
                <div className="text-xs text-gray-500 mt-1">avg</div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                  Bandwidth
                </div>
                <div className="text-xl font-mono text-white">2.4 MB/s</div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                  Error Rate
                </div>
                <div className="text-xl font-mono text-white">0.01%</div>
                <div className="text-xs text-green-400 mt-1">Healthy</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">
                Traffic (Last Hour)
              </div>
              <div className="h-24 flex items-end gap-1">
                {[
                  45, 72, 30, 85, 60, 40, 90, 55, 25, 65, 80, 35, 50, 75, 45,
                  95, 60, 30, 70, 50,
                ].map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-blue-500/20 hover:bg-blue-500/40 transition-colors rounded-t-sm"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
