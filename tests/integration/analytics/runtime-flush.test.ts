import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pino from 'pino';
import { expect, it, vi } from 'vitest';
import { getAccessCollector } from '../../../src/server/analytics/collector.ts';
import { startAnalyticsRuntime } from '../../../src/server/analytics/runtime.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-runtime-flush-'));
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  const service = startAnalyticsRuntime({
    db: connection.db.$client,
    logger: pino({ level: 'silent' }),
  });
  const collector = getAccessCollector();
  return {
    service,
    connection,
    record(id: string) {
      collector.recordAccess(
        {
          imageId: id,
          storageId: 'local',
          actualVersion: 'original',
          occurredAt: new Date(),
        },
        'UTC',
      );
    },
    count() {
      return (
        connection.db.$client
          .prepare('SELECT coalesce(sum(count),0) AS n FROM analytics_daily')
          .get() as { n: number }
      ).n;
    },
    close() {
      connection.db.$client.pragma('query_only = OFF');
      service.stop();
      connection.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

it('flushes all pending batches synchronously without stopping normal analytics scheduling', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 1001; i++) f.record(`before-${i}`);
    expect(f.service.flush()).toBe(true);
    expect(f.count()).toBe(1001);
    expect(f.service.health().pendingKeys).toBe(0);
    for (let i = 0; i < 1000; i++) f.record(`after-${i}`);
    await vi.waitFor(() => expect(f.count()).toBe(2001));
  } finally {
    f.close();
  }
});

it('reports flush failure and preserves pending increments for a subsequent retry', () => {
  const f = fixture();
  try {
    f.record('pending');
    f.connection.db.$client.pragma('query_only = ON');
    expect(f.service.flush()).toBe(false);
    expect(f.service.health().pendingEvents).toBe(1);
    expect(f.count()).toBe(0);
    f.connection.db.$client.pragma('query_only = OFF');
    expect(f.service.flush()).toBe(true);
    expect(f.count()).toBe(1);
  } finally {
    f.close();
  }
});
