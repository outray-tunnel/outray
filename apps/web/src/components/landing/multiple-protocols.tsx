import { Globe, Database, Gamepad2, ArrowRight } from "lucide-react";

export const MultipleProtocols = () => (
  <div className="py-32 bg-black relative overflow-hidden border-t border-white/5">
    <div className="max-w-7xl mx-auto px-6">
      <div className="text-center max-w-3xl mx-auto mb-20">
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 tracking-tight">
          Any protocol, <br />
          <span className="text-white/40">anywhere.</span>
        </h2>
        <p className="text-lg sm:text-xl text-white/60">
          OutRay isn't limited to just web traffic. Tunnel any TCP or UDP
          service securely to your local machine with a single command.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* HTTP Card */}
        <div className="group relative bg-white/2 border border-white/5 rounded-3xl p-8 hover:border-accent/20 transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />

          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <Globe className="w-6 h-6 text-blue-400" />
            </div>

            <h3 className="text-xl font-bold text-white mb-3">HTTP/HTTPS</h3>
            <p className="text-white/40 mb-8 sm:h-12">
              Instant secure URLs for your local web servers, webhooks, and
              APIs.
            </p>

            <div className="bg-black/40 rounded-xl border border-white/5 p-3 font-mono text-sm text-white/60 flex items-center justify-between group-hover:border-blue-500/20 transition-colors">
              <span className="truncate mr-2">outray http 3000</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-blue-400 shrink-0" />
            </div>
          </div>
        </div>

        {/* TCP Card */}
        <div className="group relative bg-white/2 border border-white/5 rounded-3xl p-8 hover:border-accent/20 transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-b from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />

          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <Database className="w-6 h-6 text-purple-400" />
            </div>

            <h3 className="text-xl font-bold text-white mb-3">TCP Tunnels</h3>
            <p className="text-white/40 mb-8 sm:h-12">
              Expose databases, SSH, RDP, and other TCP services securely.
            </p>

            <div className="bg-black/40 rounded-xl border border-white/5 p-3 font-mono text-sm text-white/60 flex items-center justify-between group-hover:border-purple-500/20 transition-colors">
              <span className="truncate mr-2">outray tcp 5432</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-purple-400 shrink-0" />
            </div>
          </div>
        </div>

        {/* UDP Card */}
        <div className="group relative bg-white/2 border border-white/5 rounded-3xl p-8 hover:border-accent/20 transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-b from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />

          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <Gamepad2 className="w-6 h-6 text-orange-400" />
            </div>

            <h3 className="text-xl font-bold text-white mb-3">UDP Tunnels</h3>
            <p className="text-white/40 mb-8 sm:h-12">
              Perfect for game servers, streaming, and real-time applications.
            </p>

            <div className="bg-black/40 rounded-xl border border-white/5 p-3 font-mono text-sm text-white/60 flex items-center justify-between group-hover:border-orange-500/20 transition-colors">
              <span className="truncate mr-2">outray udp 25565</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-orange-400 shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
