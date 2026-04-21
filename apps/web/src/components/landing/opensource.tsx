import { Heart, Lock, Users, Server } from "lucide-react";
import { SiDiscord, SiGithub } from "react-icons/si";

export function OpenSource() {
  return (
    <section className="py-24 bg-black relative overflow-hidden border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
              100% Open Source
            </h2>
            <p className="text-base sm:text-lg text-white/60 mb-8 leading-relaxed">
              We believe in transparency and community. OutRay is built in the
              open, so you can inspect the code, contribute features, or
              self-host the entire platform on your own infrastructure.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="https://github.com/akinloluwami/outray"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black text-sm sm:text-base font-medium hover:bg-gray-200 transition-colors"
              >
                <SiGithub className="w-5 h-5" />
                Star on GitHub
              </a>
              <a
                href="https://discord.gg/DncjGcCHDg"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white text-sm sm:text-base font-medium hover:bg-white/10 transition-colors"
              >
                <SiDiscord className="w-5 h-5" />
                Join Community
              </a>
            </div>
          </div>

          <div className="relative mt-8 lg:mt-0">
            <div className="relative bg-[#0c0c0c] border border-white/10 rounded-3xl p-6 sm:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                    <Lock className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-white font-semibold text-sm sm:text-base">
                    Auditable Security
                  </h3>
                  <p className="text-xs sm:text-sm text-white/40">
                    Verify our security claims by inspecting the source code
                    yourself.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                    <Users className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-white font-semibold text-sm sm:text-base">Community Driven</h3>
                  <p className="text-xs sm:text-sm text-white/40">
                    Built with feedback and contributions from developers like
                    you.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
                    <Server className="w-5 h-5 text-green-400" />
                  </div>
                  <h3 className="text-white font-semibold text-sm sm:text-base">Self-Hostable</h3>
                  <p className="text-xs sm:text-sm text-white/40">
                    Run the entire stack on your own servers. No vendor lock-in.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
                    <Heart className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-white font-semibold text-sm sm:text-base">Free Forever</h3>
                  <p className="text-xs sm:text-sm text-white/40">
                    The core features will always be free and open source.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
