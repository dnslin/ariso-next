import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import {
  initializeSiteSettings,
  readSiteSettings,
  requireSiteSettings,
  updateSiteSettings,
} from '../../../src/server/site/settings.ts';
import { siteSettingsInputSchema } from '../../../src/server/site/validation.ts';
import { buildSiteUrl } from '../../../src/server/site/urls.ts';
import { formatSiteInstant } from '../../../src/server/site/time.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
const input = siteSettingsInputSchema.parse({
  publicUrl: 'https://IMG.example.com/',
  timeZone: 'UTC',
});
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-site-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
const initialize = () =>
  connection.db.transaction((tx) => initializeSiteSettings(tx, input));

describe('site 真实磁盘 SQLite', () => {
  it('生产迁移可重复执行，空库不生成站点或虚构地址', () => {
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
    expect(readSiteSettings(connection.db)).toBeNull();
    expect(() =>
      buildSiteUrl(requireSiteSettings(connection.db), '/image'),
    ).toThrowError(expect.objectContaining({ code: 'SITE_NOT_INITIALIZED' }));
    expect(() =>
      connection.db.transaction((tx) => updateSiteSettings(tx, input)),
    ).toThrowError(expect.objectContaining({ code: 'SITE_NOT_INITIALIZED' }));
    expect(readSiteSettings(connection.db)).toBeNull();
  });

  it('事务保存规范化配置和默认品牌，时间存为 UTC 毫秒并可序列化为 ISO UTC', () => {
    const before = Date.now();
    const saved = initialize();
    expect(saved).toEqual({
      id: 1,
      ...input,
      name: 'Ariso',
      description: '',
      logoKey: null,
      logoMime: null,
      faviconKey: null,
      faviconMime: null,
      updatedAt: expect.any(Date),
    });
    expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(saved.updatedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(readSiteSettings(connection.db)).toEqual(saved);
    expect(
      connection.db.$client
        .prepare('SELECT updated_at FROM site_settings')
        .get(),
    ).toEqual({ updated_at: saved.updatedAt.getTime() });
    expect(JSON.parse(JSON.stringify(saved)).updatedAt).toBe(
      saved.updatedAt.toISOString(),
    );
  });

  it('数据库拒绝第二站点、重复初始化、缺失必填字段和半个素材引用', () => {
    const saved = initialize();
    expect(() => initialize()).toThrow();
    expect(() =>
      connection.db
        .insert(siteSettings)
        .values({ ...input, id: 2, updatedAt: new Date() })
        .run(),
    ).toThrow();
    for (const field of [
      'public_url',
      'time_zone',
      'name',
      'description',
      'updated_at',
    ]) {
      expect(() =>
        connection.db.$client
          .prepare(`UPDATE site_settings SET ${field} = NULL`)
          .run(),
      ).toThrow();
    }
    for (const field of [
      'logo_key',
      'logo_mime',
      'favicon_key',
      'favicon_mime',
    ]) {
      expect(() =>
        connection.db.$client
          .prepare(`UPDATE site_settings SET ${field} = 'orphan'`)
          .run(),
      ).toThrow();
    }
    expect(requireSiteSettings(connection.db)).toEqual(saved);
  });

  it('非法输入在入口拒绝，没有部分写入', () => {
    expect(() =>
      connection.db.transaction((tx) =>
        initializeSiteSettings(
          tx,
          siteSettingsInputSchema.parse({
            publicUrl: 'https://example.com/subpath',
            timeZone: '+08:00',
          }),
        ),
      ),
    ).toThrow();
    expect(readSiteSettings(connection.db)).toBeNull();
  });

  it('初始化后另一项 SQL 失败则整体回滚；修正后可以重试', () => {
    connection.db.$client.exec(
      'CREATE TABLE setup_sample (id INTEGER PRIMARY KEY CHECK (id = 1))',
    );
    expect(() =>
      connection.db.transaction((tx) => {
        initializeSiteSettings(tx, input);
        tx.run('INSERT INTO setup_sample VALUES (2)');
      }),
    ).toThrow();
    expect(readSiteSettings(connection.db)).toBeNull();
    expect(
      connection.db.$client.prepare('SELECT * FROM setup_sample').all(),
    ).toEqual([]);
    expect(initialize()).toMatchObject(input);
  });

  it('更新失败保留旧配置；已有快照稳定而新读取立即使用新地址', () => {
    const old = initialize();
    const next = siteSettingsInputSchema.parse({
      publicUrl: 'https://new.example.com:8443',
      timeZone: 'Asia/Shanghai',
    });
    const failure = new Error('组合操作失败');
    expect(() =>
      connection.db.transaction((tx) => {
        updateSiteSettings(tx, next);
        throw failure;
      }),
    ).toThrow(failure);
    expect(requireSiteSettings(connection.db)).toEqual(old);
    connection.db.transaction((tx) => updateSiteSettings(tx, next));
    expect(buildSiteUrl(old, '/image/1')).toBe(
      'https://img.example.com/image/1',
    );
    expect(buildSiteUrl(requireSiteSettings(connection.db), '/image/1')).toBe(
      'https://new.example.com:8443/image/1',
    );
  });

  it('修改时区不改写历史 UTC 时间和品牌，只改变展示', () => {
    initialize();
    const instant = Date.parse('2026-03-08T07:00:00Z');
    connection.db.$client.exec(
      'CREATE TABLE history_sample (instant INTEGER NOT NULL)',
    );
    connection.db.$client
      .prepare('INSERT INTO history_sample VALUES (?)')
      .run(instant);
    connection.db.$client.exec(
      "UPDATE site_settings SET name = '我的站点', description = '描述'",
    );
    const changed = connection.db.transaction((tx) =>
      updateSiteSettings(tx, { ...input, timeZone: 'America/New_York' }),
    );
    expect(
      connection.db.$client.prepare('SELECT instant FROM history_sample').get(),
    ).toEqual({ instant });
    expect(changed).toMatchObject({ name: '我的站点', description: '描述' });
    expect(
      formatSiteInstant(instant, changed.timeZone, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    ).toBe('03:00');
  });

  it('数据库读取故障向上传播，不能伪装成未初始化', () => {
    connection.db.$client.exec('DROP TABLE site_settings');
    expect(() => readSiteSettings(connection.db)).toThrow('no such table');
    expect(() => requireSiteSettings(connection.db)).toThrow('no such table');
  });

  it('独立进程写入退出后，另一个进程通过公开读取函数得到持久化配置', () => {
    connection.close();
    const source = `
      import { openRuntimeDatabase } from ${JSON.stringify(new URL('../../../src/server/runtime/db.ts', import.meta.url).href)};
      import { initializeSiteSettings, requireSiteSettings } from ${JSON.stringify(new URL('../../../src/server/site/settings.ts', import.meta.url).href)};
      import { siteSettingsInputSchema } from ${JSON.stringify(new URL('../../../src/server/site/validation.ts', import.meta.url).href)};
      const { db, close } = openRuntimeDatabase(process.argv[1]);
      try {
        if (process.argv[2] === 'write') db.transaction(tx => initializeSiteSettings(tx, siteSettingsInputSchema.parse({ publicUrl: 'https://IMG.example.com/', timeZone: 'UTC' })));
        else console.log(JSON.stringify(requireSiteSettings(db)));
      } finally { close(); }
    `;
    const run = (mode: string) =>
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          source,
          join(directory, 'ariso.db'),
          mode,
        ],
        { cwd: resolve('.'), encoding: 'utf8', timeout: 10000 },
      );
    run('write');
    const saved = JSON.parse(run('read'));
    expect(saved).toMatchObject({ id: 1, ...input, name: 'Ariso' });
    expect(new Date(saved.updatedAt).toISOString()).toBe(saved.updatedAt);
  });
});
