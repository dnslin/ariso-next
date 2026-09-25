import {
  ACCESS_BUFFER_CAPACITY,
  createAccessCollector,
  getAccessCollector,
} from '../../../src/server/analytics/collector.ts';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUFFER_CAPACITY,
  createAnalyticsCollector,
  type AccessEvent,
} from '../../experiments/analytics/collector.ts';

const event: AccessEvent = {
  imageId: 'historical-image',
  date: '2026-09-25',
  timezone: 'Asia/Shanghai',
  version: 'original',
};
const databases: Database.Database[] = [];
function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  return { db, collector: createAnalyticsCollector(db) };
}
function total(db: Database.Database) {
  return db
    .prepare(
      'SELECT sum(original_count + compressed_count + watermark_count) AS n FROM analytics_image_totals',
    )
    .get();
}
afterEach(() => {
  vi.useRealTimers();
  for (const db of databases.splice(0)) db.close();
});

describe('EV-ANALYTICS-01 experimental collector', () => {
  it('records only in memory and commits all three version totals and historical identities', () => {
    const { db, collector } = fixture();
    collector.record(event);
    collector.record(event);
    collector.record({ ...event, version: 'compressed' });
    collector.record({ ...event, version: 'watermark' });
    collector.record({ ...event, timezone: 'America/Los_Angeles' });
    expect(total(db)).toEqual({ n: null });
    expect(collector.snapshot()).toMatchObject({ accepted: 5, pendingKeys: 4 });
    expect(collector.flushAll()).toBe(true);
    expect(total(db)).toEqual({ n: 5 });
    expect(db.prepare('SELECT * FROM analytics_image_totals').get()).toEqual({
      image_id: event.imageId,
      original_count: 3,
      compressed_count: 1,
      watermark_count: 1,
    });
    expect(
      db
        .prepare(
          'SELECT timezone, count FROM analytics_image_daily ORDER BY timezone',
        )
        .all(),
    ).toEqual([
      { timezone: 'America/Los_Angeles', count: 1 },
      { timezone: 'Asia/Shanghai', count: 4 },
    ]);
    expect(collector.flushAll()).toBe(true);
    expect(total(db)).toEqual({ n: 5 });
  });

  it('rolls back the whole batch on a final-table failure, preserves increments, and retries once', () => {
    const { db, collector } = fixture();
    db.exec(
      "CREATE TRIGGER fail_totals BEFORE INSERT ON analytics_image_totals BEGIN SELECT RAISE(ABORT, 'injected totals failure'); END",
    );
    collector.record(event);
    expect(collector.flushBatch()).toBe(false);
    expect(
      db.prepare('SELECT count(*) AS n FROM analytics_daily').get(),
    ).toEqual({ n: 0 });
    expect(
      db.prepare('SELECT count(*) AS n FROM analytics_image_daily').get(),
    ).toEqual({ n: 0 });
    expect(collector.snapshot()).toMatchObject({
      pendingEvents: 1,
      failedBatches: 1,
      lastError: 'injected totals failure',
    });
    collector.record(event);
    expect(collector.snapshot().flushAttempts).toBe(1);
    db.exec('DROP TRIGGER fail_totals');
    expect(collector.flushAll()).toBe(true);
    expect(total(db)).toEqual({ n: 2 });
    expect(collector.snapshot()).toMatchObject({
      flushed: 2,
      pendingEvents: 0,
      lastError: null,
    });
  });

  it('bounds each batch to 1000 keys and synchronously drains remaining batches on stop', () => {
    const { db, collector } = fixture();
    for (let i = 0; i < 2001; i++)
      collector.record({ ...event, imageId: String(i) });
    collector.flushBatch();
    expect(total(db)).toEqual({ n: 1000 });
    expect(collector.snapshot().pendingKeys).toBe(1001);
    expect(collector.stop()).toBe(true);
    expect(total(db)).toEqual({ n: 2001 });
    expect(collector.snapshot().committedBatches).toBe(3);
  });

  it('continues accepting existing keys at capacity and retains the loss marker after recovery', () => {
    const { collector } = fixture();
    for (let i = 0; i < BUFFER_CAPACITY; i++)
      collector.record({ ...event, imageId: String(i) });
    expect(collector.record({ ...event, imageId: 'overflow' })).toBe(false);
    expect(collector.record({ ...event, imageId: '0' })).toBe(true);
    expect(collector.snapshot()).toMatchObject({
      accepted: 20001,
      pendingKeys: 20000,
      dropped: 1,
      incomplete: true,
    });
    collector.flushAll();
    expect(collector.snapshot()).toMatchObject({
      flushed: 20001,
      pendingKeys: 0,
      dropped: 1,
      incomplete: true,
    });
  });

  it('starts one timer, flushes after five seconds, and throttles automatic retries after failure', async () => {
    vi.useFakeTimers();
    const { db, collector } = fixture();
    collector.start();
    collector.start();
    expect(vi.getTimerCount()).toBe(1);
    collector.record(event);
    await vi.advanceTimersByTimeAsync(5001);
    expect(total(db)).toEqual({ n: 1 });
    db.exec(
      "CREATE TRIGGER fail_totals BEFORE INSERT ON analytics_image_totals BEGIN SELECT RAISE(ABORT, 'busy experiment'); END",
    );
    for (let i = 0; i < 1000; i++)
      collector.record({ ...event, imageId: String(i) });
    await vi.advanceTimersByTimeAsync(1);
    expect(collector.snapshot().failedBatches).toBe(1);
    for (let i = 0; i < 100; i++) collector.record(event);
    await vi.advanceTimersByTimeAsync(25000);
    expect(collector.snapshot().failedBatches).toBe(1);
    db.exec('DROP TRIGGER fail_totals');
    await vi.advanceTimersByTimeAsync(10000);
    expect(collector.snapshot()).toMatchObject({
      pendingKeys: 0,
      flushed: 1101,
      failedBatches: 1,
    });
    collector.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('production in-memory access collector', () => {
  const access = {
    imageId: 'image',
    storageId: 'storage',
    actualVersion: 'original' as const,
    occurredAt: new Date('2026-09-16T16:30:00Z'),
  };

  it('aggregates separate GETs by historical identity, local date, timezone and actual version', () => {
    const collector = createAccessCollector();
    collector.recordAccess(access, 'Asia/Shanghai');
    collector.recordAccess({ ...access, storageId: 'other' }, 'Asia/Shanghai');
    collector.recordAccess(
      { ...access, actualVersion: 'compressed' },
      'Asia/Shanghai',
    );
    collector.recordAccess(
      { ...access, actualVersion: 'watermark' },
      'Asia/Shanghai',
    );
    collector.recordAccess(access, 'America/Los_Angeles');
    expect(collector.snapshot()).toEqual({
      accepted: 5,
      dropped: 0,
      incomplete: false,
      increments: [
        {
          imageId: 'image',
          date: '2026-09-17',
          timezone: 'Asia/Shanghai',
          version: 'original',
          count: 2,
        },
        {
          imageId: 'image',
          date: '2026-09-17',
          timezone: 'Asia/Shanghai',
          version: 'compressed',
          count: 1,
        },
        {
          imageId: 'image',
          date: '2026-09-17',
          timezone: 'Asia/Shanghai',
          version: 'watermark',
          count: 1,
        },
        {
          imageId: 'image',
          date: '2026-09-16',
          timezone: 'America/Los_Angeles',
          version: 'original',
          count: 1,
        },
      ],
    });
  });

  it.each([
    ['2026-03-08T04:59:59Z', '2026-03-07'],
    ['2026-03-08T05:00:00Z', '2026-03-08'],
    ['2026-03-09T03:59:59Z', '2026-03-08'],
    ['2026-03-09T04:00:00Z', '2026-03-09'],
    ['2026-11-01T05:30:00Z', '2026-11-01'],
    ['2026-11-01T06:30:00Z', '2026-11-01'],
  ])('uses calendar dates across DST: %s', (instant, date) => {
    const collector = createAccessCollector();
    collector.recordAccess(
      { ...access, occurredAt: new Date(instant) },
      'America/New_York',
    );
    expect(collector.snapshot().increments[0]?.date).toBe(date);
  });

  it('retains same-date timezone segments and protects stored dates from caller mutation', () => {
    const collector = createAccessCollector();
    const occurredAt = new Date('2026-09-17T12:00:00Z');
    collector.recordAccess({ ...access, occurredAt }, 'UTC');
    collector.recordAccess({ ...access, occurredAt }, 'Asia/Shanghai');
    occurredAt.setUTCFullYear(2000);
    const snapshot = collector.snapshot();
    snapshot.increments[0]!.count = 100;
    expect(
      collector
        .snapshot()
        .increments.map(({ date, count }) => ({ date, count })),
    ).toEqual([
      { date: '2026-09-17', count: 1 },
      { date: '2026-09-17', count: 1 },
    ]);
  });

  it('bounds different keys, keeps accepting existing keys and reports dropped events', () => {
    const collector = createAccessCollector();
    for (let i = 0; i < ACCESS_BUFFER_CAPACITY; i++)
      expect(
        collector.recordAccess({ ...access, imageId: String(i) }, 'UTC'),
      ).toBe(true);
    expect(collector.recordAccess(access, 'UTC')).toBe(false);
    expect(collector.recordAccess({ ...access, imageId: '0' }, 'UTC')).toBe(
      true,
    );
    expect(collector.snapshot()).toMatchObject({
      accepted: 20001,
      dropped: 1,
      incomplete: true,
    });
    expect(collector.snapshot().increments).toHaveLength(20000);
  });

  it('surfaces invalid timezones, dates and unapproved versions without partial increments', () => {
    const collector = createAccessCollector();
    expect(() => collector.recordAccess(access, 'invalid/timezone')).toThrow();
    expect(() =>
      collector.recordAccess({ ...access, occurredAt: new Date(NaN) }, 'UTC'),
    ).toThrow();
    expect(() =>
      collector.recordAccess({ ...access, actualVersion: 'thumbnail' }, 'UTC'),
    ).toThrow('Thumbnail');
    expect(collector.snapshot().accepted).toBe(0);
    expect(collector.recordAccess(access, 'UTC')).toBe(true);
  });

  it('reuses one process collector', () => {
    expect(getAccessCollector()).toBe(getAccessCollector());
  });
});
