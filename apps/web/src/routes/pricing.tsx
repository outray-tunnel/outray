import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/navbar";
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";
import { isNigerianUser } from "@/lib/geolocation";
import { Check, X } from "lucide-react";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing - OutRay" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [showNGN, setShowNGN] = useState(false);

  // Check if user is in Nigeria to show NGN prices
  useEffect(() => {
    isNigerianUser().then(setShowNGN);
  }, []);

  const plans = Object.entries(SUBSCRIPTION_PLANS)
    .filter(([_, plan]) => !("hidden" in plan && plan.hidden))
    .map(([key, plan]) => ({
      id: key,
      ...plan,
    }));

  const formatBandwidth = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1024) {
      return `${gb / 1024}TB`;
    }
    return `${gb}GB`;
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30 font-sans">
      <Navbar />

      <div className="pt-32 pb-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              Start for free, upgrade as you grow. No hidden fees.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {plans.map((plan) => {
              const f = plan.features as {
                maxTunnels: number;
                maxDomains: number;
                maxSubdomains: number;
                maxMembers: number;
                bandwidthPerMonth: number;
                retentionDays: number;
                customDomains: boolean;
                prioritySupport: boolean;
              };
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col p-8 rounded-3xl border transition-all duration-300 ${
                    plan.id === "beam"
                      ? "bg-linear-to-br from-accent/10 via-white/5 to-purple-500/10 border-accent shadow-[0_0_60px_rgba(255,255,255,0.15)] ring-2 ring-accent/30 scale-[1.02]"
                      : "bg-[#0c0c0c] border-white/10 hover:border-white/20"
                  }`}
                >
                  {plan.id === "beam" && (
                    <>
                      <div className="absolute inset-0 rounded-3xl bg-linear-to-br from-accent/5 via-transparent to-purple-500/5 pointer-events-none" />
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-linear-to-r from-accent to-yellow-400 text-black text-xs font-bold rounded-full uppercase tracking-wider shadow-lg shadow-accent/30 flex items-center gap-1.5">
                        <span className="animate-pulse">✨</span>
                        Recommended
                        <span className="animate-pulse">✨</span>
                      </div>
                    </>
                  )}

                  <div className="mb-8 relative">
                    <h3
                      className={`text-xl font-bold mb-2 ${plan.id === "beam" ? "text-accent" : ""}`}
                    >
                      {plan.name}
                    </h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">${plan.price}</span>
                      <span className="text-white/40">/month</span>
                    </div>
                    {showNGN && plan.priceNGN > 0 && (
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-lg text-white/60">₦{plan.priceNGN.toLocaleString()}</span>
                        <span className="text-white/40 text-sm">/month</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-4 mb-8">
                    <FeatureItem
                      label={`${
                        f.maxTunnels === -1 ? "Unlimited" : f.maxTunnels
                      } Tunnel${f.maxTunnels === 1 ? "" : "s"}`}
                    />
                    <FeatureItem
                      label={`${
                        f.maxDomains === -1 ? "Unlimited" : f.maxDomains
                      } Custom Domain${f.maxDomains === 1 ? "" : "s"}`}
                      included={f.maxDomains !== 0}
                    />
                    <FeatureItem
                      label={`${
                        f.maxSubdomains === -1 ? "Unlimited" : f.maxSubdomains
                      } Subdomain${f.maxSubdomains === 1 ? "" : "s"}`}
                    />
                    <FeatureItem
                      label={`${
                        f.maxMembers === -1 ? "Unlimited" : f.maxMembers
                      } Team Member${f.maxMembers === 1 ? "" : "s"}`}
                    />
                    <FeatureItem
                      label={`${formatBandwidth(f.bandwidthPerMonth)} Bandwidth`}
                    />
                    <FeatureItem
                      label={`${f.retentionDays} Days Log Retention`}
                    />
                    <FeatureItem
                      label="Priority Support"
                      included={f.prioritySupport}
                    />
                  </div>

                  <Link
                    to="/login"
                    className={`w-full py-3 rounded-full font-bold text-center transition-all ${
                      plan.id === "beam"
                        ? "bg-white text-black hover:bg-gray-200"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {plan.price === 0 ? "Get Started" : "Subscribe"}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="border-t border-white/10 py-12 bg-black">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="OutRay Logo" className="w-6" />
            <span className="font-bold">OutRay</span>
          </div>
          <div className="text-white/40 text-sm">
            © {new Date().getFullYear()} OutRay Inc. All rights reserved.
          </div>
          <div className="flex gap-6 text-white/60">
            <a href="#" className="hover:text-white transition-colors">
              Twitter
            </a>
            <a href="#" className="hover:text-white transition-colors">
              GitHub
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Discord
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureItem({
  label,
  included = true,
}: {
  label: string;
  included?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {included ? (
        <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <Check size={12} className="text-white" />
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center shrink-0">
          <X size={12} className="text-white/20" />
        </div>
      )}
      <span className={included ? "text-white/80" : "text-white/40"}>
        {label}
      </span>
    </div>
  );
}
