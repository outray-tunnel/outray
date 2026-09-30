import { useBlocker } from "@tanstack/react-router";

export function useUptimeUnsavedChanges(dirty: boolean) {
  return useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
}
