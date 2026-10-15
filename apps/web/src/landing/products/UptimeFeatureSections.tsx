import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import Activity03Icon from "@outray/icons/stroke/Activity03Icon";
import Alert02Icon from "@outray/icons/stroke/Alert02Icon";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import CheckmarkCircle02Icon from "@outray/icons/stroke/CheckmarkCircle02Icon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import Notification02Icon from "@outray/icons/stroke/Notification02Icon";
import Search01Icon from "@outray/icons/stroke/Search01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import styles from "./UptimeFeatureSections.module.css";

export const UPTIME_INCIDENT_STAGES = [
  {
    id: "investigating", label: "Investigating", cue: "Start with what you know.", color: "#edb96d", icon: Search01Icon,
    time: "09:41", dateTime: "2026-10-15T09:41:00Z", title: "We’re looking into it.",
    message: "We’re investigating errors affecting checkout. The dashboard and public API remain available.",
    evidenceTitle: "Failure threshold reached", evidence: "3 consecutive failures", response: "GET /health · HTTP 503", state: "Down",
  },
  {
    id: "identified", label: "Identified", cue: "Explain what’s changing.", color: "#b697f4", icon: Activity03Icon,
    time: "09:48", dateTime: "2026-10-15T09:48:00Z", title: "The cause is identified.",
    message: "We’ve identified the checkout dependency causing the errors. A fix is in progress.",
    evidenceTitle: "Impact confirmed", evidence: "Checkout affected", response: "Dashboard and public API available", state: "Down",
  },
  {
    id: "resolved", label: "Resolved", cue: "Close the loop, clearly.", color: "#70d7b3", icon: CheckmarkCircle02Icon,
    time: "10:06", dateTime: "2026-10-15T10:06:00Z", title: "Back to business.",
    message: "Checkout is operating normally again. Recovery checks are passing. Thank you for your patience.",
    evidenceTitle: "Recovery confirmed", evidence: "2 consecutive successes", response: "GET /health · HTTP 200", state: "Up",
  },
] as const;

type HistoryState = "operational" | "incident" | "unknown";

function componentHistory(incidentDays: readonly number[]): HistoryState[] {
  return Array.from({ length: 90 }, (_, index) => index < 8 ? "unknown" : incidentDays.includes(index) ? "incident" : "operational");
}

export const UPTIME_PUBLIC_COMPONENTS = [
  { name: "Public API", history: componentHistory([64]) },
  { name: "Dashboard", history: componentHistory([]) },
  { name: "Checkout", history: componentHistory([64, 65]) },
] as const;

export function uptimeIncidentIndexFromKey(current: number, key: string): number | null {
  if (key === "ArrowDown" || key === "ArrowRight") return (current + 1) % UPTIME_INCIDENT_STAGES.length;
  if (key === "ArrowUp" || key === "ArrowLeft") return (current + UPTIME_INCIDENT_STAGES.length - 1) % UPTIME_INCIDENT_STAGES.length;
  if (key === "Home") return 0;
  if (key === "End") return UPTIME_INCIDENT_STAGES.length - 1;
  return null;
}

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={17} strokeWidth={1.6} aria-hidden="true" />;
}

export function UptimeIncidentFlow() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const stage = UPTIME_INCIDENT_STAGES[selected];

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = uptimeIncidentIndexFromKey(index, event.key);
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return <section className={`${styles.section} ${styles.incidentSection}`} aria-labelledby="uptime-incident-title">
    <div className={styles.incidentCopy}>
      <h2 className={styles.title} id="uptime-incident-title">When something breaks,<br />clarity shouldn’t.</h2>
      <p className={styles.lead}>Review the evidence. Publish the update. Keep the timeline clear.</p>
      <div className={styles.incidentSteps} role="tablist" aria-label="Explore the incident timeline" aria-orientation="vertical">
        {UPTIME_INCIDENT_STAGES.map((entry, index) => <button
          type="button"
          role="tab"
          className={styles.incidentStep}
          id={`${id}-step-${entry.id}`}
          aria-controls={`${id}-incident-panel`}
          aria-selected={selected === index}
          tabIndex={selected === index ? 0 : -1}
          ref={(element) => { buttons.current[index] = element; }}
          onClick={() => setSelected(index)}
          onFocus={() => setSelected(index)}
          onKeyDown={(event) => handleKey(event, index)}
          key={entry.id}
        ><span className={styles.stepIcon} style={{ color: entry.color }} aria-hidden="true"><HugeiconsIcon icon={entry.icon} size={20} strokeWidth={1.5} /></span><span><strong>{entry.label}</strong><span>{entry.cue}</span></span><span className={styles.stepArrow} aria-hidden="true"><Arrow /></span></button>)}
      </div>
      <Link className={styles.textLink} to="/docs/$" params={{ _splat: "uptime/incidents" }}>Explore incidents<Arrow /></Link>
    </div>
    <div className={styles.incidentVisual} role="tabpanel" id={`${id}-incident-panel`} aria-labelledby={`${id}-step-${stage.id}`} tabIndex={0}>
      <div className={styles.incidentTopline}><span><HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.5} aria-hidden="true" />Checkout disruption</span><span>October 15</span></div>
      <div className={styles.updateContent} key={stage.id}>
        <div className={styles.updateTopline}><span className={styles.stagePill} style={{ color: stage.color, backgroundColor: `${stage.color}10` }}><i style={{ backgroundColor: stage.color }} aria-hidden="true" />{stage.label}</span><time dateTime={stage.dateTime}>{stage.time} UTC</time></div>
        <h3>{stage.title}</h3><p className={styles.updateMessage}>{stage.message}</p>
        <div className={styles.affectedComponent}><span>Affected component</span><span><i style={{ backgroundColor: stage.color }} aria-hidden="true" />Checkout</span></div>
        <div className={styles.evidenceCard}><span className={styles.evidenceIcon} style={{ color: stage.color }} aria-hidden="true"><HugeiconsIcon icon={stage.icon} size={22} strokeWidth={1.5} /></span><div><span>{stage.evidenceTitle}</span><strong>{stage.evidence}</strong><code>{stage.response}</code></div><span className={styles.monitorState} style={{ color: stage.color }}>{stage.state}</span></div>
      </div>
      <div className={styles.updateFooter}><span className={styles.teamMark} aria-hidden="true">a</span><span>Acme team</span><span><HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={1.8} aria-hidden="true" />Published update</span></div>
    </div>
  </section>;
}

export function UptimeStatusPagePreview() {
  return <figure className={styles.statusPreview} aria-label="Acme public status page with component health and 90 days of observed history">
    <div className={styles.domainBar}><HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.5} aria-hidden="true" /><span>status.acme.example</span><span className={styles.domainConnected}><HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={1.8} aria-hidden="true" />Custom domain</span></div>
    <div className={styles.publicPage}>
      <div className={styles.publicBrand}><span aria-hidden="true">a</span><span>Acme status</span></div>
      <div className={styles.operationalBanner}><span className={styles.operationalIcon} aria-hidden="true"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={26} strokeWidth={1.4} /></span><div><h3>All systems operational.</h3><p>Everything you rely on, in one place.</p></div></div>
      <div className={styles.publicComponents}>
        {UPTIME_PUBLIC_COMPONENTS.map((component) => <div className={styles.publicComponent} key={component.name}>
          <div className={styles.componentTopline}><span>{component.name}</span><span><i aria-hidden="true" />Operational</span></div>
          <div className={styles.historyBars} role="img" aria-label={`${component.name}: 90 day history, including ${component.history.filter((state) => state === "incident").length} incident days and 8 days without observations`}>{component.history.map((state, index) => <i data-state={state} key={index} />)}</div>
        </div>)}
      </div>
      <div className={styles.historyRange}><span>90 days ago</span><span>Today</span></div>
      <div className={styles.historyLegend} aria-label="History legend"><span><i data-state="operational" aria-hidden="true" />Operational</span><span><i data-state="incident" aria-hidden="true" />Incident</span><span><i data-state="unknown" aria-hidden="true" />No data</span></div>
      <div className={styles.publicSubscriptions}><HugeiconsIcon icon={Notification02Icon} size={14} strokeWidth={1.5} aria-hidden="true" /><span>Email updates, for the people who subscribe.</span></div>
    </div>
  </figure>;
}

function UptimeStatusPageSection() {
  return <section className={`${styles.section} ${styles.statusSection}`} aria-labelledby="uptime-status-title">
    <UptimeStatusPagePreview />
    <div className={styles.statusCopy}><h2 className={styles.title} id="uptime-status-title">A straight answer.<br />On your own domain.</h2><p className={styles.lead}>Give customers a place to check before they open a ticket.</p><p className={styles.supportingCopy}>Your branding. Your services. A clear history of what happened.</p><div className={styles.statusDetails}><span><HugeiconsIcon icon={Globe02Icon} size={18} strokeWidth={1.5} aria-hidden="true" />Your custom subdomain</span><span><HugeiconsIcon icon={Activity03Icon} size={18} strokeWidth={1.5} aria-hidden="true" />90 days of public history</span></div><Link className={styles.textLink} to="/docs/$" params={{ _splat: "uptime/status-page" }}>Explore status pages<Arrow /></Link></div>
  </section>;
}

export function UptimeNotificationPreview() {
  return <div className={styles.notificationPreview} role="group" aria-label="Team notification for a confirmed monitor failure">
    <div className={styles.notificationHeader}><span><HugeiconsIcon icon={Notification02Icon} size={17} strokeWidth={1.5} aria-hidden="true" />OutRay Uptime</span><span>Team notification</span></div>
    <div className={styles.notificationBody}><span className={styles.notificationAlert} aria-hidden="true"><HugeiconsIcon icon={Alert02Icon} size={24} strokeWidth={1.4} /></span><div><h3>Checkout API is Down</h3><p>3 consecutive checks failed.</p><code>GET /health · HTTP 503</code></div></div>
    <div className={styles.notificationRecovery}><HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.5} aria-hidden="true" /><span>Recovery notifications, too.</span></div>
    <div className={styles.channelDestinations} aria-label="Supported team destinations"><span>Email</span><span>Slack</span><span>Discord</span></div>
  </div>;
}

function UptimeNotificationsSection() {
  return <section className={`${styles.section} ${styles.notificationsSection}`} aria-labelledby="uptime-notifications-title"><div><h2 className={styles.title} id="uptime-notifications-title">A heads-up.<br />In the right place.</h2><p className={styles.lead}>Send confirmed Down and recovery notifications to email, Slack, or Discord.</p><p className={styles.supportingCopy}>Keep the investigation private. Publish a written update when you’re ready to notify status-page subscribers.</p><Link className={styles.textLink} to="/docs/$" params={{ _splat: "uptime/notifications" }}>Explore notifications<Arrow /></Link></div><UptimeNotificationPreview /></section>;
}

function UptimeGetStartedSection() {
  return <section className={styles.startSection} aria-labelledby="uptime-start-title"><h2 id="uptime-start-title">Stay ahead of<br />“is it down?”</h2><p>Monitor an endpoint. Keep your team and customers in the loop.</p><div className={styles.startActions}><Link className={styles.primaryButton} to="/signup" data-track="cta" data-track-label="uptime-bottom-get-started">Start monitoring<Arrow /></Link><Link className={styles.textLink} to="/docs/$" params={{ _splat: "uptime" }} data-track="cta" data-track-label="uptime-bottom-documentation">Read the docs<Arrow /></Link></div></section>;
}

export function UptimeFeatureSections() {
  return <><UptimeIncidentFlow /><UptimeStatusPageSection /><UptimeNotificationsSection /><UptimeGetStartedSection /></>;
}
