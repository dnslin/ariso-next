import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations';
import {
  initialMigration,
  upgradeMigration,
  brokenMigration,
  writeMigrations,
} from '../../fixtures/runtime/migrations';

const watermarkDefaults = {
  watermark_text: '',
  watermark_font: 'chinese',
  watermark_font_size: 3,
  watermark_color: '#FFFFFF',
  watermark_stroke_color: '#000000',
  watermark_stroke_width: 0,
  watermark_opacity: 50,
  watermark_position: 'bottom-right',
  watermark_margin: 2,
  watermark_width: 20,
};

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-migrations-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
const progress = () =>
  connection.db.$client
    .prepare(
      'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at',
    )
    .all();
const values = () =>
  connection.db.$client.prepare('SELECT value FROM sample').all();
const migrate = (folder: string) =>
  migrateRuntimeDatabase(connection.db, folder);

describe('runtime forward migrations', () => {
  it('真实存储探测数据库升级元数据和 CORS 字段时保留历史数据，新列默认值正确，重跑不重放', () => {
    const currentFolder = resolve('drizzle');
    const journal = JSON.parse(
      readFileSync(join(currentFolder, 'meta/_journal.json'), 'utf8'),
    ) as {
      version: string;
      dialect: string;
      entries: { idx: number; tag: string; when: number }[];
    };
    const storageProbeIndex = journal.entries.findIndex(
      (entry) => entry.tag === '0012_storage_probes',
    );
    expect(storageProbeIndex).toBeGreaterThanOrEqual(0);
    const previousEntries = journal.entries.slice(0, storageProbeIndex + 1);
    const previousFolder = join(directory, 'storage-probe-release');
    mkdirSync(join(previousFolder, 'meta'), { recursive: true });
    // Preserve the committed SQL and journal entries; only limit the release's endpoint.
    writeFileSync(
      join(previousFolder, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries: previousEntries }),
    );
    for (const entry of previousEntries)
      copyFileSync(
        join(currentFolder, `${entry.tag}.sql`),
        join(previousFolder, `${entry.tag}.sql`),
      );
    migrate(previousFolder);
    const db = connection.db.$client;
    db.exec(`
      INSERT INTO media_watermark_assets
        (id, path, format, mime, width, height, byte_size, status, expires_at, error, created_at, updated_at)
      VALUES ('retained-asset', 'watermarks/retained.png', 'PNG', 'image/png', 120, 60, 2048, 'ready', NULL, NULL, 1000, 2000);
      INSERT INTO media_watermark_preview_refs (preview_id, asset_id)
      VALUES ('retained-preview', 'retained-asset');
      INSERT INTO media_settings
        (id, compression_enabled, output_format, quality, max_edge, jpeg_background, watermark_mode, watermark_asset_id, default_link_version, default_visibility, concurrency, updated_at)
      VALUES (1, 1, 'jpeg', 80, 1920, '#ffffff', 'image', 'retained-asset', 'watermark', 'private', 2, 2000);
    `);
    const report = JSON.stringify({
      probeId: 'retained-probe',
      storageId: 'retained-storage',
      revision: 3,
      passed: false,
      stale: false,
      cleanupPending: true,
      stages: [
        {
          stage: 'delete',
          status: 'failed',
          error: 'retained cleanup failure',
        },
      ],
      deploymentRequirement: 'Bucket 必须保持私有',
      testedAt: '2026-09-30T00:00:00.000Z',
      ownerConfirmation: {
        wholeBucketHasNoLockRules: true,
        confirmedAt: '2026-09-30T00:00:00.000Z',
      },
    });
    db.prepare(
      `INSERT INTO storage_configs
      (id, name, type, enabled, endpoint, region, bucket, config_revision, connection_status, connection_revision, connection_report, created_at, updated_at)
      VALUES ('retained-storage', 'Existing S3 storage', 's3', 0, 'https://storage.example.invalid', 'auto', 'existing-bucket', 3, 'failed', 3, ?, 1000, 2000)`,
    ).run(report);
    db.prepare(
      `INSERT INTO storage_probes
      (id, storage_id, purpose, config_revision, key, state, stage, object_state, byte_size, confirmed_at, cleanup_attempts, next_cleanup_at, error, report, created_at, updated_at)
      VALUES ('retained-probe', 'retained-storage', 'connection', 3, 'probes/retained-probe', 'cleanup', 'delete', 'stored', 256, 1000, 2, 10000, 'retained cleanup failure', ?, 1000, 2000)`,
    ).run(report);
    const existingData = () => ({
      assets: db.prepare('SELECT * FROM media_watermark_assets').all(),
      previews: db.prepare('SELECT * FROM media_watermark_preview_refs').all(),
      settings: db.prepare('SELECT * FROM media_settings').all(),
      storage: db.prepare('SELECT * FROM storage_configs').all(),
      probes: db.prepare('SELECT * FROM storage_probes').all(),
    });
    const retainedData = existingData();
    const expectedUpgradedData = {
      ...retainedData,
      settings: retainedData.settings.map((row) => ({
        ...(row as Record<string, unknown>),
        ...watermarkDefaults,
      })),
      storage: retainedData.storage.map((row) => ({
        ...(row as Record<string, unknown>),
        cors_report: null,
      })),
      probes: retainedData.probes.map((row) => ({
        ...(row as Record<string, unknown>),
        origin: null,
        invalidated: 0,
        expires_at: null,
      })),
    };
    expect(() =>
      db.prepare('SELECT cors_report FROM storage_configs'),
    ).toThrow();
    expect(() =>
      db.prepare('SELECT origin, invalidated, expires_at FROM storage_probes'),
    ).toThrow();
    const originalProgress = progress();
    expect(originalProgress).toHaveLength(previousEntries.length);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name = 'media_metadata'")
        .get(),
    ).toBeUndefined();

    migrate(currentFolder);
    const metadataEntry = journal.entries.find(
      (entry) => entry.tag === '0013_magenta_colonel_america',
    )!;
    expect(metadataEntry.when).toBeGreaterThan(previousEntries.at(-1)!.when);
    const corsEntry = journal.entries.find(
      (entry) => entry.tag === '0015_fluffy_venus',
    )!;
    const watermarkEntry = journal.entries.find(
      (entry) => entry.tag === '0014_sticky_blacklash',
    )!;
    expect(watermarkEntry.when).toBeGreaterThan(metadataEntry.when);
    expect(corsEntry.when).toBeGreaterThan(watermarkEntry.when);
    const upgradedProgress = progress();
    expect(upgradedProgress).toHaveLength(journal.entries.length);
    expect(upgradedProgress.slice(0, originalProgress.length)).toEqual(
      originalProgress,
    );
    expect(upgradedProgress).toContainEqual({
      hash: createHash('sha256')
        .update(readFileSync(join(currentFolder, `${metadataEntry.tag}.sql`)))
        .digest('hex'),
      created_at: metadataEntry.when,
    });
    expect(
      db
        .prepare(
          'SELECT image_id, data, photography, read_at FROM media_metadata',
        )
        .all(),
    ).toEqual([]);
    expect(upgradedProgress).toContainEqual({
      hash: createHash('sha256')
        .update(readFileSync(join(currentFolder, `${corsEntry.tag}.sql`)))
        .digest('hex'),
      created_at: corsEntry.when,
    });
    expect(existingData()).toEqual(expectedUpgradedData);
    expect(db.pragma('foreign_key_check')).toEqual([]);

    migrate(currentFolder);
    expect(progress()).toEqual(upgradedProgress);
    expect(existingData()).toEqual(expectedUpgradedData);
    expect(db.prepare('SELECT * FROM media_metadata').all()).toEqual([]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('空 journal 可重复执行且没有业务表', () => {
    const folder = writeMigrations(join(directory, 'empty-sql'), []);
    migrate(folder);
    migrate(folder);
    expect(progress()).toEqual([]);
    expect(
      connection.db.$client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all(),
    ).toEqual([{ name: '__drizzle_migrations' }]);
  });
  it('正常迁移与升级，关闭重开后不重放', () => {
    const folder = writeMigrations(join(directory, 'sql'), [initialMigration]);
    migrate(folder);
    const originalProgress = progress();
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    migrate(folder);
    expect(progress()).toEqual(originalProgress);
    expect(values()).toEqual([{ value: 'original' }]);
    writeMigrations(folder, [initialMigration, upgradeMigration]);
    migrate(folder);
    migrate(folder);
    expect(values()).toEqual([{ value: 'original' }, { value: 'upgrade' }]);
    expect(progress()).toHaveLength(2);
  });

  it('从 main 水印迁移升级探测表时保留水印、存储数据与历史进度，重复升级不重放', () => {
    const journal = JSON.parse(
      readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string; when: number }[] };
    const mainEntries = journal.entries.slice(0, 12);
    expect(mainEntries.at(-1)?.tag).toBe('0011_little_shinko_yamashiro');
    expect(journal.entries[12].tag).toBe('0012_storage_probes');
    const mainFolder = writeMigrations(
      join(directory, 'main-sql'),
      mainEntries.map((entry) => ({
        ...entry,
        sql: readFileSync(resolve('drizzle', `${entry.tag}.sql`), 'utf8'),
      })),
    );
    migrate(mainFolder);
    const db = connection.db.$client;
    db.exec(`
      INSERT INTO media_watermark_assets
        (id, path, format, mime, width, height, byte_size, status, created_at, updated_at)
        VALUES ('watermark-before-upgrade', 'watermarks/existing.png', 'PNG', 'image/png', 32, 16, 512, 'ready', 1000, 2000);
      INSERT INTO media_watermark_preview_refs (preview_id, asset_id)
        VALUES ('preview-before-upgrade', 'watermark-before-upgrade');
      INSERT INTO media_settings
        (id, compression_enabled, output_format, quality, jpeg_background, watermark_mode, watermark_asset_id, default_link_version, default_visibility, concurrency, updated_at)
        VALUES (1, 1, 'webp', 82, '#FFFFFF', 'image', 'watermark-before-upgrade', 'watermark', 'private', 2, 2000);
      INSERT INTO storage_configs
        (id, name, type, enabled, local_path, created_at, updated_at)
        VALUES ('storage-before-upgrade', 'Existing storage', 'local', 1, 'existing', 1000, 2000);
    `);
    const watermarkBefore = db
      .prepare('SELECT * FROM media_watermark_assets')
      .all();
    const previewRefsBefore = db
      .prepare('SELECT * FROM media_watermark_preview_refs')
      .all();
    const settingsBefore = db.prepare('SELECT * FROM media_settings').all();
    const storageBefore = db.prepare('SELECT * FROM storage_configs').get();
    const progressBefore = progress();
    expect(progressBefore).toHaveLength(12);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name = 'storage_probes'")
        .get(),
    ).toBeUndefined();
    expect(() =>
      db.prepare('SELECT connection_report FROM storage_configs'),
    ).toThrow();

    migrate(resolve('drizzle'));
    expect(db.prepare('SELECT * FROM storage_probes').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM storage_configs').get()).toEqual({
      ...(storageBefore as Record<string, unknown>),
      connection_report: null,
      cors_report: null,
    });
    expect(db.prepare('SELECT * FROM media_watermark_assets').all()).toEqual(
      watermarkBefore,
    );
    expect(
      db.prepare('SELECT * FROM media_watermark_preview_refs').all(),
    ).toEqual(previewRefsBefore);
    expect(db.prepare('SELECT * FROM media_settings').all()).toEqual(
      settingsBefore.map((row) => ({
        ...(row as Record<string, unknown>),
        ...watermarkDefaults,
      })),
    );
    const upgradedProgress = progress();
    expect(upgradedProgress.slice(0, 12)).toEqual(progressBefore);
    expect(upgradedProgress).toHaveLength(journal.entries.length);
    expect(upgradedProgress[12]).toMatchObject({
      created_at: journal.entries[12].when,
    });

    migrate(resolve('drizzle'));
    expect(progress()).toEqual(upgradedProgress);
    expect(db.prepare('SELECT * FROM media_watermark_assets').all()).toEqual(
      watermarkBefore,
    );
    expect(
      db.prepare('SELECT * FROM media_watermark_preview_refs').all(),
    ).toEqual(previewRefsBefore);
    expect(db.prepare('SELECT * FROM media_settings').all()).toEqual(
      settingsBefore.map((row) => ({
        ...(row as Record<string, unknown>),
        ...watermarkDefaults,
      })),
    );
  });

  it('故障回滚整批 SQL 和进度，保留已提交数据，修复后继续', () => {
    const folder = writeMigrations(join(directory, 'sql'), [initialMigration]);
    migrate(folder);
    const before = progress();
    writeMigrations(folder, [
      initialMigration,
      upgradeMigration,
      brokenMigration,
    ]);
    expect(() => migrate(folder)).toThrowError(
      expect.objectContaining({
        code: 'MIGRATION_FAILED',
        stage: 'apply',
        databasePath: join(directory, 'ariso.db'),
        currentMigration: 1000,
        latestMigration: 3000,
        cause: expect.objectContaining({
          code: 'SQLITE_ERROR',
          message: 'no such table: missing_table',
        }),
      }),
    );
    expect(progress()).toEqual(before);
    expect(values()).toEqual([{ value: 'original' }]);
    expect(
      connection.db.$client
        .prepare("SELECT name FROM sqlite_master WHERE name = 'rolled_back'")
        .all(),
    ).toEqual([]);
    expect(connection.db.$client.inTransaction).toBe(false);
    writeMigrations(folder, [
      initialMigration,
      upgradeMigration,
      { ...brokenMigration, sql: "INSERT INTO sample VALUES ('fixed');" },
    ]);
    migrate(folder);
    expect(values()).toEqual([
      { value: 'original' },
      { value: 'upgrade' },
      { value: 'fixed' },
    ]);
    expect(progress()).toHaveLength(3);
  });
  it('首次迁移故障同样回滚，单个待执行文件可定位', () => {
    const folder = writeMigrations(join(directory, 'sql'), [brokenMigration]);
    expect(() => migrate(folder)).toThrowError(
      expect.objectContaining({
        stage: 'apply',
        currentMigration: null,
        migrationFiles: [join(folder, '0002_broken.sql')],
      }),
    );
    expect(progress()).toEqual([]);
    expect(
      connection.db.$client
        .prepare("SELECT name FROM sqlite_master WHERE name = 'rolled_back'")
        .all(),
    ).toEqual([]);
  });
  it.each(['old', 'empty'])(
    '拒绝较新数据库（%s 集合），保留现有数据和进度',
    (version) => {
      migrate(
        writeMigrations(join(directory, 'new'), [
          initialMigration,
          upgradeMigration,
        ]),
      );
      const before = progress();
      const folder =
        version === 'empty'
          ? writeMigrations(join(directory, 'empty-sql'), [])
          : writeMigrations(join(directory, 'old'), [initialMigration]);
      expect(() => migrate(folder)).toThrowError(
        expect.objectContaining({
          code: 'SCHEMA_TOO_NEW',
          stage: 'check-version',
          databasePath: join(directory, 'ariso.db'),
          currentMigration: 2000,
          latestMigration: version === 'empty' ? null : 1000,
          message: expect.stringContaining('恢复升级前的数据备份'),
        }),
      );
      expect(progress()).toEqual(before);
      expect(values()).toEqual([{ value: 'original' }, { value: 'upgrade' }]);
    },
  );
  it.each(['missing-journal', 'invalid-journal', 'missing-sql'])(
    '迁移文件故障提供读取阶段和已有进度（%s）',
    (fault) => {
      migrate(writeMigrations(join(directory, 'initial'), [initialMigration]));
      const before = progress();
      const folder = writeMigrations(join(directory, 'invalid'), [
        initialMigration,
        upgradeMigration,
      ]);
      const journal = join(folder, 'meta/_journal.json');
      if (fault === 'missing-journal') rmSync(journal);
      if (fault === 'invalid-journal') writeFileSync(journal, '{broken');
      if (fault === 'missing-sql') rmSync(join(folder, '0001_upgrade.sql'));
      expect(() => migrate(folder)).toThrowError(
        expect.objectContaining({
          code: 'MIGRATION_FAILED',
          stage: 'read-migrations',
          currentMigration: 1000,
          databasePath: join(directory, 'ariso.db'),
          cause: expect.any(Error),
        }),
      );
      expect(progress()).toEqual(before);
      expect(values()).toEqual([{ value: 'original' }]);
    },
  );
  it('诊断保留 SQLite 原因但不复制 SQL 中的秘密值', () => {
    const secret = 'migration-private-value';
    const folder = writeMigrations(join(directory, 'sql'), [
      {
        ...brokenMigration,
        sql: `INSERT INTO missing_table VALUES ('${secret}');`,
      },
    ]);
    let failure: unknown;
    try {
      migrate(folder);
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(
      expect.objectContaining({
        cause: expect.objectContaining({ code: 'SQLITE_ERROR' }),
      }),
    );
    expect(inspect(failure)).not.toContain(secret);
    expect(inspect(failure)).not.toContain('INSERT INTO');
  });
  it('进度表无法读取时报告阶段，不删除已有表', () => {
    connection.db.$client.exec(
      'CREATE TABLE __drizzle_migrations (unexpected TEXT)',
    );
    expect(() => migrate(resolve('drizzle'))).toThrowError(
      expect.objectContaining({
        code: 'MIGRATION_FAILED',
        stage: 'read-progress',
        databasePath: join(directory, 'ariso.db'),
        cause: expect.objectContaining({ code: 'SQLITE_ERROR' }),
      }),
    );
    expect(
      connection.db.$client
        .prepare('SELECT unexpected FROM __drizzle_migrations')
        .all(),
    ).toEqual([]);
  });
});
