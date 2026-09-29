import { fileURLToPath } from 'node:url';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createAccessWriter } from '../../../src/server/analytics/flush.ts';
import type { AccessIncrement } from '../../../src/server/analytics/collector.ts';

export function dateLabel(day: number) {
  return new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
}
export const queries = {
  trend: {
    sql: 'SELECT date, SUM(count) AS count FROM analytics_daily WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date',
  },
  versions: {
    sql: 'SELECT version, SUM(count) AS count FROM analytics_daily WHERE date BETWEEN ? AND ? GROUP BY version ORDER BY version',
  },
  ranking: {
    sql: 'SELECT image_id, SUM(count) AS count FROM analytics_image_daily WHERE date BETWEEN ? AND ? GROUP BY image_id ORDER BY count DESC, image_id ASC LIMIT 10',
  },
  image: {
    sql: 'SELECT date, SUM(count) AS count FROM analytics_image_daily WHERE image_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date',
  },
  imageTotal: {
    sql: 'SELECT original_count, compressed_count, watermark_count FROM analytics_image_totals WHERE image_id = ?',
  },
  total: {
    sql: 'SELECT SUM(original_count + compressed_count + watermark_count) AS count FROM analytics_image_totals',
  },
};

export const coveringIndexSql =
  'CREATE INDEX experiment_analytics_date_image_count ON analytics_image_daily(date, image_id, count)';
export const coveringRankingSql = queries.ranking.sql.replace(
  'FROM analytics_image_daily',
  'FROM analytics_image_daily INDEXED BY experiment_analytics_date_image_count',
);

// Synthetic distribution, not a claim about observed traffic. All counts are
// passed through the real production writer with its 1000-key transaction size.
export function createScaleFixture(path: string, images = 100_000, days = 365) {
  const connection = openRuntimeDatabase(path);
  try {
    migrateRuntimeDatabase(
      connection.db,
      fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    );
    const db = connection.db.$client;
    db.prepare('INSERT INTO storage_configs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'scale',
      'Scale fixture',
      'local',
      1,
      '/scale-fixture',
      0,
      0,
    );
    const image = db.prepare(`INSERT INTO media_images
      (id, storage_id, original_name, display_name, visibility, format, mime, width, height, byte_size, processing_status, created_at, updated_at)
      VALUES (?, 'scale', 'fixture.jpg', 'Fixture', 'public', 'jpeg', 'image/jpeg', 100, 100, 1000, 'ready', 0, 0)`);
    db.transaction(() => {
      for (let i = 0; i < images; i++)
        image.run(`image-${String(i).padStart(6, '0')}`);
    })();
    const write = createAccessWriter(db);
    let batch: AccessIncrement[] = [];
    let events = 0;
    let dailyRows = 0;
    const accessed = new Set<number>();
    for (let day = 0; day < days; day++) {
      for (let i = 0; i < images; i++) {
        const bucket = i % 100;
        if (
          bucket >= 90 ||
          (bucket >= 10 && day % 30 !== i % 30) ||
          (bucket >= 1 && bucket < 10 && day % 7 !== i % 7)
        )
          continue;
        accessed.add(i);
        dailyRows++;
        for (const [version, weight] of [
          ['original', 3],
          ['compressed', 2],
          ['watermark', 1],
        ] as const) {
          const count = (bucket === 0 ? 100 : bucket < 10 ? 10 : 1) * weight;
          events += count;
          batch.push({
            imageId: `image-${String(i).padStart(6, '0')}`,
            date: dateLabel(day),
            timezone: day % 2 ? 'Asia/Shanghai' : 'UTC',
            version,
            count,
          });
          if (batch.length === 1000) {
            write(batch);
            batch = [];
          }
        }
      }
    }
    if (batch.length) write(batch);
    db.exec('ANALYZE');
    db.pragma('wal_checkpoint(TRUNCATE)');
    return {
      connection,
      images,
      days,
      dailyRows,
      imagesWithAccess: accessed.size,
      events,
    };
  } catch (error) {
    connection.close();
    throw error;
  }
}
