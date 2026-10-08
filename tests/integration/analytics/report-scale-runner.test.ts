import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runReportsScale } from '../../verification/analytics/reports-scale.ts';
import { createScaleFixture } from '../../experiments/analytics-scale/fixture.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import { createAccessWriter } from '../../../src/server/analytics/flush.ts';

it('runs actual reports with captured SQL and validates interleaved persisted snapshots', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'analytics-report-runner-'));
  const reportPath = join(directory, 'scale.json');
  try {
    const report = await runReportsScale({
      reportPath,
      images: 1000,
      warmRuns: 2,
      rounds: 3,
    });
    expect(report.status).toBe('passed');
    expect(report.measurements.map((measurement) => measurement.name)).toEqual([
      'overview-7',
      'overview-30',
      'overview-90',
      'image-image-000000',
      'image-image-000099',
    ]);
    for (const measurement of report.measurements) {
      expect(measurement.warm.samplesMs).toHaveLength(2);
      expect(measurement.queries.every((query) => query.plan.length > 0)).toBe(
        true,
      );
      expect(
        measurement.queries.some((query) =>
          query.sql.includes('analytics_image_totals'),
        ),
      ).toBe(true);
    }
    const overview = report.measurements.find(
      (measurement) => measurement.name === 'overview-90',
    )!;
    expect(
      overview.queries.some(
        (query) =>
          query.sql.includes('ranked') &&
          query.parameters.includes('2026-10-03'),
      ),
    ).toBe(true);
    expect(report.concurrency.completedFlushes).toBe(3);
    expect(report.concurrency.deletedRows).toBeGreaterThan(0);
    expect(report.concurrency.health).toMatchObject({
      accepted: 3000,
      flushed: 3000,
      pendingKeys: 0,
      dropped: 0,
    });
    for (const measurement of Object.values(report.concurrency.measurements))
      expect(measurement.samplesMs).toHaveLength(3);
    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({
      status: 'passed',
      failures: [],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 15_000);

it('clones the pre-workload fixture without mutating it and retains failure evidence for an already changed snapshot', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'analytics-report-clone-'));
  const path = join(directory, 'source.db');
  const fixture = createScaleFixture(path, 1000, 365);
  try {
    fixture.connection.db.transaction((tx) =>
      initializeSiteSettings(tx, {
        publicUrl: 'http://localhost',
        timeZone: 'UTC',
      }),
    );
    const db = fixture.connection.db.$client;
    db.pragma('wal_checkpoint(TRUNCATE)');
    const report = await runReportsScale({
      reportPath: join(directory, 'clone.json'),
      fixtureDatabase: path,
      images: 1000,
      warmRuns: 1,
      rounds: 1,
    });
    expect(report.status).toBe('passed');
    expect(report.fixture.seedMs).toBeNull();
    expect(report.database.migrationMs).toEqual(expect.any(Number));
    expect(
      db
        .prepare(
          'SELECT sum(original_count + compressed_count + watermark_count) total FROM analytics_image_totals',
        )
        .get(),
    ).toEqual({ total: fixture.events });
    createAccessWriter(db)([
      {
        imageId: 'image-000000',
        date: '2026-12-31',
        timezone: 'UTC',
        version: 'original',
        count: 1,
      },
    ]);
    db.pragma('wal_checkpoint(TRUNCATE)');
    const failedPath = join(directory, 'failure.json');
    await expect(
      runReportsScale({
        reportPath: failedPath,
        fixtureDatabase: path,
        images: 1000,
        warmRuns: 1,
        rounds: 1,
      }),
    ).rejects.toThrow('AssertionError');
    const failed = JSON.parse(readFileSync(failedPath, 'utf8'));
    expect(failed.status).toBe('failed');
    expect(
      failed.failures.some((failure: string) =>
        failure.includes('AssertionError'),
      ),
    ).toBe(true);
  } finally {
    fixture.connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 15_000);
