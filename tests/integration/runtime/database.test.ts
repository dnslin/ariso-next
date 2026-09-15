import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db';
import { initializeRuntimePaths } from '../../../src/server/runtime/paths';

let directory: string;
const connections: ReturnType<typeof openRuntimeDatabase>[] = [];
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-database-'));
});
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  rmSync(directory, { recursive: true, force: true });
});

function openDatabase() {
  const paths = initializeRuntimePaths(join(directory, 'data'));
  const connection = openRuntimeDatabase(paths.database);
  connections.push(connection);
  return { paths, ...connection };
}

describe('runtime disk database', () => {
  it('重复创建基础目录，保留 tmp 内容，不创建默认存储', () => {
    const dataDir = join(directory, 'nested', 'data');
    const paths = initializeRuntimePaths(dataDir);
    expect(paths).toEqual({
      dataDir,
      database: join(dataDir, 'ariso.db'),
      storage: join(dataDir, 'storage'),
      assets: join(dataDir, 'assets'),
      watermarks: join(dataDir, 'assets', 'watermarks'),
      branding: join(dataDir, 'assets', 'branding'),
      tmp: join(dataDir, 'tmp'),
    });
    for (const path of Object.values(paths).filter(
      (p) => p !== paths.database,
    )) {
      expect(statSync(path).isDirectory()).toBe(true);
    }
    writeFileSync(join(paths.tmp, 'pending'), 'unfinished upload');
    expect(initializeRuntimePaths(dataDir)).toEqual(paths);
    expect(readFileSync(join(paths.tmp, 'pending'), 'utf8')).toBe(
      'unfinished upload',
    );
    expect(readdirSync(paths.storage)).toEqual([]);
    expect(existsSync(paths.database)).toBe(false);
  });

  it.each([0o555, 0o666])(
    '不可写或不可遍历的已有目录保留错误码和路径，不修改权限（%i）',
    (mode) => {
      const paths = initializeRuntimePaths(directory);
      chmodSync(paths.tmp, mode);
      try {
        expect(() => initializeRuntimePaths(directory)).toThrowError(
          expect.objectContaining({ code: 'EACCES', path: paths.tmp }),
        );
        expect(statSync(paths.tmp).mode & 0o777).toBe(mode);
      } finally {
        chmodSync(paths.tmp, 0o755);
      }
    },
  );

  it('目录位置被文件占用时保留底层错误与路径', () => {
    const blocked = join(directory, 'storage');
    writeFileSync(blocked, 'keep');
    expect(() => initializeRuntimePaths(directory)).toThrowError(
      expect.objectContaining({ code: 'EEXIST', path: blocked }),
    );
    expect(readFileSync(blocked, 'utf8')).toBe('keep');
  });

  it('真实磁盘连接启用规定设置，空数据库没有业务表，并能关闭', () => {
    const { paths, db, close } = openDatabase();
    expect(db.$client.memory).toBe(false);
    expect(db.$client.name).toBe(paths.database);
    expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.$client.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(
      db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table'`),
    ).toEqual([]);
    expect(existsSync(paths.database)).toBe(true);
    close();
    expect(db.$client.open).toBe(false);
    expect(() => db.get(sql`SELECT 1`)).toThrow();
  });

  it('外键实际拒绝无效记录，原生事务回滚失败写入', () => {
    const { db } = openDatabase();
    db.run(sql`CREATE TABLE parent (id INTEGER PRIMARY KEY)`);
    db.run(sql`CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))`);
    expect(() =>
      db.transaction((tx) => {
        tx.run(sql`INSERT INTO parent VALUES (1)`);
        tx.run(sql`INSERT INTO child VALUES (2)`);
      }),
    ).toThrow();
    expect(db.all(sql`SELECT * FROM parent`)).toEqual([]);
  });

  it('锁冲突在驱动超时后保留 SQLITE_BUSY，释放锁后可继续写入', () => {
    const { paths, db } = openDatabase();
    db.run(sql`CREATE TABLE busy_sample (value INTEGER)`);
    const second = openRuntimeDatabase(paths.database);
    connections.push(second);
    db.run(sql`BEGIN IMMEDIATE`);
    try {
      expect(() =>
        second.db.run(sql`INSERT INTO busy_sample VALUES (1)`),
      ).toThrowError(
        expect.objectContaining({
          cause: expect.objectContaining({ code: 'SQLITE_BUSY' }),
        }),
      );
    } finally {
      db.run(sql`ROLLBACK`);
    }
    second.db.run(sql`INSERT INTO busy_sample VALUES (2)`);
    expect(db.all(sql`SELECT value FROM busy_sample`)).toEqual([{ value: 2 }]);
  }, 10000);

  it('损坏数据库报原生错误，不覆盖已有数据', () => {
    const paths = initializeRuntimePaths(directory);
    const content = 'not a database'.repeat(100);
    writeFileSync(paths.database, content);
    expect(() => openRuntimeDatabase(paths.database)).toThrowError(
      expect.objectContaining({ code: 'SQLITE_NOTADB' }),
    );
    expect(readFileSync(paths.database, 'utf8')).toBe(content);
  });

  it('一个进程写入并退出后，另一个进程通过 Drizzle 读到同一记录', () => {
    const paths = initializeRuntimePaths(join(directory, 'process data'));
    const moduleUrl = new URL(
      '../../../src/server/runtime/db.ts',
      import.meta.url,
    );
    const source = `
      import { openRuntimeDatabase } from ${JSON.stringify(moduleUrl.href)};
      import { sql } from 'drizzle-orm';
      const { db, close } = openRuntimeDatabase(process.argv[1]);
      try {
        if (process.argv[2] === 'write') {
          db.run(sql\`CREATE TABLE restart_sample (value TEXT NOT NULL)\`);
          db.run(sql\`INSERT INTO restart_sample VALUES (\${process.argv[3]})\`);
        } else {
          console.log(JSON.stringify(db.all(sql\`SELECT value FROM restart_sample\`)));
        }
      } finally { close(); }
    `;
    const value = "跨进程持久化 ' sample";
    const run = (mode: string) =>
      execFileSync(
        process.execPath,
        ['--input-type=module', '-e', source, paths.database, mode, value],
        {
          cwd: fileURLToPath(new URL('../../../', import.meta.url)),
          encoding: 'utf8',
          timeout: 10000,
        },
      );
    run('write');
    expect(JSON.parse(run('read'))).toEqual([{ value }]);
    expect(existsSync(`${paths.database}-wal`)).toBe(false);
    expect(existsSync(`${paths.database}-shm`)).toBe(false);
  });
});
