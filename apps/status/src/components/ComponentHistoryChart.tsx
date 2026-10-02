import { useEffect, useId, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from "recharts";
import type { PublicComponentHistoryDay, PublicState } from "../lib/status-data";
import { formatDuration } from "../lib/format-duration";
import "./ComponentHistoryChart.css";

interface Props {
  name: string;
  history: PublicComponentHistoryDay[];
  incidentBasePath: string;
}

type ChartDay = PublicComponentHistoryDay & { height: number };
type FloatingTooltip = { index: number; left: number; top?: number; bottom?: number; maxHeight: number };

const TOOLTIP_EVENT = "outray:component-history-tooltip";
let activeTooltipOwner: string | null = null;

const colors: Record<PublicState, string> = {
  operational: "#10b981",
  degraded: "#fbbf24",
  outage: "#fb7185",
  unknown: "#3f3f46",
};

const dateLabel = (date: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "2-digit", year: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T00:00:00Z`));

function StatusIcon({ state }: { state: PublicState }) {
  if (state === "operational") return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="m6 10 2.6 2.6L14 7" fill="none" stroke="#101514" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (state === "unknown") return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 5.5v5m0 3v.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.3 2.8a2 2 0 0 1 3.4 0l7.6 13.1a2 2 0 0 1-1.7 3H2.4a2 2 0 0 1-1.7-3Z" fill="currentColor" /><path d="M10 7v5m0 3v.3" fill="none" stroke="#101514" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function HistoryTooltip({ day, incidentBasePath, position, tooltipRef }: {
  day: PublicComponentHistoryDay;
  incidentBasePath: string;
  position: FloatingTooltip;
  tooltipRef: RefObject<HTMLDivElement | null>;
}) {
  const hasReport = day.incidents.length > 0;
  const detectedDowntime = day.detectedFailureMinutes > 0;
  const below = position.top !== undefined;
  return <div className={`component-chart-tooltip-hit-area component-chart-tooltip-hit-area--${below ? "below" : "above"}`} ref={tooltipRef}
    style={{ left: position.left, top: below ? position.top! - 12 : undefined,
      bottom: below ? undefined : position.bottom! - 12, maxHeight: position.maxHeight + 12 }}>
    <div className="component-chart-tooltip" role="tooltip">
      <div className="component-chart-tooltip-date">{dateLabel(day.date)}</div>
      <div className={`component-chart-tooltip-body component-chart-tooltip-body--${day.state}`}>
        <StatusIcon state={day.state} />
        <div className="component-chart-tooltip-detail">
          {hasReport ? <>
            <span className="incident-duration">
              {day.incidentKind === "downtime" ? "Downtime" : "Incident"} {formatDuration(day.incidentMinutes)}
            </span>
            {day.incidents.map((incident) => <a key={incident.id} href={`${incidentBasePath}/${encodeURIComponent(incident.id)}`}>
              {incident.title} <span aria-hidden="true">↗</span>
            </a>)}
          </> : detectedDowntime ? <>
            <span className="incident-duration">Downtime detected · about {formatDuration(day.detectedFailureMinutes)}</span>
            <small>No incident report</small>
          </> : <span>{day.state === "unknown" ? "No monitoring data" : "No incidents"}</span>}
        </div>
      </div>
    </div>
  </div>;
}

export default function ComponentHistoryChart({ name, history, incidentBasePath }: Props) {
  const [mounted, setMounted] = useState(false);
  const [tooltip, setTooltip] = useState<FloatingTooltip | null>(null);
  const owner = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const dismiss = () => {
      setTooltip(null);
      if (activeTooltipOwner === owner) activeTooltipOwner = null;
    };
    const closeOtherTooltip = (event: Event) => {
      if ((event as CustomEvent<string>).detail === owner) return;
      setTooltip(null);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (activeTooltipOwner !== owner) return;
      const target = event.target;
      if (target instanceof Node && (plotRef.current?.contains(target) || tooltipRef.current?.contains(target))) return;
      dismiss();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (activeTooltipOwner !== owner) return;
      const target = event.target;
      if (target instanceof Node && (plotRef.current?.contains(target) || tooltipRef.current?.contains(target))) return;
      dismiss();
    };
    window.addEventListener(TOOLTIP_EVENT, closeOtherTooltip);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", dismiss);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("visibilitychange", dismiss);
    return () => {
      window.removeEventListener(TOOLTIP_EVENT, closeOtherTooltip);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", dismiss);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", dismiss);
      if (activeTooltipOwner === owner) activeTooltipOwner = null;
    };
  }, [owner]);

  const showTooltip = (event: ReactMouseEvent) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || history.length === 0) return;
    const index = Math.max(0, Math.min(history.length - 1,
      Math.floor((event.clientX - rect.left) / rect.width * history.length)));
    const day = history[index];
    if (!day) return;
    if (activeTooltipOwner !== owner) {
      activeTooltipOwner = owner;
      window.dispatchEvent(new CustomEvent(TOOLTIP_EVENT, { detail: owner }));
    }
    const width = Math.min(400, window.innerWidth - 32);
    const left = Math.max(16, Math.min(event.clientX - width / 2, window.innerWidth - width - 16));
    const gap = 12;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const placeBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    setTooltip({
      index,
      left,
      top: placeBelow ? rect.bottom + gap : undefined,
      bottom: placeBelow ? undefined : window.innerHeight - rect.top + gap,
      maxHeight: Math.max(0, (placeBelow ? spaceBelow : spaceAbove) - gap),
    });
  };
  const data: ChartDay[] = history.map((day) => ({ ...day, height: 1 }));

  return <div className="component-chart" aria-label={`${name}: 90-day component status history`}>
    <div className="component-chart-plot" ref={plotRef} onMouseMove={showTooltip}>
      {mounted ? <ResponsiveContainer width="100%" height={32}>
        <BarChart data={data} barCategoryGap={0.5} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <Bar dataKey="height" radius={[1, 1, 1, 1]} isAnimationActive={false}>
            {data.map((day, index) => <Cell key={day.date} fill={colors[day.state]} opacity={tooltip?.index === index ? 0.62 : 1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer> : <div className="component-chart-placeholder" aria-hidden="true">
        {data.map((day) => <span key={day.date} className={`component-chart-placeholder-day component-chart-placeholder-day--${day.state}`} />)}
      </div>}
    </div>
    {mounted && tooltip && data[tooltip.index] && createPortal(
      <HistoryTooltip day={data[tooltip.index]} incidentBasePath={incidentBasePath}
        position={tooltip} tooltipRef={tooltipRef} />,
      document.body,
    )}
  </div>;
}
