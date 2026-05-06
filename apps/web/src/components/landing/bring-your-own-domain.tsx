import { Check, Globe } from "lucide-react";

export const BringYourOwnDomain = () => (
  <div className="py-24 bg-black relative overflow-hidden">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 tracking-tight">
            Bring your <br />
            own domain
          </h2>
          <p className="text-lg sm:text-xl text-white/40 mb-8">
            Don't want to use our random subdomains? No problem. Connect your
            own domain in seconds and get automatic SSL certificates.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-4 text-white/60">
              <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                <Check size={16} className="text-accent" />
              </div>
              <span className="text-sm sm:text-base">Automatic SSL/TLS certificates</span>
            </div>
            <div className="flex items-center gap-4 text-white/60">
              <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                <Check size={16} className="text-accent" />
              </div>
              <span className="text-sm sm:text-base">Simple CNAME configuration</span>
            </div>
            <div className="flex items-center gap-4 text-white/60">
              <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                <Check size={16} className="text-accent" />
              </div>
              <span className="text-sm sm:text-base">Zero-downtime reconfiguration</span>
            </div>
          </div>
        </div>

        <div className="relative group mt-8 lg:mt-0">
          <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full group-hover:bg-accent/30 transition-colors duration-500" />

          <div className="relative bg-white/2 border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-base sm:text-lg font-medium text-white truncate">
                      api.yourcompany.com
                    </h3>
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-medium text-accent">
                      Active
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-white/40 mt-1">
                    Added on {new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden font-mono text-xs sm:text-sm">
              <div className="p-4 border-b border-white/5 flex items-center justify-between gap-4">
                <span className="text-white/40">Type</span>
                <span className="text-white/80">CNAME</span>
              </div>
              <div className="p-4 border-b border-white/5 flex items-center justify-between gap-4">
                <span className="text-white/40">Name</span>
                <span className="text-white/80">api</span>
              </div>
              <div className="p-4 border-b border-white/5 flex items-center justify-between gap-4">
                <span className="text-white/40">Value</span>
                <span className="text-accent truncate">edge.outray.app</span>
              </div>
              <div className="p-4 flex items-center justify-between gap-4">
                <span className="text-white/40">TTL</span>
                <span className="text-white/80">Auto</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
