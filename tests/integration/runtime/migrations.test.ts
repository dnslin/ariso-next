import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  it('空生产 journal 可重复执行且没有业务表', () => {
    migrate(resolve('drizzle'));
    migrate(resolve('drizzle'));
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
          ? resolve('drizzle')
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
