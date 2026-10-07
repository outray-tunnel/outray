import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { UptimeComponent, UptimeGroup, UptimeMonitor, UptimePage } from "./uptime-client";
import type { StatusPageAppearanceDraft } from "./status-page-data";

export interface StatusPageEditorContextValue {
  orgSlug: string;
  page: UptimePage;
  groups: UptimeGroup[];
  standaloneComponents: UptimeComponent[];
  monitors: UptimeMonitor[];
  monitorsLoaded: boolean;
  reload: () => void;
  canManage: boolean;
  appearanceDraft: StatusPageAppearanceDraft;
  setAppearanceDraft: Dispatch<SetStateAction<StatusPageAppearanceDraft>>;
  appearanceDirty: boolean;
  appearanceSaving: boolean;
  setAppearanceSaving: Dispatch<SetStateAction<boolean>>;
  commitAppearance: (draft: StatusPageAppearanceDraft) => void;
}

export const StatusPageEditorContext = createContext<StatusPageEditorContextValue | null>(null);

export function useStatusPageEditor() {
  const context = useContext(StatusPageEditorContext);
  if (!context) throw new Error("Status page editor is unavailable");
  return context;
}
