import type Database from 'better-sqlite3';

export function checkBackupDatabase(db: Database.Database) {
  if (db.pragma('integrity_check', { simple: true }) !== 'ok')
    throw Object.assign(new Error('备份数据库完整性检查失败'), {
      code: 'BACKUP_DATABASE_INVALID',
    });
  if ((db.pragma('foreign_key_check') as unknown[]).length)
    throw Object.assign(new Error('备份数据库包含失效的数据关联'), {
      code: 'BACKUP_DATABASE_INVALID',
    });
}

/** Only the snapshot is writable here. Browser and authentication state never migrates. */
export function normalizeSnapshot(db: Database.Database) {
  db.transaction(() => {
    for (const table of [
      'media_watermark_preview_refs',
      'media_previews',
      'upload_sessions',
      'upload_submissions',
      'storage_probes',
      'storage_orphans',
      'storage_scans',
      'session',
      'verification',
      'share_grants',
    ])
      db.prepare(`DELETE FROM ${table}`).run();
    // Draining leaves no persistent running work. Do not silently turn an unfinished write into success.
    if (
      db
        .prepare(
          "SELECT 1 FROM media_jobs WHERE status='running' UNION ALL SELECT 1 FROM media_cleanup_jobs WHERE status='running' LIMIT 1",
        )
        .get()
    )
      throw Object.assign(new Error('仍有持久任务运行，无法生成稳定备份'), {
        code: 'BACKUP_NOT_QUIESCENT',
      });
    db.prepare(
      "UPDATE media_objects SET status='deleted', byte_size=0, next_cleanup_at=NULL WHERE purpose='temporary'",
    ).run();
    // A new machine has no previous storage probe or scan result.
    db.prepare(
      "UPDATE storage_configs SET connection_status='untested', connection_revision=NULL, connection_report=NULL, connection_tested_at=NULL, cors_status='untested', cors_revision=NULL, cors_report=NULL, cors_origin=NULL, cors_tested_at=NULL",
    ).run();
  })();
  checkBackupDatabase(db);
}
