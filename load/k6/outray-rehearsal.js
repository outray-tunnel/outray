import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const baseUrl = (__ENV.K6_BASE_URL || "").replace(/\/$/, "");
const orgSlug = __ENV.K6_ORG_SLUG || "";
const tunnelId = __ENV.K6_TUNNEL_ID || "";
const authCookie = __ENV.K6_AUTH_COOKIE || "";
const bearerToken = __ENV.K6_BEARER_TOKEN || "";
const smokeProfile = __ENV.K6_PROFILE === "smoke";
const profile150 = __ENV.K6_PROFILE === "150vu";
const profile1000 = __ENV.K6_PROFILE === "1000vu";
const endpointFilter = __ENV.K6_ENDPOINT?.trim() || "";

if (!baseUrl || !orgSlug || !tunnelId || (!authCookie && !bearerToken)) {
  fail(
    "Set K6_BASE_URL, K6_ORG_SLUG, K6_TUNNEL_ID, and either K6_AUTH_COOKIE or K6_BEARER_TOKEN.",
  );
}

export const options = {
  discardResponseBodies: __ENV.K6_DEBUG !== "true",
  insecureSkipTLSVerify: __ENV.K6_INSECURE_SKIP_TLS_VERIFY === "true",
  thresholds: {
    http_req_failed: [smokeProfile || profile150 || profile1000 ? "rate<0.05" : "rate<0.01"],
    http_req_duration: profile1000
      ? ["p(95)<300", "p(99)<1000"]
      : smokeProfile || profile150
      ? ["p(95)<5000", "p(99)<10000"]
      : ["p(95)<1500", "p(99)<3000"],
    outray_failed_checks: [profile1000 ? "count<25" : smokeProfile || profile150 ? "count<10" : "count<25"],
  },
  stages: profile1000
    ? [
        { duration: "30s", target: 250 },
        { duration: "60s", target: 500 },
        { duration: "90s", target: 1000 },
        { duration: "120s", target: 1000 },
        { duration: "60s", target: 0 },
      ]
    : profile150
    ? [
        { duration: "30s", target: 150 },
        { duration: "4m", target: 150 },
        { duration: "30s", target: 0 },
      ]
    : smokeProfile
    ? [
        { duration: "30s", target: 10 },
        { duration: "60s", target: 25 },
        { duration: "120s", target: 50 },
        { duration: "30s", target: 0 },
      ]
    : [
        { duration: "5m", target: 50 },
        { duration: "10m", target: 250 },
        { duration: "30m", target: 250 },
        { duration: "5m", target: 500 },
        { duration: "5m", target: 0 },
      ],
};

const failedChecks = new Counter("outray_failed_checks");
const endpointRequests = new Counter("outray_endpoint_requests");
const scenarioDuration = new Trend("outray_scenario_duration", true);
const scenarioSuccess = new Rate("outray_scenario_success");

const paths = {
  overview: `/api/${orgSlug}/stats/overview?range=24h`,
  tunnelStats: `/api/${orgSlug}/stats/tunnel?tunnelId=${encodeURIComponent(tunnelId)}&range=24h`,
  requests: `/api/${orgSlug}/requests?tunnelId=${encodeURIComponent(tunnelId)}&range=24h&limit=50`,
  tunnels: `/api/${orgSlug}/tunnels`,
  bandwidth: `/api/${orgSlug}/stats/bandwidth`,
  services: `/api/${orgSlug}/observability/services?range=24h`,
  traces: `/api/${orgSlug}/observability/traces?range=1h&limit=100`,
  logs: `/api/${orgSlug}/observability/logs?range=1h&limit=250`,
  metrics: `/api/${orgSlug}/observability/metrics?range=1h`,
  observabilityRequests: `/api/${orgSlug}/observability/requests?range=1h&limit=50`,
  alerts: `/api/${orgSlug}/observability/alerts`,
  secrets: `/api/${orgSlug}/secrets/overview`,
  uptimeMonitors: `/api/${orgSlug}/uptime/monitors`,
  uptimeIncidents: `/api/${orgSlug}/uptime/incidents?limit=50`,
};

const endpointDurations = Object.fromEntries(
  Object.keys(paths).map((name) => [name, new Trend(`outray_${name}_duration`, true)]),
);

if (endpointFilter && !Object.hasOwn(paths, endpointFilter)) {
  fail(`Unknown K6_ENDPOINT: ${endpointFilter}`);
}

function headers() {
  const result = {
    Accept: "application/json",
    "User-Agent": "OutRay-k6-rehearsal/1.0",
  };
  if (authCookie) result.Cookie = authCookie;
  if (bearerToken) result.Authorization = `Bearer ${bearerToken}`;
  return result;
}

function get(name) {
  const response = http.get(`${baseUrl}${paths[name]}`, {
    headers: headers(),
    tags: { endpoint: name },
    timeout: "30s",
  });
  const ok = check(response, {
    [`${name} returns 2xx`]: (item) => item.status >= 200 && item.status < 300,
  });
  const status = String(response.status || "network_error");
  endpointDurations[name].add(response.timings.duration);
  endpointRequests.add(1, {
    endpoint: name,
    status,
    outcome: ok ? "success" : "failure",
  });
  if (!ok) failedChecks.add(1, { endpoint: name, status });
  return ok;
}

function chooseScenario() {
  if (endpointFilter) return [endpointFilter];
  const roll = Math.random() * 100;
  if (roll < 20) return ["overview", "tunnels", "bandwidth"];
  if (roll < 40) return ["services", "traces"];
  if (roll < 55) return ["logs"];
  if (roll < 70) return ["metrics"];
  if (roll < 80) return ["observabilityRequests"];
  if (roll < 90) return ["tunnelStats", "requests"];
  if (roll < 95) return ["secrets"];
  return ["uptimeMonitors", "uptimeIncidents", "alerts"];
}

export default function () {
  const started = Date.now();
  const scenario = chooseScenario();
  let successful = true;
  for (const name of scenario) successful = get(name) && successful;
  scenarioDuration.add(Date.now() - started, { scenario: scenario.join(",") });
  scenarioSuccess.add(successful, { scenario: scenario.join(",") });
  sleep(Math.random() * 2 + 1);
}
