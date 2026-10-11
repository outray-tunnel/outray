import { useEffect, useId, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import PauseIcon from "@outray/icons/stroke/PauseIcon";
import PlayIcon from "@outray/icons/stroke/PlayIcon";
import styles from "./tunnel-terminal.module.css";

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
    <section ref={sectionRef} className={styles.section} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <h2 className={styles.title} id={titleId}>Every request. As it arrives.</h2>
      </div>

      <div className={styles.terminal} role="region" aria-label="Example tunnel terminal">
        <div className={styles.header}>
          <span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span>
          <span className={styles.windowTitle}>user@outray-cli</span>
          <span className={styles.example}>Example</span>
        </div>

        <div className={styles.body}>
          <div className={styles.output}>
            <p className={styles.command}><span aria-hidden="true">➜</span><span aria-hidden="true">~</span><code>npx outray 3000</code></p>
            <p className={styles.connecting}>Connecting to OutRay...</p>
            <p className={styles.connected}>Linked to your local port 3000</p>
            <p className={styles.ready}>Tunnel ready: <span>https://demo.outray.app</span></p>
            <p className={styles.note}>Keep this running to keep your tunnel active.</p>
          </div>

          <table className={styles.requests} aria-label="Sample HTTP requests" aria-live="off">
            <thead><tr><th scope="col">Method</th><th scope="col">Path</th><th scope="col">Status</th><th scope="col">Time</th></tr></thead>
            <tbody>
              {logs.map((log, index) => (
                <tr className={styles.request} key={log.id} data-new={log.id >= VISIBLE_LOG_COUNT && index === logs.length - 1}>
                  <td className={styles.method}>{log.method}</td>
                  <td className={styles.path}>{log.path}</td>
                  <td className={log.status >= 300 ? styles.redirect : styles.success}>{log.status}</td>
                  <td className={styles.time}>{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className={styles.cursor} aria-hidden="true" />
        </div>

        <div className={styles.footer}>
          <span>Illustrative traffic · not a live tunnel.</span>
          {reducedMotion === true ? <span className={styles.staticPreview}>Static preview</span> : (
            <button type="button" className={styles.streamControl} aria-label={paused ? "Resume request stream" : "Pause request stream"} onClick={() => setPaused((value) => !value)}>
              <HugeiconsIcon icon={paused ? PlayIcon : PauseIcon} size={14} strokeWidth={1.5} aria-hidden="true" />{paused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
