#!/usr/bin/env bash
set -euo pipefail

: "${EDGE_SSH_KEY:?Set the Woodpecker edge_ssh_key repository secret}"

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

ssh "${ssh_options[@]}" "$edge" 'mkdir -p /root/outray/tunnel /root/outray/internal-check /root/outray/status /root/outray/uptime-probe /root/outray/deploy/woodpecker'
scp "${scp_options[@]}" deploy/woodpecker/run-edge-deploy.mjs "$edge:/root/outray/deploy/woodpecker/"
ssh "${ssh_options[@]}" "$edge" 'node /root/outray/deploy/woodpecker/run-edge-deploy.mjs --check'

for service in tunnel internal-check status uptime-probe; do
  scp "${scp_options[@]}" -r "apps/$service/dist" "apps/$service/package.json" "$edge:/root/outray/$service/"
done
scp "${scp_options[@]}" deploy.sh "$edge:/root/outray/"
scp "${scp_options[@]}" -r deploy/migrations deploy/uptime-probe.service "$edge:/root/outray/deploy/"

ssh "${ssh_options[@]}" "$edge" 'node /root/outray/deploy/woodpecker/run-edge-deploy.mjs'
