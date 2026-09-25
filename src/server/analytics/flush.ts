import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { getAccessCollector, type AccessIncrement } from './collector.ts';

export const ACCESS_BATCH_SIZE = 1_000;
export const ACCESS_FLUSH_INTERVAL_MS = 5_000;
export const ACCESS_RETRY_INTERVAL_MS = 30_000;

/** Prepared once for the Web connection; all three aggregates commit together. */
export function createAccessWriter(db: Database.Database) {
  const daily =
    db.prepare(`INSERT INTO analytics_daily (date, timezone, version, count)
    VALUES (@date, @timezone, @version, @count)
    ON CONFLICT(date, timezone, version) DO UPDATE SET count = count + excluded.count`);
  const imageDaily =
    db.prepare(`INSERT INTO analytics_image_daily (image_id, date, timezone, count)
    VALUES (@imageId, @date, @timezone, @count)
    ON CONFLICT(image_id, date, timezone) DO UPDATE SET count = count + excluded.count`);
  const totals = db.prepare(`INSERT INTO analytics_image_totals
    (image_id, original_count, compressed_count, watermark_count)
    VALUES (@imageId, @original, @compressed, @watermark)
    ON CONFLICT(image_id) DO UPDATE SET
    original_count = original_count + excluded.original_count,
    compressed_count = compressed_count + excluded.compressed_count,
    watermark_count = watermark_count + excluded.watermark_count`);
  return db.transaction((batch: AccessIncrement[]) => {
    for (const increment of batch) {
      daily.run(increment);
      imageDaily.run(increment);
      totals.run({
        imageId: increment.imageId,
        original: increment.version === 'original' ? increment.count : 0,
        compressed: increment.version === 'compressed' ? increment.count : 0,
        watermark: increment.version === 'watermark' ? increment.count : 0,
      });
    }
  });
}

export function createAccessFlusher(options: {
  db: Database.Database;
  logger: Pick<Logger, 'error'>;
  collector?: ReturnType<typeof getAccessCollector>;
  now?: () => number;
}) {
  const collector = options.collector ?? getAccessCollector();
  const now = options.now ?? (() => Date.now());
  const write = createAccessWriter(options.db);
  let lastFlushedAt: number | null = null;
  let lastError: string | null = null;
  let nextRetryAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let immediate: ReturnType<typeof setImmediate> | undefined;

  function flushAccessBatch() {
    const batch = collector.nextBatch(ACCESS_BATCH_SIZE);
    if (batch.length === 0) return true;
    try {
      write(batch);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      nextRetryAt = now() + ACCESS_RETRY_INTERVAL_MS;
      options.logger.error(
        { err, ...collector.health() },
        'Analytics batch write failed; increments retained',
      );
      return false;
    }
    // No await between commit and acknowledgement: requests cannot interleave.
    collector.acknowledge(batch);
    lastFlushedAt = now();
    lastError = null;
    nextRetryAt = 0;
    return true;
  }

  function schedule() {
    if (!timer || immediate || !collector.pendingKeys || now() < nextRetryAt)
      return;
    immediate = setImmediate(() => {
      immediate = undefined;
      if (flushAccessBatch() && collector.pendingKeys) schedule();
    });
    immediate.unref();
  }

  return {
    flushAccessBatch,
    start() {
      if (timer) return;
      timer = setInterval(schedule, ACCESS_FLUSH_INTERVAL_MS);
      timer.unref();
      collector.onRecord(() => {
        if (collector.pendingKeys >= ACCESS_BATCH_SIZE) schedule();
      });
      if (collector.pendingKeys >= ACCESS_BATCH_SIZE) schedule();
    },
    stop() {
      clearInterval(timer);
      clearImmediate(immediate);
      timer = undefined;
      immediate = undefined;
      collector.onRecord(undefined);
      while (collector.pendingKeys) {
        if (!flushAccessBatch()) return false;
      }
      return true;
    },
    health() {
      const health = collector.health();
      return {
        ...health,
        lastFlushedAt,
        lastError,
        nextRetryAt,
        status: health.incomplete
          ? 'incomplete'
          : lastError
            ? 'backlogged'
            : health.pendingKeys
              ? 'waiting'
              : 'idle',
      };
    },
  };
}
