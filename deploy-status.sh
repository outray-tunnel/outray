#!/usr/bin/env bash
set -euo pipefail

OUTRAY_STATUS_URL="${OUTRAY_STATUS_URL:-}"
UPTIME_ENABLED="${UPTIME_ENABLED:-false}"
DATABASE_SSL_REJECT_UNAUTHORIZED="${DATABASE_SSL_REJECT_UNAUTHORIZED:-true}"
STATUS_PORT=4323

if [ -z "$OUTRAY_STATUS_URL" ]; then
  if [ "$UPTIME_ENABLED" = "true" ]; then
    echo "OUTRAY_STATUS_URL is required when Uptime is enabled." >&2
    exit 1
  fi
  echo "Status URL is not configured; leaving the renderer unchanged."
  exit 0
fi

case "$OUTRAY_STATUS_URL" in
  https://status.outray.app|https://status.outray.app/) ;;
  *) echo "OUTRAY_STATUS_URL must be https://status.outray.app." >&2; exit 1 ;;
esac

if [ "$UPTIME_ENABLED" = "true" ]; then
  for required_name in DATABASE_URL UPTIME_RATE_LIMIT_SECRET UPTIME_UNSUBSCRIBE_SECRET STATUS_EDGE_SECRET ZEPTO_API_KEY; do
    if [ -z "${!required_name:-}" ]; then
      echo "$required_name is required before enabling Uptime." >&2
      exit 1
    fi
  done
fi

cd /root/outray/status
npm install --omit=dev --engine-strict --no-audit --no-fund

# The renderer is private to the tunnel edge. Never bind it to a public address.
export STATUS_BIND_HOST="127.0.0.1" HOST="127.0.0.1" PORT="$STATUS_PORT" NODE_ENV="production"
export DATABASE_URL DATABASE_SSL_REJECT_UNAUTHORIZED OUTRAY_STATUS_URL UPTIME_ENABLED
export UPTIME_RATE_LIMIT_SECRET UPTIME_UNSUBSCRIBE_SECRET STATUS_EDGE_SECRET ZEPTO_API_KEY
export OUTRAY_API_KEY OUTRAY_OTLP_ENDPOINT
# Import this build's server chunks before restarting the process. Astro
# can emit bare transitive imports whose workspace hoisting differs on the VPS.
timeout 30s env ASTRO_NODE_AUTOSTART=disabled node --input-type=module -e '
  import { readFile } from "node:fs/promises";
  import { resolve, sep } from "node:path";
  import { pathToFileURL } from "node:url";
  const { outrayRuntime } = JSON.parse(await readFile("package.json", "utf8"));
  const modules = outrayRuntime?.serverModules;
  if (!Array.isArray(modules) || !modules.includes("dist/server/entry.mjs")) {
    throw new Error("Status release module inventory missing; deploy a freshly packaged build.");
  }
  const root = resolve("dist/server") + sep;
  for (const module of modules) {
    const path = resolve(module);
    if (!path.startsWith(root) || !/\.[mc]?js$/.test(path)) throw new Error("Invalid Status release module path.");
    await import(pathToFileURL(path).href);
  }
  console.log(`Status server imports verified (${modules.length} modules).`);
'
STATUS_NODE_ARGS="--import /root/outray/status/observability-preload.mjs"
if pm2 describe outray-status >/dev/null 2>&1; then
  pm2 restart outray-status --node-args "$STATUS_NODE_ARGS" --update-env
else
  pm2 start dist/server/entry.mjs --name outray-status --node-args "$STATUS_NODE_ARGS"
fi

sleep 3
if ! pm2 list | grep -q 'outray-status.*online'; then
  echo "Status renderer did not come online." >&2
  exit 1
fi
if [ "$UPTIME_ENABLED" = "true" ]; then
  status_health_deadline=$((SECONDS + 45))
  until curl --fail --silent --max-time 5 -H 'Host: status.outray.app' "http://127.0.0.1:$STATUS_PORT/health" >/dev/null; do
    if [ "$SECONDS" -ge "$status_health_deadline" ]; then
      echo "Status renderer failed its health check within 45 seconds." >&2
      exit 1
    fi
    sleep 1
  done
fi

pm2 save
echo "Status renderer deployed."
