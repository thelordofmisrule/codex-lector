# Operations

Codex Lector now includes basic operational safeguards in-repo.

## Automatic DB Backups

- The production server runs an automatic backup check on startup and then once per hour.
- If the newest backup is older than `AUTO_BACKUP_HOURS` (default `24`), it creates a fresh SQLite snapshot.
- Backups are written to `data/backups/`.
- Backup retention is controlled by `BACKUP_RETENTION_DAYS` (default `14`).

Manual backup:

```bash
npm run backup:db
```

## Restore

Restore the newest backup:

```bash
npm run restore:db
```

Restore a specific backup:

```bash
node scripts/restore-db.js data/backups/codex-2026-03-03T00-00-00-000Z.db
```

After restore, restart the service.

## Logs

- App logs are mirrored to `logs/app-YYYY-MM-DD.log`.
- Old app logs are pruned automatically based on `LOG_RETENTION_DAYS` (default `14`).
- Safe deploy logs are written to `logs/deploy/`.

## Safe Deploy

Use this on the VPS instead of the manual reset/build flow:

```bash
npm run deploy:safe
```

What it does:

1. creates a predeploy DB backup
2. saves rollback metadata to `data/releases/last-known-good.json`
3. fetches `origin/main`
4. hard-resets to the target commit
5. runs `npm run setup`
6. runs `npm run build`
7. restarts `codex-lector`

If build or restart fails, it automatically resets the code back to the previous commit and restarts the service.

## Rollback

Roll back code to the last known good commit:

```bash
npm run rollback
```

This restores the previous code revision and rebuilds the client.

If you also need to restore content state, use the backup path printed by the deploy or rollback script and run `npm run restore:db`.
