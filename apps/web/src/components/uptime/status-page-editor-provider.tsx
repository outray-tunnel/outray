import { useEffect, useReducer, useState, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "../arc/button/button";
import { UptimeDialog } from "./uptime-dialog";
import { StatusPageEditorContext, type StatusPageEditorContextValue } from "./status-page-editor-context";
import { appearanceDraftChanged, appearanceEditorReducer, createAppearanceState } from "./status-page-data";

/** The parent route owns appearance edits so changing sections never clears a draft. */
export function StatusPageEditorProvider({ children, ...value }: Omit<StatusPageEditorContextValue, "appearanceDraft" | "setAppearanceDraft" | "appearanceDirty" | "appearanceSaving" | "setAppearanceSaving" | "commitAppearance"> & { children: ReactNode }) {
  const [state, dispatch] = useReducer(appearanceEditorReducer, value.page, createAppearanceState);
  const appearanceDirty = appearanceDraftChanged(state.draft, state.baseline);
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  useEffect(() => { dispatch({ type: "server", page: value.page }); }, [value.page]);
  const editorPath = "/" + value.orgSlug + "/uptime/status-page";
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) => (appearanceDirty || appearanceSaving) && next.pathname !== editorPath && !next.pathname.startsWith(editorPath + "/"),
    enableBeforeUnload: appearanceDirty || appearanceSaving,
    withResolver: true,
  });
  useEffect(() => {
    // A completed save makes a pending departure safe; don't ask to discard already-saved changes.
    if (blocker.status === "blocked" && !appearanceDirty && !appearanceSaving) blocker.proceed();
  }, [blocker, appearanceDirty, appearanceSaving]);
  return <StatusPageEditorContext.Provider value={{ ...value, appearanceDraft: state.draft, setAppearanceDraft: (update) => dispatch({ type: "edit", update }), appearanceDirty, appearanceSaving, setAppearanceSaving, commitAppearance: (draft) => dispatch({ type: "commit", draft }) }}>
    {children}
    <UptimeDialog open={blocker.status === "blocked"} title="Discard appearance changes?" onClose={() => { if (!appearanceSaving) blocker.reset?.(); }} busy={appearanceSaving}
      footer={<><Button type="button" variant="secondary" size="sm" data-autofocus disabled={appearanceSaving} onClick={() => blocker.reset?.()}>Keep editing</Button><Button type="button" size="sm" disabled={appearanceSaving} onClick={() => { if (appearanceSaving) return; dispatch({ type: "discard" }); if (blocker.status === "blocked") blocker.proceed(); }}>Discard changes</Button></>}>
      <p className="text-[13px] leading-6 text-zinc-400">{appearanceSaving ? "Wait for your changes to finish saving before leaving." : "Your unsaved page name, description, and accent color will be lost. Changes stay in place when switching status-page tabs."}</p>
    </UptimeDialog>
  </StatusPageEditorContext.Provider>;
}
