#!/bin/bash
set -e

# Configuration
APP_DIR="/root/outray/tunnel"
CADDYFILE="/etc/caddy/Caddyfile"

REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
REDIS_TUNNEL_TTL_SECONDS="${REDIS_TUNNEL_TTL_SECONDS:-120}"
REDIS_HEARTBEAT_INTERVAL_MS="${REDIS_HEARTBEAT_INTERVAL_MS:-20000}"

# Alerts runtime config
TINYBIRD_API_HOST="${TINYBIRD_API_HOST:-}"
TINYBIRD_INGEST_TOKEN="${TINYBIRD_INGEST_TOKEN:-}"
TINYBIRD_QUERY_TOKEN="${TINYBIRD_QUERY_TOKEN:-}"
ZEPTO_API_KEY="${ZEPTO_API_KEY:-}"
APP_URL="${APP_URL:-https://outray.dev}"
ALERT_POLL_INTERVAL_MS="${ALERT_POLL_INTERVAL_MS:-15000}"
ALERT_BATCH_SIZE="${ALERT_BATCH_SIZE:-25}"
ALERT_EVALUATION_CONCURRENCY="${ALERT_EVALUATION_CONCURRENCY:-5}"
ALERT_LEASE_SECONDS="${ALERT_LEASE_SECONDS:-120}"
ALERT_LATE_DATA_SECONDS="${ALERT_LATE_DATA_SECONDS:-60}"
ALERT_EVALUATION_RETENTION_DAYS="${ALERT_EVALUATION_RETENTION_DAYS:-30}"
DATABASE_SSL_REJECT_UNAUTHORIZED="${DATABASE_SSL_REJECT_UNAUTHORIZED:-true}"

# Uptime is rolled out in stages. The renderer and probe have separate deploys;
# this script owns only the tunnel edge, internal check, and Caddy route.
UPTIME_ENABLED="${UPTIME_ENABLED:-false}"
DEPLOY_CRON="${DEPLOY_CRON:-true}"
OUTRAY_DASHBOARD_URL="${OUTRAY_DASHBOARD_URL:-}"
OUTRAY_STATUS_URL="${OUTRAY_STATUS_URL:-}"
STATUS_EDGE_SECRET="${STATUS_EDGE_SECRET:-}"
STATUS_PORT=4323

if [ "$UPTIME_ENABLED" = "true" ]; then
  for required_name in OUTRAY_DASHBOARD_URL OUTRAY_STATUS_URL STATUS_EDGE_SECRET DATABASE_URL UPTIME_RATE_LIMIT_SECRET UPTIME_UNSUBSCRIBE_SECRET ZEPTO_API_KEY; do
    if [ -z "${!required_name:-}" ]; then
      echo "❌ $required_name is required before enabling Uptime." >&2
      exit 1
    fi
  done
  case "$OUTRAY_DASHBOARD_URL" in https://*) ;; *) echo "❌ OUTRAY_DASHBOARD_URL must be HTTPS." >&2; exit 1 ;; esac
  case "$OUTRAY_STATUS_URL" in
    https://status.outray.app|https://status.outray.app/) ;;
    *) echo "❌ OUTRAY_STATUS_URL must be https://status.outray.app for this edge route." >&2; exit 1 ;;
  esac
fi
# Tunnel Server Config
BASE_DOMAIN="${BASE_DOMAIN:-outray.app}"
BLUE_PORT=3547
GREEN_PORT=3548
BLUE_NAME="outray-blue"
GREEN_NAME="outray-green"

# Tinybird resources must be deployed before promoting the tunnel runtime.
if [ -z "$TINYBIRD_API_HOST" ] || [ -z "$TINYBIRD_INGEST_TOKEN" ]; then
  echo "❌ TINYBIRD_API_HOST and TINYBIRD_INGEST_TOKEN are required for tunnel analytics." >&2
  exit 1
fi

cd $APP_DIR

# Install Server dependencies
npm install --production

# Determine which instance is currently running
if pm2 list | grep -q "$BLUE_NAME.*online"; then
  CURRENT_COLOR="blue"
  TARGET_COLOR="green"
  TARGET_PORT=$GREEN_PORT
  TARGET_NAME=$GREEN_NAME
  OLD_NAME=$BLUE_NAME
elif pm2 list | grep -q "outray.*online" && ! pm2 list | grep -q "$GREEN_NAME.*online"; then
  # Legacy is running
  echo "⚠️ Legacy outray detected. Treating as Blue."
  CURRENT_COLOR="legacy"
  TARGET_COLOR="green"
  TARGET_PORT=$GREEN_PORT
  TARGET_NAME=$GREEN_NAME
  
  if pm2 list | grep -q "outray-server.*online"; then
    OLD_NAME="outray-server"
  else
    OLD_NAME="outray"
  fi
else
  # Default to blue
  CURRENT_COLOR="green"
  TARGET_COLOR="blue"
  TARGET_PORT=$BLUE_PORT
  TARGET_NAME=$BLUE_NAME
  OLD_NAME=$GREEN_NAME
fi

echo "🔵 Current active: $CURRENT_COLOR (or none)"
echo "🟢 Deploying to: $TARGET_COLOR (Tunnel Server: $TARGET_NAME on Port $TARGET_PORT)"

# 1. Start Tunnel Server
BASE_DOMAIN="$BASE_DOMAIN" \
WEB_API_URL="${WEB_API_URL:-${OUTRAY_DASHBOARD_URL:-https://outray.dev}/api}" \
PORT=$TARGET_PORT \
TUNNEL_BIND_HOST="127.0.0.1" \
REDIS_URL="$REDIS_URL" \
REDIS_TUNNEL_TTL_SECONDS="$REDIS_TUNNEL_TTL_SECONDS" \
REDIS_HEARTBEAT_INTERVAL_MS="$REDIS_HEARTBEAT_INTERVAL_MS" \
TINYBIRD_API_HOST="$TINYBIRD_API_HOST" \
TINYBIRD_INGEST_TOKEN="$TINYBIRD_INGEST_TOKEN" \
DATABASE_URL="$DATABASE_URL" \
DATABASE_SSL_REJECT_UNAUTHORIZED="$DATABASE_SSL_REJECT_UNAUTHORIZED" \
UPTIME_ENABLED="$UPTIME_ENABLED" \
STATUS_EDGE_SECRET="$STATUS_EDGE_SECRET" \
STATUS_PORT="$STATUS_PORT" \
INTERNAL_API_SECRET="$INTERNAL_API_SECRET" \
pm2 start dist/server.js --name $TARGET_NAME --update-env --force

# 1.5 Start Internal Check Service
echo "🔍 Starting Internal Check Service..."
cd ../internal-check
npm install --production
# Restart if exists, otherwise start new (prevents duplicates without downtime)
if pm2 list | grep -q "outray-internal-check"; then
  DATABASE_URL="$DATABASE_URL" \
  UPTIME_ENABLED="$UPTIME_ENABLED" \
  PORT=3001 \
  pm2 restart "outray-internal-check" --update-env
else
  DATABASE_URL="$DATABASE_URL" \
  UPTIME_ENABLED="$UPTIME_ENABLED" \
  PORT=3001 \
  pm2 start dist/index.js --name "outray-internal-check"
fi
cd $APP_DIR

# 1.7 Start Cron Service
if [ "$DEPLOY_CRON" = "true" ]; then
echo "⏰ Starting Cron Service..."
cd ../cron
npm install --production
if [ -z "$TINYBIRD_API_HOST" ] || [ -z "$TINYBIRD_QUERY_TOKEN" ]; then
  echo "⚠️ Tinybird runtime credentials are incomplete; alert evaluation will be disabled."
fi
if [ -z "$ZEPTO_API_KEY" ]; then
  echo "⚠️ ZEPTO_API_KEY is not set; the alert email delivery worker will be disabled."
fi
# Restart if exists, otherwise start new (prevents duplicates without downtime)
if pm2 list | grep -q "outray-cron"; then
  REDIS_URL="$REDIS_URL" \
  TINYBIRD_INGEST_TOKEN="$TINYBIRD_INGEST_TOKEN" \
  DATABASE_URL="$DATABASE_URL" \
  DATABASE_SSL_REJECT_UNAUTHORIZED="$DATABASE_SSL_REJECT_UNAUTHORIZED" \
  PAYSTACK_SECRET_KEY="$PAYSTACK_SECRET_KEY" \
  TINYBIRD_API_HOST="$TINYBIRD_API_HOST" \
  TINYBIRD_QUERY_TOKEN="$TINYBIRD_QUERY_TOKEN" \
  ZEPTO_API_KEY="$ZEPTO_API_KEY" \
  APP_URL="$APP_URL" \
  ALERT_POLL_INTERVAL_MS="$ALERT_POLL_INTERVAL_MS" \
  ALERT_BATCH_SIZE="$ALERT_BATCH_SIZE" \
  ALERT_EVALUATION_CONCURRENCY="$ALERT_EVALUATION_CONCURRENCY" \
  ALERT_LEASE_SECONDS="$ALERT_LEASE_SECONDS" \
  ALERT_LATE_DATA_SECONDS="$ALERT_LATE_DATA_SECONDS" \
  ALERT_EVALUATION_RETENTION_DAYS="$ALERT_EVALUATION_RETENTION_DAYS" \
  pm2 restart "outray-cron" --update-env
else
  REDIS_URL="$REDIS_URL" \
  TINYBIRD_INGEST_TOKEN="$TINYBIRD_INGEST_TOKEN" \
  DATABASE_URL="$DATABASE_URL" \
  DATABASE_SSL_REJECT_UNAUTHORIZED="$DATABASE_SSL_REJECT_UNAUTHORIZED" \
  PAYSTACK_SECRET_KEY="$PAYSTACK_SECRET_KEY" \
  TINYBIRD_API_HOST="$TINYBIRD_API_HOST" \
  TINYBIRD_QUERY_TOKEN="$TINYBIRD_QUERY_TOKEN" \
  ZEPTO_API_KEY="$ZEPTO_API_KEY" \
  APP_URL="$APP_URL" \
  ALERT_POLL_INTERVAL_MS="$ALERT_POLL_INTERVAL_MS" \
  ALERT_BATCH_SIZE="$ALERT_BATCH_SIZE" \
  ALERT_EVALUATION_CONCURRENCY="$ALERT_EVALUATION_CONCURRENCY" \
  ALERT_LEASE_SECONDS="$ALERT_LEASE_SECONDS" \
  ALERT_LATE_DATA_SECONDS="$ALERT_LATE_DATA_SECONDS" \
  ALERT_EVALUATION_RETENTION_DAYS="$ALERT_EVALUATION_RETENTION_DAYS" \
  pm2 start dist/index.js --name "outray-cron"
fi
cd $APP_DIR
fi

echo "⏳ Waiting for tunnel server to be ready..."
sleep 5

# Verify Tunnel Server
if ! pm2 list | grep -q "$TARGET_NAME.*online"; then
  echo "❌ Deployment failed: $TARGET_NAME is not online."
  exit 1
fi

if ! curl --fail --silent --max-time 5 -H "Host: ${BASE_DOMAIN}" "http://127.0.0.1:$TARGET_PORT/health" >/dev/null; then
  echo "❌ New tunnel edge failed its health check; keeping the previous edge route." >&2
  exit 1
fi

echo "✅ Tunnel server is running."

if [ "$UPTIME_ENABLED" = "true" ]; then
  if ! curl --fail --silent --max-time 5 -H 'Host: status.outray.app' "http://127.0.0.1:$STATUS_PORT/health" >/dev/null; then
    echo "❌ Status renderer is not healthy; keeping the previous edge route." >&2
    exit 1
  fi
fi

# 2. Update Caddyfile (Web will be handled by Vercel)
echo "🔄 Updating Caddyfile..."

if [ ! -r /etc/caddy/cloudflare.env ]; then
  echo "❌ /etc/caddy/cloudflare.env is required for wildcard certificate renewal." >&2
  exit 1
fi

set -a
. /etc/caddy/cloudflare.env
set +a

CADDYFILE_CANDIDATE="${CADDYFILE}.next"
cat > "$CADDYFILE_CANDIDATE" <<EOF
{
    on_demand_tls {
        ask http://127.0.0.1:3001/internal/domain-check
    }
}

*.${BASE_DOMAIN} {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }

    reverse_proxy 127.0.0.1:$TARGET_PORT {
        header_up Host {hostport}
        header_up -X-Outray-Edge-Secret
        header_up X-Outray-Client-IP {remote_host}
    }
}

status.outray.app, *.status.outray.app {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }

    reverse_proxy 127.0.0.1:$TARGET_PORT {
        header_up Host {hostport}
        header_up -X-Outray-Edge-Secret
        header_up X-Outray-Client-IP {remote_host}
    }
}

:443 {
    tls {
        on_demand
    }

    reverse_proxy 127.0.0.1:$TARGET_PORT {
        header_up Host {hostport}
        header_up -X-Outray-Edge-Secret
        header_up X-Outray-Client-IP {remote_host}
    }
}
EOF

caddy fmt --overwrite "$CADDYFILE_CANDIDATE"
caddy validate --config "$CADDYFILE_CANDIDATE"
mv "$CADDYFILE_CANDIDATE" "$CADDYFILE"

# 3. Reload Caddy
echo "🔄 Reloading Caddy..."
caddy reload --config $CADDYFILE

echo "✅ Traffic switched to $TARGET_COLOR."

# 4. Stop old tunnel server instance
if pm2 describe "$OLD_NAME" >/dev/null 2>&1; then
  echo "🛑 Stopping $OLD_NAME..."
  pm2 stop "$OLD_NAME" || true
  pm2 delete "$OLD_NAME" || true
fi

# Clean up any legacy web servers
for web_name in "outray-web-blue" "outray-web-green"; do
  if pm2 describe "$web_name" >/dev/null 2>&1; then
    echo "🧹 Cleaning up legacy web server: $web_name..."
    pm2 stop "$web_name" || true
    pm2 delete "$web_name" || true
  fi
done

# Save PM2 list
pm2 save

echo "🚀 Deployment complete! Active: $TARGET_COLOR (Tunnel Server Only)"
