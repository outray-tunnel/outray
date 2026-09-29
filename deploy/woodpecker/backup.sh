#!/usr/bin/env bash
set -euo pipefail
umask 077

database=/opt/woodpecker/data/server/woodpecker.sqlite
backup_dir=/opt/woodpecker/backups
mkdir -p "$backup_dir"
target="$backup_dir/woodpecker-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
sqlite3 "$database" ".backup '$target'"
find "$backup_dir" -maxdepth 1 -type f -name 'woodpecker-*.sqlite' -mtime +14 -delete
