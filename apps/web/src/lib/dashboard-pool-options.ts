/** Keep warm connections across normal dashboard navigation pauses. */
export const dashboardPoolOptions = {
  // Bound total database pressure across the main and Timescale pools on
  // both production replicas. More clients here only queue behind the
  // database's connection and CPU limits during a burst.
  max: 10,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
};
