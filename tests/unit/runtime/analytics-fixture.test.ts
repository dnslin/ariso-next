import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { analyticsFixture } from '../../../e2e/analytics-fixture.mjs';

describe('analytics browser access fixture', () => {
  it.each(['UTC', 'Asia/Shanghai'])(
    'seeds a real old-timezone segment when the current site uses %s',
    async (timezone) => {
      const db = new Database(':memory:');
      try {
        db.exec(`
          CREATE TABLE analytics_daily(date TEXT, timezone TEXT, version TEXT, count INTEGER);
          CREATE TABLE analytics_image_daily(image_id TEXT, date TEXT, timezone TEXT, count INTEGER);
          CREATE TABLE analytics_image_totals(image_id TEXT, original_count INTEGER);
        `);
        const fixture = await analyticsFixture(
          {},
          {
            sql: async (statement: string) => {
              const query = db.prepare(statement);
              return query.reader ? query.all() : query.run();
            },
            request: async () => ({
              timezone,
              range: { endDate: '2026-10-10' },
            }),
          },
        );
        // Recovery clears and then reseeds the same fixture after zero access.
        for (let seed = 0; seed < 2; seed++) {
          await fixture.seedAccess();
          for (const [startDate, total, oldTimezone] of [
            ['2026-10-04', 78, 0],
            ['2026-09-11', 234, 1],
          ]) {
            expect(
              db
                .prepare(
                  `
                SELECT sum(count) total, max(timezone != ?) oldTimezone
                FROM analytics_daily WHERE date BETWEEN ? AND '2026-10-10'
              `,
                )
                .get(timezone, startDate),
            ).toEqual({ total, oldTimezone });
          }
          expect(
            db
              .prepare(
                'SELECT sum(original_count) total FROM analytics_image_totals',
              )
              .get(),
          ).toEqual({ total: 468 });
        }
      } finally {
        db.close();
      }
    },
  );
});
