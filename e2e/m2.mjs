/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { readFile, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { verifyM2Core, verifyM2Analytics } = await import(
  new URL('./m2-core.mjs', config.libraryDetailScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const path = join(config.output, `m2-${config.width}.json`);
const report =
  config.phase === 'before'
    ? {
        status: 'running',
        width: config.width,
        height: config.width === 1440 ? 1080 : 844,
        theme: 'light',
        checks: [],
      }
    : JSON.parse(await readFile(path, 'utf8'));
const source = join(
  config.projectDirectory,
  'tests/fixtures/runtime/images/sample.png',
);
async function original(id) {
  const rows = await sql(
    `SELECT o.id,o.key,o.storage_id,s.local_path FROM media_objects o JOIN storage_configs s ON s.id=o.storage_id WHERE o.image_id='${id}' AND o.purpose='original' AND o.status='stored'`,
  );
  assert.equal(rows.length, 1);
  const object = rows[0];
  assert.deepEqual(
    await readFile(
      join(
        config.dataDirectory,
        'storage',
        object.local_path,
        'ariso',
        object.storage_id,
        object.key,
      ),
    ),
    await readFile(source),
  );
  return object;
}
try {
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: config.width,
    height: config.width === 1440 ? 1080 : 844,
    deviceScaleFactor: 1,
    mobile: config.width < 768,
  });
  await page.goto(`${config.origin}/upload`);
  await page.waitForFunction(
    () =>
      document.querySelector('#email') ||
      document.querySelector('input[type=file]'),
  );
  if (new URL(await page.url()).pathname === '/login') {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
    await page.waitForFunction(
      () =>
        location.pathname !== '/login' ||
        document
          .querySelector('[role="alert"]')
          ?.textContent.includes('HTTP 429'),
    );
    if (new URL(await page.url()).pathname === '/login') {
      await page.waitForFunction(
        () => !document.querySelector('button[type="submit"]').disabled,
        undefined,
        { timeout: 30000 },
      );
      await page.click(button('登录'));
      report.checks.push(
        'M2 login honors the real preceding identity rate-limit countdown before retrying.',
      );
    }
  }
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  if (config.phase === 'before') {
    report.core = await verifyM2Core({ task, page, config, sql, report });
    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector('input[type=file]', { state: 'attached' });
    // Hold only scheduling of a genuinely accepted upload. Restart must recover
    // its persisted running job without creating another image or submission.
    await sql(
      "CREATE TRIGGER m2_hold_job AFTER INSERT ON media_jobs BEGIN UPDATE media_jobs SET status='running' WHERE id=NEW.id; END",
    );
    try {
      await page.setInputFiles('input[type=file]', [source]);
      await page.waitForSelector(
        '[data-testid="upload-item"][data-state="queued"]',
      );
      await page.click(button('开始上传'));
      await page.waitForSelector(
        '[data-testid="upload-item"][data-state="processing"]',
      );
      const id = await page.evaluate(
        () =>
          document.querySelector('[data-testid="upload-item"]').dataset.imageId,
      );
      const [job] = await sql(
        `SELECT id,status,snapshot,expected_versions FROM media_jobs WHERE image_id='${id}'`,
      );
      assert.equal(job.status, 'running');
      report.recovery = { imageId: id, job, original: await original(id) };
      await page.screenshot({
        path: join(config.output, `m2-restart-before-${config.width}.png`),
      });
      await page.goto(`${config.origin}/library`);
    } finally {
      await sql('DROP TRIGGER m2_hold_job');
    }
    report.checks.push(
      'Real File upload is accepted before restart; controlled scheduling hold leaves its actual job running and original bytes intact.',
    );
  } else {
    await verifyM2Analytics({ sql, state: report.core });
    report.checks.push(
      'After actual stop/start, all three persisted analytics tables still exactly match anonymous public accesses; owner/private/failed requests remain excluded.',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="upload-item"]').length,
      ),
      0,
      'Restart does not restore a browser queue',
    );
    const { imageId: id, job, original: savedOriginal } = report.recovery;
    await page.waitForFunction(
      async (id) => {
        const response = await fetch(`/api/images/${id}`);
        return (
          response.ok && (await response.json()).processingStatus === 'ready'
        );
      },
      id,
      { timeout: 30000 },
    );
    const jobs = await sql(
      `SELECT id,status,snapshot,expected_versions FROM media_jobs WHERE image_id='${id}'`,
    );
    assert.deepEqual(
      jobs,
      [{ ...job, status: 'succeeded' }],
      'Restart completes the same saved job and snapshot exactly once',
    );
    assert.deepEqual(await original(id), savedOriginal);
    const [session] = await sql(
      `SELECT count(*) AS count FROM upload_sessions WHERE image_id='${id}' AND state='accepted'`,
    );
    assert.equal(session.count, 1);
    const versions = await sql(
      `SELECT kind,count(*) AS count FROM media_versions WHERE image_id='${id}' GROUP BY kind ORDER BY kind`,
    );
    assert.deepEqual(
      versions,
      ['compressed', 'original', 'thumbnail'].map((kind) => ({
        kind,
        count: 1,
      })),
    );
    await page.goto(`${config.origin}/library?image=${id}`);
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.screenshot({
      path: join(config.output, `m2-restart-after-${config.width}.png`),
    });
    report.checks.push(
      'Actual production stop/start restores the same job, image, original object and processing snapshot; each expected version exists once and browser queue stays empty.',
    );
    report.recovery.versions = versions;
    report.status = 'passed';
  }
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack ?? error);
  try {
    report.page = await page.snapshot();
  } catch (diagnostic) {
    report.pageError = String(diagnostic);
  }
  throw error;
} finally {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(report);
