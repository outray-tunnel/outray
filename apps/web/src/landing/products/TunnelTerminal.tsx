import { useEffect, useId, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import PauseIcon from "@outray/icons/stroke/PauseIcon";
import PlayIcon from "@outray/icons/stroke/PlayIcon";

// The example traffic mirrors the terminal on OutRay's original landing page.
export const SAMPLE_TUNNEL_LOGS = [
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
] as const;

type TunnelLog = (typeof SAMPLE_TUNNEL_LOGS)[number] & { id: number };
const VISIBLE_LOG_COUNT = 8;

export function createInitialTunnelLogs(): TunnelLog[] {
  return SAMPLE_TUNNEL_LOGS.slice(0, VISIBLE_LOG_COUNT).map((log, id) => ({ ...log, id }));
}

export function advanceTunnelLogs(logs: readonly TunnelLog[]): TunnelLog[] {
  const id = (logs.at(-1)?.id ?? -1) + 1;
  const nextLog = SAMPLE_TUNNEL_LOGS[id % SAMPLE_TUNNEL_LOGS.length];
  return [...logs.slice(-(VISIBLE_LOG_COUNT - 1)), { ...nextLog, id }];
}

export function TunnelTerminalSection() {
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const [logs, setLogs] = useState(createInitialTunnelLogs);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motionQuery.matches);
    const updateVisibility = () => setDocumentVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    motionQuery.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);

    const element = sectionRef.current;
    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.15 });
    if (observer && element) observer.observe(element);
    else setOnScreen(true);

    return () => {
      motionQuery.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer?.disconnect();
    };
  }, []);

  const streaming = !paused && reducedMotion === false && onScreen && documentVisible;

  useEffect(() => {
    if (!streaming) return;
    const interval = window.setInterval(() => setLogs(advanceTunnelLogs), 1200);
    return () => window.clearInterval(interval);
  }, [streaming]);

  return (
    <section ref={sectionRef} className="relative border-t border-[#202020] py-[86px_112px] max-[820px]:py-[65px_80px] max-[540px]:py-[52px_65px]" aria-labelledby={titleId}>
      <div className="mb-[38px] text-center max-[540px]:mb-[26px]">
        <h2 className="text-[clamp(29px,3.1vw,43px)] leading-[1.2] font-medium tracking-[-0.042em] text-[#f7f7f7] max-[540px]:text-[clamp(25px,6vw,32px)]" id={titleId}>Every request. As it arrives.</h2>
      </div>

      <div className="mx-auto max-w-[1000px] overflow-hidden rounded-2xl border border-[#3b3b3b] bg-[#090909] max-[540px]:rounded-xl" role="region" aria-label="Example tunnel terminal">
        <div className="grid min-h-[55px] grid-cols-[1fr_auto_1fr] items-center border-b border-[#363636] bg-[#191919] px-[22px] max-[540px]:min-h-11 max-[540px]:px-3.5">
          <span className="flex items-center gap-[7px] max-[540px]:gap-1 [&>i]:size-[9px] [&>i]:rounded-full [&>i]:border [&>i]:border-[#484848] [&>i]:bg-[#2a2a2a] max-[540px]:[&>i]:size-1.5" aria-hidden="true"><i /><i /><i /></span>
          <span className="font-mono text-[11px] text-[#b8b8bd] max-[540px]:text-[9px]">user@outray-cli</span>
          <span className="justify-self-end font-mono text-[10px] text-[#aaa] max-[540px]:text-[8px]">Example</span>
        </div>

        <div className="px-[38px] pt-8 pb-[23px] font-mono text-[13px] leading-[1.7] max-[820px]:px-[25px] max-[540px]:px-4 max-[540px]:pt-[22px] max-[540px]:pb-[17px] max-[540px]:text-[10px]">
          <div className="mb-[26px] grid gap-[7px] max-[540px]:mb-[18px] max-[540px]:gap-1.5 [&>p]:m-0">
            <p className="flex items-center gap-3 pb-2 text-[15px] text-[#f5f5f5] max-[540px]:gap-[9px] max-[540px]:text-xs [&>code]:font-[inherit] [&>span:first-child]:text-[#c084fc] [&>span:nth-child(2)]:text-[#aaa]"><span aria-hidden="true">➜</span><span aria-hidden="true">~</span><code>npx outray 3000</code></p>
            <p className="text-[#aaa]">Connecting to OutRay...</p>
            <p className="text-[#d1d1d1]">Linked to your local port 3000</p>
            <p className="text-[#bbb] [&>span]:text-[#f1f1f1]">Tunnel ready: <span>https://demo.outray.app</span></p>
            <p className="text-[11px] text-[#aaa] max-[540px]:text-[8px]">Keep this running to keep your tunnel active.</p>
          </div>

          <table className="w-full table-fixed border-collapse font-[inherit] [&_th]:h-[33px] [&_th]:border-b [&_th]:border-[#242424] [&_th]:p-0 [&_th]:text-left [&_th]:text-[10px] [&_th]:font-normal [&_th]:text-[#999] max-[540px]:[&_th]:text-[8px]" aria-label="Sample HTTP requests" aria-live="off">
            <thead><tr><th className="w-20 max-[540px]:w-[47px]" scope="col">Method</th><th scope="col">Path</th><th className="w-16 max-[540px]:w-9" scope="col">Status</th><th className="w-[65px] text-right! max-[540px]:w-10" scope="col">Time</th></tr></thead>
            <tbody>
              {logs.map((log, index) => (
                <tr className={`h-[35px] max-[540px]:h-[29px] [&>td]:h-[35px] [&>td]:p-0 [&>td]:whitespace-nowrap max-[540px]:[&>td]:h-[29px] ${log.id >= VISIBLE_LOG_COUNT && index === logs.length - 1 ? "animate-[request-arrival_320ms_ease-out] motion-reduce:animate-none" : ""}`} key={log.id} data-new={log.id >= VISIBLE_LOG_COUNT && index === logs.length - 1}>
                  <td className="text-[11px] text-[#999] max-[540px]:text-[9px]">{log.method}</td>
                  <td className="overflow-hidden pr-3! text-ellipsis text-[#e4e4e4] max-[540px]:pr-[5px]!">{log.path}</td>
                  <td className={`text-xs max-[540px]:text-[9px] ${log.status >= 300 ? "text-[#facc15]" : "text-[#4ade80]"}`}>{log.status}</td>
                  <td className="text-right text-[11px] text-[#999] tabular-nums max-[540px]:text-[9px]">{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="mt-[11px] block h-3.5 w-[7px] bg-[#b66dff] opacity-90" aria-hidden="true" />
        </div>

        <div className="flex min-h-[49px] items-center justify-between gap-3 border-t border-[#292929] px-[22px] py-2 text-[11px] text-[#999] max-[540px]:min-h-[46px] max-[540px]:gap-1.5 max-[540px]:px-[13px] max-[540px]:text-[8px]">
          <span>Illustrative traffic · not a live tunnel.</span>
          {reducedMotion === true ? <span className="inline-flex min-h-[33px] items-center text-[#999] max-[540px]:text-[8px]">Static preview</span> : (
            <button type="button" className="inline-flex min-h-[33px] min-w-20 items-center justify-center gap-[7px] rounded-[7px] border-0 bg-transparent px-[9px] py-[5px] font-[inherit] text-[11px] text-[#b3b3b3] transition-[color,background] duration-150 hover:bg-[#252525] hover:text-[#eee] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#bdbdbd] motion-reduce:transition-none max-[540px]:min-w-[68px] max-[540px]:text-[10px]" aria-label={paused ? "Resume request stream" : "Pause request stream"} onClick={() => setPaused((value) => !value)}>
              <HugeiconsIcon icon={paused ? PlayIcon : PauseIcon} size={14} strokeWidth={1.5} aria-hidden="true" />{paused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
