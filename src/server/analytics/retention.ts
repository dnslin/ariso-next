import type Database from 'better-sqlite3';

export function dateInTimezone(now: Date | number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** One short synchronous batch across both daily tables. Totals are never touched. */
export function pruneDailyStats(
  db: Database.Database,
  now: Date | number,
  limit = 1_000,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000)
    throw new RangeError(
      'Analytics retention batch size must be between 1 and 1000',
    );
  return db.transaction(() => {
    // Flush creates both daily tables atomically. Delete image details first so
    // the smaller site-daily table retains every timezone until its details are gone.
    const timezones = db
      .prepare(`SELECT DISTINCT timezone FROM analytics_daily`)
      .all() as { timezone: string }[];
    let deleted = 0;
    for (const { timezone } of timezones) {
      const today = dateInTimezone(now, timezone);
      // UTC here represents calendar labels, not elapsed time in the archived timezone.
      const cutoff = new Date(`${today}T00:00:00.000Z`);
      cutoff.setUTCDate(cutoff.getUTCDate() - 364);
      const oldest = cutoff.toISOString().slice(0, 10);
      for (const table of [
        'analytics_image_daily',
        'analytics_daily',
      ] as const) {
        deleted += db
          .prepare(
            `DELETE FROM ${table} WHERE rowid IN (
          SELECT rowid FROM ${table} WHERE date < ? AND timezone = ? ORDER BY date LIMIT ?
        )`,
          )
          .run(oldest, timezone, limit - deleted).changes;
        if (deleted === limit) return { deleted, hasMore: true };
      }
    }
    return { deleted, hasMore: false };
  })();
}

/** Web-runtime lifecycle only; migration and build entry points never call this. */
export function startDailyRetention(options: {
  db: Database.Database;
  logger: Pick<import('pino').Logger, 'error' | 'warn'>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const lastDates = new Map<string, string>();
  const warnedFuture = new Map<string, string>();
  let pending: ReturnType<typeof setImmediate> | undefined;
  let stopped = false;

  function batch() {
    pending = undefined;
    if (stopped) return;
    try {
      if (pruneDailyStats(options.db, now()).hasMore) {
        pending = setImmediate(batch);
        pending.unref();
      }
    } catch (err) {
      // Retry on the next hourly check even when the local date has not advanced.
      lastDates.clear();
      options.logger.error({ err }, 'Analytics daily retention failed');
    }
  }

  function checkDates() {
    if (pending || stopped) return;
    try {
      const rows = options.db
        .prepare(
          `SELECT timezone, MAX(date) AS latest FROM analytics_daily GROUP BY timezone`,
        )
        .all() as { timezone: string; latest: string }[];
      const instant = now();
      let advanced = false;
      for (const { timezone, latest } of rows) {
        const today = dateInTimezone(instant, timezone);
        const previous = lastDates.get(timezone);
        if (previous && today < previous)
          options.logger.warn(
            { timezone, previous, today },
            'Analytics local date moved backwards; historical dates retained',
          );
        if (!previous || today > previous) advanced = true;
        lastDates.set(timezone, today);
        if (latest > today && warnedFuture.get(timezone) !== latest) {
          options.logger.warn(
            { timezone, today, latest },
            'Analytics future daily records retained',
          );
          warnedFuture.set(timezone, latest);
        } else if (latest <= today) warnedFuture.delete(timezone);
      }
      if (advanced) {
        pending = setImmediate(batch);
        pending.unref();
      }
    } catch (err) {
      options.logger.error({ err }, 'Analytics retention date check failed');
    }
  }

  pending = setImmediate(() => {
    pending = undefined;
    checkDates();
  });
  pending.unref();
  const timer = setInterval(checkDates, 60 * 60 * 1_000);
  timer.unref();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      clearImmediate(pending);
      pending = undefined;
    },
  };
}
