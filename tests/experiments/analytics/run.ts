import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { arch, platform } from 'node:os';
import { buildExperiment, launchExperiment } from './harness.ts';

async function until(check: () => Promise<boolean>, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, 'Experiment observation timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
function readCounts(path: string) {
  const database = new Database(path, { readonly: true });
  try {
    return [
      'SELECT coalesce(sum(count),0) AS count FROM analytics_daily',
      'SELECT coalesce(sum(count),0) AS count FROM analytics_image_daily',
      'SELECT coalesce(sum(original_count+compressed_count+watermark_count),0) AS count FROM analytics_image_totals',
    ].map((sql) => (database.prepare(sql).get() as { count: number }).count);
  } finally {
    database.close();
  }
}
export async function runLifecycle(reportPath: string, image?: string) {
  const results = [];
  for (const scenario of [
    'SIGTERM',
    'SIGINT',
    'SIGKILL',
    'write-failure',
    'full-buffer',
    'full-drain',
  ] as const) {
    const app = await launchExperiment(image);
    try {
      // Establish an independently observed committed prefix before the crash case.
      if (scenario === 'SIGKILL') {
        await (
          await app.request('?action=record&count=1000&prefix=committed')
        ).json();
        await until(
          async () => (await (await app.request()).json()).flushed === 1000,
        );
        assert.deepEqual(readCounts(app.database), [1000, 1000, 1000]);
      }
      if (
        scenario === 'write-failure' ||
        scenario === 'full-buffer' ||
        scenario === 'full-drain'
      ) {
        await (await app.request('?action=fault&enabled=1')).json();
      }
      await (
        await app.request(
          `?action=record&count=${scenario === 'full-buffer' || scenario === 'full-drain' ? 20001 : 17}&prefix=pending`,
        )
      ).json();
      const before = await (await app.request()).json();
      assert.equal(
        before.pendingEvents,
        scenario === 'full-buffer' || scenario === 'full-drain' ? 20000 : 17,
      );
      assert.equal(
        before.dropped,
        scenario === 'full-buffer' || scenario === 'full-drain' ? 1 : 0,
      );
      assert.deepEqual(
        readCounts(app.database),
        scenario === 'SIGKILL' ? [1000, 1000, 1000] : [0, 0, 0],
      );
      if (scenario === 'full-drain') {
        await (await app.request('?action=fault&enabled=0')).json();
      }
      let stream: Promise<string> | undefined;
      if (scenario === 'SIGTERM' || scenario === 'SIGINT') {
        stream = app
          .request('?action=stream')
          .then((response) => response.text());
        await until(async () =>
          (await app.trace()).some((event) => event.event === 'request-start'),
        );
      }
      const start = performance.now();
      const signal =
        scenario === 'SIGKILL'
          ? 'SIGKILL'
          : scenario === 'SIGINT'
            ? 'SIGINT'
            : 'SIGTERM';
      const watchdog = setTimeout(() => {
        void app.signal('SIGKILL');
      }, 10000);
      let exit;
      try {
        await app.signal(signal);
        if (stream) {
          await until(async () =>
            (await app.trace()).some((event) => event.event === 'signal'),
          );
          await assert.rejects(
            app.request(),
            'Next must reject new connections after signal',
          );
          assert.equal(await stream, 'first\nlast\n');
        }
        exit = await app.closed;
      } finally {
        clearTimeout(watchdog);
      }
      const shutdownMs = performance.now() - start;
      assert.ok(shutdownMs < 10000, 'Shutdown exceeded experiment budget');
      assert.equal(
        exit[0],
        image
          ? signal === 'SIGKILL'
            ? 137
            : signal === 'SIGINT'
              ? 130
              : 143
          : signal === 'SIGKILL'
            ? null
            : signal === 'SIGINT'
              ? 130
              : 143,
      );
      if (!image && signal === 'SIGKILL') assert.equal(exit[1], 'SIGKILL');
      const trace = await app.trace();
      assert.equal(
        trace.filter((event) => event.event === 'initialized').length,
        1,
      );
      const counts = readCounts(app.database);
      if (scenario === 'SIGKILL') {
        assert.deepEqual(counts, [1000, 1000, 1000]);
        assert.ok(!trace.some((event) => event.event === 'exit-flush-start'));
      } else {
        const events = trace.map((event) => event.event);
        assert.ok(
          events.indexOf('signal') < events.indexOf('exit-flush-start'),
        );
        assert.ok(
          events.indexOf('exit-flush-start') < events.indexOf('exit-flush-end'),
        );
        assert.ok(
          events.indexOf('exit-flush-end') < events.indexOf('database-closed'),
        );
        const final = trace.find((event) => event.event === 'exit-flush-end');
        if (stream) {
          assert.ok(events.indexOf('signal') < events.indexOf('first-byte'));
          assert.ok(
            events.indexOf('first-byte') < events.indexOf('stream-complete'),
          );
          assert.ok(
            events.indexOf('stream-complete') <
              events.indexOf('exit-flush-start'),
          );
          assert.equal(final.complete, true);
          assert.equal(final.health.pendingEvents, 0);
          assert.deepEqual(counts, [18, 18, 18]);
        } else if (scenario === 'full-drain') {
          const startHealth = trace.find(
            (event) => event.event === 'exit-flush-start',
          ).health;
          assert.equal(startHealth.pendingEvents, 20000);
          assert.equal(startHealth.committedBatches, 0);
          assert.equal(final.complete, true);
          assert.equal(final.health.pendingEvents, 0);
          assert.equal(final.health.committedBatches, 20);
          assert.deepEqual(counts, [20000, 20000, 20000]);
        } else {
          assert.equal(final.complete, false);
          assert.match(final.health.lastError, /readonly/i);
          assert.equal(final.health.pendingEvents, before.pendingEvents);
          assert.deepEqual(counts, [0, 0, 0]);
        }
      }
      results.push({
        scenario,
        before,
        counts,
        lostAccepted: before.accepted + (stream ? 1 : 0) - counts[0],
        shutdownMs,
        exit,
        trace,
        logs: app.logs(),
      });
    } catch (error) {
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            status: 'failed',
            scenario,
            error: String(error),
            results,
            trace: await app.trace(),
            logs: app.logs(),
          },
          null,
          2,
        ) + '\n',
      );
      throw error;
    } finally {
      await app.dispose();
    }
  }
  const report = {
    status: 'passed',
    node: process.version,
    platform: platform(),
    architecture: arch(),
    image: image ?? null,
    results,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (!process.env.ANALYTICS_SKIP_BUILD) await buildExperiment();
  await runLifecycle(
    process.env.ANALYTICS_REPORT ?? 'test-results/analytics/lifecycle.json',
    process.env.ANALYTICS_IMAGE,
  );
}
