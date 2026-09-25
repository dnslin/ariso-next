import Database from 'better-sqlite3';
import { appendFileSync } from 'node:fs';
import { createAnalyticsCollector } from './collector.ts';

function initialize() {
  const database = new Database(process.env.ANALYTICS_DATABASE!);
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 100');
  const log = (event: string, details: object = {}) => {
    appendFileSync(
      process.env.ANALYTICS_TRACE!,
      `${JSON.stringify({ event, time: Date.now(), ...details })}\n`,
    );
  };
  const collector = createAnalyticsCollector(database);
  collector.start();
  log('initialized', { pid: process.pid });
  process.on('SIGTERM', () => log('signal', { signal: 'SIGTERM' }));
  process.on('SIGINT', () => log('signal', { signal: 'SIGINT' }));
  // Next alone owns signal shutdown and waits for HTTP + after() work.
  // Node exit listeners can only do synchronous work. The bounded buffer is
  // drained using synchronous SQLite transactions before closing this connection.
  process.once('exit', (code) => {
    log('exit-flush-start', { code, health: collector.snapshot() });
    const complete = collector.stop();
    log('exit-flush-end', { complete, health: collector.snapshot() });
    database.close();
    log('database-closed');
  });
  return {
    database,
    collector,
    log,
    record(imageId: string) {
      collector.record({
        imageId,
        date: '2026-09-25',
        timezone: 'Asia/Shanghai',
        version: 'original',
      });
    },
  };
}
const state = globalThis as typeof globalThis & {
  analyticsExperiment?: ReturnType<typeof initialize>;
};
export function getExperiment() {
  return (state.analyticsExperiment ??= initialize());
}
