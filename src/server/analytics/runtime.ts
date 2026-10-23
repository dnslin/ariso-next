import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { createAccessFlusher } from './flush.ts';
import { startDailyRetention } from './retention.ts';

/** Called once by the process-wide Web runtime, never by build or migration CLI. */
export function startAnalyticsRuntime(options: {
  db: Database.Database;
  logger: Logger;
}) {
  const flusher = createAccessFlusher(options);
  const retention = startDailyRetention(options);
  flusher.start();
  return {
    health: flusher.health,
    flush() {
      while (flusher.health().pendingKeys) {
        if (!flusher.flushAccessBatch()) return false;
      }
      return true;
    },
    stop() {
      retention.stop();
      return flusher.stop();
    },
  };
}
