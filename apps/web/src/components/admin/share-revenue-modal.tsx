import { useState, useEffect, useRef } from "react";
import { X, Copy, Download, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { appClient } from "@/lib/app-client";
import { toPng } from "html-to-image";

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
  token: string;
  currentMrr: number;
  bgDataUrls: Record<number, string>;
}

export function ShareRevenueModal({
  isOpen,
  onClose,
  token,
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
    if (isOpen && token) {
      fetchRevenueData();
    }
  }, [isOpen, token]);

  const fetchRevenueData = async () => {
    setLoading(true);
    try {
      const res = await appClient.admin.revenueHistory(token, "30d");
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
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-3xl bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Share Revenue Metric
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Card Preview */}
              <div className="p-8">
                <div
                  ref={cardRef}
                  className="relative rounded-2xl p-10 border border-white/10 overflow-hidden min-h-[420px]"
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
              </div>

              {/* Footer Actions */}
              <div className="p-6 pt-0 flex items-center justify-between">
                {/* Background Selectors */}
                <div className="flex items-center gap-2">
                  {backgrounds.map((bg, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedBg(index)}
                      className={`w-8 h-8 rounded-full border-2 overflow-hidden transition-all ${
                        selectedBg === index
                          ? "border-blue-500 ring-2 ring-blue-500/30"
                          : "border-white/20 hover:border-white/40"
                      }`}
                      style={
                        bg.type === "image"
                          ? { 
                              backgroundImage: `url(${bgDataUrls[index] || `/api/admin/proxy-image?url=${encodeURIComponent(bg.value)}`})`, 
                              backgroundSize: "cover", 
                              backgroundPosition: "center" 
                            }
                          : undefined
                      }
                    >
                      {bg.type === "solid" && (
                        <div className="w-full h-full bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d]" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={loading}
                    aria-label={copied ? "Revenue image copied" : "Copy revenue image"}
                    title={copied ? "Revenue image copied" : "Copy revenue image"}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-gray-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:opacity-50"
                  >
                    {copied ? (
                      <Check size={16} className="text-green-400" aria-hidden="true" />
                    ) : (
                      <Copy size={16} aria-hidden="true" />
                    )}
                  </button>
                  <span className="sr-only" role="status" aria-live="polite">{copied ? "Revenue image copied." : ""}</span>
                  <button
                    onClick={handleDownload}
                    disabled={loading || downloading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Download size={16} />
                    {downloading ? "Downloading..." : "Download"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
