import { motion } from "motion/react";
import { Globe, Server, Shield, Laptop, Sparkles } from "lucide-react";

export function NetworkDiagram() {
  return (
    <section className="py-24 bg-black relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-24">
          <div className="relative inline-block">
            <motion.div
              className="absolute -inset-8 bg-linear-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-2xl rounded-full"
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <h2 className="relative text-6xl md:text-7xl font-bold italic tracking-tighter text-transparent bg-clip-text bg-linear-to-b from-white via-white/90 to-white/70 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              It just works
            </h2>

            <motion.div
              className="absolute -top-8 -right-10 text-yellow-200"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.7, 1, 0.7],
                rotate: [0, 15, 0],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="w-10 h-10 fill-yellow-200/20" />
            </motion.div>
            <motion.div
              className="absolute -bottom-4 -left-10 text-purple-300"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5],
                rotate: [0, -15, 0],
              }}
              transition={{ duration: 3, repeat: Infinity, delay: 1 }}
            >
              <Sparkles className="w-8 h-8 fill-purple-300/20" />
            </motion.div>
            <motion.div
              className="absolute top-0 -left-8 text-blue-300"
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
              }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
            >
              <Sparkles className="w-4 h-4 fill-blue-300/20" />
            </motion.div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-y-1/2 hidden md:block" />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
            <div className="flex flex-col items-center text-center group">
              <div className="w-16 h-16 rounded-2xl bg-[#0c0c0c] border border-white/10 flex items-center justify-center mb-6 relative z-10 group-hover:border-yellow-500/50 transition-colors duration-500">
                <Laptop className="w-8 h-8 text-yellow-400" />
                <motion.div
                  className="absolute inset-0 bg-yellow-500/20 blur-xl rounded-full"
                  animate={{ opacity: [0, 1, 0, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    times: [0, 0.1, 0.25, 1],
                    ease: "easeInOut",
                  }}
                />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Localhost
              </h3>
              <p className="text-sm text-white/40">
                Your local server running on
                <br />
                <span className="text-yellow-400">localhost:3000</span>
              </p>
            </div>

            <div className="flex flex-col items-center text-center group">
              <div className="w-16 h-16 rounded-2xl bg-[#0c0c0c] border border-white/10 flex items-center justify-center mb-6 relative z-10 group-hover:border-green-500/50 transition-colors duration-500">
                <Shield className="w-8 h-8 text-green-400" />
                <motion.div
                  className="absolute inset-0 bg-green-500/20 blur-xl rounded-full"
                  animate={{ opacity: [0, 0, 1, 0, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    times: [0, 0.2, 0.35, 0.5, 1],
                    ease: "easeInOut",
                  }}
                />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Secure Tunnel
              </h3>
              <p className="text-sm text-white/40">
                Establishes a secure,
                <br />
                persistent connection
              </p>
            </div>

            <div className="flex flex-col items-center text-center group">
              <div className="w-16 h-16 rounded-2xl bg-[#0c0c0c] border border-white/10 flex items-center justify-center mb-6 relative z-10 group-hover:border-purple-500/50 transition-colors duration-500">
                <Server className="w-8 h-8 text-purple-400" />
                <motion.div
                  className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full"
                  animate={{ opacity: [0, 0, 0, 1, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    times: [0, 0.45, 0.6, 0.75, 1],
                    ease: "easeInOut",
                  }}
                />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                OutRay Edge
              </h3>
              <p className="text-sm text-white/40">
                Routes traffic from the
                <br />
                internet to your tunnel
              </p>
            </div>

            <div className="flex flex-col items-center text-center group">
              <div className="w-16 h-16 rounded-2xl bg-[#0c0c0c] border border-white/10 flex items-center justify-center mb-6 relative z-10 group-hover:border-blue-500/50 transition-colors duration-500">
                <Globe className="w-8 h-8 text-blue-400" />
                <motion.div
                  className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"
                  animate={{ opacity: [0, 0, 0, 1] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    times: [0, 0.7, 0.85, 1],
                    ease: "easeInOut",
                  }}
                />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Public Internet
              </h3>
              <p className="text-sm text-white/40">
                Accessible worldwide at
                <br />
                <span className="text-blue-400">{`{subdomain}.outray.app`}</span>
              </p>
            </div>
          </div>

          <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 hidden md:block pointer-events-none">
            <motion.div
              className="w-24 h-1 bg-linear-to-r from-transparent via-white to-transparent opacity-50"
              animate={{
                x: ["0%", "100%"],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"
              animate={{
                left: ["0%", "100%"],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
