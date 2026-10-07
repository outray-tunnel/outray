# OutRay k6 launch rehearsal

This scenario exercises read-heavy dashboard, observability, Secrets, uptime,
and tunnel API traffic. It is intentionally read-only. It does not create
users, tunnels, secrets, monitors, alerts, or telemetry rows.

Install k6 separately, then run from the repository root:

```bash
K6_BASE_URL=http://localhost:6767 \
K6_ORG_SLUG=outray-tunnel \
K6_TUNNEL_ID=10000000-0000-4000-8000-000000000001 \
K6_AUTH_COOKIE='better-auth.session_token=...' \
k6 run load/k6/outray-rehearsal.js
```

For a machine-token/API-token test, use `K6_BEARER_TOKEN` instead of
`K6_AUTH_COOKIE`. Never commit either credential.

The default profile ramps to 250 virtual users, sustains that level for 30
minutes, spikes to 500 users for 5 minutes, and then ramps down. Override the
profile in the script only after the 50-user baseline is healthy.

For the first diagnostic run, use the short smoke profile. It lasts about four
minutes, ramps to 50 VUs, and reports endpoint/status combinations through the
`outray_endpoint_requests` metric:

```bash
K6_PROFILE=smoke \
K6_BASE_URL='http://[::1]:6767' \
K6_ORG_SLUG=outray-tunnel \
K6_TUNNEL_ID=10000000-0000-4000-8000-000000000001 \
K6_AUTH_COOKIE='better-auth.session_token=YOUR_FRESH_COOKIE' \
npm run load:k6
```

For the next capacity step, use the five-minute 150-VU profile:

```bash
K6_PROFILE=150vu \
K6_BASE_URL='http://[::1]:6767' \
K6_ORG_SLUG=outray-tunnel \
K6_TUNNEL_ID=10000000-0000-4000-8000-000000000001 \
K6_AUTH_COOKIE='better-auth.session_token=YOUR_FRESH_COOKIE' \
npm run load:k6
```

Add `K6_DEBUG=true` only when needed; it keeps response bodies in memory for
debugging and should not be used for a long run.

Set `K6_ENDPOINT` to isolate one route, for example:

```bash
K6_ENDPOINT=traces K6_PROFILE=150vu npm run load:k6
```

The summary will include a separate `outray_<endpoint>_duration` metric for
each endpoint, which makes the slowest dependency visible.

Useful outputs include `http_req_duration`, `http_req_failed`,
`outray_failed_checks`, and the per-endpoint `endpoint` tag. Run the existing
single-process benchmarks before this test:

```bash
cd apps/web
npx tsx --tsconfig tsconfig.app.json scripts/benchmark-dashboard-queries.ts
npx tsx scripts/benchmark-secrets-reveal.ts
```
