#!/bin/bash
set -e

# Configuration
APP_DIR="/root/outray/server"
CADDYFILE="/etc/caddy/Caddyfile"

# Tunnel Server Config
BLUE_PORT=3547
GREEN_PORT=3548
BLUE_NAME="outray-blue"
GREEN_NAME="outray-green"

# Web Server Config
BLUE_WEB_PORT=3000
GREEN_WEB_PORT=3001
BLUE_WEB_NAME="outray-web-blue"
GREEN_WEB_NAME="outray-web-green"

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
  
  TARGET_WEB_PORT=$GREEN_WEB_PORT
  TARGET_WEB_NAME=$GREEN_WEB_NAME
  OLD_WEB_NAME=$BLUE_WEB_NAME

elif pm2 list | grep -q "outray.*online" && ! pm2 list | grep -q "$GREEN_NAME.*online"; then
  # Legacy is running
  echo "⚠️ Legacy outray detected. Treating as Blue."
  CURRENT_COLOR="legacy"
  TARGET_COLOR="green"
  
  TARGET_PORT=$GREEN_PORT
  TARGET_NAME=$GREEN_NAME
  
  TARGET_WEB_PORT=$GREEN_WEB_PORT
  TARGET_WEB_NAME=$GREEN_WEB_NAME
  OLD_WEB_NAME=$BLUE_WEB_NAME # Assume legacy web was static or blue
  
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
  
  TARGET_WEB_PORT=$BLUE_WEB_PORT
  TARGET_WEB_NAME=$BLUE_WEB_NAME
  OLD_WEB_NAME=$GREEN_WEB_NAME
fi

echo "🔵 Current active: $CURRENT_COLOR (or none)"
echo "🟢 Deploying to: $TARGET_COLOR"
echo "   - Tunnel Server: $TARGET_NAME (Port $TARGET_PORT)"
echo "   - Web Server:    $TARGET_WEB_NAME (Port $TARGET_WEB_PORT)"

# 1. Start Tunnel Server
BASE_DOMAIN="outray.dev" PORT=$TARGET_PORT pm2 start dist/server/src/server.js --name $TARGET_NAME --update-env --force

# 2. Prepare and Start Web Server
WEB_STAGING="/root/outray/web-staging"
WEB_TARGET="/root/outray/web-$TARGET_COLOR"

if [ -d "$WEB_STAGING" ]; then
  echo "📦 Moving web assets to $WEB_TARGET..."
  rm -rf $WEB_TARGET
  mv $WEB_STAGING $WEB_TARGET
  
  echo "📦 Installing web dependencies..."
  cd $WEB_TARGET
  npm install --production
  
  echo "🚀 Starting Web Server..."
  # Start with Vite (Vinxi) on the specific port
  # We use 'npm run start -- --port' but vite start might not accept --port directly if not passed in script
  # Let's assume 'vite start --port X' works.
  # Updating package.json script on the fly or just running vite directly?
  # Safest is to run the command directly via PM2
  
  pm2 start "npm run start -- --port $TARGET_WEB_PORT" --name $TARGET_WEB_NAME --force
  
  cd $APP_DIR
else
  echo "⚠️ No web staging found. Skipping web deployment."
fi

echo "⏳ Waiting for services to be ready..."
sleep 10

# Verify Tunnel Server
if ! pm2 list | grep -q "$TARGET_NAME.*online"; then
  echo "❌ Deployment failed: $TARGET_NAME is not online."
  exit 1
fi

# Verify Web Server
if ! pm2 list | grep -q "$TARGET_WEB_NAME.*online"; then
  echo "❌ Deployment failed: $TARGET_WEB_NAME is not online."
  exit 1
fi

echo "✅ Services are running."

# 3. Update Caddyfile
echo "🔄 Updating Caddyfile..."

cat > $CADDYFILE <<EOF
outray.dev {
    reverse_proxy localhost:$TARGET_WEB_PORT
}

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

# 4. Reload Caddy
echo "🔄 Reloading Caddy..."
caddy reload --config $CADDYFILE

echo "✅ Traffic switched to $TARGET_COLOR."

# 5. Stop old instances
if pm2 list | grep -q "$OLD_NAME.*online"; then
  echo "🛑 Stopping $OLD_NAME..."
  pm2 stop $OLD_NAME
  pm2 delete $OLD_NAME
fi

if pm2 list | grep -q "$OLD_WEB_NAME.*online"; then
  echo "🛑 Stopping $OLD_WEB_NAME..."
  pm2 stop $OLD_WEB_NAME
  pm2 delete $OLD_WEB_NAME
fi

# Save PM2 list
pm2 save

echo "🚀 Deployment complete! Active: $TARGET_COLOR"
