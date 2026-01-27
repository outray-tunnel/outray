import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Wrench,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/admin/actions")({
  head: () => ({
    meta: [
      { title: "Admin Actions - OutRay" },
    ],
  }),
  component: AdminActionsPage,
});

interface CleanupResult {
  success: boolean;
  checked: number;
  removed: number;
  entries: Array<{
    setKey: string;
    tunnelId: string;
    reason: string;
  }>;
}

function AdminActionsPage() {
  const token = useAdminStore((s) => s.token);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/tunnels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "cleanup" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Cleanup failed");
      }

      return response.json() as Promise<CleanupResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
    },
  });

  const handleCleanup = () => {
    if (
      confirm(
        "This will remove stale tunnel entries from Redis. Are you sure you want to continue?"
      )
    ) {
      cleanupMutation.mutate();
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Admin Actions</h1>
        <p className="text-gray-400">
          Maintenance and cleanup actions for the platform
        </p>
      </div>

      <div className="grid gap-6 max-w-3xl">
        {/* Cleanup Phantom Tunnels Card */}
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-500/10 rounded-xl">
              <Trash2 className="w-6 h-6 text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">
                Cleanup Phantom Tunnels
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Remove stale tunnel entries from Redis that are blocking users
                from creating new tunnels. This cleans up:
              </p>
              <ul className="text-gray-500 text-sm space-y-1 mb-6 list-disc list-inside">
                <li>
                  Entries using hostname format instead of UUID (legacy bug)
                </li>
                <li>
                  UUID entries whose <code className="text-gray-400">tunnel:last_seen</code> key has expired
                </li>
              </ul>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleCleanup}
                  disabled={cleanupMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {cleanupMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running Cleanup...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Run Cleanup
                    </>
                  )}
                </button>

                {cleanupMutation.isError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {cleanupMutation.error?.message || "Cleanup failed"}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results Section */}
          {lastResult && (
            <div className="mt-6 pt-6 border-t border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="text-white font-medium">Cleanup Complete</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-white">
                    {lastResult.checked}
                  </div>
                  <div className="text-gray-400 text-sm">Entries Checked</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-400">
                    {lastResult.removed}
                  </div>
                  <div className="text-gray-400 text-sm">Stale Entries Removed</div>
                </div>
              </div>

              {lastResult.entries.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2">
                    Removed Entries:
                  </h4>
                  <div className="bg-black/30 rounded-lg p-4 max-h-60 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-left">
                          <th className="pb-2">Organization Set</th>
                          <th className="pb-2">Tunnel ID</th>
                          <th className="pb-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-300 font-mono">
                        {lastResult.entries.map((entry, i) => (
                          <tr key={i} className="border-t border-white/5">
                            <td className="py-2 pr-4 text-xs truncate max-w-[200px]">
                              {entry.setKey}
                            </td>
                            <td className="py-2 pr-4 text-xs truncate max-w-[200px]">
                              {entry.tunnelId}
                            </td>
                            <td className="py-2">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  entry.reason === "invalid_format_hostname"
                                    ? "bg-purple-500/20 text-purple-400"
                                    : "bg-yellow-500/20 text-yellow-400"
                                }`}
                              >
                                {entry.reason === "invalid_format_hostname"
                                  ? "Hostname (legacy)"
                                  : "Expired"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {lastResult.entries.length === 0 && lastResult.removed === 0 && (
                <p className="text-gray-500 text-sm">
                  No stale entries found. All tunnel records are clean!
                </p>
              )}
            </div>
          )}
        </div>

        {/* Placeholder for future actions */}
        <div className="bg-white/2 border border-white/5 border-dashed rounded-2xl p-6 opacity-50">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gray-500/10 rounded-xl">
              <Wrench className="w-6 h-6 text-gray-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-400 mb-1">
                More Actions Coming Soon
              </h3>
              <p className="text-gray-500 text-sm">
                Additional maintenance actions will be added here as needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
