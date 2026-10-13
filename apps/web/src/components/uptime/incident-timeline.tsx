import { IncidentRichContent } from "./incident-rich-editor";
import { incidentStagePresentation, type IncidentStage } from "./incident-stage-presentation";
import type { UptimeIncidentUpdate } from "./uptime-client";

export type IncidentTimelineEvent = {
  id: string;
  at: string;
  stage: IncidentStage;
  kind?: "update" | "detected" | "recovered";
  title?: string;
  description?: string;
  update?: Pick<UptimeIncidentUpdate, "bodyJson" | "note">;
};

/** The caller supplies the real, newest-first publication and source events. */
export function IncidentTimeline({ events }: { events: IncidentTimelineEvent[] }) {
  return <ol role="list" aria-label="Incident timeline, newest first" className="px-5 py-6 sm:px-6 sm:py-7">
    {events.map((event, index) => {
      const presentation = incidentStagePresentation[event.stage];
      const Icon = presentation.icon;
      const date = new Date(event.at);
      const validDate = Number.isFinite(date.getTime());
      const hasBody = Boolean(event.update?.note.trim() || event.update?.bodyJson);
      return <li key={event.id} data-incident-event={event.id} data-event-kind={event.kind ?? "update"} data-stage={event.stage}
        className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 pb-9 last:pb-0 sm:grid-cols-[136px_32px_minmax(0,1fr)] sm:gap-x-5">
        <div aria-hidden="true" className="relative col-start-1 row-span-3 row-start-1 sm:col-start-2">
          {index < events.length - 1 ? <span data-timeline-connector className="absolute -bottom-9 left-1/2 top-8 w-px -translate-x-1/2 bg-white/[0.12]" /> : null}
          <span data-timeline-marker className={`relative z-10 flex size-8 items-center justify-center rounded-full border border-current/15 ${presentation.className}`}>
            <Icon size={16} strokeWidth={1.7} />
          </span>
        </div>
        <div className="col-start-2 row-start-1 flex min-h-8 min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 sm:col-start-3">
          <h3 className="text-[13px] font-medium text-zinc-200">{event.title ?? presentation.label}</h3>
          {event.title ? <span className={`text-[11px] ${presentation.className.split(" ")[0]}`}>{presentation.label}</span> : null}
          {index === 0 ? <span className="rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[9px] leading-3 text-zinc-500">Latest<span className="sr-only"> event</span></span> : null}
        </div>
        <time dateTime={validDate ? date.toISOString() : undefined}
          className="col-start-2 row-start-2 mt-0.5 flex flex-wrap gap-x-2 text-[11px] leading-5 text-zinc-500 sm:col-start-1 sm:row-start-1 sm:mt-0.5 sm:block sm:text-right">
          <span className="sm:block sm:text-zinc-400">{validDate ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Date unavailable"}</span>
          {validDate ? <span className="tabular-nums sm:block">{date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
        </time>
        <div className="col-start-2 row-start-3 min-w-0 max-w-[80ch] sm:col-start-3 sm:row-start-2 sm:row-span-2">
          {hasBody && event.update ? <IncidentRichContent body={event.update.bodyJson} note={event.update.note} /> : null}
          {event.description ? <p className="mt-2 text-[12px] leading-6 text-zinc-400">{event.description}</p> : null}
        </div>
      </li>;
    })}
  </ol>;
}
