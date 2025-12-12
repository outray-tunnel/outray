#!/bin/bash
set -e

# Configuration
APP_DIR="/root/outray/server"
CADDYFILE="/etc/caddy/Caddyfile"
BLUE_PORT=3547
GREEN_PORT=3548
BLUE_NAME="outray-blue"
GREEN_NAME="outray-green"

cd $APP_DIR

# Install dependencies
npm install --production

# Determine which instance is currently running
if pm2 list | grep -q "$BLUE_NAME.*online"; then
  CURRENT_COLOR="blue"
  TARGET_COLOR="green"
  TARGET_PORT=$GREEN_PORT
  TARGET_NAME=$GREEN_NAME
  OLD_NAME=$BLUE_NAME
elif pm2 list | grep -q "outray-server.*online"; then
  # Legacy is running (assume it's on 3547), go Green
  echo "⚠️ Legacy outray-server detected. Treating as Blue."
  CURRENT_COLOR="legacy"
  TARGET_COLOR="green"
  TARGET_PORT=$GREEN_PORT
  TARGET_NAME=$GREEN_NAME
  OLD_NAME="outray-server"
else
  # Default to blue if green is running or neither is running
  CURRENT_COLOR="green"
  TARGET_COLOR="blue"
  TARGET_PORT=$BLUE_PORT
  TARGET_NAME=$BLUE_NAME
  OLD_NAME=$GREEN_NAME
fi
else
  # Default to blue if green is running or neither is running
  CURRENT_COLOR="green"
  TARGET_COLOR="blue"
  TARGET_PORT=$BLUE_PORT
  TARGET_NAME=$BLUE_NAME
  OLD_NAME=$GREEN_NAME
fi

echo "🔵 Current active: $CURRENT_COLOR (or none)"
echo "🟢 Deploying to: $TARGET_COLOR ($TARGET_NAME) on port $TARGET_PORT"

# Start the target instance
# We use --update-env to ensure new env vars are picked up if any
PORT=$TARGET_PORT pm2 start dist/server/src/server.js --name $TARGET_NAME --update-env --force

echo "⏳ Waiting for $TARGET_NAME to be ready..."
sleep 5 # Give it a moment to start listening. Ideally use a health check loop.

# Verify it's running
if ! pm2 list | grep -q "$TARGET_NAME.*online"; then
  echo "❌ Deployment failed: $TARGET_NAME is not online."
  exit 1
fi

echo "✅ $TARGET_NAME is running."

# Prepare Web Assets for Target Color
WEB_STAGING="/root/outray/web-staging"
WEB_TARGET="/root/outray/web-$TARGET_COLOR"

if [ -d "$WEB_STAGING" ]; then
  echo "📦 Moving web assets to $WEB_TARGET..."
  rm -rf $WEB_TARGET
  mv $WEB_STAGING $WEB_TARGET
else
  echo "⚠️ No web staging found. Skipping web asset update."
fi

# Update Caddyfile
echo "🔄 Updating Caddyfile to point to port $TARGET_PORT and web root $WEB_TARGET..."
# Update Proxy Port
sed -i "s/localhost:[0-9]\{4\}/localhost:$TARGET_PORT/g" $CADDYFILE
# Update Web Root (matches /root/outray/web, /root/outray/web-blue, or /root/outray/web-green)
sed -i "s|root \* /root/outray/web.*|root \* $WEB_TARGET|g" $CADDYFILE

# Reload Caddy
echo "🔄 Reloading Caddy..."
caddy reload --config $CADDYFILE

echo "✅ Traffic switched to $TARGET_NAME."

# Stop the old instance
if pm2 list | grep -q "$OLD_NAME.*online"; then
  echo "🛑 Stopping $OLD_NAME..."
  pm2 stop $OLD_NAME
fi

# Save PM2 list
pm2 save

echo "🚀 Deployment complete! Active: $TARGET_NAME"
