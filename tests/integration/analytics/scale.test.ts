import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  createScaleFixture,
  queries,
  dateLabel,
  coveringIndexSql,
  coveringRankingSql,
} from '../../experiments/analytics-scale/fixture.ts';
import { pruneDailyStats } from '../../../src/server/analytics/retention.ts';

it('seeds deterministic sparse history and queries periods without losing timezone segments or cumulative history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'analytics-scale-test-'));
  const fixture = createScaleFixture(join(directory, 'stats.db'), 200, 365);
  try {
    const db = fixture.connection.db.$client;
    db.exec(coveringIndexSql);
    expect(fixture.imagesWithAccess).toBe(180);
    expect(fixture.dailyRows).toBeGreaterThan(1000);
    const total = db.prepare(queries.total.sql).get() as { count: number };
    expect(total.count).toBe(fixture.events);
    for (const period of [7, 30, 90]) {
      const args = [dateLabel(365 - period), dateLabel(364)];
      const trend = db.prepare(queries.trend.sql).all(...args) as {
        count: number;
      }[];
      const ranking = db.prepare(queries.ranking.sql).all(...args) as {
        image_id: string;
        count: number;
      }[];
      const versions = db.prepare(queries.versions.sql).all(...args) as {
        count: number;
      }[];
      const image = db
        .prepare(queries.image.sql)
        .all('image-000000', ...args) as { count: number }[];
      expect(image).toHaveLength(period);
      expect(image.every((row) => row.count === 600)).toBe(true);
      expect(versions).toHaveLength(3);
      expect(versions.reduce((sum, row) => sum + row.count, 0)).toBe(
        trend.reduce((sum, row) => sum + row.count, 0),
      );
      expect(db.prepare(coveringRankingSql).all(...args)).toEqual(ranking);
      expect(trend).toHaveLength(period);
      expect(ranking[0].image_id).toBe('image-000000');
      expect(ranking[0].count).toBe(period * 600);
      expect(ranking[1]).toEqual({
        image_id: 'image-000100',
        count: period * 600,
      });
      expect(db.prepare(queries.imageTotal.sql).get('image-000000')).toEqual({
        original_count: 365 * 300,
        compressed_count: 365 * 200,
        watermark_count: 365 * 100,
      });
      expect(
        db.prepare(queries.imageTotal.sql).get('image-000099'),
      ).toBeUndefined();
      expect(trend.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThan(
        ranking[0].count,
      );
    }
    let deleted = 0;
    let result;
    do {
      result = pruneDailyStats(db, new Date('2027-01-01T12:00:00Z'));
      deleted += result.deleted;
    } while (result.hasMore);
    expect(deleted).toBeGreaterThan(0);
    expect(db.prepare(queries.total.sql).get()).toEqual(total);
    expect(pruneDailyStats(db, new Date('2027-01-01T12:00:00Z')).deleted).toBe(
      0,
    );
  } finally {
    fixture.connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
