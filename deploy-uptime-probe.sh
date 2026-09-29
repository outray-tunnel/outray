#!/usr/bin/env bash
set -euo pipefail

UPTIME_ENABLED="${UPTIME_ENABLED:-false}"
UPTIME_PROBES_ENABLED="${UPTIME_PROBES_ENABLED:-false}"
UPTIME_NOTIFICATIONS_ENABLED="${UPTIME_NOTIFICATIONS_ENABLED:-false}"
UPTIME_EGRESS_POLICY_READY="${UPTIME_EGRESS_POLICY_READY:-false}"
DATABASE_SSL_REJECT_UNAUTHORIZED="${DATABASE_SSL_REJECT_UNAUTHORIZED:-true}"

if [ "$UPTIME_ENABLED" != "true" ] || {
  [ "$UPTIME_PROBES_ENABLED" != "true" ] && [ "$UPTIME_NOTIFICATIONS_ENABLED" != "true" ];
}; then
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop outray-uptime-probe >/dev/null 2>&1 || true
  fi
  echo "Uptime worker is disabled; service stopped if present."
  exit 0
fi

if [ "$UPTIME_EGRESS_POLICY_READY" != "true" ]; then
  echo "Refusing to start Uptime worker without acknowledged egress policy." >&2
  exit 1
fi
for required_name in DATABASE_URL OUTRAY_DASHBOARD_URL OUTRAY_STATUS_URL UPTIME_UNSUBSCRIBE_SECRET ZEPTO_API_KEY; do
  if [ -z "${!required_name:-}" ]; then
    echo "$required_name is required before starting the Uptime worker." >&2
    exit 1
  fi
done
if ! command -v systemctl >/dev/null 2>&1 || ! command -v systemd-analyze >/dev/null 2>&1; then
  echo "Uptime worker requires systemd IPAddressDeny support." >&2
  exit 1
fi

# Run outside PM2 as an unprivileged systemd service with kernel egress rules.
if ! id outray-uptime >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin outray-uptime
fi
install -d -m 0755 /opt/outray/uptime-probe
install -d -m 0700 /etc/outray
cp -a /root/outray/uptime-probe/. /opt/outray/uptime-probe/
cd /opt/outray/uptime-probe
npm install --production
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
  echo "Uptime worker did not start under its egress policy." >&2
  exit 1
fi

echo "Uptime worker deployed."
