import type { UptimePage } from "./uptime-client";

export interface StatusPageAppearanceDraft { name: string; description: string; accentColor: string }
export interface AppearanceEditorState { draft: StatusPageAppearanceDraft; baseline: StatusPageAppearanceDraft; latest: StatusPageAppearanceDraft }
type AppearanceAction =
  | { type: "edit"; update: StatusPageAppearanceDraft | ((draft: StatusPageAppearanceDraft) => StatusPageAppearanceDraft) }
  | { type: "server"; page: UptimePage }
  | { type: "commit"; draft: StatusPageAppearanceDraft }
  | { type: "discard" };

export const statusPageAppearance = (page: UptimePage): StatusPageAppearanceDraft => ({ name: page.name, description: page.description || "", accentColor: page.accentColor });
export const appearanceDraftChanged = (draft: StatusPageAppearanceDraft, baseline: StatusPageAppearanceDraft) => draft.name !== baseline.name || draft.description !== baseline.description || draft.accentColor !== baseline.accentColor;
export function createAppearanceState(page: UptimePage): AppearanceEditorState {
  const appearance = statusPageAppearance(page);
  return { draft: appearance, baseline: appearance, latest: appearance };
}
export function appearanceEditorReducer(state: AppearanceEditorState, action: AppearanceAction): AppearanceEditorState {
  switch (action.type) {
    case "edit": return { ...state, draft: typeof action.update === "function" ? action.update(state.draft) : action.update };
    case "server": return appearanceDraftChanged(state.draft, state.baseline) ? { ...state, latest: statusPageAppearance(action.page) } : createAppearanceState(action.page);
    case "commit": return { ...state, baseline: action.draft, latest: action.draft };
    case "discard": return { draft: state.latest, baseline: state.latest, latest: state.latest };
  }
}
