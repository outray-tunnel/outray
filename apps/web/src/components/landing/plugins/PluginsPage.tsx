import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, Zap, Package } from "lucide-react";
import { SiVite, SiNextdotjs } from "react-icons/si";
import { Navbar } from "../navbar";
import { Footer } from "../shared";

const plugins = [
  {
    name: "Vite Plugin",
    description:
      "Zero-config integration for Vite projects. Automatic tunnel creation when your dev server starts.",
    icon: SiVite,
    iconColor: "text-[#646CFF]",
    bgGradient: "from-[#646CFF]/20 to-[#646CFF]/5",
    href: "/vite",
    npm: "@outray/vite",
    features: [
      "Auto-starts tunnel on dev server",
      "Works with React, Vue, Svelte, Solid",
      "HMR-friendly configuration",
      "TypeScript support",
    ],
  },
  {
    name: "Next.js Plugin",
    description:
      "Seamless integration for Next.js applications. Compatible with both Webpack and Turbopack.",
    icon: SiNextdotjs,
    iconColor: "text-white",
    bgGradient: "from-white/20 to-white/5",
    href: "/nextjs",
    npm: "@outray/next",
    features: [
      "Next.js 13-16 support",
      "Turbopack compatible",
      "App & Pages router",
      "TypeScript support",
    ],
  },
];

export const PluginsPage = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/60 mb-8"
          >
            <Package size={16} className="text-accent" />
            Official Plugins
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
          >
            <span className="text-white">Framework</span>
            <br />
            <span className="text-accent">Integrations</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-white/50 max-w-2xl mx-auto"
          >
            Drop-in plugins that automatically create tunnels when your dev
            server starts. No CLI needed.
          </motion.p>
        </div>
      </section>

      {/* Plugins Grid */}
      <section className="pb-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {plugins.map((plugin, index) => (
              <motion.div
                key={plugin.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
              >
                <Link
                  to={plugin.href}
                  className="block h-full bg-white/2 border border-white/5 rounded-3xl p-8 hover:border-white/20 transition-all duration-300 group relative overflow-hidden"
                >
                  {/* Background gradient */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${plugin.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />

                  <div className="relative">
                    {/* Icon and title */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <plugin.icon className={`text-3xl ${plugin.iconColor}`} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white">
                          {plugin.name}
                        </h3>
                        <code className="text-sm text-white/40 font-mono">
                          {plugin.npm}
                        </code>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-white/50 mb-6">{plugin.description}</p>

                    {/* Features */}
                    <ul className="space-y-2 mb-8">
                      {plugin.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-center gap-2 text-sm text-white/40"
                        >
                          <Zap size={14} className="text-accent" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <div className="flex items-center gap-2 text-accent font-medium group-hover:gap-3 transition-all">
                      Learn more
                      <ArrowRight
                        size={18}
                        className="group-hover:translate-x-1 transition-transform"
                      />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* More coming soon */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-12 text-center"
          >
            <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/2 border border-white/5">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-black flex items-center justify-center text-xs">
                  🦀
                </div>
                <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-black flex items-center justify-center text-xs">
                  🐹
                </div>
                <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-black flex items-center justify-center text-xs">
                  🐍
                </div>
              </div>
              <span className="text-white/40 text-sm">
                More frameworks coming soon...
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};
