import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  ACCESS_BUFFER_CAPACITY,
  createAccessCollector,
  type AccessIncrement,
} from '../../../src/server/analytics/collector.ts';
import {
  createAccessFlusher,
  createAccessWriter,
} from '../../../src/server/analytics/flush.ts';
import {
  readImageStats,
  readOverview,
} from '../../../src/server/analytics/queries.ts';
import { pruneDailyStats } from '../../../src/server/analytics/retention.ts';
import { readCurrentCounts as readCounts } from '../../../src/server/analytics/usage.ts';
import { createAlbum } from '../../../src/server/collections/records.ts';
import { albumImages } from '../../../src/server/collections/schema.ts';
import {
  cleanupPermanentDeletes,
  readMediaCleanup,
  requestPermanentDelete,
} from '../../../src/server/media/cleanup.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { restoreImage, trashImage } from '../../../src/server/media/trash.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
let collector: ReturnType<typeof createAccessCollector>;
let flusher: ReturnType<typeof createAccessFlusher>;
let write: ReturnType<typeof createAccessWriter>;
const now = new Date('2026-10-08T12:00:00Z');
const logger = { info: vi.fn(), error: vi.fn() };
const options = () => ({ now, health: flusher.health });
const overview = (days: 7 | 30 | 90 = 7) =>
  readOverview(fixture.db, { ...options(), days });
const imageStats = (imageId: string) =>
  readImageStats(fixture.db, imageId, options());
const zeroVersions = { original: 0, compressed: 0, watermark: 0, total: 0 };

beforeEach(() => {
  fixture = collectionFixture();
  fixture.db
    .insert(siteSettings)
    .values({ publicUrl: 'http://localhost', timeZone: 'UTC', updatedAt: now })
    .run();
  collector = createAccessCollector();
  flusher = createAccessFlusher({
    db: fixture.db.$client,
    collector,
    logger,
    now: () => now.getTime(),
  });
  write = createAccessWriter(fixture.db.$client);
});
afterEach(() => {
  fixture.db.$client.pragma('query_only = OFF');
  flusher.stop();
  fixture.close();
  vi.clearAllMocks();
});

function access(
  imageId: string,
  date: string,
  count: number,
  version: AccessIncrement['version'] = 'original',
  timezone = 'UTC',
) {
  write([{ imageId, date, count, version, timezone }]);
}

function publishThumbnail(imageId: string) {
  const original = fixture.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.imageId, imageId))
    .get()!;
  const objectId = randomUUID();
  fixture.db
    .insert(mediaObjects)
    .values({
      ...original,
      id: objectId,
      key: `derived/${objectId}.png`,
      purpose: 'thumbnail',
    })
    .run();
  fixture.db
    .insert(mediaVersions)
    .values({
      imageId,
      kind: 'thumbnail',
      objectId,
      byteSize: 100,
      format: 'PNG',
      mime: 'image/png',
      createdAt: now,
    })
    .run();
  fixture.db
    .update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, imageId))
    .run();
  fixture.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.imageId, imageId))
    .run();
}

describe('persisted analytics reports', () => {
  it('returns genuine zeroes for an empty site and an existing image with no accesses', () => {
    const empty = readOverview(fixture.db, options());
    expect(empty).toMatchObject({
      generatedAt: now,
      timezone: 'UTC',
      lastFlushedAt: null,
      approximate: true,
      health: { status: 'idle', pendingEvents: 0 },
      range: { days: 7, startDate: '2026-10-02', endDate: '2026-10-08' },
      containsOldTimezone: false,
      today: 0,
      cumulative: zeroVersions,
      versions: zeroVersions,
      popular: [],
    });
    expect(empty.counts).toEqual(readCounts(fixture.db).counts);
    expect(empty.trend).toEqual([
      { date: '2026-10-02', count: 0, isTodayPartial: false },
      { date: '2026-10-03', count: 0, isTodayPartial: false },
      { date: '2026-10-04', count: 0, isTodayPartial: false },
      { date: '2026-10-05', count: 0, isTodayPartial: false },
      { date: '2026-10-06', count: 0, isTodayPartial: false },
      { date: '2026-10-07', count: 0, isTodayPartial: false },
      { date: '2026-10-08', count: 0, isTodayPartial: true },
    ]);
    const imageId = fixture.image();
    expect(imageStats(imageId)).toMatchObject({
      generatedAt: now,
      imageId,
      timezone: 'UTC',
      lastFlushedAt: null,
      approximate: true,
      health: { status: 'idle' },
      cumulative: zeroVersions,
      periods: [
        {
          days: 7,
          startDate: '2026-10-02',
          endDate: '2026-10-08',
          total: 0,
          containsOldTimezone: false,
        },
        {
          days: 30,
          startDate: '2026-09-09',
          endDate: '2026-10-08',
          total: 0,
          containsOldTimezone: false,
        },
        {
          days: 90,
          startDate: '2026-07-11',
          endDate: '2026-10-08',
          total: 0,
          containsOldTimezone: false,
        },
      ],
    });
  });

  it.each([
    {
      days: 7 as const,
      startDate: '2026-10-02',
      total: 3,
      original: 1,
      compressed: 2,
      watermark: 0,
    },
    {
      days: 30 as const,
      startDate: '2026-09-09',
      total: 15,
      original: 9,
      compressed: 2,
      watermark: 4,
    },
    {
      days: 90 as const,
      startDate: '2026-07-11',
      total: 63,
      original: 9,
      compressed: 18,
      watermark: 36,
    },
  ])(
    'uses one inclusive $days-day range for trend, versions and popular images',
    ({ days, startDate, total, original, compressed, watermark }) => {
      const imageId = fixture.image();
      access(imageId, '2026-10-08', 1);
      access(imageId, '2026-10-02', 2, 'compressed');
      access(imageId, '2026-10-01', 4, 'watermark');
      access(imageId, '2026-09-09', 8);
      access(imageId, '2026-09-08', 16, 'compressed');
      access(imageId, '2026-07-11', 32, 'watermark');
      access(imageId, '2026-07-10', 64);
      access(imageId, '2026-10-09', 128);
      const report = overview(days);
      expect(report.range).toEqual({ days, startDate, endDate: '2026-10-08' });
      expect(report.today).toBe(1);
      expect(report.cumulative).toEqual({
        original: 201,
        compressed: 18,
        watermark: 36,
        total: 255,
      });
      expect(report.versions).toEqual({
        original,
        compressed,
        watermark,
        total,
      });
      expect(report.trend).toHaveLength(days);
      expect(report.trend[0].date).toBe(startDate);
      expect(report.trend.at(-1)).toEqual({
        date: '2026-10-08',
        count: 1,
        isTodayPartial: true,
      });
      expect(report.trend.filter((row) => row.isTodayPartial)).toHaveLength(1);
      expect(report.trend.reduce((sum, row) => sum + row.count, 0)).toBe(total);
      expect(report.popular).toMatchObject([{ imageId, count: total }]);
      expect(imageStats(imageId).periods.map((period) => period.total)).toEqual(
        [3, 15, 63],
      );
    },
  );

  it.each([
    {
      instant: '2026-03-08T19:00:00Z',
      startDate: '2026-03-02',
      endDate: '2026-03-08',
    },
    {
      instant: '2026-11-01T20:00:00Z',
      startDate: '2026-10-26',
      endDate: '2026-11-01',
    },
  ])(
    'uses calendar dates through Los Angeles daylight-saving changes at $instant',
    ({ instant, startDate, endDate }) => {
      fixture.db
        .update(siteSettings)
        .set({ timeZone: 'America/Los_Angeles' })
        .run();
      const imageId = fixture.image();
      const occurredAt = new Date(instant);
      collector.recordAccess(
        {
          imageId,
          storageId: fixture.storage.id,
          actualVersion: 'original',
          occurredAt,
        },
        'America/Los_Angeles',
      );
      expect(flusher.flushAccessBatch()).toBe(true);
      const report = readOverview(fixture.db, {
        health: flusher.health,
        now: occurredAt,
      });
      expect(report.range).toEqual({ days: 7, startDate, endDate });
      expect(report.trend).toHaveLength(7);
      expect(report.trend.map((row) => row.date)).toEqual(
        Array.from({ length: 7 }, (_, index) => {
          const date = new Date(`${startDate}T12:00:00Z`);
          date.setUTCDate(date.getUTCDate() + index);
          return date.toISOString().slice(0, 10);
        }),
      );
      expect(report.today).toBe(1);
      expect(report.trend.at(-1)).toEqual({
        date: endDate,
        count: 1,
        isTodayPartial: true,
      });
    },
  );

  it('sums archived timezone rows by their saved date labels and flags only the affected range', () => {
    fixture.db
      .update(siteSettings)
      .set({ timeZone: 'America/Los_Angeles' })
      .run();
    const imageId = fixture.image();
    access(imageId, '2026-10-08', 3, 'original', 'Asia/Shanghai');
    access(imageId, '2026-10-08', 4, 'compressed', 'America/Los_Angeles');
    access(imageId, '2026-10-07', 2, 'watermark', 'UTC');
    access(imageId, '2026-09-20', 8, 'original', 'UTC');
    access(imageId, '2026-10-09', 16, 'original', 'Asia/Shanghai');
    expect(overview()).toMatchObject({
      today: 7,
      containsOldTimezone: true,
      versions: { original: 3, compressed: 4, watermark: 2, total: 9 },
      cumulative: { original: 27, compressed: 4, watermark: 2, total: 33 },
      popular: [{ imageId, count: 9 }],
    });
    expect(imageStats(imageId).periods).toMatchObject([
      { days: 7, total: 9, containsOldTimezone: true },
      { days: 30, total: 17, containsOldTimezone: true },
      { days: 90, total: 17, containsOldTimezone: true },
    ]);
    const fresh = fixture.image();
    access(fresh, '2026-09-20', 1, 'original', 'UTC');
    access(fresh, '2026-10-08', 1, 'original', 'America/Los_Angeles');
    expect(imageStats(fresh).periods).toMatchObject([
      { days: 7, total: 1, containsOldTimezone: false },
      { days: 30, total: 2, containsOldTimezone: true },
      { days: 90, total: 2, containsOldTimezone: true },
    ]);
  });

  it('excludes permanently removed images before taking the top ten, with stable ties and no album multiplication', () => {
    const imageIds = Array.from(
      { length: 12 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    for (const imageId of [...imageIds].reverse()) {
      fixture.image(imageId);
      access(imageId, '2026-10-08', 5);
    }
    const deleted = randomUUID();
    access(deleted, '2026-10-08', 1000);
    const unvisited = fixture.image();
    fixture.db.transaction((tx) => {
      for (const name of ['first', 'second', 'third']) {
        const album = createAlbum(tx, { name });
        tx.insert(albumImages)
          .values({ albumId: album.id, imageId: imageIds[0], joinedAt: now })
          .run();
      }
      createAlbum(tx, { name: 'empty' });
    });
    for (const days of [7, 30, 90] as const)
      expect(overview(days).popular.map((row) => row.imageId)).toEqual(
        imageIds.slice(0, 10),
      );
    const report = overview();
    expect(report.popular.map((row) => row.count)).toEqual(Array(10).fill(5));
    expect(report.popular.some((row) => row.imageId === unvisited)).toBe(false);
    expect(report.counts).toEqual(readCounts(fixture.db).counts);
    expect(report.counts).toMatchObject({ normalImages: 13, albums: 4 });
    expect(report.versions.total).toBe(1060);
    expect(report.today).toBe(1060);
    expect(report.cumulative.total).toBe(1060);
    expect(report.trend.at(-1)?.count).toBe(1060);
    access(imageIds[11], '2026-10-08', 1);
    expect(overview().popular.map((row) => row.imageId)).toEqual([
      imageIds[11],
      ...imageIds.slice(0, 9),
    ]);
  });

  it('uses the current name and owner thumbnail for private images, but hides content for disabled storage and recycled images', () => {
    const imageId = fixture.image();
    publishThumbnail(imageId);
    access(imageId, '2026-10-08', 6);
    fixture.db
      .update(mediaImages)
      .set({ displayName: 'renamed private image', visibility: 'private' })
      .where(eq(mediaImages.id, imageId))
      .run();
    expect(overview().popular).toEqual([
      {
        imageId,
        count: 6,
        state: 'normal',
        displayName: 'renamed private image',
        shortId: imageId.slice(0, 8),
        managementUrl: `/library?image=${imageId}`,
        thumbnailUrl: `/i/${imageId}?type=thumbnail`,
      },
    ]);
    fixture.db.update(storageConfigs).set({ enabled: false }).run();
    expect(overview().popular).toMatchObject([
      {
        state: 'normal',
        count: 6,
        displayName: 'renamed private image',
        thumbnailUrl: null,
        managementUrl: `/library?image=${imageId}`,
      },
    ]);
    trashImage(fixture.db, imageId);
    expect(overview().popular).toEqual([
      {
        imageId,
        count: 6,
        state: 'recycled',
        displayName: null,
        shortId: imageId.slice(0, 8),
        managementUrl: `/trash?image=${imageId}`,
        thumbnailUrl: null,
      },
    ]);
    expect(imageStats(imageId).cumulative.total).toBe(6);
    expect(overview().counts).toMatchObject({
      normalImages: 0,
      recycledImages: 1,
    });
    restoreImage(fixture.db, imageId);
    expect(overview().popular).toMatchObject([
      {
        state: 'normal',
        displayName: 'renamed private image',
        count: 6,
        thumbnailUrl: null,
      },
    ]);
    fixture.db.update(storageConfigs).set({ enabled: true }).run();
    expect(overview().popular[0].thumbnailUrl).toBe(
      `/i/${imageId}?type=thumbnail`,
    );
  });

  it('keeps historical counts after real permanent cleanup, drops all old content information and does not transfer counts to a same-name upload', async () => {
    const imageId = fixture.image();
    publishThumbnail(imageId);
    access(imageId, '2026-10-07', 500, 'compressed');
    collector.recordAccess(
      {
        imageId,
        storageId: fixture.storage.id,
        actualVersion: 'watermark',
        occurredAt: now,
      },
      'UTC',
    );
    trashImage(fixture.db, imageId);
    requestPermanentDelete(fixture.db, imageId);
    expect(overview().popular).toMatchObject([
      {
        imageId,
        count: 500,
        state: 'recycled',
        managementUrl: `/trash?image=${imageId}`,
      },
    ]);
    await cleanupPermanentDeletes(
      {
        db: fixture.db,
        storageRoot: fixture.storageRoot,
        temporaryRoot: join(dirname(fixture.storageRoot), 'tmp'),
        logger,
      },
      new Set(),
    );
    expect(readMediaCleanup(fixture.db, imageId).status).toBe('succeeded');
    expect(flusher.flushAccessBatch()).toBe(true);
    const report = overview();
    expect(report.cumulative).toEqual({
      original: 0,
      compressed: 500,
      watermark: 1,
      total: 501,
    });
    expect(report.versions).toEqual(report.cumulative);
    expect(report.trend.find((row) => row.date === '2026-10-07')?.count).toBe(
      500,
    );
    for (const days of [7, 30, 90] as const)
      expect(overview(days).popular).toEqual([]);
    expect(
      fixture.db.$client
        .prepare(
          'SELECT date, count FROM analytics_image_daily WHERE image_id = ? ORDER BY date',
        )
        .all(imageId),
    ).toEqual([
      { date: '2026-10-07', count: 500 },
      { date: '2026-10-08', count: 1 },
    ]);
    expect(JSON.stringify(report.popular)).not.toContain('sample');
    expect(() => imageStats(imageId)).toThrow(
      expect.objectContaining({ code: 'ANALYTICS_IMAGE_NOT_FOUND' }),
    );
    const sameName = fixture.image();
    expect(imageStats(sameName).cumulative).toEqual(zeroVersions);
    expect(overview().popular).toEqual(report.popular);
  });

  it('does not flush waiting reads and returns real idle, waiting, backlogged and incomplete health without hiding persisted counts', () => {
    const imageId = fixture.image();
    const event = {
      imageId,
      storageId: fixture.storage.id,
      actualVersion: 'original' as const,
      occurredAt: now,
    };
    expect(overview().health).toEqual(flusher.health());
    expect(collector.recordAccess(event, 'UTC')).toBe(true);
    for (const report of [overview(), imageStats(imageId)]) {
      expect(report.health).toEqual(flusher.health());
      expect(report.health.status).toBe('waiting');
      expect(report.lastFlushedAt).toBeNull();
      expect(report.cumulative.total).toBe(0);
    }
    expect(collector.pendingEvents).toBe(1);
    fixture.db.$client.pragma('query_only = ON');
    expect(flusher.flushAccessBatch()).toBe(false);
    expect(overview()).toMatchObject({
      health: {
        status: 'backlogged',
        pendingEvents: 1,
        lastError: expect.any(String),
      },
      lastFlushedAt: null,
      today: 0,
    });
    fixture.db.$client.pragma('query_only = OFF');
    expect(flusher.flushAccessBatch()).toBe(true);
    expect(overview()).toMatchObject({
      health: { status: 'idle', pendingEvents: 0 },
      lastFlushedAt: now,
      today: 1,
    });
    for (let index = 0; index < ACCESS_BUFFER_CAPACITY; index++) {
      collector.recordAccess({ ...event, imageId: `pending-${index}` }, 'UTC');
    }
    expect(
      collector.recordAccess({ ...event, imageId: 'dropped-event' }, 'UTC'),
    ).toBe(false);
    const report = overview();
    expect(report.health).toEqual(flusher.health());
    expect(report).toMatchObject({
      health: {
        status: 'incomplete',
        dropped: 1,
        pendingEvents: ACCESS_BUFFER_CAPACITY,
      },
      today: 1,
      cumulative: { total: 1 },
      lastFlushedAt: now,
    });
    expect(imageStats(imageId).health.status).toBe('incomplete');
    expect(flusher.stop()).toBe(true);
    expect(overview()).toMatchObject({
      health: { status: 'incomplete', dropped: 1, pendingEvents: 0 },
      cumulative: { total: ACCESS_BUFFER_CAPACITY + 1 },
    });
  });

  it('propagates missing image and database errors instead of manufacturing zero-valued reports', () => {
    expect(() => imageStats('missing')).toThrow(
      expect.objectContaining({ code: 'ANALYTICS_IMAGE_NOT_FOUND' }),
    );
    const imageId = fixture.image();
    fixture.db.$client.exec('DROP TABLE analytics_daily');
    expect(() => overview()).toThrow('no such table');
    fixture.db.$client.exec('DROP TABLE analytics_image_daily');
    expect(() => imageStats(imageId)).toThrow('no such table');
  });

  it('returns one SQLite snapshot when another connection commits during the health read', () => {
    const existing = fixture.image();
    access(existing, '2026-10-08', 1);
    const other = openRuntimeDatabase(
      join(dirname(fixture.storageRoot), 'ariso.db'),
    );
    const fresh = randomUUID();
    let committed = false;
    const health = () => {
      if (!committed) {
        other.db.transaction((tx) => {
          acceptOriginal(tx, fixture.input(fresh));
          createAccessWriter(other.db.$client)([
            {
              imageId: fresh,
              date: '2026-10-08',
              timezone: 'UTC',
              version: 'compressed',
              count: 7,
            },
          ]);
        });
        committed = true;
      }
      return flusher.health();
    };
    try {
      const report = readOverview(fixture.db, { now, health });
      expect(committed).toBe(true);
      expect(report).toMatchObject({
        counts: { normalImages: 1 },
        today: 1,
        cumulative: { total: 1 },
        versions: { total: 1 },
        popular: [{ imageId: existing, count: 1 }],
      });
      expect(overview()).toMatchObject({
        counts: { normalImages: 2 },
        today: 8,
        cumulative: { total: 8 },
        versions: { total: 8 },
        popular: [
          { imageId: fresh, count: 7 },
          { imageId: existing, count: 1 },
        ],
      });
    } finally {
      other.close();
    }
  });

  it('reads the supplied transaction including current counts and committed aggregates without opening another connection', () => {
    expect(() =>
      fixture.db.transaction((tx) => {
        const imageId = fixture.image();
        access(imageId, '2026-10-08', 7);
        expect(readOverview(tx, options())).toMatchObject({
          counts: { normalImages: 1 },
          today: 7,
          cumulative: { total: 7 },
        });
        expect(readImageStats(tx, imageId, options()).cumulative.total).toBe(7);
        throw new Error('rollback fixture');
      }),
    ).toThrow('rollback fixture');
    expect(overview()).toMatchObject({
      counts: { normalImages: 0 },
      cumulative: zeroVersions,
      popular: [],
    });
  });

  it('preserves cumulative totals when 365-day cleanup removes old ranking detail and remains idempotent', () => {
    const imageId = fixture.image();
    access(imageId, '2025-10-08', 100, 'original');
    access(imageId, '2025-10-09', 10, 'compressed');
    access(imageId, '2026-10-08', 4, 'watermark');
    expect(pruneDailyStats(fixture.db.$client, now)).toEqual({
      deleted: 2,
      hasMore: false,
    });
    expect(overview()).toMatchObject({
      cumulative: { original: 100, compressed: 10, watermark: 4, total: 114 },
      versions: { original: 0, compressed: 0, watermark: 4, total: 4 },
      popular: [{ imageId, count: 4 }],
    });
    expect(imageStats(imageId)).toMatchObject({
      cumulative: { total: 114 },
      periods: [{ total: 4 }, { total: 4 }, { total: 4 }],
    });
    expect(pruneDailyStats(fixture.db.$client, now)).toEqual({
      deleted: 0,
      hasMore: false,
    });
    expect(overview().cumulative.total).toBe(114);
  });
});
