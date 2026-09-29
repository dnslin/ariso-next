import assert from 'node:assert/strict';
import pino from 'pino';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import {
  arch,
  cpus,
  freemem,
  platform,
  release,
  tmpdir,
  totalmem,
} from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { createAccessCollector } from '../../../src/server/analytics/collector.ts';
import { createAccessFlusher } from '../../../src/server/analytics/flush.ts';
import { pruneDailyStats } from '../../../src/server/analytics/retention.ts';
import {
  createScaleFixture,
  dateLabel,
  queries,
  coveringIndexSql,
  coveringRankingSql,
} from './fixture.ts';

const { values } = parseArgs({
  options: {
    report: { type: 'string', default: 'test-results/analytics/scale.json' },
    'covering-index': { type: 'boolean', default: false },
    baseline: { type: 'string' },
  },
});
const directory = mkdtempSync(join(tmpdir(), 'ariso-analytics-scale-'));
const path = join(directory, 'analytics.db');
const started = performance.now();
const cpuStart = process.cpuUsage();
function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samplesMs: samples,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1)!,
  };
}
let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
try {
  console.log(
    'Seeding 100000 images and 365 days through production analytics writer',
  );
  const fixture = createScaleFixture(path);
  connection = fixture.connection;
  const seedMs = performance.now() - started;
  const db = connection.db.$client;
  const candidateIndex = coveringIndexSql;
  if (values['covering-index']) {
    db.exec(candidateIndex);
    db.exec('ANALYZE');
    db.pragma('wal_checkpoint(TRUNCATE)');
  }
  const rows = Object.fromEntries(
    [
      'media_images',
      'analytics_daily',
      'analytics_image_daily',
      'analytics_image_totals',
    ].map((table) => [
      table,
      (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number })
        .n,
    ]),
  );
  assert.equal(rows.media_images, 100_000);
  assert.equal(rows.analytics_image_daily, fixture.dailyRows);
  assert.equal(
    (db.prepare(queries.total.sql).get() as { count: number }).count,
    fixture.events,
  );
  const indexes = db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name LIKE 'analytics_%'",
    )
    .all();
  const pragmas = {
    journalMode: db.pragma('journal_mode', { simple: true }),
    cacheSize: db.pragma('cache_size', { simple: true }),
    pageSize: db.pragma('page_size', { simple: true }),
    sqliteVersion: db.prepare('SELECT sqlite_version() AS version').get(),
  };
  const databaseBytes = statSync(path).size;
  const rankingSql = values['covering-index']
    ? coveringRankingSql
    : queries.ranking.sql;
  const scenarios = [7, 30, 90].flatMap((period) =>
    (['trend', 'versions', 'ranking', 'image'] as const).map((kind) => ({
      name: `${kind}-${period}`,
      sql: kind === 'ranking' ? rankingSql : queries[kind].sql,
      args:
        kind === 'image'
          ? ['image-000000', dateLabel(365 - period), dateLabel(364)]
          : [dateLabel(365 - period), dateLabel(364)],
    })),
  );
  scenarios.push(
    { name: 'total', sql: queries.total.sql, args: [] },
    {
      name: 'image-total',
      sql: queries.imageTotal.sql,
      args: ['image-000000'],
    },
  );
  connection.close();
  connection = undefined;
  const measurements = scenarios.map((scenario) => {
    // New connection has an empty SQLite page cache. OS cache is not evicted.
    const cold = openRuntimeDatabase(path);
    let firstRows: unknown[];
    let coldMs: number;
    try {
      const start = performance.now();
      firstRows = cold.db.$client.prepare(scenario.sql).all(...scenario.args);
      coldMs = performance.now() - start;
    } finally {
      cold.close();
    }
    const warm = openRuntimeDatabase(path);
    try {
      const statement = warm.db.$client.prepare(scenario.sql);
      assert.deepEqual(statement.all(...scenario.args), firstRows);
      const samples = Array.from({ length: 25 }, () => {
        const start = performance.now();
        const result = statement.all(...scenario.args);
        const elapsed = performance.now() - start;
        assert.deepEqual(result, firstRows);
        return elapsed;
      });
      const result = {
        name: scenario.name,
        sql: scenario.sql,
        parameters: scenario.args,
        rows: firstRows.length,
        plan: warm.db.$client
          .prepare(`EXPLAIN QUERY PLAN ${scenario.sql}`)
          .all(...scenario.args),
        sqliteColdMs: coldMs,
        warm: summary(samples),
      };
      console.log(
        `${scenario.name}: cold=${coldMs.toFixed(1)}ms warm p95=${result.warm.p95Ms.toFixed(1)}ms`,
      );
      return result;
    } finally {
      warm.close();
    }
  });
  connection = openRuntimeDatabase(path);
  const active = connection.db.$client;
  const collector = createAccessCollector();
  const flusher = createAccessFlusher({
    db: active,
    collector,
    logger: pino({}, process.stderr),
  });
  const ranking = active.prepare(rankingSql);
  const concurrent: Record<string, number[]> = {
    ranking: [],
    flush: [],
    retention: [],
    queuedRanking: [],
    queuedFlush: [],
    queuedRetention: [],
  };
  let deleted = 0;
  // This matches the actual single-process synchronous SQLite model: operations
  // scheduled together queue on the event loop rather than running in parallel.
  for (let round = 0; round < 25; round++) {
    for (let i = 0; i < 1000; i++)
      assert.equal(
        collector.recordAccess(
          {
            imageId: `image-${String(i).padStart(6, '0')}`,
            storageId: 'scale',
            actualVersion: 'original',
            occurredAt: new Date('2027-01-01T12:00:00Z'),
          },
          'UTC',
        ),
        true,
      );
    const queued = performance.now();
    const operations = [
      () => {
        const start = performance.now();
        assert.equal(ranking.all(dateLabel(275), dateLabel(364)).length, 10);
        concurrent.ranking.push(performance.now() - start);
        concurrent.queuedRanking.push(performance.now() - queued);
      },
      () => {
        const start = performance.now();
        assert.equal(flusher.flushAccessBatch(), true);
        concurrent.flush.push(performance.now() - start);
        concurrent.queuedFlush.push(performance.now() - queued);
      },
      () => {
        const start = performance.now();
        deleted += pruneDailyStats(
          active,
          new Date('2027-01-01T12:00:00Z'),
        ).deleted;
        concurrent.retention.push(performance.now() - start);
        concurrent.queuedRetention.push(performance.now() - queued);
      },
    ];
    const ordered = [
      ...operations.slice(round % 3),
      ...operations.slice(0, round % 3),
    ];
    await Promise.all(ordered.map((operation) => yieldLoop().then(operation)));
  }
  assert.equal(flusher.stop(), true);
  assert.equal(flusher.health().dropped, 0);
  assert.equal(
    (active.prepare(queries.total.sql).get() as { count: number }).count,
    fixture.events + 25_000,
  );
  assert.ok(deleted > 0);
  const concurrentSummary = Object.fromEntries(
    Object.entries(concurrent).map(([name, samples]) => [
      name,
      summary(samples),
    ]),
  );
  const thresholds = {
    warmP95Ms: 500,
    sqliteColdMs: 2000,
    pass: measurements.every(
      (result) => result.warm.p95Ms <= 500 && result.sqliteColdMs <= 2000,
    ),
    concurrentRankingPass: concurrentSummary.queuedRanking.p95Ms <= 500,
  };
  const disk = statfsSync(directory);
  const report = {
    recordedAt: new Date().toISOString(),
    indexMode: values['covering-index']
      ? 'Experimental covering index with explicit INDEXED BY ranking query; production schema unchanged'
      : 'Existing production indexes',
    candidateIndex: values['covering-index'] ? candidateIndex : null,
    baseline: values.baseline
      ? JSON.parse(readFileSync(values.baseline, 'utf8'))
      : null,
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
      fixtureDirectory: directory,
      filesystem: {
        type: disk.type,
        blockSize: disk.bsize,
        blocks: disk.blocks,
        availableBlocks: disk.bavail,
      },
      diskInfo:
        platform() === 'darwin'
          ? execFileSync(
              'diskutil',
              [
                'info',
                execFileSync('df', ['-P', directory], { encoding: 'utf8' })
                  .trim()
                  .split('\n')
                  .at(-1)!
                  .split(/\s+/)[0],
              ],
              { encoding: 'utf8' },
            )
          : execFileSync('df', ['-T', directory], { encoding: 'utf8' }),
    },
    fixture: {
      images: fixture.images,
      days: fixture.days,
      dateRange: [dateLabel(0), dateLabel(364)],
      distribution:
        '1% daily hotspot (600/day); 9% weekly (60/active day); 80% every 30 days (6/active day); 10% zero access. Versions 3:2:1; alternating UTC/Asia/Shanghai archived dates.',
      seedMs,
      events: fixture.events,
      rows,
      databaseBytes,
    },
    cacheDefinition: {
      cold: 'Fresh connection and SQLite page cache; OS cache was NOT evicted and is unknown/warm after fixture generation. Not an OS-cold benchmark.',
      warm: 'One untimed execution then 25 executions on the same prepared statement/connection; production cache_size unchanged.',
    },
    pragmas,
    indexes,
    measurements,
    concurrency: {
      model:
        '25 rounds: ranking, production 1000-key flush and production <=1000-row retention queued together in rotating order on the same Node event loop and SQLite connection. queued metrics include time waiting for earlier operations; no worker-thread parallelism claimed.',
      deletedRows: deleted,
      acceptedEvents: 25_000,
      health: flusher.health(),
      measurements: concurrentSummary,
    },
    resources: {
      elapsedMs: performance.now() - started,
      cpu: process.cpuUsage(cpuStart),
      memory: process.memoryUsage(),
      maxRssKiB: process.resourceUsage().maxRSS,
    },
    thresholds,
    limitations: [
      'No operating-system cold-cache claim.',
      'Synthetic distribution; 36.5 million dense daily rows are not this workload.',
      'No production reporting API or UI implemented.',
      'Local host only; container and other CPU architecture verification belongs to Release.',
    ],
  };
  mkdirSync(dirname(values.report), { recursive: true });
  writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(thresholds.pass, 'Scale query latency target failed; see report');
  assert.ok(
    thresholds.concurrentRankingPass,
    'Queued ranking latency target failed; see report',
  );
  console.log(`Saved ${values.report}`);
} finally {
  connection?.close();
  rmSync(directory, { recursive: true, force: true });
}
