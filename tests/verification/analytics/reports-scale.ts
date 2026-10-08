import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { createAccessCollector } from '../../../src/server/analytics/collector.ts';
import { createAccessFlusher } from '../../../src/server/analytics/flush.ts';
import {
  readImageStats,
  readOverview,
  type ReportDays,
} from '../../../src/server/analytics/queries.ts';
import { pruneDailyStats } from '../../../src/server/analytics/retention.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import {
  createScaleFixture,
  dateLabel,
} from '../../experiments/analytics-scale/fixture.ts';

function summary(samplesMs: number[]) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    samplesMs,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1)!,
  };
}

/** Reduced dimensions are used only by the default integration runner test. */
export async function runReportsScale(options: {
  reportPath: string;
  images?: number;
  warmRuns?: number;
  rounds?: number;
  fixtureDatabase?: string;
}) {
  const images = options.images ?? 100_000;
  const warmRuns = options.warmRuns ?? 25;
  const rounds = options.rounds ?? 25;
  assert.ok(images >= 1000 && images % 100 === 0);
  assert.ok(warmRuns > 0 && rounds > 0);
  const directory = mkdtempSync(join(tmpdir(), 'ariso-report-scale-'));
  const path = join(directory, 'analytics.db');
  const started = performance.now();
  const cpuStart = process.cpuUsage();
  const now = new Date('2026-12-31T12:00:00Z');
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  const measurements: {
    name: string;
    sqliteColdMs: number;
    warm: ReturnType<typeof summary>;
    queries: { sql: string; parameters: unknown[]; plan: unknown[] }[];
  }[] = [];
  const concurrency: Record<string, number[]> = {
    overview: [],
    flush: [],
    retention: [],
    queuedOverview: [],
    queuedFlush: [],
    queuedRetention: [],
  };
  const failures: string[] = [];
  let workloadError: unknown;
  let fixtureDetails: Record<string, unknown> = {};
  let databaseDetails: Record<string, unknown> = {};
  let deletedRows = 0;
  let completedFlushes = 0;
  let finalHealth:
    ReturnType<ReturnType<typeof createAccessFlusher>['health']> | undefined;
  try {
    try {
      console.log(
        options.fixtureDatabase
          ? 'Cloning the pre-workload production-writer fixture and applying current production migrations'
          : `Seeding ${images} images and 365 days through production writer`,
      );
      let migrationMs: number | null = null;
      let bytesBeforeMigration: number | null = null;
      let cloneMs: number | null = null;
      let fixture: { dailyRows: number; events: number };
      if (options.fixtureDatabase) {
        copyFileSync(options.fixtureDatabase, path);
        cloneMs = performance.now() - started;
        bytesBeforeMigration = statSync(path).size;
        connection = openRuntimeDatabase(path);
        const migrationStarted = performance.now();
        migrateRuntimeDatabase(
          connection.db,
          fileURLToPath(new URL('../../../drizzle', import.meta.url)),
        );
        connection.db.$client.pragma('wal_checkpoint(TRUNCATE)');
        migrationMs = performance.now() - migrationStarted;
        fixture = {
          dailyRows: (
            connection.db.$client
              .prepare('SELECT count(*) n FROM analytics_image_daily')
              .get() as { n: number }
          ).n,
          events: (
            connection.db.$client
              .prepare(
                'SELECT sum(original_count + compressed_count + watermark_count) n FROM analytics_image_totals',
              )
              .get() as { n: number }
          ).n,
        };
      } else {
        const seeded = createScaleFixture(path, images, 365);
        connection = seeded.connection;
        fixture = seeded;
        connection.db.transaction((tx) =>
          initializeSiteSettings(tx, {
            publicUrl: 'http://localhost',
            timeZone: 'UTC',
          }),
        );
      }
      const seedMs = options.fixtureDatabase
        ? null
        : performance.now() - started;
      const client = connection.db.$client;
      const rows = Object.fromEntries(
        [
          'media_images',
          'analytics_daily',
          'analytics_image_daily',
          'analytics_image_totals',
          'media_jobs',
          'media_objects',
        ].map((table) => [
          table,
          (
            client.prepare(`SELECT count(*) n FROM ${table}`).get() as {
              n: number;
            }
          ).n,
        ]),
      );
      fixtureDetails = {
        images,
        days: 365,
        events: fixture.events,
        rows,
        seedMs,
        seedSource: options.fixtureDatabase
          ? 'SQLite-consistent pre-workload backup from this Issue baseline; baseline report retains original production-writer seed cost. Original backup is unchanged.'
          : 'Fresh #143 fixture through production writer',
        cloneMs,
        writerIncrementKeysPerSecond:
          seedMs === null ? null : (fixture.dailyRows * 3) / (seedMs / 1000),
        distribution:
          'Deterministic synthetic: 1% daily hotspots, 9% weekly, 80% monthly, 10% zero; original:compressed:watermark 3:2:1; alternating UTC/Asia/Shanghai. Reuses #143 fixture and production writer; no experiment query SQL is executed.',
        dateRange: [dateLabel(0), dateLabel(364)],
      };
      assert.equal(rows.media_images, images);
      assert.equal(rows.analytics_image_daily, fixture.dailyRows);
      databaseDetails = {
        bytesAfterSeed: statSync(path).size,
        bytesBeforeMigration,
        migrationMs,
        indexes: client
          .prepare(
            "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name LIKE 'analytics_%'",
          )
          .all(),
        journalMode: client.pragma('journal_mode', { simple: true }),
        cacheSize: client.pragma('cache_size', { simple: true }),
        pageSize: client.pragma('page_size', { simple: true }),
        sqliteVersion: client.prepare('SELECT sqlite_version() version').get(),
      };

      // Independent arithmetic oracle for the synthetic distribution, never SQL.
      let expectedDailyRows = 0;
      const daily = Array.from({ length: 365 }, (_, day) => {
        let weight = 0;
        for (let i = 0; i < images; i++) {
          const bucket = i % 100;
          if (
            bucket >= 90 ||
            (bucket >= 10 && day % 30 !== i % 30) ||
            (bucket >= 1 && bucket < 10 && day % 7 !== i % 7)
          )
            continue;
          expectedDailyRows++;
          weight += bucket === 0 ? 100 : bucket < 10 ? 10 : 1;
        }
        return weight;
      });
      assert.equal(
        daily.reduce((sum, weight) => sum + weight * 6, 0),
        fixture.events,
      );
      assert.equal(
        fixture.dailyRows,
        expectedDailyRows,
        'Reused fixture must be before retention or interleaved writes',
      );
      const collector = createAccessCollector();
      const health = createAccessFlusher({
        db: client,
        collector,
        logger: {
          error: () => assert.fail('Unexpected analytics write failure'),
        },
      }).health;
      function checkOverview(
        result: ReturnType<typeof readOverview>,
        days: ReportDays,
        flushes = 0,
      ) {
        const weight = daily
          .slice(365 - days)
          .reduce((sum, count) => sum + count, 0);
        assert.deepEqual(result.range, {
          days,
          startDate: dateLabel(365 - days),
          endDate: dateLabel(364),
        });
        assert.equal(result.timezone, 'UTC');
        assert.equal(result.counts.normalImages, images);
        assert.equal(result.containsOldTimezone, true);
        assert.deepEqual(result.versions, {
          original: weight * 3 + flushes * 1000,
          compressed: weight * 2,
          watermark: weight,
          total: weight * 6 + flushes * 1000,
        });
        assert.equal(result.trend.length, days);
        result.trend.forEach((row, i) => {
          assert.equal(row.date, dateLabel(365 - days + i));
          assert.equal(
            row.count,
            daily[365 - days + i] * 6 + (i === days - 1 ? flushes * 1000 : 0),
          );
          assert.equal(row.isTodayPartial, i === days - 1);
        });
        assert.equal(
          result.trend.reduce((sum, row) => sum + row.count, 0),
          result.versions.total,
        );
        assert.equal(result.today, daily[364] * 6 + flushes * 1000);
        assert.deepEqual(result.cumulative, {
          original: fixture.events / 2 + flushes * 1000,
          compressed: fixture.events / 3,
          watermark: fixture.events / 6,
          total: fixture.events + flushes * 1000,
        });
        assert.deepEqual(
          result.popular.map((row) => row.imageId),
          Array.from(
            { length: 10 },
            (_, i) => `image-${String(i * 100).padStart(6, '0')}`,
          ),
        );
        assert.ok(
          result.popular.every(
            (row) =>
              row.count === days * 600 + flushes && row.state === 'normal',
          ),
        );
      }
      function checkImage(
        result: ReturnType<typeof readImageStats>,
        flushes = 0,
      ) {
        const hotspot = result.imageId === 'image-000000';
        assert.equal(
          result.cumulative.total,
          hotspot ? 365 * 600 + flushes : 0,
        );
        for (const period of result.periods) {
          assert.deepEqual(
            {
              days: period.days,
              startDate: period.startDate,
              endDate: period.endDate,
            },
            {
              days: period.days,
              startDate: dateLabel(365 - period.days),
              endDate: dateLabel(364),
            },
          );
          assert.equal(period.total, hotspot ? period.days * 600 + flushes : 0);
          assert.equal(period.containsOldTimezone, hotspot);
        }
      }

      connection.close();
      connection = undefined;
      const scenarios = [
        ...([7, 30, 90] as const).map((days) => ({
          name: `overview-${days}`,
          read: (db: BetterSQLite3Database) => {
            const result = readOverview(db, { now, health, days });
            return { result, check: () => checkOverview(result, days) };
          },
        })),
        ...['image-000000', 'image-000099'].map((imageId) => ({
          name: `image-${imageId}`,
          read: (db: BetterSQLite3Database) => {
            const result = readImageStats(db, imageId, { now, health });
            return { result, check: () => checkImage(result) };
          },
        })),
      ];
      for (const scenario of scenarios) {
        const logged: { sql: string; parameters: unknown[] }[] = [];
        connection = openRuntimeDatabase(path);
        const cold = drizzle(connection.db.$client, {
          logger: {
            logQuery(sql, parameters) {
              logged.push({ sql, parameters });
            },
          },
        });
        const start = performance.now();
        const first = scenario.read(cold);
        const sqliteColdMs = performance.now() - start;
        first.check();
        const queries = logged
          .filter(({ sql }) => /^\s*(select|with)\b/i.test(sql))
          .map((query) => ({
            ...query,
            plan: connection!.db.$client
              .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
              .all(...query.parameters),
          }));
        assert.ok(queries.length > 0, 'Production SQL was not captured');
        connection.close();
        connection = openRuntimeDatabase(path);
        const warm = connection.db;
        scenario.read(warm).check();
        const samples: number[] = [];
        for (let i = 0; i < warmRuns; i++) {
          const start = performance.now();
          const next = scenario.read(warm);
          samples.push(performance.now() - start);
          next.check();
          assert.deepEqual(next.result, first.result);
        }
        const measurement = {
          name: scenario.name,
          sqliteColdMs,
          warm: summary(samples),
          queries,
        };
        measurements.push(measurement);
        console.log(
          `${scenario.name}: cold=${sqliteColdMs.toFixed(1)}ms warm p95=${measurement.warm.p95Ms.toFixed(1)}ms`,
        );
        connection.close();
        connection = undefined;
      }

      connection = openRuntimeDatabase(path);
      const active = connection.db;
      const flusher = createAccessFlusher({
        db: active.$client,
        collector,
        logger: {
          error: () => assert.fail('Unexpected analytics write failure'),
        },
        now: () => now.getTime(),
      });
      for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < 1000; i++)
          assert.equal(
            collector.recordAccess(
              {
                imageId: `image-${String(i).padStart(6, '0')}`,
                storageId: 'scale',
                actualVersion: 'original',
                occurredAt: now,
              },
              'UTC',
            ),
            true,
          );
        assert.equal(collector.pendingKeys, 1000);
        const queued = performance.now();
        const operations = [
          {
            name: 'Overview',
            run: () => {
              const result = readOverview(active, {
                now,
                health: flusher.health,
                days: 90,
              });
              return () => checkOverview(result, 90, completedFlushes);
            },
          },
          {
            name: 'Flush',
            run: () => {
              assert.equal(flusher.flushAccessBatch(), true);
              completedFlushes++;
              return () => assert.equal(collector.pendingKeys, 0);
            },
          },
          {
            name: 'Retention',
            run: () => {
              const result = pruneDailyStats(
                active.$client,
                new Date('2027-01-01T12:00:00Z'),
              );
              deletedRows += result.deleted;
              return () =>
                assert.ok(result.deleted >= 0 && result.deleted <= 1000);
            },
          },
        ];
        const ordered = [
          ...operations.slice(round % 3),
          ...operations.slice(0, round % 3),
        ];
        await Promise.all(
          ordered.map(({ name, run }) =>
            yieldLoop().then(() => {
              const start = performance.now();
              const check = run();
              const end = performance.now();
              concurrency[name.toLowerCase()].push(end - start);
              concurrency[`queued${name}`].push(end - queued);
              check();
            }),
          ),
        );
        // Every round re-reads the committed snapshot after all three operations.
        checkOverview(
          readOverview(active, { now, health: flusher.health, days: 90 }),
          90,
          completedFlushes,
        );
        checkImage(
          readImageStats(active, 'image-000000', {
            now,
            health: flusher.health,
          }),
          completedFlushes,
        );
      }
      assert.equal(flusher.stop(), true);
      finalHealth = flusher.health();
      assert.equal(finalHealth.dropped, 0);
      assert.equal(finalHealth.flushed, rounds * 1000);
      assert.ok(deletedRows > 0);
      databaseDetails.bytesAfterWorkload = statSync(path).size;
      databaseDetails.walBytesAfterWorkload = statSync(`${path}-wal`).size;
    } catch (error) {
      workloadError = error;
      failures.push(
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
      );
    }
    const concurrentMeasurements = Object.fromEntries(
      Object.entries(concurrency).map(([name, samples]) => [
        name,
        summary(samples),
      ]),
    );
    const thresholds = {
      warmP95Ms: 500,
      sqliteColdMs: 2000,
      queuedP95Ms: 500,
      queriesPass:
        measurements.length === 5 &&
        measurements.every(
          (result) => result.warm.p95Ms <= 500 && result.sqliteColdMs <= 2000,
        ),
      concurrencyPass:
        concurrentMeasurements.queuedOverview.samplesMs.length === rounds &&
        concurrentMeasurements.queuedOverview.p95Ms <= 500,
    };
    if (!thresholds.queriesPass)
      failures.push(
        'Production query latency target failed or measurements incomplete',
      );
    if (!thresholds.concurrencyPass)
      failures.push(
        'Queued production overview latency target failed or measurements incomplete',
      );
    const disk = statfsSync(directory);
    const diskDevice = execFileSync('df', ['-P', directory], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .at(-1)!
      .split(/\s+/)[0];
    const diskInfo =
      platform() === 'darwin'
        ? execFileSync('diskutil', ['info', diskDevice], { encoding: 'utf8' })
            .split('\n')
            .filter((line) =>
              /Device \/ Media Name|Protocol:|Solid State:|File System Personality:/.test(
                line,
              ),
            )
            .map((line) => line.trim())
        : [diskDevice];
    const report = {
      status: failures.length ? 'failed' : 'passed',
      recordedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: platform(),
        release: release(),
        arch: arch(),
        cpu: cpus()[0].model,
        logicalCpus: cpus().length,
        memoryBytes: totalmem(),
        freeMemoryBytes: freemem(),
        filesystem: {
          type: disk.type,
          blockSize: disk.bsize,
          availableBlocks: disk.bavail,
        },
        diskInfo,
      },
      fixture: fixtureDetails,
      database: databaseDetails,
      cacheDefinition: {
        cold: 'New connection with empty SQLite page cache. OS cache NOT evicted, warm/unknown after seeding; no OS-cold claim.',
        warm: `One untimed call then ${warmRuns} production report calls on the same connection; production cache_size unchanged.`,
      },
      measurements,
      concurrency: {
        model: `${rounds} rounds, rotating overview90 / production1000-key flush / production<=1000-row retention, queued on same Node event loop and SQLite connection; no parallel-worker claim. Each round validates committed period, per-version/trend sums, deterministic top10 IDs and cumulative preservation.`,
        completedFlushes,
        deletedRows,
        health: finalHealth,
        measurements: concurrentMeasurements,
      },
      resources: {
        elapsedMs: performance.now() - started,
        cpu: process.cpuUsage(cpuStart),
        memory: process.memoryUsage(),
        maxRssKiB: process.resourceUsage().maxRSS,
      },
      thresholds,
      failures,
      limitations: [
        'Synthetic sparse distribution, not observed traffic or dense 36.5m image/day rows.',
        'This #143 fixture has no media_jobs or media_objects rows. Overview measures the actual current-count provider on these 100k images, not the distinct #168 workload with 100k processing jobs/objects; no universal latency claim for all production distributions.',
        'Local host only; container/other architecture verification belongs to Release.',
        'Historical #143 evidence and experimental SQL are unchanged.',
      ],
    };
    mkdirSync(dirname(options.reportPath), { recursive: true });
    writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Saved ${options.reportPath} (${report.status})`);
    if (failures.length) throw workloadError ?? new Error(failures.join('; '));
    return report;
  } catch (error) {
    if (workloadError !== undefined && error !== workloadError)
      throw new AggregateError(
        [workloadError, error],
        'Analytics scale workload and report generation failed',
      );
    throw error;
  } finally {
    try {
      connection?.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

/** Diagnose captured production SQL against the same seeded snapshot. */
export function profileCapturedReportSql(
  databasePath: string,
  baselinePath: string,
  reportPath: string,
) {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Awaited<
    ReturnType<typeof runReportsScale>
  >;
  const connection = openRuntimeDatabase(databasePath);
  const measurements: {
    scenarios: string[];
    sql: string;
    parameters: unknown[];
    plan: unknown[];
    warm: ReturnType<typeof summary>;
  }[] = [];
  try {
    for (const scenario of baseline.measurements) {
      for (const query of scenario.queries) {
        const existing = measurements.find(
          (measurement) =>
            measurement.sql === query.sql &&
            JSON.stringify(measurement.parameters) ===
              JSON.stringify(query.parameters),
        );
        if (existing) {
          existing.scenarios.push(scenario.name);
          continue;
        }
        const statement = connection.db.$client.prepare(query.sql);
        const expected = statement.all(...query.parameters);
        const samples: number[] = [];
        for (let i = 0; i < 25; i++) {
          const start = performance.now();
          const result = statement.all(...query.parameters);
          samples.push(performance.now() - start);
          assert.deepEqual(result, expected);
        }
        const measurement = {
          scenarios: [scenario.name],
          ...query,
          warm: summary(samples),
        };
        measurements.push(measurement);
        console.log(
          `${scenario.name} SQL ${measurements.length}: p95=${measurement.warm.p95Ms.toFixed(1)}ms`,
        );
      }
    }
  } finally {
    connection.close();
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      `${JSON.stringify({ recordedAt: new Date().toISOString(), source: baselinePath, model: 'Actual SQL/parameters captured from production reports; 25 warm executions per distinct SQL/parameter pair against SQLite-consistent backup of the same seeded fixture; no copied experiment SQL.', measurements }, null, 2)}\n`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      report: {
        type: 'string',
      },
      'profile-db': { type: 'string' },
      baseline: { type: 'string' },
      'fixture-db': { type: 'string' },
    },
  });
  if (values['profile-db']) {
    assert.ok(values.baseline, 'A captured baseline report is required');
    profileCapturedReportSql(
      values['profile-db'],
      values.baseline,
      values.report ?? 'test-results/analytics-169/scale-sql-profile.json',
    );
  } else {
    await runReportsScale({
      fixtureDatabase: values['fixture-db'],
      reportPath:
        values.report ?? 'test-results/analytics-169/scale-baseline.json',
    });
  }
}
