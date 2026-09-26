import { createAccessWriter } from '../../../src/server/analytics/flush.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  dateInTimezone,
  pruneDailyStats,
  startDailyRetention,
} from '../../../src/server/analytics/retention.ts';

let connection: ReturnType<typeof openRuntimeDatabase>;
beforeEach(() => {
  connection = openRuntimeDatabase(':memory:');
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
});
afterEach(() => connection.close());

function add(date: string, timezone: string, imageId = date) {
  const db = connection.db.$client;
  db.prepare('INSERT INTO analytics_daily VALUES (?, ?, ?, ?)').run(
    date,
    timezone,
    'original',
    3,
  );
  db.prepare('INSERT INTO analytics_image_daily VALUES (?, ?, ?, ?)').run(
    imageId,
    date,
    timezone,
    3,
  );
}
function dates(table = 'analytics_daily') {
  return connection.db.$client
    .prepare(`SELECT date, timezone FROM ${table} ORDER BY timezone, date`)
    .all();
}

describe('analytics daily retention', () => {
  it('uses date-range and image-range indexes without tying historical IDs to media rows', () => {
    const db = connection.db.$client;
    for (const table of [
      'analytics_daily',
      'analytics_image_daily',
      'analytics_image_totals',
    ]) {
      expect(db.prepare(`PRAGMA foreign_key_list(${table})`).all()).toEqual([]);
    }
    const statements = [
      "SELECT * FROM analytics_daily WHERE date >= '2026-01-01' AND date <= '2026-01-07'",
      "SELECT image_id, SUM(count) FROM analytics_image_daily WHERE date >= '2026-01-01' AND date <= '2026-01-07' GROUP BY image_id",
      "SELECT * FROM analytics_image_daily WHERE image_id = 'history' AND date >= '2026-01-01'",
    ];
    for (const statement of statements) {
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${statement}`).all() as {
        detail: string;
      }[];
      expect(
        plan.some(
          ({ detail }) => detail.includes('SEARCH') && detail.includes('INDEX'),
        ),
      ).toBe(true);
    }
  });

  it('keeps 365 local dates per archived timezone and preserves future rows and totals', () => {
    // At this instant Shanghai is September 27, while Los Angeles is September 26.
    const now = new Date('2026-09-26T17:00:00Z');
    for (const timezone of ['Asia/Shanghai', 'America/Los_Angeles']) {
      add('2025-09-26', timezone);
      add('2025-09-27', timezone);
      add('2025-09-28', timezone);
      add('2027-01-01', timezone);
    }
    connection.db.$client
      .prepare('INSERT INTO analytics_image_totals VALUES (?, ?, ?, ?)')
      .run('deleted-image', 900, 40, 2);
    expect(pruneDailyStats(connection.db.$client, now)).toEqual({
      deleted: 6,
      hasMore: false,
    });
    const expected = [
      { date: '2025-09-27', timezone: 'America/Los_Angeles' },
      { date: '2025-09-28', timezone: 'America/Los_Angeles' },
      { date: '2027-01-01', timezone: 'America/Los_Angeles' },
      { date: '2025-09-28', timezone: 'Asia/Shanghai' },
      { date: '2027-01-01', timezone: 'Asia/Shanghai' },
    ];
    expect(dates()).toEqual(expected);
    expect(dates('analytics_image_daily')).toEqual(expected);
    expect(pruneDailyStats(connection.db.$client, now)).toEqual({
      deleted: 0,
      hasMore: false,
    });
    expect(
      pruneDailyStats(connection.db.$client, new Date('2025-01-01T00:00:00Z'))
        .deleted,
    ).toBe(0);
    expect(
      connection.db.$client
        .prepare('SELECT * FROM analytics_image_totals')
        .all(),
    ).toEqual([
      {
        image_id: 'deleted-image',
        original_count: 900,
        compressed_count: 40,
        watermark_count: 2,
      },
    ]);
  });

  it('cleans long downtime in bounded batches and rolls back the whole batch on failure', () => {
    for (let day = 1; day <= 5; day++) add(`2020-01-0${day}`, 'UTC');
    const db = connection.db.$client;
    db.exec(`CREATE TRIGGER fail_prune BEFORE DELETE ON analytics_image_daily
      BEGIN SELECT RAISE(ABORT, 'injected retention failure'); END`);
    expect(() => pruneDailyStats(db, new Date('2026-09-26T00:00:00Z'))).toThrow(
      'injected retention failure',
    );
    expect(dates()).toHaveLength(5);
    expect(dates('analytics_image_daily')).toHaveLength(5);
    db.exec('DROP TRIGGER fail_prune');
    const removed: number[] = [];
    let result;
    do {
      result = pruneDailyStats(db, new Date('2026-09-26T00:00:00Z'), 3);
      removed.push(result.deleted);
    } while (result.hasMore);
    expect(removed).toEqual([3, 3, 3, 1]);
    expect(dates()).toEqual([]);
    expect(dates('analytics_image_daily')).toEqual([]);
  });

  it('retains each timezone discovery row until its image details are removed across batches', () => {
    const db = connection.db.$client;
    const write = createAccessWriter(db);
    for (const timezone of ['Asia/Shanghai', 'America/Los_Angeles']) {
      write(
        Array.from({ length: 3 }, (_, index) => ({
          imageId: `${timezone}-${index}`,
          date: '2020-01-01',
          timezone,
          version: 'original' as const,
          count: 1,
        })),
      );
    }
    let result;
    let deleted = 0;
    do {
      result = pruneDailyStats(db, new Date('2026-09-26T12:00:00Z'), 2);
      deleted += result.deleted;
      expect(
        db
          .prepare(
            `SELECT DISTINCT timezone FROM analytics_image_daily
        EXCEPT SELECT timezone FROM analytics_daily`,
          )
          .all(),
      ).toEqual([]);
    } while (result.hasMore);
    expect(deleted).toBe(8);
    expect(dates()).toEqual([]);
    expect(dates('analytics_image_daily')).toEqual([]);
    expect(
      db
        .prepare(
          'SELECT SUM(original_count) AS total FROM analytics_image_totals',
        )
        .get(),
    ).toEqual({ total: 6 });
  });

  it('uses calendar dates across daylight-saving transitions and leap years', () => {
    expect(
      dateInTimezone(new Date('2026-03-08T07:59:00Z'), 'America/Los_Angeles'),
    ).toBe('2026-03-07');
    expect(
      dateInTimezone(new Date('2026-03-08T10:01:00Z'), 'America/Los_Angeles'),
    ).toBe('2026-03-08');
    add('2023-03-01', 'America/Los_Angeles');
    add('2023-03-02', 'America/Los_Angeles');
    expect(
      pruneDailyStats(connection.db.$client, new Date('2024-02-29T20:00:00Z'))
        .deleted,
    ).toBe(2);
    expect(dates()).toEqual([
      { date: '2023-03-02', timezone: 'America/Los_Angeles' },
    ]);
  });
});

describe('analytics retention scheduling', () => {
  it('yields after 1000 deletions and preserves a flush committed between cleanup batches', () => {
    vi.useFakeTimers();
    const db = connection.db.$client;
    const insert = db.prepare(
      'INSERT INTO analytics_image_daily VALUES (?, ?, ?, ?)',
    );
    db.transaction(() => {
      for (let index = 0; index < 1001; index++)
        insert.run(`old-${index}`, '2020-01-01', 'UTC', 1);
    })();
    db.prepare('INSERT INTO analytics_daily VALUES (?, ?, ?, ?)').run(
      '2020-01-01',
      'UTC',
      'original',
      1001,
    );
    const logger = { warn: vi.fn(), error: vi.fn() };
    const retention = startDailyRetention({
      db,
      logger,
      now: () => Date.parse('2026-09-26T12:00:00Z'),
    });
    try {
      vi.advanceTimersToNextTimer();
      expect(dates('analytics_image_daily')).toHaveLength(1001);
      vi.advanceTimersToNextTimer();
      expect(dates('analytics_image_daily')).toHaveLength(1);
      expect(dates()).toEqual([{ date: '2020-01-01', timezone: 'UTC' }]);
      createAccessWriter(db)([
        {
          imageId: 'fresh',
          date: '2026-09-26',
          timezone: 'UTC',
          version: 'original',
          count: 7,
        },
      ]);
      vi.advanceTimersToNextTimer();
      expect(dates('analytics_image_daily')).toEqual([
        { date: '2026-09-26', timezone: 'UTC' },
      ]);
      expect(
        db
          .prepare(
            'SELECT original_count FROM analytics_image_totals WHERE image_id = ?',
          )
          .get('fresh'),
      ).toEqual({ original_count: 7 });
      expect(db.prepare('SELECT count FROM analytics_daily').get()).toEqual({
        count: 7,
      });
      expect(logger.error).not.toHaveBeenCalled();
    } finally {
      retention.stop();
    }
  });

  afterEach(() => vi.useRealTimers());

  it('checks on startup and hourly, cleans only after a local day advances, and logs clock anomalies', () => {
    vi.useFakeTimers();
    let now = Date.parse('2026-09-26T12:00:00Z');
    const logger = { warn: vi.fn(), error: vi.fn() };
    add('2025-09-27', 'UTC');
    add('2027-01-01', 'UTC');
    const retention = startDailyRetention({
      db: connection.db.$client,
      logger,
      now: () => now,
    });
    try {
      vi.advanceTimersByTime(2);
      expect(dates()).toHaveLength(2);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      add('2020-01-01', 'UTC');
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(dates()).toHaveLength(3);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      now = Date.parse('2026-09-27T12:00:00Z');
      vi.advanceTimersByTime(60 * 60 * 1000 + 2);
      expect(dates()).toEqual([{ date: '2027-01-01', timezone: 'UTC' }]);
      now = Date.parse('2026-09-25T12:00:00Z');
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(dates()).toHaveLength(1);
      expect(logger.error).not.toHaveBeenCalled();
    } finally {
      retention.stop();
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a failed prune next hour and cancels pending work when stopped', () => {
    vi.useFakeTimers();
    add('2020-01-01', 'UTC');
    const db = connection.db.$client;
    db.exec(`CREATE TRIGGER fail_prune BEFORE DELETE ON analytics_daily
      BEGIN SELECT RAISE(ABORT, 'retention unavailable'); END`);
    const logger = { warn: vi.fn(), error: vi.fn() };
    const retention = startDailyRetention({
      db,
      logger,
      now: () => Date.parse('2026-09-26T12:00:00Z'),
    });
    try {
      vi.advanceTimersByTime(2);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(dates()).toHaveLength(1);
      db.exec('DROP TRIGGER fail_prune');
      vi.advanceTimersByTime(60 * 60 * 1000 + 2);
      expect(dates()).toEqual([]);
    } finally {
      retention.stop();
    }
    const cancelled = startDailyRetention({ db, logger });
    cancelled.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
