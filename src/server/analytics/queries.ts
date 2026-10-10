import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaImages } from '../media/schema.ts';
import { requireSiteSettings } from '../site/settings.ts';
import type { createAccessFlusher } from './flush.ts';
import { dateInTimezone } from './retention.ts';
import { readCurrentCounts } from './usage.ts';

export type ReportDays = 7 | 30 | 90;
export type AnalyticsHealth = ReturnType<
  ReturnType<typeof createAccessFlusher>['health']
>;
type ReadOptions = { now?: Date; health: () => AnalyticsHealth };
type VersionCounts = {
  original: number;
  compressed: number;
  watermark: number;
  total: number;
};

/** UTC arithmetic operates on calendar labels, never elapsed time in a DST day. */
export function reportRange(today: string, days: ReportDays) {
  const start = new Date(`${today}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { days, startDate: start.toISOString().slice(0, 10), endDate: today };
}

function readCumulative(db: BetterSQLite3Database, imageId?: string) {
  const row = db.get<Omit<VersionCounts, 'total'>>(sql`select
    coalesce(sum(original_count), 0) original,
    coalesce(sum(compressed_count), 0) compressed,
    coalesce(sum(watermark_count), 0) watermark
    from analytics_image_totals ${imageId === undefined ? sql`` : sql`where image_id = ${imageId}`}`)!;
  return { ...row, total: row.original + row.compressed + row.watermark };
}

function metadata(db: BetterSQLite3Database, options: ReadOptions, now: Date) {
  const timezone = requireSiteSettings(db).timeZone;
  const health = options.health();
  return {
    generatedAt: now,
    timezone,
    lastFlushedAt:
      health.lastFlushedAt === null ? null : new Date(health.lastFlushedAt),
    health,
    approximate: true as const,
  };
}

/** Date-covering reads avoid the measured history-wide primary-key skip scan.
 * Check current existence per grouped ID before taking ten, then join their metadata. */
function readPopular(
  db: BetterSQLite3Database,
  range: ReturnType<typeof reportRange>,
) {
  const rows = db.all<{
    imageId: string;
    count: number;
    state: 'normal' | 'recycled';
    displayName: string | null;
    hasThumbnail: number;
  }>(sql`with ranked as (
    select image_id, sum(count) count from analytics_image_daily
    indexed by analytics_image_daily_date_image_count_idx
    where date between ${range.startDate} and ${range.endDate}
    group by image_id having sum(count) > 0
      and exists(select 1 from media_images existing
        where existing.id = analytics_image_daily.image_id)
    order by count desc, image_id asc limit 10
  ) select r.image_id imageId, r.count,
    case when m.trashed_at is not null or m.deletion_status is not null then 'recycled'
      else 'normal' end state,
    case when m.trashed_at is null and m.deletion_status is null then m.display_name end displayName,
    case when m.trashed_at is null and m.deletion_status is null and s.enabled = 1
      and exists(select 1 from media_versions v where v.image_id = m.id and v.kind = 'thumbnail')
      then 1 else 0 end hasThumbnail
    from ranked r join media_images m on m.id = r.image_id
    left join storage_configs s on s.id = m.storage_id
    order by r.count desc, r.image_id asc`);
  return rows.map(({ hasThumbnail, ...row }) => ({
    ...row,
    shortId: row.imageId.slice(0, 8),
    managementUrl: `/${row.state === 'recycled' ? 'trash' : 'library'}?image=${encodeURIComponent(row.imageId)}`,
    thumbnailUrl: hasThumbnail
      ? `/i/${encodeURIComponent(row.imageId)}?type=thumbnail`
      : null,
  }));
}

/** Persisted access, counts and current identity share one short read snapshot. */
export function readOverview(
  db: BetterSQLite3Database,
  options: ReadOptions & { days?: ReportDays },
) {
  const now = options.now ?? new Date();
  return db.transaction((tx) => {
    const meta = metadata(tx, options, now);
    const today = dateInTimezone(now, meta.timezone);
    const range = reportRange(today, options.days ?? 7);
    const rows = tx.all<{
      date: string;
      version: 'original' | 'compressed' | 'watermark';
      count: number;
      oldTimezone: number;
    }>(sql`select date, version, sum(count) count,
      max(timezone != ${meta.timezone}) oldTimezone
      from analytics_daily where date between ${range.startDate} and ${today}
      group by date, version order by date`);
    const versions: VersionCounts = {
      original: 0,
      compressed: 0,
      watermark: 0,
      total: 0,
    };
    const daily = new Map<string, number>();
    for (const row of rows) {
      versions[row.version] += row.count;
      versions.total += row.count;
      daily.set(row.date, (daily.get(row.date) ?? 0) + row.count);
    }
    const cursor = new Date(`${range.startDate}T00:00:00.000Z`);
    const trend = Array.from({ length: range.days }, () => {
      const date = cursor.toISOString().slice(0, 10);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      return {
        date,
        count: daily.get(date) ?? 0,
        isTodayPartial: date === today,
      };
    });
    return {
      ...meta,
      counts: readCurrentCounts(tx, now).counts,
      range,
      containsOldTimezone: rows.some((row) => row.oldTimezone !== 0),
      today: daily.get(today) ?? 0,
      cumulative: readCumulative(tx),
      versions,
      trend,
      popular: readPopular(tx, range),
    };
  });
}

/** Existing images, including recycle records, expose numbers without content privilege. */
export function readImageStats(
  db: BetterSQLite3Database,
  imageId: string,
  options: ReadOptions,
) {
  const now = options.now ?? new Date();
  return db.transaction((tx) => {
    if (
      !tx
        .select({ id: mediaImages.id })
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get()
    )
      throw Object.assign(new Error('图片记录不存在'), {
        code: 'ANALYTICS_IMAGE_NOT_FOUND',
      });
    const meta = metadata(tx, options, now);
    const today = dateInTimezone(now, meta.timezone);
    const rows = tx.all<{
      date: string;
      count: number;
      oldTimezone: number;
    }>(sql`select date, sum(count) count,
      max(timezone != ${meta.timezone}) oldTimezone from analytics_image_daily
      where image_id = ${imageId} and date between ${reportRange(today, 90).startDate} and ${today}
      group by date`);
    return {
      ...meta,
      imageId,
      cumulative: readCumulative(tx, imageId),
      periods: ([7, 30, 90] as const).map((days) => {
        const range = reportRange(today, days);
        const included = rows.filter((row) => row.date >= range.startDate);
        return {
          ...range,
          total: included.reduce((total, row) => total + row.count, 0),
          containsOldTimezone: included.some((row) => row.oldTimezone !== 0),
        };
      }),
    };
  });
}
