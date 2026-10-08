/** Keep warm connections across normal dashboard navigation pauses. */
export const dashboardPoolOptions = {
  max: 25,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
};
