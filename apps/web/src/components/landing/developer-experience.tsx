import { Terminal as TerminalIcon, Code, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";

const LOGS = [
  {
    status: "200 OK",
    method: "GET",
    path: "/api/users",
    time: "12ms",
    color: "text-accent",
  },
  {
    status: "201 Created",
    method: "POST",
    path: "/api/webhooks",
    time: "45ms",
    color: "text-accent",
  },
  {
    status: "401 Unauth",
    method: "GET",
    path: "/admin",
    time: "8ms",
    color: "text-white/40",
  },
  {
    status: "200 OK",
    method: "GET",
    path: "/favicon.ico",
    time: "2ms",
    color: "text-accent",
  },
  {
    status: "500 Error",
    method: "POST",
    path: "/api/checkout",
    time: "120ms",
    color: "text-red-400",
  },
  {
    status: "200 OK",
    method: "GET",
    path: "/api/products",
    time: "15ms",
    color: "text-accent",
  },
  {
    status: "200 OK",
    method: "GET",
    path: "/api/settings",
    time: "24ms",
    color: "text-accent",
  },
  {
    status: "404 Not Found",
    method: "GET",
    path: "/api/unknown",
    time: "5ms",
    color: "text-white/40",
  },
];

export const DeveloperExperience = () => {
  const [visibleLogs, setVisibleLogs] = useState(
    LOGS.slice(0, 6).map((l, i) => ({ ...l, id: i })),
  );

  useEffect(() => {
    let count = 6;
    const interval = setInterval(() => {
      const nextLog = LOGS[count % LOGS.length];
      const newLog = { ...nextLog, id: count };
      setVisibleLogs((current) => [...current.slice(1), newLog]);
      count++;
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-16">
        <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight text-white">
          First-class <br />
          developer experience
        </h2>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-stretch">
        <div className="grid gap-8 lg:grid-rows-2">
          <div className="bg-white/2 border border-white/5 rounded-3xl p-8 hover:border-white/10 transition-colors group h-full flex flex-col">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                <TerminalIcon size={20} className="text-accent" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Online in one line
              </h3>
            </div>
            <p className="text-white/40 mb-6">
              One command, you're online. Seriously, try for yourself.
            </p>
            <div className="bg-black/40 rounded-2xl border border-white/5 p-4 font-mono text-sm mt-auto">
              <span className="text-accent">$</span> outray 3000
            </div>
          </div>

          <div className="bg-white/2 border border-white/5 rounded-3xl p-8 hover:border-white/10 transition-colors group h-full flex flex-col">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                <Code size={20} className="text-accent" />
              </div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-white">Don't fw CLI?</h3>
                <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs font-medium">
                  Coming Soon
                </span>
              </div>
            </div>
            <p className="text-white/40 mb-6">
              Use our SDKs to embed OutRay directly into your app.
            </p>
            <div className="bg-black/40 rounded-2xl border border-white/5 p-4 font-mono text-sm overflow-x-auto mt-auto whitespace-pre-wrap">
              <span className="text-accent">import</span> outray{" "}
              <span className="text-accent">from</span>{" "}
              <span className="text-white/60">"outray"</span>;{"\n"}
              <span className="text-accent">await</span> outray.
              <span className="text-white">connect</span>({"{"} port:{" "}
              <span className="text-white">3000</span> {"}"});
            </div>
          </div>
        </div>

        <div className="bg-white/2 border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden group h-full">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none group-hover:bg-accent/20 transition-colors" />

          <div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                <Activity size={20} className="text-accent" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Instant Observability
              </h3>
            </div>
            <p className="text-white/40">
              View live traffic happening on your APIs in real-time the second
              it goes online.
            </p>
          </div>

          <div className="mt-8 space-y-3 font-mono text-xs flex-1 flex flex-col justify-end">
            <AnimatePresence mode="popLayout" initial={false}>
              {visibleLogs.map((log) => (
                <motion.div
                  key={log.id}
                  layout
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.95,
                    transition: { duration: 0.2 },
                  }}
                  transition={{ duration: 0.4, type: "spring", bounce: 0 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
                >
                  <span className={log.color}>{log.status}</span>
                  <span className="text-white/40">{log.method}</span>
                  <span className="text-white/60">{log.path}</span>
                  <span className="ml-auto text-white/20">{log.time}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
