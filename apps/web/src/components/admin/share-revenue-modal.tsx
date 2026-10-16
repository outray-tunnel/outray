import { useState, useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Copy01Icon from "@outray/icons/stroke/Copy01Icon";
import Download01Icon from "@outray/icons/stroke/Download01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { appClient } from "@/lib/app-client";
import { toPng } from "html-to-image";
import { Button } from "@/components/arc/button/button";
import { WorkspaceDialog } from "@/components/workspace/workspace-ui";

// Background options - exported for preloading
export const REVENUE_BACKGROUNDS = [
  { type: "solid", value: "bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d]" },
  { type: "image", value: "https://assets.outray.dev/bgs/001.jpg" },
  { type: "image", value: "https://assets.outray.dev/bgs/002.jpg" },
  { type: "image", value: "https://assets.outray.dev/bgs/003.jpg" },
  { type: "image", value: "https://assets.outray.dev/bgs/004.jpeg" },
];

// Helper to preload backgrounds via proxy - call this early in parent component
export async function preloadRevenueBackgrounds(): Promise<Record<number, string>> {
  const dataUrls: Record<number, string> = {};
  
  for (let i = 0; i < REVENUE_BACKGROUNDS.length; i++) {
    const bg = REVENUE_BACKGROUNDS[i];
    if (bg.type === "image") {
      try {
        // Use proxy to avoid CORS issues
        const proxyUrl = `/api/admin/proxy-image?url=${encodeURIComponent(bg.value)}`;
        const response = await fetch(proxyUrl);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        dataUrls[i] = dataUrl;
      } catch (error) {
        console.error(`Failed to load background ${i}:`, error);
      }
    }
  }
  
  return dataUrls;
}

interface ShareRevenueModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMrr: number;
  bgDataUrls: Record<number, string>;
}

export function ShareRevenueModal({
  isOpen,
  onClose,
  currentMrr,
  bgDataUrls,
}: ShareRevenueModalProps) {
  const [revenueData, setRevenueData] = useState<
    Array<{ date: string; revenue: number }>
  >([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [previousMrr, setPreviousMrr] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedBg, setSelectedBg] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const backgrounds = REVENUE_BACKGROUNDS;

  useEffect(() => {
    if (isOpen) {
      fetchRevenueData();
    }
  }, [isOpen]);

  const fetchRevenueData = async () => {
    setLoading(true);
    try {
      const res = await appClient.admin.revenueHistory("30d");
      if (!("error" in res)) {
        setRevenueData(res.data);
        setPeriodStart(res.periodStart);
        setPeriodEnd(res.periodEnd);
        setPreviousMrr(res.previousMrr);
      }
    } catch (error) {
      console.error("Failed to fetch revenue history:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!cardRef.current) return;

    // Temporarily remove rounded corners for export
    const originalBorderRadius = cardRef.current.style.borderRadius;
    cardRef.current.style.borderRadius = "0";

    try {
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: "#000000",
        pixelRatio: 2,
        cacheBust: true,
        fetchRequestInit: {
          mode: "cors",
          cache: "no-cache",
        },
        skipAutoScale: true,
        includeQueryParams: true,
      });

      // Restore rounded corners
      cardRef.current.style.borderRadius = originalBorderRadius;

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Restore rounded corners on error
      cardRef.current.style.borderRadius = originalBorderRadius;
      console.error("Failed to copy image:", error);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;

    setDownloading(true);

    // Temporarily remove rounded corners for export
    const originalBorderRadius = cardRef.current.style.borderRadius;
    cardRef.current.style.borderRadius = "0";

    try {
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: "#000000",
        pixelRatio: 2,
        cacheBust: true,
        fetchRequestInit: {
          mode: "cors",
          cache: "no-cache",
        },
        skipAutoScale: true,
        includeQueryParams: true,
      });

      // Restore rounded corners
      cardRef.current.style.borderRadius = originalBorderRadius;

      // Create download link
      const link = document.createElement("a");
      link.download = `outray-revenue-${new Date().toISOString().split("T")[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      // Restore rounded corners on error
      cardRef.current.style.borderRadius = originalBorderRadius;
      console.error("Failed to download image:", error);
    } finally {
      setDownloading(false);
    }
  };

  // Format X-axis date
  const formatXAxis = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <WorkspaceDialog
      open={isOpen}
      onClose={onClose}
      title="Share revenue"
      description="Choose a background, then copy or download your revenue card."
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2" role="group" aria-label="Revenue card background">
            {backgrounds.map((bg, index) => (
              <button
                key={bg.value}
                type="button"
                onClick={() => setSelectedBg(index)}
                aria-label={index === 0 ? "Dark background" : `Photo background ${index}`}
                aria-pressed={selectedBg === index}
                className={`size-7 shrink-0 overflow-hidden rounded-lg border transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#8367c7] ${
                  selectedBg === index
                    ? "border-zinc-300 ring-2 ring-white/15 ring-offset-2 ring-offset-[#101010]"
                    : "border-white/15 hover:border-white/40"
                }`}
                style={bg.type === "image" ? {
                  backgroundImage: `url(${bgDataUrls[index] || `/api/admin/proxy-image?url=${encodeURIComponent(bg.value)}`})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                } : undefined}
              >
                {bg.type === "solid" ? <span className="block size-full bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d]" /> : null}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              disabled={loading || downloading}
              aria-label={copied ? "Revenue image copied" : "Copy revenue image"}
              title={copied ? "Revenue image copied" : "Copy revenue image"}
              className="w-8 min-w-8 px-0!"
            >
              <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={15} strokeWidth={1.7} className={copied ? "text-emerald-300" : undefined} aria-hidden="true" />
            </Button>
            <span className="sr-only" role="status" aria-live="polite">{copied ? "Revenue image copied." : ""}</span>
            <Button type="button" size="sm" onClick={handleDownload} disabled={loading} loading={downloading}>
              <HugeiconsIcon icon={Download01Icon} size={15} strokeWidth={1.7} aria-hidden="true" />
              {downloading ? "Downloading…" : "Download"}
            </Button>
          </div>
        </div>
      }
    >
                <div
                  ref={cardRef}
                  className="relative min-h-[420px] overflow-hidden rounded-xl border border-white/10 p-6 max-[480px]:p-4"
                >
                  {/* Background image element for proper export */}
                  {backgrounds[selectedBg].type === "image" && (
                    <img
                      src={bgDataUrls[selectedBg] || `/api/admin/proxy-image?url=${encodeURIComponent(backgrounds[selectedBg].value)}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  
                  {/* Background for solid option */}
                  {backgrounds[selectedBg].type === "solid" && (
                    <div className={`absolute inset-0 ${backgrounds[selectedBg].value}`} />
                  )}
                  
                  {/* Dark overlay for image backgrounds to ensure text readability */}
                  {backgrounds[selectedBg].type === "image" && (
                    <div className="absolute inset-0 bg-black/40" />
                  )}
                  
                  {/* Inner card with content */}
                  <div className="relative z-10 bg-[#0d0d0d]/90 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                    {/* Revenue Header */}
                    <div className="mb-6">
                      <p className="text-sm text-gray-400 mb-1">Revenue</p>
                      <p className="text-4xl font-bold text-white tracking-tight">
                        ${currentMrr.toLocaleString()}
                      </p>

                      {/* Period badges */}
                      <div className="flex items-center gap-4 mt-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="text-gray-400">
                            {periodStart} – {periodEnd}
                          </span>
                        </div>
                        {previousMrr > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-gray-500" />
                            <span className="text-gray-500">
                              Previous: ${previousMrr.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Chart */}
                    <div className="h-40">
                      {loading ? (
                        <div className="h-full flex items-center justify-center text-gray-500">
                          Loading...
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={revenueData}
                            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient
                                id="revenueGradient"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="#3b82f6"
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#3b82f6"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <XAxis
                              dataKey="date"
                              tickFormatter={formatXAxis}
                              stroke="#444"
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fill: "#666" }}
                              interval="preserveStartEnd"
                              minTickGap={50}
                            />
                            <YAxis hide domain={["dataMin", "dataMax"]} />
                            <Area
                              type="monotone"
                              dataKey="revenue"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#revenueGradient)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Branding */}
                    <div className="flex items-center justify-center mt-6 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <img
                          src="/logo.png"
                          alt="OutRay"
                          className="w-5 h-5"
                        />
                        <span className="text-white font-semibold text-sm">
                          OutRay
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
    </WorkspaceDialog>
  );
}
