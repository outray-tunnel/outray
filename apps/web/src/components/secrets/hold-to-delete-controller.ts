type HoldSource = `pointer:${number}` | "keyboard:Enter" | "keyboard: ";

interface HoldToDeleteControllerOptions {
  now: () => number;
  schedule: (callback: () => void, delay: number) => unknown;
  cancelScheduled: (handle: unknown) => void;
  onProgress: (progress: number) => void;
  onConfirm: () => void;
  durationMs?: number;
}

/** The clock is injectable so accidental clicks, interrupted holds, and stale
 * callbacks can be verified without relying on real timers or the DOM. */
export function createHoldToDeleteController({
  now, schedule, cancelScheduled, onProgress, onConfirm, durationMs = 5000,
}: HoldToDeleteControllerOptions) {
  const duration = Math.max(1, durationMs);
  let source: HoldSource | null = null;
  let startedAt = 0;
  let completed = false;
  let generation = 0;
  let scheduled: unknown = null;

  function cancel(matchingSource?: HoldSource) {
    if (matchingSource !== undefined && source !== matchingSource) return;
    generation++;
    if (scheduled !== null) cancelScheduled(scheduled);
    scheduled = null;
    source = null;
    completed = false;
    onProgress(0);
  }

  function begin(nextSource: HoldSource) {
    // A second input (or keyboard auto-repeat) never extends or duplicates a hold.
    if (source !== null) return;
    source = nextSource;
    startedAt = now();
    completed = false;
    const currentGeneration = ++generation;
    onProgress(0);

    function tick() {
      if (generation !== currentGeneration || source === null || completed) return;
      scheduled = null;
      const elapsed = Math.max(0, now() - startedAt);
      onProgress(Math.min(1, elapsed / duration));
      if (elapsed >= duration) {
        completed = true;
        onConfirm();
        return;
      }
      scheduled = schedule(tick, Math.min(16, duration - elapsed));
    }

    scheduled = schedule(tick, Math.min(16, duration));
  }

  return { begin, cancel };
}
