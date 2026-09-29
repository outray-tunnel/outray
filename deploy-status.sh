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
npm install --production

# The renderer is private to the tunnel edge. Never bind it to a public address.
export STATUS_BIND_HOST="127.0.0.1" HOST="127.0.0.1" PORT="$STATUS_PORT" NODE_ENV="production"
export DATABASE_URL DATABASE_SSL_REJECT_UNAUTHORIZED OUTRAY_STATUS_URL UPTIME_ENABLED
export UPTIME_RATE_LIMIT_SECRET UPTIME_UNSUBSCRIBE_SECRET STATUS_EDGE_SECRET ZEPTO_API_KEY
if pm2 describe outray-status >/dev/null 2>&1; then
  pm2 restart outray-status --update-env
else
  pm2 start dist/server/entry.mjs --name outray-status
fi

sleep 3
if ! pm2 list | grep -q 'outray-status.*online'; then
  echo "Status renderer did not come online." >&2
  exit 1
fi
if [ "$UPTIME_ENABLED" = "true" ] && \
   ! curl --fail --silent --max-time 5 -H 'Host: status.outray.app' "http://127.0.0.1:$STATUS_PORT/health" >/dev/null; then
  echo "Status renderer failed its health check." >&2
  exit 1
fi

pm2 save
echo "Status renderer deployed."
