#!/bin/bash
set -e

# Configuration
APP_DIR="/root/outray/tunnel"
CADDYFILE="/etc/caddy/Caddyfile"

REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
REDIS_TUNNEL_TTL_SECONDS="${REDIS_TUNNEL_TTL_SECONDS:-120}"
REDIS_HEARTBEAT_INTERVAL_MS="${REDIS_HEARTBEAT_INTERVAL_MS:-20000}"

# Tunnel Server Config
BLUE_PORT=3547
GREEN_PORT=3548
BLUE_NAME="outray-blue"
GREEN_NAME="outray-green"

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
BASE_DOMAIN="outray.dev" \
WEB_API_URL="https://outray.dev/api" \
PORT=$TARGET_PORT \
REDIS_URL="$REDIS_URL" \
REDIS_TUNNEL_TTL_SECONDS="$REDIS_TUNNEL_TTL_SECONDS" \
REDIS_HEARTBEAT_INTERVAL_MS="$REDIS_HEARTBEAT_INTERVAL_MS" \
pm2 start dist/server.js --name $TARGET_NAME --update-env --force

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
api.outray.dev {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy localhost:$TARGET_PORT
}

*.outray.dev {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
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
