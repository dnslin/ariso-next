import { sql } from 'drizzle-orm';
import { shareGrants } from './schema.ts';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from 'pino';
import { unlockShare } from './authorization.ts';
import { SharingError } from './errors.ts';
import { createShareLimiter } from './limiter.ts';

/** One bounded batch; expiry is also checked on every authorization read. */
export function pruneShareGrants(db: BetterSQLite3Database, now: Date) {
  return db
    .delete(shareGrants)
    .where(
      sql`rowid IN (
    SELECT rowid FROM share_grants WHERE expires_at <= ${now.getTime()} ORDER BY expires_at LIMIT 1000
  )`,
    )
    .run().changes;
}

/** Owned by the Web runtime; stop settles hashes before its database is closed. */
export function startSharingRuntime(options: {
  db: BetterSQLite3Database;
  logger: Pick<Logger, 'info' | 'error' | 'debug'>;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  const limiter = createShareLimiter();
  const active = new Set<Promise<unknown>>();
  let pending: ReturnType<typeof setImmediate> | undefined;
  let stopped = false;
  function clean() {
    pending = undefined;
    if (stopped) return;
    try {
      limiter.prune(now().getTime());
      if (pruneShareGrants(options.db, now()) === 1000) {
        pending = setImmediate(clean);
        pending.unref();
      }
    } catch (err) {
      options.logger.error({ err }, 'Share grant cleanup failed');
    }
  }
  pending = setImmediate(clean);
  pending.unref();
  const timer = setInterval(() => {
    if (!pending) clean();
  }, 60_000);
  timer.unref();
  return {
    unlock(token: string, password: string) {
      if (stopped)
        throw new SharingError('SHARING_STOPPING', '服务正在停止', 503);
      const operation = unlockShare(
        { ...options, now, limiter },
        token,
        password,
      ).finally(() => active.delete(operation));
      active.add(operation);
      return operation;
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      clearImmediate(pending);
      pending = undefined;
      await Promise.allSettled(active);
    },
  };
}
