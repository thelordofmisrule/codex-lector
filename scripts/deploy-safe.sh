#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
DEPLOY_LOG_DIR="$LOG_DIR/deploy"
RELEASE_DIR="$ROOT_DIR/data/releases"
ROLLBACK_FILE="$RELEASE_DIR/last-known-good.json"
SERVICE_NAME="${SERVICE_NAME:-codex-lector}"
LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-14}"

mkdir -p "$DEPLOY_LOG_DIR" "$RELEASE_DIR"

timestamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
log_file="$DEPLOY_LOG_DIR/deploy-$timestamp.log"

prune_old_files() {
  find "$1" -type f -mtime +"$LOG_RETENTION_DAYS" -delete 2>/dev/null || true
}

run_step() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "$log_file"
  "$@" 2>&1 | tee -a "$log_file"
}

rollback() {
  local reason="$1"
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Deploy failed: $reason" | tee -a "$log_file"
  if [[ -n "${previous_sha:-}" ]]; then
    echo "Rolling back to $previous_sha" | tee -a "$log_file"
    git reset --hard "$previous_sha" 2>&1 | tee -a "$log_file" || true
    npm run build 2>&1 | tee -a "$log_file" || true
    sudo systemctl restart "$SERVICE_NAME" 2>&1 | tee -a "$log_file" || true
  fi
  echo "If schema or data changed, restore the predeploy backup printed above." | tee -a "$log_file"
  exit 1
}

cd "$ROOT_DIR"

previous_sha="$(git rev-parse HEAD)"
backup_path="$(node scripts/backup-db.js --label "predeploy-$timestamp")"
echo "Predeploy backup: $backup_path" | tee -a "$log_file"

trap 'rollback "unexpected error"' ERR

run_step git fetch origin
target_sha="$(git rev-parse origin/main)"

cat > "$ROLLBACK_FILE" <<EOF
{
  "savedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "previousSha": "$previous_sha",
  "targetSha": "$target_sha",
  "predeployBackup": "$backup_path"
}
EOF

run_step git reset --hard "$target_sha"
run_step npm run setup
run_step npm run build
run_step sudo systemctl restart "$SERVICE_NAME"

trap - ERR
prune_old_files "$DEPLOY_LOG_DIR"
prune_old_files "$RELEASE_DIR"

echo "Deploy succeeded: $target_sha" | tee -a "$log_file"
echo "Rollback metadata: $ROLLBACK_FILE" | tee -a "$log_file"
