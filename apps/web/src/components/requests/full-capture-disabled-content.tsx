import type { TunnelEvent } from "./types";
import { formatBytes } from "./utils";

interface FullCaptureDisabledContentProps {
  request: TunnelEvent;
  orgSlug: string;
}

export function FullCaptureDisabledContent({
  request,
  orgSlug,
}: FullCaptureDisabledContentProps) {
  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="bg-accent/10 border border-accent/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full border border-accent/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-accent text-xs">i</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white mb-1">
              Full capture is disabled
            </p>
            <p className="text-sm text-gray-400 mb-3">
              Only basic request metadata is available. Enable full capture to
              inspect headers, body, and replay requests.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <a
                href="#"
                className="text-sm text-accent hover:text-accent/80 transition-colors inline-flex items-center gap-1"
              >
                Learn more about data storage
                <span>→</span>
              </a>
              <a
                href={`/${orgSlug}/settings`}
                className="px-4 py-1.5 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Enable full capture
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* General Info section - shows real data */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-sm font-medium text-white">General</span>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">URL</span>
            <span className="text-gray-300 font-mono">
              https://{request.host}
              {request.path}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Method</span>
            <span className="text-gray-300 font-mono">{request.method}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Status</span>
            <span className="text-gray-300 font-mono">
              {request.status_code}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Client IP</span>
            <span className="text-gray-300 font-mono">{request.client_ip}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Duration</span>
            <span className="text-gray-300 font-mono">
              {request.request_duration_ms}ms
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Size</span>
            <span className="text-gray-300 font-mono">
              {formatBytes(request.bytes_in + request.bytes_out)}
            </span>
          </div>
        </div>
      </div>

      {/* Skeleton for Headers section */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden opacity-50">
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-sm font-medium text-white">Headers</span>
        </div>
        <div className="p-4 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="h-4 w-24 bg-white/10 rounded" />
              <div className="h-4 flex-1 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Skeleton for Body section */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden opacity-50">
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-sm font-medium text-white">Body</span>
        </div>
        <div className="p-4 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-4 bg-white/10 rounded"
              style={{ width: `${80 - i * 15}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
