import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createAccessCollector } from '../../../src/server/analytics/collector.ts';
import { createAccessFlusher } from '../../../src/server/analytics/flush.ts';

const event = {
  imageId: 'deleted-history',
  storageId: 'storage',
  actualVersion: 'original' as const,
  occurredAt: new Date('2026-09-16T16:30:00Z'),
};
let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let collector: ReturnType<typeof createAccessCollector>;
let flusher: ReturnType<typeof createAccessFlusher>;
const logger = { error: vi.fn() };
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-persistence-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  collector = createAccessCollector();
  flusher = createAccessFlusher({
    db: connection.db.$client,
    collector,
    logger,
  });
});
afterEach(async () => {
  flusher.stop();
  vi.useRealTimers();
  connection.close();
  await rm(directory, { recursive: true, force: true });
});
function sums() {
  return [
    'analytics_daily',
    'analytics_image_daily',
    'analytics_image_totals',
  ].map(
    (table, index) =>
      (
        connection.db.$client
          .prepare(
            `SELECT coalesce(sum(${index === 2 ? 'original_count + compressed_count + watermark_count' : 'count'}),0) AS n FROM ${table}`,
          )
          .get() as { n: number }
      ).n,
  );
}

describe('production analytics persistence', () => {
  it('commits all versions and original timezone dates for historical IDs, without request-time SQL or restart replay', () => {
    connection.db.$client.pragma('query_only = ON');
    collector.recordAccess(event, 'Asia/Shanghai');
    collector.recordAccess(event, 'Asia/Shanghai');
    collector.recordAccess({ ...event, actualVersion: 'compressed' }, 'UTC');
    collector.recordAccess({ ...event, actualVersion: 'watermark' }, 'UTC');
    expect(sums()).toEqual([0, 0, 0]);
    connection.db.$client.pragma('query_only = OFF');
    expect(flusher.stop()).toBe(true);
    expect(sums()).toEqual([4, 4, 4]);
    expect(
      connection.db.$client
        .prepare('SELECT * FROM analytics_image_totals')
        .all(),
    ).toEqual([
      {
        image_id: event.imageId,
        original_count: 2,
        compressed_count: 1,
        watermark_count: 1,
      },
    ]);
    expect(
      connection.db.$client
        .prepare(
          'SELECT date, timezone, count FROM analytics_daily ORDER BY timezone, version',
        )
        .all(),
    ).toEqual([
      { date: '2026-09-17', timezone: 'Asia/Shanghai', count: 2 },
      { date: '2026-09-16', timezone: 'UTC', count: 1 },
      { date: '2026-09-16', timezone: 'UTC', count: 1 },
    ]);
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    collector = createAccessCollector();
    flusher = createAccessFlusher({
      db: connection.db.$client,
      collector,
      logger,
    });
    expect(flusher.health()).toMatchObject({
      lastFlushedAt: null,
      status: 'idle',
    });
    flusher.stop();
    expect(sums()).toEqual([4, 4, 4]);
  });

  it('rolls back the first two tables when totals fail and acknowledges only the eventual successful transaction', () => {
    connection.db.$client.exec(
      "CREATE TRIGGER fail_totals BEFORE INSERT ON analytics_image_totals BEGIN SELECT RAISE(ABORT, 'totals failure'); END",
    );
    collector.recordAccess(event, 'UTC');
    expect(flusher.flushAccessBatch()).toBe(false);
    expect(sums()).toEqual([0, 0, 0]);
    expect(flusher.health()).toMatchObject({
      pendingEvents: 1,
      lastFlushedAt: null,
      lastError: 'totals failure',
      status: 'backlogged',
    });
    collector.recordAccess(event, 'UTC');
    connection.db.$client.exec('DROP TRIGGER fail_totals');
    expect(flusher.flushAccessBatch()).toBe(true);
    expect(sums()).toEqual([2, 2, 2]);
    expect(flusher.health()).toMatchObject({
      pendingEvents: 0,
      lastError: null,
      status: 'idle',
    });
    expect(flusher.flushAccessBatch()).toBe(true);
    expect(sums()).toEqual([2, 2, 2]);
  });

  it('keeps 20000 keys under failure, accepts existing keys and retains loss status after bounded recovery', () => {
    connection.db.$client.pragma('query_only = ON');
    for (let i = 0; i < 20000; i++)
      collector.recordAccess({ ...event, imageId: String(i) }, 'UTC');
    expect(flusher.flushAccessBatch()).toBe(false);
    expect(collector.recordAccess(event, 'UTC')).toBe(false);
    expect(collector.recordAccess({ ...event, imageId: '0' }, 'UTC')).toBe(
      true,
    );
    expect(flusher.health()).toMatchObject({
      pendingKeys: 20000,
      pendingEvents: 20001,
      dropped: 1,
      status: 'incomplete',
    });
    connection.db.$client.pragma('query_only = OFF');
    expect(flusher.flushAccessBatch()).toBe(true);
    expect(flusher.health().pendingKeys).toBe(19000);
    expect(sums()).toEqual([1001, 1001, 1001]);
    expect(flusher.stop()).toBe(true);
    expect(sums()).toEqual([20001, 20001, 20001]);
    expect(flusher.health()).toMatchObject({
      pendingKeys: 0,
      pendingEvents: 0,
      dropped: 1,
      incomplete: true,
      status: 'incomplete',
    });
  });

  it('uses one timer, schedules threshold writes off the request stack and retries failures at reduced frequency', async () => {
    vi.useFakeTimers();
    flusher.start();
    flusher.start();
    expect(vi.getTimerCount()).toBe(1);
    collector.recordAccess(event, 'UTC');
    await vi.advanceTimersByTimeAsync(5001);
    expect(sums()).toEqual([1, 1, 1]);
    connection.db.$client.pragma('query_only = ON');
    for (let i = 0; i < 1000; i++)
      collector.recordAccess({ ...event, imageId: String(i) }, 'UTC');
    expect(flusher.health().lastError).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(flusher.health().status).toBe('backlogged');
    connection.db.$client.pragma('query_only = OFF');
    await vi.advanceTimersByTimeAsync(25000);
    expect(sums()).toEqual([1, 1, 1]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(sums()).toEqual([1001, 1001, 1001]);
    flusher.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
