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

# Uptime is rolled out in stages. Deploying the binaries does not start probes,
# expose a page, or send notifications until the corresponding flags are set.
UPTIME_ENABLED="${UPTIME_ENABLED:-false}"
UPTIME_PROBES_ENABLED="${UPTIME_PROBES_ENABLED:-false}"
UPTIME_NOTIFICATIONS_ENABLED="${UPTIME_NOTIFICATIONS_ENABLED:-false}"
UPTIME_EGRESS_POLICY_READY="${UPTIME_EGRESS_POLICY_READY:-false}"
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
if [ "$UPTIME_PROBES_ENABLED" = "true" ] && [ "$UPTIME_EGRESS_POLICY_READY" != "true" ]; then
  echo "❌ Probes cannot start until the dedicated worker egress policy is verified and UPTIME_EGRESS_POLICY_READY=true." >&2
  exit 1
fi

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
WEB_API_URL="${WEB_API_URL:-${OUTRAY_DASHBOARD_URL:-https://outray.dev}/api}" \
PORT=$TARGET_PORT \
TUNNEL_BIND_HOST="127.0.0.1" \
REDIS_URL="$REDIS_URL" \
REDIS_TUNNEL_TTL_SECONDS="$REDIS_TUNNEL_TTL_SECONDS" \
REDIS_HEARTBEAT_INTERVAL_MS="$REDIS_HEARTBEAT_INTERVAL_MS" \
TIMESCALE_URL="$TIMESCALE_URL" \
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

# 1.6 Start the separate Astro status renderer (private loopback only).
if [ -n "$OUTRAY_STATUS_URL" ]; then
  echo "📟 Starting public status renderer..."
  cd ../status
  npm install --production
  (
    export STATUS_BIND_HOST="127.0.0.1" HOST="127.0.0.1" PORT="$STATUS_PORT" NODE_ENV="production"
    export DATABASE_URL DATABASE_SSL_REJECT_UNAUTHORIZED OUTRAY_STATUS_URL UPTIME_ENABLED
    export UPTIME_RATE_LIMIT_SECRET UPTIME_UNSUBSCRIBE_SECRET STATUS_EDGE_SECRET ZEPTO_API_KEY
    if pm2 describe outray-status >/dev/null 2>&1; then
      pm2 restart outray-status --update-env
    else
      pm2 start dist/server/entry.mjs --name outray-status
    fi
  )
  cd "$APP_DIR"
fi

# 1.7 Start Cron Service
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

if [ "$UPTIME_ENABLED" = "true" ]; then
  if ! curl --fail --silent --max-time 5 -H 'Host: status.outray.app' "http://127.0.0.1:$STATUS_PORT/health" >/dev/null; then
    echo "❌ Status renderer is not healthy; keeping the previous edge route." >&2
    exit 1
  fi
fi

# Uptime checks run outside PM2 as an unprivileged systemd service, where
# IPAddressDeny is enforced by the kernel. Do not run this worker as root.
if [ "$UPTIME_ENABLED" = "true" ] && {
  [ "$UPTIME_PROBES_ENABLED" = "true" ] || [ "$UPTIME_NOTIFICATIONS_ENABLED" = "true" ];
}; then
  if [ "$UPTIME_EGRESS_POLICY_READY" != "true" ]; then
    echo "❌ Refusing to start Uptime worker without acknowledged egress policy." >&2
    exit 1
  fi
  if ! command -v systemctl >/dev/null 2>&1 || ! command -v systemd-analyze >/dev/null 2>&1; then
    echo "❌ Uptime worker requires systemd IPAddressDeny support." >&2
    exit 1
  fi
  if ! id outray-uptime >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin outray-uptime
  fi
  install -d -m 0755 /opt/outray/uptime-probe
  install -d -m 0700 /etc/outray
  cp -a /root/outray/uptime-probe/. /opt/outray/uptime-probe/
  cd /opt/outray/uptime-probe
  npm install --production
  cd "$APP_DIR"
  install -m 0644 /root/outray/deploy/uptime-probe.service /etc/systemd/system/outray-uptime-probe.service
  systemd-analyze verify /etc/systemd/system/outray-uptime-probe.service
  export NODE_ENV=production DATABASE_URL DATABASE_SSL_REJECT_UNAUTHORIZED
  export UPTIME_ENABLED UPTIME_PROBES_ENABLED UPTIME_NOTIFICATIONS_ENABLED UPTIME_EGRESS_POLICY_READY
  export OUTRAY_DASHBOARD_URL OUTRAY_STATUS_URL UPTIME_UNSUBSCRIBE_SECRET ZEPTO_API_KEY
  export OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID OUTRAY_SECRETS_ACTIVE_MASTER_KEY OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS
  node -e '
    const fs = require("node:fs");
    const names = ["NODE_ENV", "DATABASE_URL", "DATABASE_SSL_REJECT_UNAUTHORIZED", "UPTIME_ENABLED", "UPTIME_PROBES_ENABLED", "UPTIME_NOTIFICATIONS_ENABLED", "UPTIME_EGRESS_POLICY_READY", "OUTRAY_DASHBOARD_URL", "OUTRAY_STATUS_URL", "UPTIME_UNSUBSCRIBE_SECRET", "ZEPTO_API_KEY", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY", "OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS"];
    const lines = names.filter((name) => process.env[name] !== undefined).map((name) => {
      const value = process.env[name];
      if (/[\r\n]/.test(value)) throw new Error(`${name} contains a newline`);
      return `${name}="${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
    });
    fs.writeFileSync("/etc/outray/uptime-probe.env", `${lines.join("\n")}\n`, { mode: 0o600 });
    fs.chmodSync("/etc/outray/uptime-probe.env", 0o600);
  '
  systemctl daemon-reload
  systemctl enable outray-uptime-probe
  systemctl restart outray-uptime-probe
  sleep 3
  if ! systemctl is-active --quiet outray-uptime-probe; then
    echo "❌ Uptime worker did not start under its egress policy." >&2
    exit 1
  fi
else
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop outray-uptime-probe >/dev/null 2>&1 || true
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
