import { Check } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { SearchField } from "@/components/arc/search-field/search-field";
import { labelClass } from "./uptime-ui";
import type { UptimePageResponse } from "./uptime-client";
import { INCIDENT_COMPONENT_PAGE_SIZE, incidentComponentRows, incidentComponentWindow } from "./incident-component-data";

// Title, body and status changes in the form do not rebuild the component list.
// Search covers every component; only the current page enters the DOM.
export const IncidentComponentPicker = memo(function IncidentComponentPicker({ page, selected, onToggle, id, error }: {
  page?: UptimePageResponse;
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
  id: string;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const rows = useMemo(() => incidentComponentRows(page), [page]);
  const window = useMemo(() => incidentComponentWindow(rows, search, pageIndex), [rows, search, pageIndex]);
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  return <fieldset>
    <legend className={`${labelClass} mb-2`}>Affected components <span className="ml-1 font-normal text-zinc-500">{selected.length ? `${selected.length} selected` : ""}</span></legend>
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]">
      <div className="outray-arc-requests-search border-b border-white/[0.07] p-2"><SearchField id={id} appearance="workspace" value={search} onValueChange={(value) => { setSearch(value); setPageIndex(0); }} label="Find a component" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} placeholder="Find a component…" /></div>
      <div className="max-h-40 overflow-y-auto p-1.5">
        {window.groups.map((group) => <div key={group.id} className="mb-1.5 last:mb-0"><p className="px-2 pb-1 pt-1.5 text-[10px] text-zinc-500">{group.name}</p>{group.components.map((component) => <label key={component.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.04] motion-reduce:transition-none"><input type="checkbox" className="peer sr-only" checked={selectedIds.has(component.id)} onChange={(event) => onToggle(component.id, event.target.checked)} /><span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-white/20 text-transparent transition-colors peer-checked:border-zinc-300 peer-checked:bg-zinc-200 peer-checked:text-zinc-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-zinc-500 motion-reduce:transition-none"><Check size={11} strokeWidth={2} /></span><span className="min-w-0 flex-1 truncate">{component.name}</span>{!component.visible && <span className="text-[10px] text-zinc-500">Hidden</span>}</label>)}</div>)}
        {!window.groups.length && <p className="px-2 py-4 text-xs text-zinc-500">No components match your search.</p>}
      </div>
      {window.total > INCIDENT_COMPONENT_PAGE_SIZE && <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-2 py-1.5">
        <span role="status" className="text-[11px] text-zinc-500">{window.start + 1}–{window.end} of {window.total} components</span>
        <div className="flex gap-1"><Button type="button" variant="ghost" size="sm" disabled={window.currentPage === 0} onClick={() => setPageIndex(window.currentPage - 1)} aria-label="Previous components">Previous</Button><Button type="button" variant="ghost" size="sm" disabled={window.end >= window.total} onClick={() => setPageIndex(window.currentPage + 1)} aria-label="Next components">Next</Button></div>
      </div>}
    </div>
    {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-rose-300">{error}</p>}
  </fieldset>;
});
