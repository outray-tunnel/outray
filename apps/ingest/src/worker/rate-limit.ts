export interface RateWindow {
  minute: number;
  count: number;
}

/** Same global per-organization fixed-minute limit as the Redis deployment. */
export function nextRateWindow(
  previous: RateWindow | undefined,
  now: number,
  limit: number,
) {
  const minute = Math.floor(now / 60_000);
  const window = {
    minute,
    count: previous?.minute === minute ? previous.count + 1 : 1,
  };
  return { window, allowed: window.count <= limit };
}
