import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from "react";
import type { HeroBeamCanvasProps } from "./HeroBeamCanvas";

export function HeroBeam() {
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  const [view, setView] = useState({ motionAllowed: false, active: false });
  const [Scene, setScene] = useState<ComponentType<HeroBeamCanvasProps> | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => { setReady(false); setFailed(true); }, []);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      if (media.matches) setReady(false);
      setView({ motionAllowed: !media.matches, active: visible && !document.hidden && !media.matches });
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    if (observer) observer.observe(element);
    else {
      visible = true;
      update();
    }
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer?.disconnect();
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!view.active || Scene || failed) return;
    let cancelled = false;
    // Keep Three.js out of the initial page/SSR bundle. The original beam is
    // only needed once the hero is visible and the visitor permits motion.
    void import("./HeroBeamCanvas").then(({ default: LoadedScene }) => {
      if (!cancelled) setScene(() => LoadedScene);
    }).catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; };
  }, [view.active, Scene, failed, onError]);

  const showScene = Scene !== null && view.motionAllowed && !failed;

  return (
    <div ref={container} className="group/beam pointer-events-none absolute inset-0 z-0 overflow-hidden" data-ready={showScene && ready ? "true" : undefined} aria-hidden="true">
      <svg className="absolute inset-0 size-full opacity-100 transition-opacity duration-500 group-data-[ready=true]/beam:opacity-0 motion-reduce:transition-none min-[768px]:-translate-x-[10%]" viewBox="0 0 1400 780" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id={`${id}-light`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.16" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.065" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id={`${id}-softness`} x="-20%" y="-30%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <g fill={`url(#${id}-light)`} filter={`url(#${id}-softness)`}>
          <path d="M-120 330 1250 75 1250 705 -120 450Z" />
          <path d="M-120 350 1250 210 1250 570 -120 430Z" opacity="0.65" />
          <path d="M-120 375 1250 300 1250 480 -120 405Z" opacity="0.5" />
        </g>
        <g fill="#ffffff" opacity="0.3">
          <circle cx="240" cy="308" r="1.2" /><circle cx="380" cy="430" r="1" />
          <circle cx="535" cy="260" r="1.1" /><circle cx="760" cy="318" r="1.4" />
          <circle cx="920" cy="515" r="1" /><circle cx="1140" cy="410" r="1.1" />
          <circle cx="660" cy="470" r="1.2" /><circle cx="1090" cy="570" r="1" />
        </g>
      </svg>
      {showScene ? <Scene active={view.active} onReady={onReady} onError={onError} /> : null}
    </div>
  );
}
