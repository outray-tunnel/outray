#!/usr/bin/env bash
set -euo pipefail

: "${EDGE_SSH_KEY:?Set the Woodpecker edge_ssh_key repository secret}"
: "${UNBE_TOKEN:?Set the Woodpecker unbe_token repository secret}"
service="${1:-}"
case "$service" in
  edge|status|uptime-probe) ;;
  *) echo "Usage: $0 edge|status|uptime-probe" >&2; exit 2 ;;
esac

temporary_dir="$(mktemp -d)"
cleanup() {
  rm -f "$temporary_dir/id_ed25519" "$temporary_dir/known_hosts"
  rmdir "$temporary_dir"
}
trap cleanup EXIT
umask 077
printf '%s\n' "$EDGE_SSH_KEY" > "$temporary_dir/id_ed25519"
printf '%s\n' '[209.74.86.123]:22022 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMVzpFu9vNmrf14y8P/fPcKFxftQkUmMVZjTV4+aHkv4' > "$temporary_dir/known_hosts"

ssh_options=(
  -i "$temporary_dir/id_ed25519"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$temporary_dir/known_hosts"
  -o BatchMode=yes
  -p 22022
)
scp_options=(
  -i "$temporary_dir/id_ed25519"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$temporary_dir/known_hosts"
  -o BatchMode=yes
  -P 22022
)
edge=root@209.74.86.123

ssh "${ssh_options[@]}" "$edge" 'mkdir -p /root/outray/deploy/woodpecker'
scp "${scp_options[@]}" deploy/woodpecker/run-service-deploy.mjs "$edge:/root/outray/deploy/woodpecker/"
printf '%s' "$UNBE_TOKEN" | ssh "${ssh_options[@]}" "$edge" \
  "node /root/outray/deploy/woodpecker/run-service-deploy.mjs --service $service --token-stdin --check"

case "$service" in
  edge)
    ssh "${ssh_options[@]}" "$edge" 'mkdir -p /root/outray/tunnel /root/outray/internal-check'
    for app in tunnel internal-check; do
      scp "${scp_options[@]}" -r "apps/$app/dist" "apps/$app/package.json" "$edge:/root/outray/$app/"
    done
    scp "${scp_options[@]}" deploy.sh "$edge:/root/outray/"
    ;;
  status)
    ssh "${ssh_options[@]}" "$edge" 'mkdir -p /root/outray/status'
    scp "${scp_options[@]}" -r apps/status/dist apps/status/package.json "$edge:/root/outray/status/"
    scp "${scp_options[@]}" deploy-status.sh "$edge:/root/outray/"
    ;;
  uptime-probe)
    ssh "${ssh_options[@]}" "$edge" 'mkdir -p /root/outray/uptime-probe'
    scp "${scp_options[@]}" -r apps/uptime-probe/dist apps/uptime-probe/package.json "$edge:/root/outray/uptime-probe/"
    scp "${scp_options[@]}" deploy-uptime-probe.sh "$edge:/root/outray/"
    scp "${scp_options[@]}" deploy/uptime-probe.service "$edge:/root/outray/deploy/"
    ;;
esac

printf '%s' "$UNBE_TOKEN" | ssh "${ssh_options[@]}" "$edge" \
  "node /root/outray/deploy/woodpecker/run-service-deploy.mjs --service $service --token-stdin"
