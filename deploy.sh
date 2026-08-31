#!/bin/bash
set -e

# Configuration
APP_DIR="/root/outray/tunnel"
CADDYFILE="/etc/caddy/Caddyfile"

REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
REDIS_TUNNEL_TTL_SECONDS="${REDIS_TUNNEL_TTL_SECONDS:-120}"
REDIS_HEARTBEAT_INTERVAL_MS="${REDIS_HEARTBEAT_INTERVAL_MS:-20000}"

TIMESCALE_URL="${TIMESCALE_URL}"

# Alerts runtime config
TINYBIRD_API_HOST="${TINYBIRD_API_HOST:-}"
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

# Tunnel Server Config
BASE_DOMAIN="${BASE_DOMAIN:-outray.app}"
BLUE_PORT=3547
GREEN_PORT=3548
BLUE_NAME="outray-blue"
GREEN_NAME="outray-green"

# Run Tiger Data (TimescaleDB) migrations
echo "🐯 Running Tiger Data migrations..."
cd /root/outray
if [ -n "$TIMESCALE_URL" ]; then
  # Run migration files (not the full setup script which drops tables)
  for migration in deploy/migrations/*.sql; do
    if [ -f "$migration" ]; then
      echo "  Running $migration..."
      if ! psql "$TIMESCALE_URL" -f "$migration"; then
        echo "❌ Failed to run migration: $migration" >&2
      fi
    fi
  done
  echo "✅ Tiger Data migrations complete."
else
  echo "⚠️ TIMESCALE_URL not set, skipping migrations."
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
WEB_API_URL="https://outray.dev/api" \
PORT=$TARGET_PORT \
REDIS_URL="$REDIS_URL" \
REDIS_TUNNEL_TTL_SECONDS="$REDIS_TUNNEL_TTL_SECONDS" \
REDIS_HEARTBEAT_INTERVAL_MS="$REDIS_HEARTBEAT_INTERVAL_MS" \
TIMESCALE_URL="$TIMESCALE_URL" \
pm2 start dist/server.js --name $TARGET_NAME --update-env --force

# 1.5 Start Internal Check Service
echo "🔍 Starting Internal Check Service..."
cd ../internal-check
npm install --production
# Restart if exists, otherwise start new (prevents duplicates without downtime)
if pm2 list | grep -q "outray-internal-check"; then
  DATABASE_URL="$DATABASE_URL" \
  PORT=3001 \
  pm2 restart "outray-internal-check" --update-env
else
  DATABASE_URL="$DATABASE_URL" \
  PORT=3001 \
  pm2 start dist/index.js --name "outray-internal-check"
fi
cd $APP_DIR

# 1.6 Start Cron Service
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
  TIMESCALE_URL="$TIMESCALE_URL" \
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
  TIMESCALE_URL="$TIMESCALE_URL" \
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

echo "⏳ Waiting for tunnel server to be ready..."
sleep 5

# Verify Tunnel Server
if ! pm2 list | grep -q "$TARGET_NAME.*online"; then
  echo "❌ Deployment failed: $TARGET_NAME is not online."
  exit 1
fi

echo "✅ Tunnel server is running."

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

    reverse_proxy 127.0.0.1:$TARGET_PORT
}

:443 {
    tls {
        on_demand
    }

    reverse_proxy 127.0.0.1:$TARGET_PORT
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
