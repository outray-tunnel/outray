import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity03Icon,
  Cancel01Icon,
  DatabaseIcon,
  InformationCircleIcon,
  Search01Icon,
  Settings02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { toast } from "sonner";
import { appClient } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useFeatureFlag } from "@/lib/feature-flags";
import { Modal } from "@/components/ui";
import {
  type TunnelEvent,
  type TimeRange,
  formatBytes,
  RequestInspectorDrawer,
} from "@/components/requests";

export const Route = createFileRoute("/$orgSlug/requests")({
  head: () => ({
    meta: [
      { title: "Requests - OutRay" },
    ],
  }),
  component: RequestsView,
});

const TIME_RANGES = [
  { value: "live" as TimeRange, label: "Live" },
  { value: "1h" as TimeRange, label: "1h" },
  { value: "24h" as TimeRange, label: "24h" },
  { value: "7d" as TimeRange, label: "7d" },
  { value: "30d" as TimeRange, label: "30d" },
];

function RequestsView() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [requests, setRequests] = useState<TunnelEvent[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>("live");
  const [isLoading, setIsLoading] = useState(false);
  const [isCaptureSettingsOpen, setIsCaptureSettingsOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TunnelEvent | null>(
    null,
  );
  const { orgSlug } = Route.useParams();
  const { data: organizations = [] } = authClient.useListOrganizations();
  const activeOrgId = organizations?.find((org) => org.slug === orgSlug)?.id;
  const wsRef = useRef<WebSocket | null>(null);

  const inspectorEnabled = useFeatureFlag("request_inspector");
  const fullCaptureFeatureEnabled = useFeatureFlag("full_capture");

  // Fetch organization's full capture setting
  const { data: orgSettings, isLoading: isLoadingOrgSettings } = useQuery({
    queryKey: ["org-settings", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return null;
      const response = await appClient.settings.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!orgSlug,
  });

  const captureSettingEnabled = orgSettings?.fullCaptureEnabled ?? false;

  const updateFullCaptureMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await appClient.settings.update(orgSlug, {
        fullCaptureEnabled: enabled,
      });
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["org-settings", orgSlug], {
        fullCaptureEnabled: response.fullCaptureEnabled,
      });
      toast.success(
        response.fullCaptureEnabled
          ? "Full request capture enabled"
          : "Full request capture disabled",
      );
    },
    onError: () => {
      toast.error("Failed to update request capture");
    },
  });

  // Full capture is enabled only if both the feature flag and org setting are enabled
  const fullCaptureEnabled =
    fullCaptureFeatureEnabled && captureSettingEnabled;

  const fetchHistoricalRequests = useCallback(
    async (range: TimeRange) => {
      if (!orgSlug || range === "live") return;

      setIsLoading(true);
      try {
        const response = await appClient.requests.list(orgSlug, {
          range,
          limit: 100,
          search: searchTerm,
        });
        if ("error" in response) throw new Error(response.error);
        setRequests(response.requests || []);
      } catch (error) {
        console.error("Failed to fetch historical requests:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [orgSlug, searchTerm],
  );

  useEffect(() => {
    if (timeRange === "live") {
      setRequests([]);
    } else {
      const timer = setTimeout(() => {
        void fetchHistoricalRequests(timeRange);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [timeRange, activeOrgId, fetchHistoricalRequests]);

  useEffect(() => {
    if (!activeOrgId || timeRange !== "live") {
      return;
    }

    let ws: WebSocket | null = null;
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY_MS = 2000;

    const connectWebSocket = async () => {
      if (cancelled) return;

      try {
        // Fetch a fresh auth token for WebSocket connection
        const tokenResponse = await fetch("/api/dashboard/ws-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orgId: activeOrgId }),
        });

        if (!tokenResponse.ok) {
          console.error("Failed to get WebSocket token:", tokenResponse.status);
          if (!cancelled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
          }
          return;
        }

        const { token } = await tokenResponse.json();

        if (cancelled) return;

        const wsUrl = import.meta.env.VITE_TUNNEL_URL;
        ws = new WebSocket(`${wsUrl}/dashboard/events?token=${token}`);

        ws.onopen = () => {
          wsRef.current = ws;
          reconnectAttempts = 0; // Reset on successful connection
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "history") {
              setRequests(message.data);
            } else if (message.type === "log") {
              setRequests((prev) => [message.data, ...prev].slice(0, 100));
            }
          } catch (e) {
            console.error("Failed to parse WebSocket message", e);
          }
        };

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          // Auto-reconnect if not intentionally cancelled
          if (!cancelled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
          }
        };
      } catch (error) {
        console.error("Failed to connect to WebSocket:", error);
        // Retry on error
        if (!cancelled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
        }
      }
    };

    void connectWebSocket();

    return () => {
      cancelled = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [activeOrgId, timeRange]);

  const filteredRequests =
    timeRange === "live"
      ? requests.filter(
          (req) =>
            req.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.method.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.host.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : requests;

  if (!activeOrgId) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between gap-4 opacity-50 pointer-events-none">
          <div className="relative flex-1 max-w-md">
            <div className="h-10 bg-white/5 rounded-lg w-full" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-24 bg-white/5 rounded-lg" />
            <div className="h-10 w-24 bg-white/5 rounded-lg" />
          </div>
        </div>

        <div className="bg-white/2 border border-white/5 rounded-2xl overflow-hidden">
          <div className="h-10 bg-white/5 border-b border-white/5" />
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-14 border-b border-white/5 flex items-center px-4 gap-4"
            >
              <div className="h-6 w-16 bg-white/5 rounded" />
              <div className="h-4 w-12 bg-white/5 rounded" />
              <div className="h-4 w-48 bg-white/5 rounded flex-1" />
              <div className="h-4 w-24 bg-white/5 rounded" />
              <div className="h-4 w-20 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex items-end justify-between gap-6 border-b border-white/[0.07] pb-7">
        <div>
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-700">
            Tunnels
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">
            Requests
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Inspect live and historical traffic across every HTTP tunnel.
          </p>
        </div>

        {fullCaptureFeatureEnabled && (
          <button
            type="button"
            onClick={() => setIsCaptureSettingsOpen(true)}
            className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-white/[0.09] px-3 text-[11px] font-medium text-zinc-500 transition-colors hover:border-white/[0.16] hover:bg-white/[0.03] hover:text-zinc-300"
          >
            <HugeiconsIcon
              icon={Settings02Icon}
              size={14}
              strokeWidth={1.7}
              aria-hidden="true"
            />
            Settings
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <label className="flex h-9 max-w-sm flex-1 items-center gap-2 border-b border-white/[0.09] text-zinc-600 focus-within:border-white/20 focus-within:text-zinc-400">
          <HugeiconsIcon
            icon={Search01Icon}
            size={15}
            strokeWidth={1.7}
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search path, method, or host"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-300 outline-none placeholder:text-zinc-700"
          />
        </label>

        <div className="flex items-center border-b border-white/[0.07]">
          {TIME_RANGES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value)}
              className={`relative border-b px-3 py-2 text-[11px] font-medium transition-colors ${
                timeRange === value
                  ? "border-accent text-zinc-200"
                  : "border-transparent text-zinc-700 hover:text-zinc-400"
              }`}
            >
              {value === "live" && (
                <span
                  className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                    timeRange === "live" ? "bg-emerald-500" : "bg-zinc-700"
                  }`}
                />
              )}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden border-y border-white/[0.07]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-white/[0.07] text-[9px] uppercase tracking-[0.1em] text-zinc-700">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Path</th>
                <th className="px-4 py-3 font-medium">Host</th>
                <th className="px-4 py-3 font-medium">Client IP</th>
                <th className="px-4 py-3 font-medium text-right">Duration</th>
                <th className="px-4 py-3 font-medium text-right">Size</th>
                <th className="px-4 py-3 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-14 text-center text-zinc-700"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border border-zinc-700 border-t-zinc-300" />
                      Loading requests...
                    </div>
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-16 text-center text-zinc-700"
                  >
                    <HugeiconsIcon
                      icon={Activity03Icon}
                      size={23}
                      strokeWidth={1.5}
                      className="mx-auto mb-3"
                    />
                    <span className="text-xs">
                      {timeRange === "live"
                        ? "Waiting for requests"
                        : "No requests found in this time range"}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, i) => (
                  <tr
                    key={`${req.tunnel_id}-${req.timestamp}-${i}`}
                    onClick={() => inspectorEnabled && setSelectedRequest(req)}
                    className={`group transition-colors hover:bg-white/[0.025] ${inspectorEnabled ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div
                        className={`inline-flex items-center text-[11px] font-medium ${
                          req.status_code >= 500
                            ? "text-red-400"
                            : req.status_code >= 400
                              ? "text-amber-400"
                              : "text-emerald-400"
                        }`}
                      >
                        {req.status_code}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-300">
                      {req.method}
                    </td>
                    <td
                      className="px-4 py-3 text-gray-300 max-w-xs truncate"
                      title={req.path}
                    >
                      {req.path}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{req.host}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {req.client_ip}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {req.request_duration_ms}ms
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {formatBytes(req.bytes_in + req.bytes_out)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                      {new Date(req.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RequestInspectorDrawer
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        fullCaptureEnabled={fullCaptureEnabled}
        orgSlug={orgSlug}
      />

      <RequestCaptureSettingsModal
        isOpen={isCaptureSettingsOpen}
        onClose={() => setIsCaptureSettingsOpen(false)}
        enabled={captureSettingEnabled}
        isLoading={isLoadingOrgSettings}
        isUpdating={updateFullCaptureMutation.isPending}
        onToggle={() =>
          updateFullCaptureMutation.mutate(!captureSettingEnabled)
        }
      />
    </div>
  );
}

function RequestCaptureSettingsModal({
  isOpen,
  onClose,
  enabled,
  isLoading,
  isUpdating,
  onToggle,
}: {
  isOpen: boolean;
  onClose: () => void;
  enabled: boolean;
  isLoading: boolean;
  isUpdating: boolean;
  onToggle: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" appearance="flat">
      <header className="flex shrink-0 items-start justify-between gap-6 border-b border-white/[0.07] px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-700">
            <HugeiconsIcon
              icon={Settings02Icon}
              size={13}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            Tunnels / Requests
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-white">
            Request settings
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-zinc-600">
            Configure how request and response data is stored.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
          aria-label="Close request settings"
        >
          <HugeiconsIcon
            icon={Cancel01Icon}
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      </header>

      <div className="px-5 py-6 sm:px-6">
        <div className="flex items-start justify-between gap-8">
          <div className="flex min-w-0 max-w-md gap-3">
            <HugeiconsIcon
              icon={DatabaseIcon}
              size={16}
              strokeWidth={1.7}
              className="mt-0.5 shrink-0 text-zinc-600"
              aria-hidden="true"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-xs font-medium text-zinc-300">
                  Full request capture
                </h3>
                <span
                  className={`text-[9px] font-medium uppercase tracking-[0.08em] ${
                    enabled ? "text-emerald-500" : "text-zinc-700"
                  }`}
                >
                  {enabled ? "Enabled" : "Metadata only"}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-zinc-600">
                Store complete headers and body content for inspection and
                request replay.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-white/[0.07]" />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              disabled={isUpdating}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                enabled
                  ? "border-white/30 bg-white"
                  : "border-white/[0.12] bg-white/[0.04]"
              } ${isUpdating ? "cursor-not-allowed opacity-40" : ""}`}
              aria-pressed={enabled}
              aria-label="Toggle full request capture"
            >
              <span
                className={`inline-block size-3.5 transform rounded-full transition-transform ${
                  enabled
                    ? "translate-x-[18px] bg-black"
                    : "translate-x-0.5 bg-zinc-600"
                }`}
              />
            </button>
          )}
        </div>

        <div className="mt-6 flex items-start gap-2.5 border-t border-white/[0.07] pt-5 text-[10px] leading-4 text-amber-200/55">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={13}
            strokeWidth={1.7}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <p>
            Request and response bodies can contain sensitive data. Enable this
            only when your traffic-handling policy permits storage.
          </p>
        </div>
      </div>
    </Modal>
  );
}
