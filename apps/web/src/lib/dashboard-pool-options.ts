/** Keep enough warm connections for concurrent dashboard/API reads. */
const configuredPoolMax = Number(process.env.DASHBOARD_DB_POOL_MAX);
const dashboardPoolMax = Number.isFinite(configuredPoolMax)
  ? Math.max(10, configuredPoolMax)
  : 50;

export const dashboardPoolOptions = {
  // The production database allows 100 connections. The app currently runs
  // as one instance, so leave headroom for migrations and background jobs
  // while avoiding a ten-connection queue at dashboard load-test volume.
  max: dashboardPoolMax,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
};
