/** Coalesce bar-to-bar pointer events without briefly showing the period total. */
export function createUsageHoverScheduler({
  requestFrame,
  cancelFrame,
  onInspect,
}: {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
  onInspect: (index: number | null) => void;
}) {
  let frame: number | null = null;
  let pendingIndex: number | null = null;

  return {
    inspect(index: number | null) {
      pendingIndex = index;
      if (frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        onInspect(pendingIndex);
      });
    },
    cancel() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      pendingIndex = null;
    },
  };
}
