import { motion } from "motion/react";
import { History, Sparkles, Eye, Bug, Zap } from "lucide-react";
import { Navbar } from "../navbar";
import { Footer } from "../shared";

interface ChangelogEntry {
  date: string;
  title: string;
  description: string;
  type: "feature" | "improvement" | "fix";
  highlights: string[];
}

const changelog: ChangelogEntry[] = [
  {
    date: "January 24, 2026",
    title: "Request Inspection & Replay",
    description:
      "Inspect every HTTP request flowing through your tunnel in real-time. View full request and response details including headers and body content. Replay requests with a single click to debug issues faster.",
    type: "feature",
    highlights: [
      "Request/Response inspector drawer with full details",
      "View headers, query params, and body content",
      "One-click request replay",
      "Export requests as cURL commands",
      "Search and filter by path, method, or host",
    ],
  },
];

const typeConfig = {
  feature: {
    icon: Sparkles,
    color: "text-accent",
    bg: "bg-accent/10",
    label: "New Feature",
  },
  improvement: {
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    label: "Improvement",
  },
  fix: {
    icon: Bug,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    label: "Bug Fix",
  },
};

export const ChangelogPage = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-accent/30">
      <Navbar />


      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/60 mb-8"
          >
            <History size={16} className="text-accent" />
            Product Updates
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
          >
            Changelog
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-white/50 max-w-2xl mx-auto"
          >
            New features, improvements, and fixes. Stay up to date with
            everything new in OutRay.
          </motion.p>
        </div>
      </section>


      <section className="pb-32 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">

            <div className="absolute left-0 md:left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2 hidden md:block" />

            {changelog.map((entry, index) => {
              const config = typeConfig[entry.type];
              const IconComponent = config.icon;

              return (
                <motion.div
                  key={entry.title}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
                  className="relative mb-16 last:mb-0"
                >

                  <div className="absolute left-0 md:left-1/2 top-0 w-4 h-4 rounded-full bg-accent border-4 border-black -translate-x-1/2 hidden md:block" />

                  <div className="md:grid md:grid-cols-2 md:gap-12">

                    <div className="md:text-right md:pr-12 mb-4 md:mb-0">
                      <div className="text-white/40 text-sm">
                        {entry.date}
                      </div>
                    </div>


                    <div className="md:pl-12">
                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.bg} ${config.color} text-xs font-medium mb-4`}
                      >
                        <IconComponent size={12} />
                        {config.label}
                      </div>

                      <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                        {entry.title}
                      </h2>

                      <p className="text-white/50 mb-6 leading-relaxed">
                        {entry.description}
                      </p>

                      <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
                        <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
                          <Eye size={14} />
                          What's included
                        </h3>
                        <ul className="space-y-3">
                          {entry.highlights.map((highlight) => (
                            <li
                              key={highlight}
                              className="flex items-start gap-3 text-white/70"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                              {highlight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>


          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-20 text-center"
          >
            <div className="inline-flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-white/2 border border-white/5">
              <p className="text-white/40 text-sm">
                Follow us for the latest updates
              </p>
              <div className="flex gap-4">
                <a
                  href="https://twitter.com/outraytunnel"
                  target="_blank"
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/60 hover:text-white transition-colors"
                >
                  Twitter
                </a>
                <a
                  href="https://github.com/akinloluwami/outray"
                  target="_blank"
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/60 hover:text-white transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://discord.gg/DncjGcCHDg"
                  target="_blank"
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/60 hover:text-white transition-colors"
                >
                  Discord
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};
