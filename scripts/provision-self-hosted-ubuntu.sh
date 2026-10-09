#!/usr/bin/env bash
# Optional bootstrap for a new, dedicated Ubuntu host. Never changes SSH/DNS or
# reads hosted OutRay configuration. Run explicitly as root after inspection.
set -euo pipefail

[[ "${EUID}" == 0 ]] || { echo 'Run as root on the dedicated self-hosted server.' >&2; exit 1; }
source /etc/os-release
[[ "${ID}" == ubuntu && "${VERSION_ID}" == 24.04 ]] || { echo 'This bootstrap supports Ubuntu 24.04 only.' >&2; exit 1; }
[[ "$(dpkg --print-architecture)" == amd64 ]] || { echo 'This bootstrap currently supports amd64 only.' >&2; exit 1; }

# A small-host build trial can use disk-backed swap; this is not extra RAM or a
# guarantee that every service will fit. Preserve any existing active swap.
if ! swapon --noheadings --show=NAME | grep -q .; then
  if [[ -e /swap-outray-ops ]]; then
    echo '/swap-outray-ops already exists but is inactive; inspect it manually.' >&2
    exit 1
  fi
  available_kib=$(df --output=avail / | tail -n 1 | tr -d ' ')
  (( available_kib > 8 * 1024 * 1024 )) || { echo 'At least 8 GiB free disk is required before allocating trial swap.' >&2; exit 1; }
  umask 077
  fallocate -l 4G /swap-outray-ops
  chmod 600 /swap-outray-ops
  mkswap /swap-outray-ops
  swapon /swap-outray-ops
  if ! grep -q '^/swap-outray-ops ' /etc/fstab; then
    printf '/swap-outray-ops none swap sw 0 0\n' >> /etc/fstab
  fi
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils rsync

if ! command -v docker >/dev/null; then
  for existing_file in /etc/apt/keyrings/docker.asc /etc/apt/sources.list.d/docker.sources; do
    [[ ! -e "${existing_file}" ]] || { echo "${existing_file} already exists; inspect Docker setup manually." >&2; exit 1; }
  done
  install -m 0755 -d /etc/apt/keyrings
  curl --proto '=https' --tlsv1.2 -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod 644 /etc/apt/keyrings/docker.asc
  printf '%s\n' 'Types: deb' 'URIs: https://download.docker.com/linux/ubuntu' 'Suites: noble' 'Components: stable' 'Architectures: amd64' 'Signed-By: /etc/apt/keyrings/docker.asc' > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker version --format '{{.Server.Version}}'
docker compose version

if command -v node >/dev/null; then
  node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
else
  task_download_dir=$(mktemp -d /tmp/outray-node.XXXXXXXX)
  curl --proto '=https' --tlsv1.2 -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "${task_download_dir}/SHASUMS256.txt"
  node_archive=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' "${task_download_dir}/SHASUMS256.txt")
  [[ "${node_archive}" =~ ^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]] || { echo 'Could not resolve the official Node 22 archive.' >&2; exit 1; }
  curl --proto '=https' --tlsv1.2 -fsSL "https://nodejs.org/dist/latest-v22.x/${node_archive}" -o "${task_download_dir}/${node_archive}"
  (cd "${task_download_dir}" && awk -v archive="${node_archive}" '$2 == archive' SHASUMS256.txt | sha256sum --check --strict)
  node_directory="/opt/${node_archive%.tar.xz}"
  [[ ! -e "${node_directory}" ]] || { echo 'Node installation directory already exists; inspect manually.' >&2; exit 1; }
  for target in /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx; do
    [[ ! -e "${target}" && ! -L "${target}" ]] || { echo "${target} already exists; refusing to replace it." >&2; exit 1; }
  done
  tar -xJf "${task_download_dir}/${node_archive}" -C /opt
  ln -s "${node_directory}/bin/node" /usr/local/bin/node
  ln -s "${node_directory}/bin/npm" /usr/local/bin/npm
  ln -s "${node_directory}/bin/npx" /usr/local/bin/npx
  # Only the two known download files are removed; never remove a broad tree.
  rm -f -- "${task_download_dir}/${node_archive}" "${task_download_dir}/SHASUMS256.txt"
  rmdir -- "${task_download_dir}"
fi
node --version
npm --version
install -m 0700 -d /opt/outray-ops /opt/outray-ops/config /opt/outray-ops/source
free -h
df -h /
