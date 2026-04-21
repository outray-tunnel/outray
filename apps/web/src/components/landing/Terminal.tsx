import { useEffect, useState } from "react";

const SAMPLE_LOGS = [
  { method: "GET", path: "/api/users", status: 200, time: "12ms" },
  { method: "POST", path: "/api/webhooks", status: 201, time: "45ms" },
  { method: "GET", path: "/favicon.ico", status: 200, time: "2ms" },
  { method: "GET", path: "/api/health", status: 200, time: "5ms" },
  { method: "POST", path: "/auth/login", status: 200, time: "89ms" },
  { method: "GET", path: "/dashboard", status: 200, time: "150ms" },
  { method: "GET", path: "/api/settings", status: 304, time: "8ms" },
  { method: "POST", path: "/api/upload", status: 201, time: "230ms" },
  { method: "GET", path: "/assets/logo.png", status: 200, time: "15ms" },
  { method: "DELETE", path: "/api/users/123", status: 204, time: "35ms" },
  { method: "GET", path: "/api/notifications", status: 200, time: "22ms" },
  { method: "PUT", path: "/api/profile", status: 200, time: "67ms" },
  { method: "GET", path: "/sw.js", status: 200, time: "4ms" },
  { method: "POST", path: "/api/logout", status: 200, time: "12ms" },
];

export function Terminal() {
  const [text, setText] = useState("");
  const [step, setStep] = useState(0);
  const [dots, setDots] = useState("");
  const [logs, setLogs] = useState<typeof SAMPLE_LOGS>([]);

  useEffect(() => {
    const command = "outray 6967";
    if (step === 0) {
      if (text.length < command.length) {
        const timeout = setTimeout(() => {
          setText(command.slice(0, text.length + 1));
        }, 80);
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => setStep(1), 300);
      return () => clearTimeout(timeout);
    }
  }, [text, step]);

  useEffect(() => {
    if (step === 1) {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length < 3 ? prev + "." : ""));
      }, 150);

      const timeout = setTimeout(() => {
        setStep(2);
      }, 1500);
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [step]);

  useEffect(() => {
    if (step === 2) {
      const timeout = setTimeout(() => setStep(3), 600);
      return () => clearTimeout(timeout);
    }
  }, [step]);

  useEffect(() => {
    if (step === 3) {
      const startTimeout = setTimeout(() => {
        const interval = setInterval(() => {
          const randomLog =
            SAMPLE_LOGS[Math.floor(Math.random() * SAMPLE_LOGS.length)];
          setLogs((prev) => [...prev.slice(-7), randomLog]);
        }, 1200);
        return () => clearInterval(interval);
      }, 1000);

      return () => clearTimeout(startTimeout);
    }
  }, [step]);

  return (
    <div className="w-full bg-[#0c0c0c] rounded-xl border border-white/10 shadow-2xl overflow-hidden font-mono text-sm md:text-base text-gray-300 pointer-events-auto min-h-125 flex flex-col">
      <div className="bg-white/5 border-b border-white/5 px-4 py-3 flex items-center gap-4">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="text-xs text-white/40 font-medium flex-1 text-center mr-16">
          user@outray-cli
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-2 flex-1 overflow-y-auto">
        <p>
          <span className="text-green-400">➜</span>{" "}
          <span className="text-blue-400">~</span> {text}
          {step === 0 && (
            <span className="animate-pulse text-green-400 block w-2.5 h-5 bg-green-400/50 align-middle ml-1"></span>
          )}
        </p>

        {step >= 1 && (
          <p className="text-cyan-400">
            Connecting to OutRay{step === 1 ? dots : "..."}
          </p>
        )}

        {step >= 2 && (
          <p className="text-green-400">Linked to your local port 6967</p>
        )}

        {step >= 3 && (
          <div className="space-y-2">
            <p className="text-fuchsia-400">
              Tunnel ready: https://tunnel.outray.app
            </p>
            <p className="text-yellow-400">
              Keep this running to keep your tunnel active.
            </p>
            <div className="pt-4 space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3 text-xs md:text-sm">
                  <span className="text-white/50 w-16">{log.method}</span>
                  <span className="text-white/80 flex-1 truncate">{log.path}</span>
                  <span
                    className={
                      log.status >= 400
                        ? "text-red-400"
                        : log.status >= 300
                          ? "text-yellow-400"
                          : "text-green-400"
                    }
                  >
                    {log.status}
                  </span>
                  <span className="text-white/30 w-12 text-right">
                    {log.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <span className="animate-pulse text-green-400 inline-block w-2.5 h-5 bg-green-400/50 align-middle"></span>
        )}
      </div>
    </div>
  );
}
