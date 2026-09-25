import { once } from 'node:events';
import { truncate } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { afterEach, expect, it } from 'vitest';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { launchLocalDelivery } from '../delivery/local-fixture.ts';

let app: Awaited<ReturnType<typeof launchLocalDelivery>> | undefined;
afterEach(async () => app?.close());
function count() {
  return (
    app!.db.$client
      .prepare('SELECT coalesce(sum(count), 0) AS count FROM analytics_daily')
      .get() as { count: number }
  ).count;
}

it.each(['SIGTERM', 'SIGINT'] as const)(
  '%s drains an in-flight production HTTP stream before queues, analytics and SQLite close',
  async (signal) => {
    app = await launchLocalDelivery();
    const asset = await app.seed();
    const length = 32 * 1024 * 1024;
    await truncate(asset.path, length);
    app.db
      .update(mediaImages)
      .set({ byteSize: length })
      .where(eq(mediaImages.id, asset.imageId))
      .run();
    app.db
      .update(mediaObjects)
      .set({ byteSize: length })
      .where(eq(mediaObjects.imageId, asset.imageId))
      .run();
    app.db
      .update(mediaVersions)
      .set({ byteSize: length })
      .where(eq(mediaVersions.imageId, asset.imageId))
      .run();
    const url = new URL(app.origin);
    const socket = createConnection({
      host: url.hostname,
      port: Number(url.port),
    });
    try {
      await once(socket, 'connect');
      socket.write(
        `GET /i/${asset.imageId}?type=original HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`,
      );
      let bytes = 0;
      let headerLength = 0;
      const first = await new Promise<Buffer>((resolve, reject) => {
        socket.once('error', reject);
        socket.once('data', (chunk) => {
          socket.pause();
          resolve(chunk);
        });
      });
      expect(first.toString(), app.logs()).toMatch(/^HTTP\/1.1 200 /);
      headerLength = first.indexOf('\r\n\r\n') + 4;
      expect(headerLength).toBeGreaterThan(3);
      bytes += first.length;
      app.child.kill(signal);
      await delay(100);
      app.child.kill(signal);
      await delay(100);
      expect(app.child.exitCode, app.logs()).toBeNull();
      await expect(
        fetch(`${app.origin}/api/health`, {
          signal: AbortSignal.timeout(1000),
        }),
      ).rejects.toThrow();
      const ended = once(socket, 'end');
      socket.on('data', (chunk) => {
        bytes += chunk.length;
      });
      socket.resume();
      await ended;
      expect(bytes - headerLength).toBe(length);
      expect(await app.closed, app.logs()).toEqual([
        signal === 'SIGINT' ? 130 : 143,
        null,
      ]);
      expect(count()).toBe(1);
      expect(app.logs()).toContain(
        'Upload and media queues stopped, analytics flushed, database closed',
      );
    } finally {
      socket.destroy();
    }
  },
  30000,
);

it('SIGKILL preserves the committed prefix without claiming the pending event was flushed', async () => {
  app = await launchLocalDelivery();
  const asset = await app.seed();
  const request = async () => {
    const response = await fetch(
      `${app!.origin}/i/${asset.imageId}?type=original`,
    );
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  };
  await request();
  await expect.poll(count, { timeout: 8000, interval: 25 }).toBe(1);
  await request();
  expect(count()).toBe(1);
  app.child.kill('SIGKILL');
  expect(await app.closed).toEqual([null, 'SIGKILL']);
  expect(count()).toBe(1);
  expect(app.logs()).not.toContain('analytics flushed, database closed');
}, 30000);

it('SIGTERM reports retained increments when the final transaction fails and does not claim a complete flush', async () => {
  app = await launchLocalDelivery();
  const asset = await app.seed();
  app.db.$client
    .exec(`CREATE TRIGGER reject_shutdown_totals BEFORE INSERT ON analytics_image_totals
    BEGIN SELECT RAISE(ABORT, 'shutdown totals failure evidence'); END`);
  const response = await fetch(
    `${app.origin}/i/${asset.imageId}?type=original`,
  );
  expect(response.status).toBe(200);
  await response.arrayBuffer();
  app.child.kill('SIGTERM');
  expect(await app.closed, app.logs()).toEqual([143, null]);
  for (const table of [
    'analytics_daily',
    'analytics_image_daily',
    'analytics_image_totals',
  ]) {
    expect(
      app.db.$client.prepare(`SELECT count(*) AS count FROM ${table}`).get(),
    ).toEqual({ count: 0 });
  }
  expect(app.logs()).toContain('shutdown totals failure evidence');
  expect(app.logs()).toContain('"pendingEvents":1');
  expect(app.logs()).toContain('Analytics shutdown flush did not complete');
  expect(app.logs()).not.toContain('analytics flushed, database closed');
}, 30000);
