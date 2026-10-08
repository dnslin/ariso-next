import assert from 'node:assert/strict';
import { limitsField, limitsId } from './upload-settings-helpers.mjs';

export async function uploadSettingsRecovery(page, tools, report) {
  const reads = async (scenario, expected) => {
    const requests = (await tools.browser()).requests.filter(
      (request) => request.path === '/api/settings/upload',
    );
    assert.equal(
      requests.filter((request) => request.method === 'GET').length,
      expected,
      `${scenario}: exact upload-settings read count`,
    );
    report.recoveryRequests ??= [];
    report.recoveryRequests.push({
      scenario,
      requests: requests.map(
        ({ method, status, responseLost, controlledNetworkFailure }) => ({
          method,
          status,
          responseLost,
          controlledNetworkFailure,
        }),
      ),
    });
  };
  let remove;
  try {
    remove = await tools.install({ holdReads: true });
    await page.goto(`${report.origin}/settings/general`);
    await page.waitForSelector(`${limitsId('editor')}[data-state="loading"]`);
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-field]').length,
      ),
      0,
      'Loading does not invent default inputs',
    );
    for (const width of [1440, 390]) await tools.evidence('loading', width);
    await tools.release();
    await page.waitForSelector(`${limitsId('editor')}[data-state="ready"]`);
  } finally {
    if (remove) await remove();
  }
  try {
    remove = await tools.install({ failReads: true });
    await page.goto(`${report.origin}/settings/general`);
    await page.waitForSelector(`${limitsId('editor')}[data-state="error"]`);
    for (const width of [1440, 390])
      await tools.evidence('read-failed', width, 'dark');
    await page.evaluate(() => {
      window.__limitsBrowser.fault.failReads = false;
    });
    await page.click(limitsId('retry'));
    await page.waitForSelector(`${limitsId('editor')}[data-state="ready"]`);
  } finally {
    if (remove) await remove();
  }
  const [row] = await tools.sql('SELECT * FROM upload_settings');
  try {
    await tools.sql('DELETE FROM upload_settings');
    await page.goto(`${report.origin}/settings/general`);
    await page.waitForSelector(
      `${limitsId('editor')}[data-state="uninitialized"]`,
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-field]').length,
      ),
      0,
      'Real 409 does not fabricate defaults',
    );
    for (const width of [1440, 390])
      await tools.evidence('uninitialized', width);
  } finally {
    await tools.sql(
      `INSERT INTO upload_settings (id,max_file_bytes,batch_size,queue_limit,updated_at) VALUES (1,${row.max_file_bytes},${row.batch_size},${row.queue_limit},${row.updated_at})`,
    );
  }
  await tools.open();
  await tools.monitor({ holdSave: true });
  await tools.fill({ maxFileMiB: 57, batchSize: 21, queueLimit: 501 });
  await page.click(limitsId('save'));
  await page.waitForFunction(() =>
    window.__limitsBrowser.requests.some((r) => r.method === 'PATCH' && r.held),
  );
  assert.equal(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll('[data-field] input:not([type="hidden"])'),
      ].every((node) => node.disabled),
    ),
    true,
  );
  for (const width of [1440, 390])
    await tools.evidence('saving', width, 'dark');
  await tools.release();
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="upload-limits-save"]').disabled,
  );

  await tools.monitor({ lost: true });
  await tools.fill({ maxFileMiB: 58 });
  await page.click(limitsId('save'));
  await page.waitForFunction(
    () =>
      window.__limitsBrowser.requests.some(
        (r) => r.method === 'GET' && r.status === 200,
      ) &&
      !document.querySelector('[data-testid="upload-limits-save"]').disabled,
  );
  assert.equal((await tools.inputs()).maxFileMiB, '58');
  assert.equal((await tools.request('/api/settings/upload')).maxFileMiB, 58);
  assert.equal(
    (await tools.browser()).requests.filter((r) => r.method === 'PATCH').length,
    1,
  );
  await reads('committed response lost, automatic confirmation', 1);
  await tools.evidence('save-confirmed', 390);

  await tools.monitor({ lost: true, failReads: true });
  await tools.fill({ maxFileMiB: 59 });
  await page.click(limitsId('save'));
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="upload-limits-reconcile"]')
        ?.disabled === false,
  );
  assert.equal((await tools.inputs()).maxFileMiB, '59');
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="upload-limits-save"]').disabled,
    ),
    true,
  );
  await reads('automatic confirmation read failed', 1);
  for (const width of [1440, 390])
    await tools.evidence('reconcile-failed', width, 'dark');
  await page.evaluate(() => {
    window.__limitsBrowser.fault.failReads = false;
  });
  await page.click(limitsId('reconcile'));
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="upload-limits-save"]').disabled,
  );
  assert.equal(
    (await tools.browser()).requests.filter((r) => r.method === 'PATCH').length,
    1,
    'Read retry never repeats mutation',
  );
  await reads('explicit confirmation retry', 2);

  for (const useSaved of [false, true]) {
    await tools.monitor({
      lost: true,
      concurrent: { maxFileMiB: 60, batchSize: 22, queueLimit: 502 },
    });
    await tools.fill({ maxFileMiB: 61 });
    await page.click(limitsId('save'));
    await page.waitForSelector(`${limitsId('editor')}[data-different="true"]`);
    assert.equal((await tools.inputs()).maxFileMiB, '61');
    assert.equal((await tools.request('/api/settings/upload')).maxFileMiB, 60);
    await reads(`different saved value, useSaved=${useSaved}`, 1);
    for (const width of [1440, 390])
      await tools.evidence('different-saved', width);
    await page.click(limitsId(useSaved ? 'use-saved' : 'keep-input'));
    assert.equal((await tools.inputs()).maxFileMiB, useSaved ? '60' : '61');
    assert.equal(
      (await tools.browser()).requests.filter((r) => r.method === 'PATCH')
        .length,
      1,
    );
    if (!useSaved) await tools.save();
  }
  await tools.monitor({ gateway: true });
  await tools.fill({ maxFileMiB: 62 });
  await page.click(limitsId('save'));
  await page.waitForSelector(`${limitsId('editor')}[data-different="true"]`);
  assert.equal((await tools.inputs()).maxFileMiB, '62');
  assert.equal((await tools.request('/api/settings/upload')).maxFileMiB, 60);
  await reads('gateway failure followed by saved-value read', 1);
  for (const width of [1440, 390])
    await tools.evidence('service-failed', width, 'dark');
  await page.click(limitsId('keep-input'));
  assert.equal(
    (await tools.browser()).requests.filter((r) => r.method === 'PATCH').length,
    1,
  );
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).disabled,
      limitsField('maxFileMiB'),
    ),
    false,
  );
  const [savedRow] = await tools.sql('SELECT * FROM upload_settings');
  try {
    await tools.monitor();
    await tools.fill({ maxFileMiB: 63 });
    await tools.sql('DELETE FROM upload_settings');
    await page.click(limitsId('save'));
    await page.waitForFunction(
      () =>
        window.__limitsBrowser.requests.some(
          (request) => request.method === 'PATCH' && request.status === 409,
        ) &&
        !document.querySelector('[data-testid="upload-limits-save"]').disabled,
    );
    assert.equal((await tools.inputs()).maxFileMiB, '63');
    assert.equal(
      (await tools.browser()).requests.filter(
        (request) => request.method === 'PATCH',
      ).length,
      1,
    );
    await reads('known HTTP 409 preserves draft without automatic read', 0);
    for (const width of [1440, 390])
      await tools.evidence('save-refused', width);
  } finally {
    await tools.sql(
      `INSERT INTO upload_settings (id,max_file_bytes,batch_size,queue_limit,updated_at) VALUES (1,${savedRow.max_file_bytes},${savedRow.batch_size},${savedRow.queue_limit},${savedRow.updated_at})`,
    );
  }
  report.checks.push(
    'Real loading/409 and refused PATCH; controlled read/gateway failures; actual committed lost responses; exact one automatic GET, explicit read retry and different-value decisions preserve inputs',
  );
}
