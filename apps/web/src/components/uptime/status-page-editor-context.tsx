import { createContext, useContext } from "react";
import type { UptimeComponent, UptimeGroup, UptimeMonitor, UptimePage } from "./uptime-client";

export interface StatusPageEditorContextValue {
  orgSlug: string;
  page: UptimePage;
  groups: UptimeGroup[];
  standaloneComponents: UptimeComponent[];
  monitors: UptimeMonitor[];
  reload: () => void;
}

export const StatusPageEditorContext = createContext<StatusPageEditorContextValue | null>(null);

export function useStatusPageEditor() {
  const context = useContext(StatusPageEditorContext);
  if (!context) throw new Error("Status page editor is unavailable");
  return context;
}
