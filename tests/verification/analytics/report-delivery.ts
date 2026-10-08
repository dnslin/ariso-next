import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { albums, albumImages } from '../../../src/server/collections/schema.ts';
import {
  launchS3Delivery,
  type DeliveryTarget,
} from '../../integration/delivery/s3-fixture.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  writeObject,
  planLocalWrite,
} from '../../../src/server/storage/local.ts';

/** Real standalone HTTP; a local protocol target only proves the model, not R2/SeaweedFS. */
export async function verifyReportDelivery(target: DeliveryTarget) {
  const request = (url: string | URL, init: RequestInit = {}) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  const app = await launchS3Delivery(target);
  try {
    const remote = await app.seed({ fourVersions: true });
    const db = app.db;
    const localStorage = db
      .select()
      .from(storageConfigs)
      .all()
      .find((row) => row.type === 'local')!;
    const storage = {
      id: localStorage.id,
      enabled: localStorage.enabled,
      localPath: localStorage.localPath!,
    };
    const localId = randomUUID();
    const root = join(app.directory, 'data', 'storage');
    const plan = planLocalWrite('uploads');
    await writeObject(root, storage, plan, Readable.from(remote.bytes));
    db.transaction((tx) => {
      const asset = acceptOriginal(tx, {
        imageId: localId,
        storageId: storage.id,
        key: plan.key,
        originalName: 'local.png',
        visibility: 'public',
        format: 'PNG',
        mime: 'image/png',
        byteSize: remote.bytes.length,
        classification: 'static',
        snapshot: createProcessingSnapshot(tx),
        expectedVersions: [],
      });
      tx.update(mediaJobs)
        .set({ status: 'succeeded' })
        .where(eq(mediaJobs.id, asset.jobId))
        .run();
      tx.update(mediaImages)
        .set({ processingStatus: 'ready' })
        .where(eq(mediaImages.id, localId))
        .run();
    });
    for (const kind of ['compressed', 'watermark', 'thumbnail'] as const) {
      const id = randomUUID();
      const derived = planLocalWrite('derived');
      await writeObject(root, storage, derived, Readable.from(remote.bytes));
      const now = new Date();
      db.transaction((tx) => {
        tx.insert(mediaObjects)
          .values({
            id,
            imageId: localId,
            storageId: storage.id,
            key: derived.key,
            purpose: kind,
            status: 'stored',
            byteSize: remote.bytes.length,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        tx.insert(mediaVersions)
          .values({
            imageId: localId,
            kind,
            objectId: id,
            byteSize: remote.bytes.length,
            format: 'PNG',
            mime: 'image/png',
            createdAt: now,
          })
          .run();
      });
    }
    const headers = {
      cookie: app.cookie,
      origin: app.origin,
      'content-type': 'application/json',
    };
    const tokenResponse = await request(`${app.origin}/api/upload-tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'report-auth-test' }),
    });
    assert.equal(tokenResponse.status, 200);
    const { key } = await tokenResponse.json();
    const albumId = randomUUID();
    const createdAt = new Date();
    db.transaction((tx) => {
      tx.insert(albums)
        .values({
          id: albumId,
          name: '统计权限测试',
          description: '',
          createdAt,
          updatedAt: createdAt,
        })
        .run();
      tx.insert(albumImages)
        .values({ albumId, imageId: remote.imageId, joinedAt: createdAt })
        .run();
    });
    const shareResponse = await request(
      `${app.origin}/api/albums/${albumId}/share`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          password: { action: 'set', value: 'report-grant-test' },
        }),
      },
    );
    assert.equal(shareResponse.status, 200);
    const { share } = await shareResponse.json();
    const unlock = await request(`${app.origin}/s/${share.token}/unlock`, {
      method: 'POST',
      headers: { origin: app.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'report-grant-test' }),
    });
    assert.equal(unlock.status, 200);
    const shareCookie = unlock.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.ok(shareCookie.startsWith('ariso_share_grant='));
    assert.equal(
      (await request(`${app.origin}/s/${share.token}/items`)).status,
      401,
    );
    const sharedItems = await request(`${app.origin}/s/${share.token}/items`, {
      headers: { cookie: shareCookie },
    });
    assert.equal(sharedItems.status, 200);
    assert.ok(
      JSON.stringify(await sharedItems.json()).includes(remote.imageId),
    );
    const paths = [
      '/api/analytics/overview',
      `/api/analytics/images/${remote.imageId}`,
    ];
    for (const credentials of [
      {},
      { authorization: `Bearer ${key}` },
      { 'x-api-key': key },
      { cookie: shareCookie },
      { authorization: `Bearer ${app.token}` },
    ]) {
      for (const path of paths) {
        const response = await request(`${app.origin}${path}`, {
          headers: credentials as Record<string, string>,
        });
        assert.equal(response.status, 401);
        assert.equal(
          response.headers.get('cache-control'),
          'private, no-store',
        );
      }
    }
    async function read(path: string) {
      const response = await request(`${app.origin}${path}`, { headers });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      return response.json();
    }
    const empty = await read(paths[0]);
    assert.equal(empty.cumulative.total, 0);
    assert.equal(empty.lastFlushedAt, null);
    assert.equal(empty.health.status, 'idle');
    assert.equal(empty.trend.length, 7);
    assert.ok(empty.trend.every((row: { count: number }) => row.count === 0));
    assert.deepEqual(empty.popular, []);
    for (const [path, status] of [
      ['/api/analytics/overview?days=1', 400],
      ['/api/analytics/overview?days=7&days=30', 400],
      ['/api/analytics/images/not-a-uuid', 400],
      [`/api/analytics/images/${randomUUID()}`, 404],
    ] as const) {
      const response = await request(`${app.origin}${path}`, { headers });
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
    const responses: { source: string; version: string; status: number }[] = [];
    for (const version of [
      'original',
      'compressed',
      'watermark',
      'thumbnail',
    ]) {
      for (const [source, id] of [
        ['s3', remote.imageId],
        ['local', localId],
      ]) {
        const url = `${app.origin}/i/${id}?type=${version}`;
        const response = await request(url, { redirect: 'manual' });
        assert.equal(response.status, source === 's3' ? 302 : 200);
        responses.push({ source, version, status: response.status });
        const content =
          source === 's3'
            ? await request(response.headers.get('location')!)
            : response;
        assert.equal(content.status, 200);
        assert.deepEqual(
          Buffer.from(await content.arrayBuffer()),
          remote.bytes,
        );
        const owner = await request(url, { headers, redirect: 'manual' });
        assert.equal(owner.status, source === 's3' ? 302 : 200);
        await owner.arrayBuffer();
        const head = await request(url, { method: 'HEAD', redirect: 'manual' });
        assert.equal(head.status, source === 's3' ? 302 : 200);
      }
    }
    const config = db
      .select()
      .from(storageConfigs)
      .where(eq(storageConfigs.id, app.storageId))
      .get()!;
    db.update(storageConfigs)
      .set({ secretKeyEncrypted: 'injected-invalid-ciphertext' })
      .where(eq(storageConfigs.id, app.storageId))
      .run();
    try {
      assert.equal(
        (
          await request(`${app.origin}/i/${remote.imageId}`, {
            redirect: 'manual',
          })
        ).status,
        500,
      );
    } finally {
      db.update(storageConfigs)
        .set({ secretKeyEncrypted: config.secretKeyEncrypted })
        .where(eq(storageConfigs.id, app.storageId))
        .run();
    }
    const deadline = Date.now() + 15000;
    let overview;
    do {
      overview = await read(paths[0]);
      if (overview.cumulative.total === 6) break;
      assert.ok(
        Date.now() < deadline,
        'actual analytics timer did not persist six eligible GETs',
      );
      await delay(100);
    } while (true);
    assert.deepEqual(overview.versions, {
      original: 2,
      compressed: 2,
      watermark: 2,
      total: 6,
    });
    assert.equal(overview.today, 6);
    assert.ok(overview.lastFlushedAt);
    assert.equal(overview.health.status, 'idle');
    assert.equal(overview.health.incomplete, false);
    const periods = [];
    for (const days of [7, 30, 90]) {
      const result = await read(`/api/analytics/overview?days=${days}`);
      assert.equal(result.range.days, days);
      assert.equal(result.trend.length, days);
      assert.deepEqual(result.versions, overview.versions);
      assert.equal(
        result.trend.reduce(
          (total: number, row: { count: number }) => total + row.count,
          0,
        ),
        6,
      );
      assert.deepEqual(
        result.popular.map((row: { imageId: string; count: number }) => ({
          id: row.imageId,
          count: row.count,
        })),
        [localId, remote.imageId].sort().map((id) => ({ id, count: 3 })),
      );
      periods.push({ days, versions: result.versions, range: result.range });
    }
    for (const id of [localId, remote.imageId]) {
      const image = await read(`/api/analytics/images/${id}`);
      assert.deepEqual(image.cumulative, {
        original: 1,
        compressed: 1,
        watermark: 1,
        total: 3,
      });
      assert.deepEqual(
        image.periods.map((period: { total: number }) => period.total),
        [3, 3, 3],
      );
    }
    db.$client.exec(
      'ALTER TABLE analytics_daily RENAME TO unavailable_analytics_daily; ALTER TABLE analytics_image_daily RENAME TO unavailable_analytics_image_daily',
    );
    try {
      for (const path of paths) {
        const response = await request(`${app.origin}${path}`, {
          headers,
        });
        assert.equal(response.status, 500);
        assert.equal(
          response.headers.get('cache-control'),
          'private, no-store',
        );
        assert.deepEqual(await response.json(), {
          code: 'ANALYTICS_READ_FAILED',
          message: '统计读取失败，请检查服务日志后重试',
        });
      }
    } finally {
      db.$client.exec(
        'ALTER TABLE unavailable_analytics_daily RENAME TO analytics_daily; ALTER TABLE unavailable_analytics_image_daily RENAME TO analytics_image_daily',
      );
    }
    assert.equal((await read(paths[0])).versions.total, 6);
    return {
      service: target.service,
      status: 'passed',
      recordedAt: new Date().toISOString(),
      responses,
      signPreparationFailure: {
        status: 500,
        counted: false,
        cause: 'controlled invalid encrypted secret',
      },
      excluded: ['thumbnail', 'owner', 'HEAD', 'sign preparation failure'],
      periods,
      cumulative: overview.cumulative,
      lastFlushedAt: overview.lastFlushedAt,
      health: overview.health,
      auth: 'owner cookie only; anonymous/upload Token/real password-unlocked share grant/session Bearer rejected',
      failureRecovery:
        'analytics_daily unavailable returned 500; restored read returned six',
      cleanup:
        'standalone stopped; exact remote keys deleted and HEAD confirmed absent',
    };
  } finally {
    await app.close();
  }
}
