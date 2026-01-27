import { useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { ArrowRight, Copy, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePostHog } from "posthog-js/react";
import { motion, AnimatePresence } from "motion/react";
import { Terminal } from "./Terminal";
import { BeamGroup } from "./beam-group";

const MINI_LOGS = [
  { method: "GET", path: "/api/users", status: "200" },
  { method: "POST", path: "/webhook", status: "201" },
  { method: "GET", path: "/health", status: "200" },
  { method: "PUT", path: "/api/data", status: "200" },
  { method: "GET", path: "/products", status: "200" },
];

export const Hero = () => {
  const [copied, setCopied] = useState(false);
  const [exposeHovered, setExposeHovered] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState(
    MINI_LOGS.slice(0, 3).map((l, i) => ({ ...l, id: i }))
  );
  const posthog = usePostHog();

  useEffect(() => {
    if (!exposeHovered) return;
    let count = 3;
    const interval = setInterval(() => {
      const nextLog = MINI_LOGS[count % MINI_LOGS.length];
      const newLog = { ...nextLog, id: count };
      setVisibleLogs((current) => [...current.slice(1), newLog]);
      count++;
    }, 800);
    return () => clearInterval(interval);
  }, [exposeHovered]);

  const copyCommand = () => {
    navigator.clipboard.writeText("npm install -g outray");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center overflow-hidden pt-20">
      <div className="absolute inset-0 z-0 md:-translate-x-[10%]">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <color attach="background" args={["#000000"]} />
          <BeamGroup />
        </Canvas>
      </div>

      <div className="flex flex-col gap-8 max-w-360 mx-auto px-6 relative z-10 w-full items-center">
        <div className="flex flex-col gap-6 items-center mt-20">
          <motion.a
            href="https://www.ycombinator.com/companies/outray"
            target="_blank"
            onClick={() => posthog.capture("yc_badge_clicked")}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-white/60 backdrop-blur-sm hover:bg-white/10 transition-colors"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-4 h-4 bg-[#F26522] flex items-center justify-center rounded-xs">
              <span className="text-white text-[10px] font-bold font-sans">
                Y
              </span>
            </div>
            <span>Not backed by Y Combinator</span>
          </motion.a>
          <motion.h1
            className="text-5xl md:text-7xl font-bold text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <span
              className="relative inline-block mb-2 md:mb-0 cursor-pointer"
              onMouseEnter={() => setExposeHovered(true)}
              onMouseLeave={() => setExposeHovered(false)}
            >
              {/* Hidden streaming logs behind */}
              <motion.span
                className="absolute inset-0 bg-black rounded-2xl px-3 border border-accent/30 font-mono text-[10px] md:text-xs overflow-hidden flex items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: exposeHovered ? 1 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <span className="flex flex-col w-full">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {visibleLogs.map((log) => (
                      <motion.div
                        key={log.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, type: "spring", bounce: 0 }}
                        className="flex items-center whitespace-nowrap h-4"
                      >
                        <span className="text-accent font-medium w-10 shrink-0">{log.method}</span>
                        <span className="text-white/50 flex-1">{log.path}</span>
                        <span className="text-white/30 ml-auto">{log.status}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </span>
              </motion.span>
              {/* Front card that rotates */}
              <motion.span
                className="bg-accent/15 text-white rounded-2xl px-4 py-1 inline-block border border-accent/30 relative origin-bottom-left"
                animate={{
                  rotate: exposeHovered ? -45 : 0,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                Expose
              </motion.span>
            </span>{" "}
            your local server <br className="hidden md:block" /> to the internet
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-center text-white/60 max-w-2xl leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            OutRay is an open-source ngrok alternative that makes it easy to
            expose your local development server to the internet via secure
            tunnels.
          </motion.p>
        </div>

        <motion.div
          className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link
            to="/signup"
            className="group w-full sm:w-auto px-8 py-4 bg-white text-black hover:bg-gray-200 rounded-full font-bold text-lg transition-all flex items-center justify-center gap-2"
          >
            Get Started Free{" "}
            <ArrowRight
              size={20}
              className="group-hover:translate-x-1 transition-transform"
            />
          </Link>
          <button
            onClick={copyCommand}
            className="w-full sm:w-auto flex items-center gap-3 text-white/60 hover:text-white px-8 py-4 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 hover:border-accent/40 font-mono text-sm backdrop-blur-sm transition-all group cursor-pointer"
          >
            <span className="text-accent">$</span> npm install -g outray
            {copied ? (
              <Check size={16} className="text-accent" />
            ) : (
              <Copy
                size={16}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            )}
          </button>
        </motion.div>

        <motion.div
          className="w-full max-w-4xl mt-12 pointer-events-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <Terminal />
        </motion.div>
      </div>
    </div>
  );
};
