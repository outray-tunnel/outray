import { Wifi, Zap, Shield, Radio } from "lucide-react";

export const LocalAccess = () => (
  <div className="py-32 bg-black relative overflow-hidden border-t border-white/5">
    <div className="max-w-7xl mx-auto px-6">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
          <Wifi size={14} />
          <span>New</span>
        </div>
        <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
          Unlimited{" "}
          <span className="bg-linear-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
            .local
          </span>{" "}
          domains
        </h2>
        <p className="text-xl text-white/60">
          Test on any device in your network. Just add --local and your app is
          instantly accessible at a memorable .local domain.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">mDNS Discovery</h3>
              <p className="text-white/40 text-sm">
                Auto-discovered by all devices via Bonjour/Avahi
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">Trusted HTTPS</h3>
              <p className="text-white/40 text-sm">
                Automatic certificates with mkcert - no browser warnings
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">Zero Config</h3>
              <p className="text-white/40 text-sm">
                No port forwarding, no firewall rules, no DNS setup
              </p>
            </div>
          </div>
        </div>

        {/* Right - Terminal demo */}
        <div className="relative group">
          <div className="absolute inset-0 bg-cyan-500/10 blur-3xl rounded-full opacity-50 group-hover:opacity-70 transition-opacity" />
          <div className="relative bg-white/2 border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="p-6 font-mono text-sm space-y-3">
              <div className="text-white/60">
                <span className="text-green-400">$</span> outray 3000 --local
              </div>
              <div className="text-white/40 pt-2">
                ✨ Tunnel:{" "}
                <span className="text-white/60">https://my-app.outray.app</span>
              </div>
              <div className="text-cyan-400">
                📡 Local:{" "}
                <span className="text-cyan-300">https://my-app.local</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
