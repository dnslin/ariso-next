import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, statfs, writeFile } from 'node:fs/promises';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  setImmediate as yieldTurn,
  setTimeout as delay,
} from 'node:timers/promises';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  ACCESS_BUFFER_CAPACITY,
  createAccessCollector,
} from '../../../src/server/analytics/collector.ts';
import {
  ACCESS_BATCH_SIZE,
  ACCESS_FLUSH_INTERVAL_MS,
  ACCESS_RETRY_INTERVAL_MS,
  createAccessFlusher,
} from '../../../src/server/analytics/flush.ts';

const event = (imageId: string, index = 0) => ({
  imageId,
  storageId: 'pressure-storage',
  actualVersion: (['original', 'compressed', 'watermark'] as const)[index % 3]!,
  occurredAt: new Date('2026-09-25T12:00:00Z'),
});
const directory = await mkdtemp(join(tmpdir(), 'ariso-production-pressure-'));
const filesystem = await statfs(directory);
const scenarios: Record<string, object> = {};
const samples: Array<
  ReturnType<ReturnType<typeof createAccessCollector>['health']> & {
    scenario: string;
    rssBytes: number;
    heapUsedBytes: number;
  }
> = [];
const started = performance.now();

function fixture(name: string) {
  const connection = openRuntimeDatabase(join(directory, `${name}.db`));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  const db = connection.db.$client;
  const collector = createAccessCollector();
  const failures: Array<{ at: number; message: string }> = [];
  const flusher = createAccessFlusher({
    db,
    collector,
    logger: {
      error(context: unknown) {
        const { err } = context as { err: Error };
        failures.push({ at: Date.now(), message: err.message });
      },
    },
  });
  function counts(expected: number) {
    const actual = [
      'analytics_daily',
      'analytics_image_daily',
      'analytics_image_totals',
    ].map(
      (table, index) =>
        (
          db
            .prepare(
              `SELECT coalesce(sum(${index === 2 ? 'original_count + compressed_count + watermark_count' : 'count'}), 0) AS n FROM ${table}`,
            )
            .get() as { n: number }
        ).n,
    );
    assert.deepEqual(actual, [expected, expected, expected]);
    return actual;
  }
  return {
    db,
    collector,
    flusher,
    failures,
    counts,
    close() {
      flusher.stop();
      connection.close();
    },
  };
}
function sample(
  scenario: string,
  collector: ReturnType<typeof createAccessCollector>,
) {
  const memory = process.memoryUsage();
  assert.ok(collector.pendingKeys <= ACCESS_BUFFER_CAPACITY);
  samples.push({
    scenario,
    ...collector.health(),
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
  });
}
async function until(predicate: () => boolean, timeout: number) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    assert.ok(
      performance.now() < deadline,
      `Condition not reached within ${timeout}ms`,
    );
    await delay(20);
  }
}

try {
  {
    const f = fixture('timer');
    try {
      f.flusher.start();
      const start = performance.now();
      f.collector.recordAccess(event('timer'), 'UTC');
      f.counts(0);
      await delay(ACCESS_FLUSH_INTERVAL_MS - 500);
      f.counts(0);
      await until(() => f.collector.pendingKeys === 0, 10_000);
      scenarios.timer = {
        elapsedMs: performance.now() - start,
        counts: f.counts(1),
        health: f.flusher.health(),
      };
    } finally {
      f.close();
    }
  }
  {
    const f = fixture('threshold');
    try {
      f.flusher.start();
      for (let i = 0; i < ACCESS_BATCH_SIZE - 1; i++)
        f.collector.recordAccess(event(String(i), i), 'UTC');
      await yieldTurn();
      f.counts(0);
      const start = performance.now();
      f.collector.recordAccess(event('last'), 'UTC');
      f.counts(0);
      await yieldTurn();
      assert.equal(f.collector.pendingKeys, 0);
      scenarios.threshold = {
        elapsedMs: performance.now() - start,
        counts: f.counts(ACCESS_BATCH_SIZE),
        health: f.flusher.health(),
      };
    } finally {
      f.close();
    }
  }
  {
    const f = fixture('failure');
    try {
      f.db.pragma('query_only = ON');
      f.flusher.start();
      sample('failure-start', f.collector);
      for (let i = 0; i < ACCESS_BUFFER_CAPACITY; i++) {
        assert.equal(
          f.collector.recordAccess(event(String(i), i), 'UTC'),
          true,
        );
        if ((i + 1) % ACCESS_BATCH_SIZE === 0) {
          await yieldTurn();
          sample('failure-fill', f.collector);
        }
      }
      assert.equal(f.failures.length, 1);
      const hotEvents = 100_000;
      for (let i = 0; i < hotEvents; i++) {
        assert.equal(f.collector.recordAccess(event('0'), 'UTC'), true);
        assert.equal(
          f.collector.recordAccess(event(`rejected-${i}`), 'UTC'),
          false,
        );
        if ((i + 1) % 10_000 === 0) sample('failure-full', f.collector);
      }
      assert.equal(f.failures.length, 1);
      await until(
        () => f.failures.length === 2,
        ACCESS_RETRY_INTERVAL_MS + 10_000,
      );
      assert.ok(
        f.failures[1]!.at - f.failures[0]!.at >= ACCESS_RETRY_INTERVAL_MS,
      );
      f.counts(0);
      const beforeRecovery = f.flusher.health();
      assert.equal(
        beforeRecovery.pendingEvents,
        ACCESS_BUFFER_CAPACITY + hotEvents,
      );
      assert.equal(beforeRecovery.dropped, hotEvents);
      f.db.pragma('query_only = OFF');
      const start = performance.now();
      const batchMs: number[] = [];
      while (f.collector.pendingKeys) {
        const before = f.collector.pendingKeys;
        const batchStart = performance.now();
        assert.equal(f.flusher.flushAccessBatch(), true);
        assert.equal(
          before - f.collector.pendingKeys,
          Math.min(before, ACCESS_BATCH_SIZE),
        );
        batchMs.push(performance.now() - batchStart);
        await yieldTurn();
      }
      assert.equal(f.flusher.stop(), true);
      assert.equal(f.flusher.health().incomplete, true);
      assert.equal(f.flusher.health().lastError, null);
      sample('recovery', f.collector);
      scenarios.failureRecovery = {
        failures: f.failures,
        beforeRecovery,
        recoveryMs: performance.now() - start,
        batches: batchMs.length,
        maxBatchMs: Math.max(...batchMs),
        counts: f.counts(ACCESS_BUFFER_CAPACITY + hotEvents),
        health: f.flusher.health(),
      };
    } finally {
      f.db.pragma('query_only = OFF');
      f.close();
    }
  }
  for (const [name, events, distinctKeys] of [
    ['hot-million', 1_000_000, 100],
    ['long-tail', 100_000, 100_000],
  ] as const) {
    const f = fixture(name);
    try {
      f.flusher.start();
      sample(name, f.collector);
      const start = performance.now();
      for (let i = 0; i < events; i++) {
        const key = i % distinctKeys;
        assert.equal(
          f.collector.recordAccess(event(`image-${key}`, key), 'UTC'),
          true,
        );
        if ((i + 1) % ACCESS_BATCH_SIZE === 0) await yieldTurn();
        if ((i + 1) % 10_000 === 0) sample(name, f.collector);
      }
      assert.equal(f.flusher.stop(), true);
      assert.equal(f.collector.health().dropped, 0);
      assert.equal(f.collector.pendingKeys, 0);
      scenarios[name] = {
        events,
        distinctKeys,
        elapsedMs: performance.now() - start,
        counts: f.counts(events),
        health: f.flusher.health(),
      };
    } finally {
      f.close();
    }
  }
  const reportPath = resolve(
    process.argv[2] ?? 'artifacts/analytics/production-pressure.json',
  );
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      architecture: process.arch,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      databaseDirectory: directory,
      filesystem: {
        type: filesystem.type,
        blockSize: filesystem.bsize,
        availableBlocks: filesystem.bavail,
      },
      journalMode: 'WAL',
    },
    elapsedMs: performance.now() - started,
    parameters: {
      batchSize: ACCESS_BATCH_SIZE,
      capacity: ACCESS_BUFFER_CAPACITY,
      flushMs: ACCESS_FLUSH_INTERVAL_MS,
      retryMs: ACCESS_RETRY_INTERVAL_MS,
    },
    scenarios,
    memory: {
      interpretation:
        'RSS and heap samples are observations, not byte limits. The asserted bound is 20,000 aggregation keys. No report-query or retention-concurrency performance claim.',
      peakRssBytes: Math.max(...samples.map((s) => s.rssBytes)),
      peakHeapUsedBytes: Math.max(...samples.map((s) => s.heapUsedBytes)),
      samples,
    },
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      { reportPath, elapsedMs: report.elapsedMs, scenarios },
      null,
      2,
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
