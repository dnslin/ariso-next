import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { writeMigrations } from '../../fixtures/runtime/migrations.ts';

it('upgrades existing upload ownership without losing cleanup fields and permits target-free API receipts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-receipt-migration-'));
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  try {
    const current = resolve('drizzle');
    const journal = JSON.parse(
      readFileSync(join(current, 'meta/_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string; when: number }[];
    };
    const previous = journal.entries.slice(0, -1);
    expect(previous.at(-1)?.tag).toBe('0023_narrow_patriot');
    const folder = writeMigrations(
      join(directory, 'previous-release'),
      previous.map((entry) => ({
        ...entry,
        sql: readFileSync(join(current, `${entry.tag}.sql`), 'utf8'),
      })),
    );
    migrateRuntimeDatabase(connection.db, folder);
    const db = connection.db.$client;
    db.exec(`
      INSERT INTO storage_configs
        (id, name, type, enabled, local_path, created_at, updated_at)
      VALUES ('saved-storage', 'Saved storage', 'local', 0, 'saved', 1000, 2000);
      INSERT INTO upload_submissions
        (id, request_id, request_input, source, storage_id, visibility, snapshot, album_ids, tag_ids, max_file_bytes, batch_size, queue_limit, last_activity_at, created_at)
      VALUES ('saved-submission', 'saved-request', '{}', 'web', 'saved-storage', 'private', '{}', '[]', '[]', 10000, 20, 500, 2000, 1000);
      INSERT INTO upload_sessions
        (id, submission_id, queue_item_id, group_index, original_name, declared_size, declared_mime, storage_id, state, candidate_image_id, candidate_job_id, route, temporary_path, temporary_key, final_key, temporary_bytes, final_bytes, confirmed_at, error_code, error, cleanup_status, cleanup_attempts, next_cleanup_at, created_at, updated_at)
      VALUES ('saved-session', 'saved-submission', 'saved-queue-item', 1, 'saved.png', 100, 'image/png', 'saved-storage', 'failed', 'saved-image', 'saved-job', 'relay', '/controlled/tmp/source', 'uploads/source', 'original/candidate.png', 100, 100, 2000, 'UPLOAD_INTERRUPTED', 'saved cleanup failure', 'pending', 2, 10000, 1000, 2000);
    `);
    const session = db.prepare('SELECT * FROM upload_sessions').all();
    const submission = db
      .prepare('SELECT * FROM upload_submissions')
      .all() as Record<string, unknown>[];
    const progress = () =>
      db
        .prepare('SELECT * FROM __drizzle_migrations ORDER BY created_at')
        .all();
    const originalProgress = progress();
    migrateRuntimeDatabase(connection.db, current);
    expect(db.prepare('SELECT * FROM upload_sessions').all()).toEqual(session);
    expect(db.prepare('SELECT * FROM upload_submissions').all()).toEqual(
      submission.map((row) => ({ ...row, api_token_id: null })),
    );
    for (const name of ['submission_id', 'storage_id'])
      expect(
        db.prepare('PRAGMA table_info(upload_sessions)').all(),
      ).toContainEqual(expect.objectContaining({ name, notnull: 0 }));
    expect(db.prepare('PRAGMA table_info(media_jobs)').all()).toContainEqual(
      expect.objectContaining({ name: 'metadata_warning', notnull: 0 }),
    );
    db.exec(`
      INSERT INTO upload_sessions
        (id, queue_item_id, group_index, original_name, declared_size, state, candidate_image_id, temporary_path, created_at, updated_at)
      VALUES ('api-receipt', 'api-receipt', 0, 'incoming.png', 0, 'receiving', 'api-image', '/controlled/tmp/incoming', 3000, 3000);
    `);
    expect(
      db
        .prepare(
          "SELECT submission_id, storage_id FROM upload_sessions WHERE id = 'api-receipt'",
        )
        .get(),
    ).toEqual({
      submission_id: null,
      storage_id: null,
    });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const upgradedProgress = progress();
    expect(upgradedProgress).toHaveLength(journal.entries.length);
    expect(upgradedProgress.slice(0, originalProgress.length)).toEqual(
      originalProgress,
    );
    const retained = db
      .prepare('SELECT * FROM upload_sessions ORDER BY id')
      .all();
    migrateRuntimeDatabase(connection.db, current);
    expect(progress()).toEqual(upgradedProgress);
    expect(
      db.prepare('SELECT * FROM upload_sessions ORDER BY id').all(),
    ).toEqual(retained);
  } finally {
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
