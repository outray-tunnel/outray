import { useCallback } from "react";
import { useBlocker } from "@tanstack/react-router";

export function useUptimeUnsavedChanges(dirty: boolean) {
  // TanStack re-registers its history/unload listeners when this callback changes.
  // Keep typing in an already-dirty editor from rebuilding those listeners.
  const shouldBlockFn = useCallback(() => dirty, [dirty]);
  return useBlocker({
    shouldBlockFn,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
}
