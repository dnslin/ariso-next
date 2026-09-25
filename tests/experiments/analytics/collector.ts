import type Database from 'better-sqlite3';

export const BATCH_SIZE = 1_000;
export const BUFFER_CAPACITY = 20_000;
export const FLUSH_INTERVAL_MS = 5_000;
export const RETRY_INTERVAL_MS = 30_000;

export interface AccessEvent {
  imageId: string;
  date: string;
  timezone: string;
  version: 'original' | 'compressed' | 'watermark';
}

type Increment = AccessEvent & { count: number };

/** Experiment only: dates are already resolved by the caller at event time. */
export function createAnalyticsCollector(
  db: Database.Database,
  options: { now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_daily (
      date TEXT NOT NULL, timezone TEXT NOT NULL, version TEXT NOT NULL,
      count INTEGER NOT NULL, PRIMARY KEY(date, timezone, version)
    );
    CREATE TABLE IF NOT EXISTS analytics_image_daily (
      image_id TEXT NOT NULL, date TEXT NOT NULL, timezone TEXT NOT NULL,
      count INTEGER NOT NULL, PRIMARY KEY(image_id, date, timezone)
    );
    CREATE TABLE IF NOT EXISTS analytics_image_totals (
      image_id TEXT PRIMARY KEY, original_count INTEGER NOT NULL,
      compressed_count INTEGER NOT NULL, watermark_count INTEGER NOT NULL
    );
  `);
  const daily =
    db.prepare(`INSERT INTO analytics_daily VALUES (@date, @timezone, @version, @count)
    ON CONFLICT(date, timezone, version) DO UPDATE SET count = count + excluded.count`);
  const imageDaily =
    db.prepare(`INSERT INTO analytics_image_daily VALUES (@imageId, @date, @timezone, @count)
    ON CONFLICT(image_id, date, timezone) DO UPDATE SET count = count + excluded.count`);
  const totals =
    db.prepare(`INSERT INTO analytics_image_totals VALUES (@imageId, @original, @compressed, @watermark)
    ON CONFLICT(image_id) DO UPDATE SET
      original_count = original_count + excluded.original_count,
      compressed_count = compressed_count + excluded.compressed_count,
      watermark_count = watermark_count + excluded.watermark_count`);
  const write = db.transaction((batch: Increment[]) => {
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
  const pending = new Map<string, Increment>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let immediate: ReturnType<typeof setImmediate> | undefined;
  let running = false;
  let accepted = 0;
  let flushed = 0;
  let dropped = 0;
  let flushAttempts = 0;
  let committedBatches = 0;
  let failedBatches = 0;
  let lastError: string | null = null;
  let lastFlushedAt: number | null = null;
  let nextRetryAt = 0;
  let maxBatchDurationMs = 0;

  function flushBatch(): boolean {
    if (pending.size === 0) return true;
    const entries: [string, Increment][] = [];
    for (const entry of pending) {
      entries.push(entry);
      if (entries.length === BATCH_SIZE) break;
    }
    flushAttempts++;
    const startedAt = performance.now();
    try {
      write(entries.map(([, increment]) => increment));
    } catch (error) {
      failedBatches++;
      lastError = error instanceof Error ? error.message : String(error);
      nextRetryAt = now() + RETRY_INTERVAL_MS;
      return false;
    } finally {
      maxBatchDurationMs = Math.max(
        maxBatchDurationMs,
        performance.now() - startedAt,
      );
    }
    // The transaction and acknowledgement are synchronous: record cannot interleave.
    for (const [key, increment] of entries) {
      pending.delete(key);
      flushed += increment.count;
    }
    committedBatches++;
    lastFlushedAt = now();
    lastError = null;
    nextRetryAt = 0;
    return true;
  }

  function schedule() {
    if (!running || immediate || pending.size === 0 || now() < nextRetryAt)
      return;
    immediate = setImmediate(() => {
      immediate = undefined;
      if (flushBatch() && pending.size > 0) schedule();
    });
    immediate.unref();
  }

  function flushAll(): boolean {
    while (pending.size > 0) {
      if (!flushBatch()) return false;
    }
    return true;
  }

  return {
    record(event: AccessEvent): boolean {
      const key = JSON.stringify([
        event.imageId,
        event.date,
        event.timezone,
        event.version,
      ]);
      const existing = pending.get(key);
      if (existing) existing.count++;
      else if (pending.size < BUFFER_CAPACITY)
        pending.set(key, { ...event, count: 1 });
      else {
        dropped++;
        return false;
      }
      accepted++;
      if (pending.size >= BATCH_SIZE) schedule();
      return true;
    },
    start() {
      if (running) return;
      running = true;
      timer = setInterval(schedule, FLUSH_INTERVAL_MS);
      timer.unref();
      if (pending.size >= BATCH_SIZE) schedule();
    },
    flushBatch,
    flushAll,
    stop(): boolean {
      running = false;
      clearInterval(timer);
      clearImmediate(immediate);
      timer = undefined;
      immediate = undefined;
      return flushAll();
    },
    snapshot() {
      return {
        accepted,
        flushed,
        dropped,
        pendingKeys: pending.size,
        pendingEvents: accepted - flushed,
        incomplete: dropped > 0,
        flushAttempts,
        committedBatches,
        failedBatches,
        lastError,
        lastFlushedAt,
        nextRetryAt,
        maxBatchDurationMs,
      };
    },
  };
}
