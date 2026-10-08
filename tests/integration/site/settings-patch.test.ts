import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  initializeSiteSettings,
  requireSiteSettings,
} from '../../../src/server/site/settings.ts';
import {
  patchSiteSettingsResponse,
  readSiteSettingsResponse,
} from '../../../src/server/site/settings-http.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import {
  storageConfigs,
  storageProbes,
} from '../../../src/server/storage/schema.ts';
import { mediaImages, mediaObjects } from '../../../src/server/media/schema.ts';
import {
  buildImageUrl,
  buildImagePath,
} from '../../../src/server/delivery/links.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
const origin = 'https://img.example.com';
const historicalInstant = new Date('2026-03-08T07:00:00.000Z');

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-site-patch-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
function seed() {
  connection.db.transaction((tx) => {
    initializeSiteSettings(tx, { publicUrl: origin, timeZone: 'UTC' });
    tx.update(siteSettings)
      .set({ logoKey: 'site-logo.svg', logoMime: 'image/svg+xml' })
      .run();
    for (const [id, type, enabled] of [
      ['s3-enabled', 's3', true],
      ['s3-disabled', 's3', false],
      ['local', 'local', true],
    ] as const) {
      tx.insert(storageConfigs)
        .values({
          id,
          name: id,
          type,
          enabled,
          corsStatus: 'passed',
          createdAt: historicalInstant,
          updatedAt: historicalInstant,
        })
        .run();
    }
    tx.insert(storageProbes)
      .values({
        id: 'in-flight-cors',
        storageId: 's3-enabled',
        purpose: 'cors',
        configRevision: 1,
        origin,
        key: 'ariso/probes/probe-key',
        state: 'running',
        stage: 'browser',
        objectState: 'stored',
        report: {
          probeId: 'in-flight-cors',
          storageId: 's3-enabled',
          revision: 1,
          origin,
          passed: true,
          stale: false,
          cleanupPending: false,
          stages: [],
          testedAt: historicalInstant.toISOString(),
        },
        createdAt: historicalInstant,
        updatedAt: historicalInstant,
      })
      .run();
    tx.insert(mediaImages)
      .values({
        id: 'image-stable',
        storageId: 's3-enabled',
        originalName: 'image.png',
        displayName: 'image.png',
        visibility: 'public',
        format: 'PNG',
        mime: 'image/png',
        byteSize: 10,
        processingStatus: 'ready',
        createdAt: historicalInstant,
        updatedAt: historicalInstant,
      })
      .run();
    tx.insert(mediaObjects)
      .values({
        id: 'object-stable',
        imageId: 'image-stable',
        storageId: 's3-enabled',
        key: 'ariso/images/image-stable/original.png',
        purpose: 'original',
        status: 'stored',
        createdAt: historicalInstant,
        updatedAt: historicalInstant,
      })
      .run();
  });
}

it('未初始化时读写均拒绝，不创建站点记录', () => {
  for (const operation of [
    () => readSiteSettingsResponse(connection.db),
    () => patchSiteSettingsResponse(connection.db, { name: '新名称' }),
  ])
    expect(operation).toThrowError(
      expect.objectContaining({ code: 'SITE_NOT_INITIALIZED' }),
    );
  expect(connection.db.select().from(siteSettings).all()).toEqual([]);
});

it('四字段分别 PATCH，保留未提交字段与素材；HTTP 数据时间为 UTC', () => {
  seed();
  let previous = readSiteSettingsResponse(connection.db);
  for (const input of [
    { name: '我的站点' },
    { description: '' },
    { publicUrl: 'https://new.example.com' },
    { timeZone: 'America/New_York' },
  ]) {
    const response = patchSiteSettingsResponse(connection.db, input);
    expect(response).toMatchObject({
      ...previous,
      ...input,
      updatedAt: expect.any(String),
      githubCallbackUrl: `${input.publicUrl ?? previous.publicUrl}/api/auth/callback/github`,
    });
    expect(new Date(response.updatedAt).toISOString()).toBe(response.updatedAt);
    previous = readSiteSettingsResponse(connection.db);
  }
  expect(previous).toMatchObject({
    name: '我的站点',
    logoKey: 'site-logo.svg',
    logoMime: 'image/svg+xml',
  });
});

it('规范化后相同 origin 和纯时区变更不使 CORS 失效，历史图片和对象 UTC/ID/Key/路径不变', () => {
  seed();
  const images = connection.db.select().from(mediaImages).all();
  const objects = connection.db.select().from(mediaObjects).all();
  const configs = connection.db.select().from(storageConfigs).all();
  const probes = connection.db.select().from(storageProbes).all();
  for (const input of [
    { publicUrl: ' HTTPS://IMG.EXAMPLE.COM:443/ ' },
    { timeZone: 'America/New_York' },
  ]) {
    expect(patchSiteSettingsResponse(connection.db, input)).toMatchObject({
      publicUrlChanged: false,
      notices: [],
    });
  }
  expect(connection.db.select().from(mediaImages).all()).toEqual(images);
  expect(connection.db.select().from(mediaObjects).all()).toEqual(objects);
  expect(connection.db.select().from(storageConfigs).all()).toEqual(configs);
  expect(connection.db.select().from(storageProbes).all()).toEqual(probes);
});

it('新 origin 在同事务使全部 S3 与进行中的 CORS probe 失效，新图片外链保持原路径', () => {
  seed();
  const images = connection.db.select().from(mediaImages).all();
  const objects = connection.db.select().from(mediaObjects).all();
  const response = patchSiteSettingsResponse(connection.db, {
    publicUrl: 'https://new.example.com:8443',
  });
  expect(response).toMatchObject({
    publicUrlChanged: true,
    githubCallbackUrl: 'https://new.example.com:8443/api/auth/callback/github',
    notices: expect.arrayContaining([
      expect.stringContaining('OAuth'),
      expect.stringContaining('CORS'),
      expect.stringContaining('旧域名'),
    ]),
  });
  expect(
    connection.db
      .select({ id: storageConfigs.id, status: storageConfigs.corsStatus })
      .from(storageConfigs)
      .all(),
  ).toEqual([
    { id: 's3-enabled', status: 'invalidated' },
    { id: 's3-disabled', status: 'invalidated' },
    { id: 'local', status: 'passed' },
  ]);
  expect(connection.db.select().from(storageProbes).get()?.invalidated).toBe(
    true,
  );
  expect(connection.db.select().from(mediaImages).all()).toEqual(images);
  expect(connection.db.select().from(mediaObjects).all()).toEqual(objects);
  const next = requireSiteSettings(connection.db);
  expect(buildImageUrl(next.publicUrl, 'image-stable')).toBe(
    `https://new.example.com:8443${buildImagePath('image-stable')}`,
  );
});

it('CORS 第二次写入失败回滚站点字段和已写入的 S3 状态，不返回部分成功', () => {
  seed();
  const before = readSiteSettingsResponse(connection.db);
  const configs = connection.db.select().from(storageConfigs).all();
  const probes = connection.db.select().from(storageProbes).all();
  connection.db.$client.exec(
    "CREATE TRIGGER reject_cors_invalidation BEFORE UPDATE ON storage_probes BEGIN SELECT RAISE(ABORT, 'cors write failed'); END",
  );
  expect(() =>
    patchSiteSettingsResponse(connection.db, {
      name: '未保存',
      publicUrl: 'https://new.example.com',
    }),
  ).toThrow('cors write failed');
  expect(readSiteSettingsResponse(connection.db)).toEqual(before);
  expect(connection.db.select().from(storageConfigs).all()).toEqual(configs);
  expect(connection.db.select().from(storageProbes).all()).toEqual(probes);
});
