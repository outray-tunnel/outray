#!/bin/bash
set -e

# Configuration
APP_DIR="/root/outray/tunnel"
CADDYFILE="/etc/caddy/Caddyfile"

REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
REDIS_TUNNEL_TTL_SECONDS="${REDIS_TUNNEL_TTL_SECONDS:-120}"
REDIS_HEARTBEAT_INTERVAL_MS="${REDIS_HEARTBEAT_INTERVAL_MS:-20000}"

CLICKHOUSE_URL="${CLICKHOUSE_URL}"
CLICKHOUSE_USER="${CLICKHOUSE_USER}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE}"

# Tunnel Server Config
BLUE_PORT=3547
GREEN_PORT=3548
BLUE_NAME="outray-blue"
GREEN_NAME="outray-green"

cd $APP_DIR

# Install Server dependencies
npm install --production

# Apply ClickHouse schema updates (idempotent - uses CREATE IF NOT EXISTS)
echo "📊 Applying ClickHouse schema updates..."
if [ -f "../deploy/setup_clickhouse.sql" ]; then
    # Run each statement separately using clickhouse-client style with multiquery
    curl -sS "$CLICKHOUSE_URL" \
        --user "$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD" \
        --data-binary @../deploy/setup_clickhouse.sql \
        && echo "✅ ClickHouse schema applied." \
        || echo "⚠️ ClickHouse schema update failed (non-critical, tables may already exist)"
else
    echo "⚠️ setup_clickhouse.sql not found, skipping schema update"
fi

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
BASE_DOMAIN="outray.app" \
WEB_API_URL="https://console.outray.dev/api" \
PORT=$TARGET_PORT \
REDIS_URL="$REDIS_URL" \
REDIS_TUNNEL_TTL_SECONDS="$REDIS_TUNNEL_TTL_SECONDS" \
REDIS_HEARTBEAT_INTERVAL_MS="$REDIS_HEARTBEAT_INTERVAL_MS" \
CLICKHOUSE_URL="$CLICKHOUSE_URL" \
CLICKHOUSE_USER="$CLICKHOUSE_USER" \
CLICKHOUSE_PASSWORD="$CLICKHOUSE_PASSWORD" \
CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
pm2 start dist/server.js --name $TARGET_NAME --update-env --force

# 1.5 Start Internal Check Service
echo "🔍 Starting Internal Check Service..."
cd ../internal-check
npm install --production
DATABASE_URL="$DATABASE_URL" \
PORT=3001 \
pm2 start dist/index.js --name "outray-internal-check" --update-env --force
cd $APP_DIR

# 1.6 Start Cron Service
echo "⏰ Starting Cron Service..."
cd ../cron
npm install --production
REDIS_URL="$REDIS_URL" \
CLICKHOUSE_HOST="$CLICKHOUSE_URL" \
CLICKHOUSE_USER="$CLICKHOUSE_USER" \
CLICKHOUSE_PASSWORD="$CLICKHOUSE_PASSWORD" \
CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
pm2 start dist/index.js --name "outray-cron" --update-env --force
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

cat > $CADDYFILE <<EOF
{
    on_demand_tls {
        ask http://localhost:3001/internal/domain-check
    }
}

:443 {
    tls {
        on_demand
    }

    reverse_proxy localhost:$TARGET_PORT
}
EOF

# 3. Reload Caddy
echo "🔄 Reloading Caddy..."
caddy reload --config $CADDYFILE

echo "✅ Traffic switched to $TARGET_COLOR."

# 4. Stop old tunnel server instance
if pm2 list | grep -q "$OLD_NAME.*online"; then
  echo "🛑 Stopping $OLD_NAME..."
  pm2 stop $OLD_NAME
  pm2 delete $OLD_NAME
fi

# Clean up any legacy web servers
for web_name in "outray-web-blue" "outray-web-green"; do
  if pm2 list | grep -q "$web_name.*online"; then
    echo "🧹 Cleaning up legacy web server: $web_name..."
    pm2 stop $web_name
    pm2 delete $web_name
  fi
done

# Save PM2 list
pm2 save

echo "🚀 Deployment complete! Active: $TARGET_COLOR (Tunnel Server Only)"
