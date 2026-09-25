import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, statfs, writeFile } from 'node:fs/promises';
import { cpus, freemem, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  setImmediate as yieldTurn,
  setTimeout as delay,
} from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
  BATCH_SIZE,
  BUFFER_CAPACITY,
  FLUSH_INTERVAL_MS,
  RETRY_INTERVAL_MS,
  createAnalyticsCollector,
  type AccessEvent,
} from './collector.ts';

const event = (imageId: string, index = 0): AccessEvent => ({
  imageId,
  date: '2026-09-25',
  timezone: 'Asia/Shanghai',
  version: (['original', 'compressed', 'watermark'] as const)[index % 3]!,
});

function counts(db: Database.Database) {
  const sum = (sql: string) =>
    (db.prepare(sql).get() as { count: number }).count;
  return {
    daily: sum('SELECT coalesce(sum(count), 0) AS count FROM analytics_daily'),
    imageDaily: sum(
      'SELECT coalesce(sum(count), 0) AS count FROM analytics_image_daily',
    ),
    totals:
      sum(`SELECT coalesce(sum(original_count + compressed_count + watermark_count), 0)
      AS count FROM analytics_image_totals`),
  };
}

function assertCounts(db: Database.Database, expected: number) {
  const actual = counts(db);
  assert.deepEqual(actual, {
    daily: expected,
    imageDaily: expected,
    totals: expected,
  });
  return actual;
}

async function until(predicate: () => boolean, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    assert.ok(
      performance.now() < deadline,
      `Condition not reached within ${timeoutMs}ms`,
    );
    await delay(20);
  }
}

/** Real elapsed time and real SQLite failures; no simulated clock or writer. */
export async function runPressure(reportPath: string) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-analytics-pressure-'));
  const filesystem = await statfs(directory);
  const memorySamples: Array<{
    scenario: string;
    events: number;
    pendingKeys: number;
    rssBytes: number;
    heapUsedBytes: number;
  }> = [];
  const scenarios: Record<string, object> = {};
  let sqliteVersion: unknown;
  const started = performance.now();
  const open = (name: string) => {
    const db = new Database(join(directory, `${name}.sqlite`));
    sqliteVersion = db.prepare('select sqlite_version() as version').get();
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 100');
    return { db, collector: createAnalyticsCollector(db) };
  };
  const sample = (
    scenario: string,
    events: number,
    collector: ReturnType<typeof createAnalyticsCollector>,
  ) => {
    const memory = process.memoryUsage();
    const snapshot = collector.snapshot();
    assert.ok(snapshot.pendingKeys <= BUFFER_CAPACITY);
    memorySamples.push({
      scenario,
      events,
      pendingKeys: snapshot.pendingKeys,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
    });
  };
  try {
    {
      const { db, collector } = open('timer');
      try {
        const start = performance.now();
        collector.start();
        assert.equal(collector.record(event('timer')), true);
        assertCounts(db, 0);
        await delay(FLUSH_INTERVAL_MS - 500);
        assertCounts(db, 0);
        await until(() => collector.snapshot().flushed === 1, 10_000);
        const elapsedMs = performance.now() - start;
        assert.ok(elapsedMs >= FLUSH_INTERVAL_MS - 20);
        scenarios.timer = {
          elapsedMs,
          counts: assertCounts(db, 1),
          health: collector.snapshot(),
        };
      } finally {
        collector.stop();
        db.close();
      }
    }
    {
      const { db, collector } = open('threshold');
      try {
        collector.start();
        const start = performance.now();
        for (let index = 0; index < BATCH_SIZE - 1; index++) {
          assert.equal(
            collector.record(event(`threshold-${index}`, index)),
            true,
          );
        }
        await yieldTurn();
        assert.equal(collector.snapshot().flushAttempts, 0);
        assert.equal(collector.record(event('threshold-last')), true);
        // record() must return without executing SQL, even at the threshold.
        assert.equal(collector.snapshot().flushAttempts, 0);
        assertCounts(db, 0);
        await yieldTurn();
        assert.equal(collector.snapshot().pendingKeys, 0);
        assert.equal(collector.snapshot().committedBatches, 1);
        scenarios.threshold = {
          elapsedMs: performance.now() - start,
          recordSqlAttempts: 0,
          counts: assertCounts(db, BATCH_SIZE),
          health: collector.snapshot(),
        };
      } finally {
        collector.stop();
        db.close();
      }
    }
    {
      const { db, collector } = open('failed-full-buffer');
      try {
        collector.start();
        db.pragma('query_only = ON');
        const start = performance.now();
        sample('failed-buffer', 0, collector);
        for (let index = 0; index < BUFFER_CAPACITY; index++) {
          assert.equal(
            collector.record(event(`retained-${index}`, index)),
            true,
          );
          if ((index + 1) % BATCH_SIZE === 0) {
            await yieldTurn();
            sample('failed-buffer', index + 1, collector);
          }
        }
        const firstFailure = collector.snapshot();
        assert.equal(firstFailure.pendingKeys, BUFFER_CAPACITY);
        assert.equal(firstFailure.failedBatches, 1);
        assert.match(firstFailure.lastError!, /readonly/i);
        assertCounts(db, 0);
        const hotEvents = 100_000;
        for (let index = 0; index < hotEvents; index++) {
          assert.equal(collector.record(event('retained-0')), true);
          assert.equal(collector.record(event(`rejected-${index}`)), false);
          if ((index + 1) % 10_000 === 0)
            sample('failed-full', index + 1, collector);
        }
        assert.equal(collector.snapshot().flushAttempts, 1);
        const retryWait = performance.now();
        await until(
          () => collector.snapshot().failedBatches >= 2,
          RETRY_INTERVAL_MS + 10_000,
        );
        const beforeRecovery = collector.snapshot();
        assert.ok(performance.now() - start >= RETRY_INTERVAL_MS - 20);
        assert.equal(beforeRecovery.failedBatches, 2);
        assert.equal(beforeRecovery.pendingKeys, BUFFER_CAPACITY);
        assert.equal(beforeRecovery.pendingEvents, BUFFER_CAPACITY + hotEvents);
        assert.equal(beforeRecovery.dropped, hotEvents);
        assert.equal(beforeRecovery.incomplete, true);
        assertCounts(db, 0);
        db.pragma('query_only = OFF');
        const recoveryStart = performance.now();
        const batchTimesMs: number[] = [];
        while (collector.snapshot().pendingKeys > 0) {
          const batchStart = performance.now();
          const before = collector.snapshot().pendingKeys;
          assert.equal(collector.flushBatch(), true);
          assert.ok(before - collector.snapshot().pendingKeys <= BATCH_SIZE);
          batchTimesMs.push(performance.now() - batchStart);
          await yieldTurn();
        }
        const recoveredCounts = assertCounts(db, BUFFER_CAPACITY + hotEvents);
        assert.equal(collector.flushAll(), true);
        assertCounts(db, BUFFER_CAPACITY + hotEvents);
        assert.equal(collector.snapshot().incomplete, true);
        assert.equal(collector.snapshot().lastError, null);
        const retained = db
          .prepare(
            'SELECT original_count FROM analytics_image_totals WHERE image_id = ?',
          )
          .get('retained-0') as { original_count: number };
        assert.equal(retained.original_count, hotEvents + 1);
        sample('recovered', BUFFER_CAPACITY + hotEvents, collector);
        scenarios.failureRecovery = {
          elapsedMs: performance.now() - start,
          retryWaitMs: recoveryStart - retryWait,
          recoveryMs: performance.now() - recoveryStart,
          maxBatchDurationMs: Math.max(...batchTimesMs),
          batchCount: batchTimesMs.length,
          beforeRecovery,
          counts: recoveredCounts,
          health: collector.snapshot(),
        };
      } finally {
        db.pragma('query_only = OFF');
        collector.stop();
        db.close();
      }
    }
    for (const [name, totalEvents, keyCount] of [
      ['hot-million', 1_000_000, 100],
      ['long-tail', 100_000, 100_000],
    ] as const) {
      const { db, collector } = open(name);
      try {
        collector.start();
        const start = performance.now();
        sample(name, 0, collector);
        for (let index = 0; index < totalEvents; index++) {
          const key = index % keyCount;
          assert.equal(collector.record(event(`image-${key}`, key)), true);
          if ((index + 1) % BATCH_SIZE === 0) await yieldTurn();
          if ((index + 1) % 10_000 === 0) sample(name, index + 1, collector);
        }
        assert.equal(collector.stop(), true);
        const health = collector.snapshot();
        assert.equal(health.accepted, totalEvents);
        assert.equal(health.dropped, 0);
        assert.equal(health.pendingKeys, 0);
        scenarios[name] = {
          events: totalEvents,
          distinctKeys: keyCount,
          elapsedMs: performance.now() - start,
          counts: assertCounts(db, totalEvents),
          health,
        };
      } finally {
        collector.stop();
        db.close();
      }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: platform(),
        release: release(),
        architecture: process.arch,
        cpuModel: cpus()[0]?.model,
        logicalCpus: cpus().length,
        totalMemoryBytes: totalmem(),
        freeMemoryBytes: freemem(),
        databaseDirectory: directory,
        filesystem: {
          type: filesystem.type,
          blockSize: filesystem.bsize,
          blocks: filesystem.blocks,
          availableBlocks: filesystem.bavail,
        },
        sqliteVersion,
      },
      elapsedMs: performance.now() - started,
      parameters: {
        batchSize: BATCH_SIZE,
        bufferCapacity: BUFFER_CAPACITY,
        flushIntervalMs: FLUSH_INTERVAL_MS,
        retryIntervalMs: RETRY_INTERVAL_MS,
      },
      scenarios,
      memory: {
        interpretation:
          'Observed RSS/heap samples only. The asserted bound is 20,000 aggregation keys, not a hard byte/RSS limit. GC and SQLite allocations remain runtime-dependent.',
        peakSampleRssBytes: Math.max(
          ...memorySamples.map((item) => item.rssBytes),
        ),
        peakSampleHeapUsedBytes: Math.max(
          ...memorySamples.map((item) => item.heapUsedBytes),
        ),
        samples: memorySamples,
      },
    };
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const reportPath = process.argv[2] ?? 'artifacts/analytics/pressure.json';
  const report = await runPressure(reportPath);
  console.log(
    JSON.stringify(
      { reportPath, elapsedMs: report.elapsedMs, scenarios: report.scenarios },
      null,
      2,
    ),
  );
}
