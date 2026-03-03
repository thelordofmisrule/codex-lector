#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_FILE="$ROOT_DIR/data/releases/last-known-good.json"
SERVICE_NAME="${SERVICE_NAME:-codex-lector}"

cd "$ROOT_DIR"

if [[ ! -f "$RELEASE_FILE" ]]; then
  echo "No rollback metadata found at $RELEASE_FILE"
  exit 1
fi

rollback_sha="$(
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if(!data.previousSha){process.exit(1)}; process.stdout.write(data.previousSha);" "$RELEASE_FILE"
)"
backup_path="$(
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(data.predeployBackup || '');" "$RELEASE_FILE"
)"

echo "Rolling back to $rollback_sha"
git reset --hard "$rollback_sha"
npm run build
sudo systemctl restart "$SERVICE_NAME"

echo "Code rollback complete."
if [[ -n "$backup_path" ]]; then
  echo "Predeploy DB backup available at: $backup_path"
  echo "If needed, restore it with: node scripts/restore-db.js \"$backup_path\""
fi
