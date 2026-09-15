import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as database from '../../../src/server/runtime/db.ts';
import { runPreflight } from '../../../src/server/startup/preflight.ts';
import {
  initialMigration,
  brokenMigration,
  writeMigrations,
} from '../../fixtures/runtime/migrations';

let directory: string;
let env: Record<string, string>;
const cli = resolve('dist/cli/prestart.js');
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-prestart-'));
  env = {
    DATA_DIR: join(directory, 'data'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  writeMigrations(join(directory, 'drizzle'), []);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});
function run(overrides: Record<string, string | undefined> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--no-experimental-strip-types', cli],
    {
      cwd: directory,
      env: { ...env, ...overrides, NODE_ENV: 'test' },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}
function expectClosed() {
  for (const suffix of ['-wal', '-shm']) {
    expect(existsSync(join(env.DATA_DIR, `ariso.db${suffix}`))).toBe(false);
  }
}
function readRows(query: string) {
  const connection = database.openRuntimeDatabase(
    join(env.DATA_DIR, 'ariso.db'),
  );
  try {
    return connection.db.$client.prepare(query).all();
  } finally {
    connection.close();
  }
}

describe('compiled prestart CLI', () => {
  it('普通 Node 执行编译产物，空 journal 重复启动成功并关闭连接', () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = run();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe('');
      expectClosed();
    }
    expect(
      readRows("SELECT name FROM sqlite_master WHERE type = 'table'"),
    ).toEqual([{ name: '__drizzle_migrations' }]);
    expect(existsSync(join(env.DATA_DIR, 'assets/branding'))).toBe(true);
    expect(existsSync(join(env.DATA_DIR, 'storage/default'))).toBe(false);
  });

  it('无效配置先于目录操作失败，诊断不泄露密钥', () => {
    const result = run({
      PORT: '0',
      ARISO_ENCRYPTION_KEY: 'private-invalid-key',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PORT');
    expect(result.stderr).toContain('ARISO_ENCRYPTION_KEY');
    expect(result.stderr).not.toContain('private-invalid-key');
    expect(result.stderr).not.toContain(env.BETTER_AUTH_SECRET);
    expect(existsSync(env.DATA_DIR)).toBe(false);
  });

  it('目录故障保留原文件、错误码和路径，非零退出', () => {
    writeFileSync(env.DATA_DIR, 'keep');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EEXIST');
    expect(result.stderr).toContain(env.DATA_DIR);
    expect(readFileSync(env.DATA_DIR, 'utf8')).toBe('keep');
  });

  it('迁移失败回滚待执行 SQL，关闭连接，修复后继续且不重放', () => {
    const folder = writeMigrations(join(directory, 'drizzle'), [
      initialMigration,
    ]);
    expect(run().status).toBe(0);
    writeMigrations(folder, [initialMigration, brokenMigration]);
    const failed = run();
    expect(failed.status).toBe(1);
    for (const diagnostic of [
      'MIGRATION_FAILED',
      'apply',
      'current=1000',
      'SQLITE_ERROR',
      'missing_table',
      '0002_broken.sql',
      join(env.DATA_DIR, 'ariso.db'),
    ]) {
      expect(failed.stderr).toContain(diagnostic);
    }
    expectClosed();
    expect(readRows('SELECT value FROM sample')).toEqual([
      { value: 'original' },
    ]);
    expect(
      readRows("SELECT name FROM sqlite_master WHERE name = 'rolled_back'"),
    ).toEqual([]);
    writeMigrations(folder, [
      initialMigration,
      { ...brokenMigration, sql: "INSERT INTO sample VALUES ('fixed');" },
    ]);
    expect(run().status).toBe(0);
    expect(run().status).toBe(0);
    expectClosed();
    expect(readRows('SELECT value FROM sample')).toEqual([
      { value: 'original' },
      { value: 'fixed' },
    ]);
  });

  it('已有数据库比空集合更新时明确拒绝，保留数据并关闭连接', () => {
    writeMigrations(join(directory, 'drizzle'), [initialMigration]);
    expect(run().status).toBe(0);
    writeMigrations(join(directory, 'drizzle'), []);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SCHEMA_TOO_NEW');
    expectClosed();
    expect(readRows('SELECT value FROM sample')).toEqual([
      { value: 'original' },
    ]);
  });

  it.each([false, true])(
    'preflight 返回或抛错前已关闭真实连接（故障=%s）',
    (fail) => {
      if (fail) {
        writeMigrations(join(directory, 'drizzle'), [initialMigration]);
        expect(run().status).toBe(0);
      }
      const open = database.openRuntimeDatabase;
      const connections: ReturnType<typeof open>[] = [];
      vi.spyOn(database, 'openRuntimeDatabase').mockImplementation((path) => {
        const connection = open(path);
        connections.push(connection);
        return connection;
      });
      try {
        if (fail) expect(() => runPreflight(env)).toThrow('SCHEMA_TOO_NEW');
        else runPreflight(env);
        expect(connections).toHaveLength(1);
        expect(connections[0].db.$client.open).toBe(false);
      } finally {
        for (const connection of connections) connection.close();
      }
    },
  );
});
