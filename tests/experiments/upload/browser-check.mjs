// Execute inside ego-browser nodejs with a config { spaceId, origin, output }.
const assert = (await import('node:assert/strict')).default;
const { mkdir, writeFile } = await import('node:fs/promises');
const { gzipSync } = await import('node:zlib');
const { createHash } = await import('node:crypto');
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
await mkdir(config.output, { recursive: true });
await page.goto(config.origin);
await page.waitForFunction(() => !!window.uploadProbe);
const report = {
  startedAt: new Date().toISOString(),
  browser: await page.evaluate(() => navigator.userAgent),
  status: 'running',
  phases: [],
};
await page.cdp('HeapProfiler.enable');
async function snapshot(name) {
  await page.cdp('HeapProfiler.collectGarbage');
  const usage = await page.cdp('Runtime.getHeapUsage');
  await page.events();
  await page.cdp(
    'HeapProfiler.takeHeapSnapshot',
    { reportProgress: false },
    { timeout: 60000 },
  );
  const events = await page.events();
  const chunks = events
    .filter((event) => event.method === 'HeapProfiler.addHeapSnapshotChunk')
    .map((event) => event.params.chunk);
  assert.ok(chunks.length, 'Heap snapshot must contain actual CDP chunks');
  const raw = chunks.join('');
  const heap = JSON.parse(raw);
  const fields = heap.snapshot.meta.node_fields;
  const types = heap.snapshot.meta.node_types[fields.indexOf('type')];
  const counts = { File: 0, Blob: 0 };
  for (let index = 0; index < heap.nodes.length; index += fields.length) {
    const name = heap.strings[heap.nodes[index + fields.indexOf('name')]];
    if (
      types[heap.nodes[index + fields.indexOf('type')]] === 'native' &&
      name in counts
    )
      counts[name]++;
  }
  await writeFile(`${config.output}/${name}.heapsnapshot.gz`, gzipSync(raw));
  return {
    name,
    usage,
    counts,
    snapshotBytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
}
async function metrics() {
  return JSON.parse((await page.fetch('/metrics')).body);
}
async function reset(hold) {
  assert.equal(
    (await page.fetch(`/reset?hold=${hold}`, { method: 'POST' })).status,
    200,
  );
}
async function finish(count) {
  await page.waitForFunction(
    (count) =>
      window.uploadProbe.state().results.length === count &&
      window.uploadProbe.state().active === 0,
    count,
    { timeout: 180000 },
  );
  const state = await page.evaluate(() => window.uploadProbe.done());
  assert.equal(state.error, undefined);
  assert.equal(state.pending, 0);
  assert.equal(state.active, 0);
  assert.equal(state.revoked, count);
  assert.equal(new Set(state.results.map((result) => result.id)).size, count);
  await page.waitForFunction(
    async () => (await (await fetch('/metrics')).json()).active === 0,
  );
  return state;
}
try {
  report.duplicate = await page.evaluate(() =>
    window.uploadProbe.duplicateFile(),
  );
  assert.equal(report.duplicate.count, 2);
  assert.notEqual(...report.duplicate.ids);
  await reset(120);
  await page.evaluate(() => window.uploadProbe.add(18, 65536, true));
  assert.equal(
    (await metrics()).records.length,
    0,
    'Manual start: no upload or signature before start',
  );
  await page.evaluate(() => window.uploadProbe.start());
  const mixed = await finish(18);
  const wire = await metrics();
  assert.equal(wire.peak, 3);
  const uploads = wire.records.filter((item) => item.kind === 'upload');
  assert.equal(uploads.length, 18, 'Failures must not retry');
  assert.equal(
    mixed.results.filter((item) => item.status === 'failed').length,
    3,
  );
  assert.equal(wire.records.filter((item) => item.kind === 'sign').length, 9);
  const digest = createHash('sha256')
    .update(new Uint8Array(65536))
    .digest('hex');
  assert.ok(
    uploads.every((item) => item.bytes === 65536 && item.hash === digest),
  );
  assert.ok(
    uploads.every(
      (item) => item.method === (item.route === 's3' ? 'PUT' : 'POST'),
    ),
  );
  assert.ok(
    uploads.some((left) =>
      uploads.some(
        (right) =>
          left.route !== right.route &&
          left.start < right.end &&
          right.start < left.end,
      ),
    ),
    'Both plugins must overlap',
  );
  for (const sign of wire.records.filter((item) => item.kind === 'sign')) {
    const preceding = uploads.filter(
      (item) => item.start < sign.at && item.end > sign.at,
    );
    assert.ok(
      preceding.length < 3,
      'No signing while all three transfer slots are occupied',
    );
  }
  assert.deepEqual(
    await page.evaluate(() => window.uploadProbe.revokedURLsUnavailable()),
    [true, true, true],
  );
  await page.cdp('HeapProfiler.collectGarbage');
  assert.equal(await page.evaluate(() => window.uploadProbe.liveFiles()), 0);
  report.phases.push({ name: 'mixed-success-failure', state: mixed, wire });

  await reset(500);
  const ids = await page.evaluate(() =>
    window.uploadProbe.add(12, 65536, false),
  );
  await page.evaluate(() => window.uploadProbe.start());
  await page.waitForFunction(
    async () => (await (await fetch('/metrics')).json()).active === 3,
  );
  await page.evaluate(
    (ids) => {
      for (const id of ids) window.uploadProbe.cancel(id);
    },
    [ids[0], ids[1], ids[10], ids[11]],
  );
  const cancelled = await finish(12);
  assert.equal(
    cancelled.results.filter((item) => item.status === 'cancelled').length,
    4,
  );
  const cancellationWire = await metrics();
  assert.equal(cancellationWire.peak, 3);
  assert.ok(
    !cancellationWire.records.some(
      (item) => item.id === ids[10] || item.id === ids[11],
    ),
  );
  await page.cdp('HeapProfiler.collectGarbage');
  assert.equal(await page.evaluate(() => window.uploadProbe.liveFiles()), 0);
  report.phases.push({
    name: 'active-and-queued-cancellation',
    state: cancelled,
    wire: cancellationWire,
  });

  await page.reload();
  await page.waitForFunction(() => !!window.uploadProbe);
  await reset(0);
  report.phases.push(await snapshot('baseline'));
  await page.evaluate(() => window.uploadProbe.add(2000, 65536, true));
  const queued = await snapshot('queued-2000');
  assert.equal(await page.evaluate(() => window.uploadProbe.liveFiles()), 2000);
  assert.ok(queued.counts.File >= 2000);
  report.phases.push(queued);
  await page.evaluate(() => window.uploadProbe.start());
  const large = await finish(2000);
  const largeWire = await metrics();
  assert.equal(largeWire.peak, 3);
  assert.equal(
    largeWire.records.filter((item) => item.kind === 'upload').length,
    2000,
  );
  const totals = {
    success: large.results.filter((item) => item.status === 'success').length,
    failed: large.results.filter((item) => item.status === 'failed').length,
    cancelled: large.results.filter((item) => item.status === 'cancelled')
      .length,
  };
  assert.deepEqual(totals, { success: 1714, failed: 286, cancelled: 0 });
  const settled = await snapshot('settled-2000');
  assert.equal(await page.evaluate(() => window.uploadProbe.liveFiles()), 0);
  assert.equal(settled.counts.File, 0);
  assert.equal(settled.counts.Blob, 0);
  report.phases.push({
    ...settled,
    results: { ...totals, revoked: large.revoked },
    wirePeak: largeWire.peak,
    requests: largeWire.records.length,
  });
  report.status = 'passed';
  if (!config.keepSpace) await task.finish({ keep: [] });
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    `${config.output}/browser.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log({
    status: report.status,
    output: config.output,
    phases: report.phases.map(({ name, counts, usage }) => ({
      name,
      counts,
      usage,
    })),
  });
}
