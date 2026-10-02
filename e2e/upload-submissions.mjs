/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { copyFile, mkdir, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { resizeViewport, setTheme, readGeometry } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const input = 'input[aria-label="选择图片文件"]';
const report = { status: 'failed', checks: [], layouts: [] };
async function settings(body) {
  const response = await page.fetch('/api/settings/upload', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, response.body);
  return JSON.parse(response.body);
}
async function layouts(name) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of [360, 390, 430, 768, 1440]) {
      await resizeViewport(page, width);
      const geometry = await readGeometry(page);
      geometry.modal = await page.evaluate(() => {
        const footer = document.querySelector('[data-slot="modal-footer"]');
        if (!footer) return null;
        const body = document.querySelector('[data-slot="modal-body"]');
        return {
          width: footer.getBoundingClientRect().width,
          gap:
            footer.getBoundingClientRect().top -
            body.getBoundingClientRect().bottom,
          buttons: [
            ...footer.querySelectorAll('button[data-slot="button"]'),
          ].map((node) => node.getBoundingClientRect().width),
        };
      });
      assert.equal(geometry.overflow, false, `${name}: document overflow`);
      assert.equal(geometry.mainOverflow, false, `${name}: main overflow`);
      for (const target of geometry.targets)
        assert.ok(
          target.width >= 44 &&
            target.height >= (width >= 1200 && target.navigation ? 40 : 44),
          `${target.name}: minimum click target (${target.width}×${target.height})`,
        );
      if (geometry.modal) {
        assert.equal(
          geometry.modal.gap,
          16,
          'Modal explanation-to-actions gap',
        );
        for (const actionWidth of geometry.modal.buttons)
          assert.equal(
            actionWidth,
            geometry.modal.width,
            'Modal actions fill the content width',
          );
      }
      await page.screenshot({
        path: join(config.output, `submissions-${name}-${theme}-${width}.png`),
      });
      report.layouts.push({ name, theme, ...geometry });
    }
    if (name === 'processing-options') {
      await resizeViewport(page, 390, 400);
      await page.focus(button('重新处理'));
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        '查看详情',
        'Reprocess keyboard order reaches the real image detail',
      );
      for (let index = 0; index < 6; index++) {
        await page.keyboard.press('Tab');
        assert.ok(
          await page.evaluate(
            () => !!document.activeElement?.closest('[role="dialog"]'),
          ),
          'Modal keeps keyboard focus within its actions',
        );
      }
      await page.focus(button('删除图片'));
      const short = await page.evaluate(() => {
        const action = [
          ...document.querySelectorAll('[role="dialog"] button'),
        ].find((node) => node.textContent === '删除图片');
        const rect = action.getBoundingClientRect();
        return { width: innerWidth, height: innerHeight, bottom: rect.bottom };
      });
      assert.ok(short.bottom <= 400, 'Short viewport can reach delete action');
      await page.screenshot({
        path: join(config.output, `submissions-${name}-${theme}-390-short.png`),
      });
      report.layouts.push({ name, theme, short });
    }
  }
}
let xhrScript;
try {
  await page.goto(`${config.origin}/upload`);
  if (await page.evaluate(() => !!document.querySelector('#email'))) {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
  }
  await page.waitForSelector(input, { state: 'attached' });
  const initial = await page.fetch('/api/settings/upload');
  assert.equal(initial.status, 200);
  assert.equal(initial.headers['cache-control'], 'no-store');
  const defaults = JSON.parse(initial.body);
  await settings({ maxFileMiB: 50, batchSize: 20, queueLimit: 500 });
  for (const body of [
    { maxFileMiB: 0 },
    { maxFileMiB: 1.5 },
    { batchSize: 201 },
    { queueLimit: 99 },
    { batchSize: 200, queueLimit: 100 },
  ]) {
    const response = await page.fetch('/api/settings/upload', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 422, response.body);
  }
  report.checks.push(
    'Owner settings API rejects illegal ranges without changing the persisted valid settings.',
  );
  xhrScript = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__uploadPending = [];
      window.__uploadSent = [];
      window.__uploadXHRs = [];
      window.__uploadMaximum = 0;
      window.__uploadRefs = [];
      window.__uploadBlobURLs = new Set();
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        window.__uploadRefs.push(new WeakRef(blob));
        const url = create(blob);
        window.__uploadBlobURLs.add(url);
        return url;
      };
      URL.revokeObjectURL = url => {
        window.__uploadBlobURLs.delete(url);
        revoke(url);
      };
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__uploadPath = String(url);
        return open.call(this, method, url, ...rest);
      };
      const send = XMLHttpRequest.prototype.send;
      window.__uploadRestoreSend = () => { XMLHttpRequest.prototype.send = send; };
      XMLHttpRequest.prototype.send = function(body) {
        if (!this.__uploadPath?.includes('/api/uploads/sessions/'))
          return send.call(this, body);
        window.__uploadPending.push(() => {
          window.__uploadXHRs = window.__uploadXHRs.filter(xhr => xhr.readyState !== 4);
          window.__uploadXHRs.push(this);
          window.__uploadMaximum = Math.max(window.__uploadMaximum, window.__uploadXHRs.length);
          window.__uploadSent.push(this.__uploadPath);
          send.call(this, body);
        });
      };
    })();`,
  });
  await page.reload();
  await page.waitForSelector(input, { state: 'attached' });
  const directory = join(config.output, 'submission-files');
  await mkdir(directory, { recursive: true });
  const files = [];
  for (let i = 0; i < 45; i++) {
    const file = join(directory, `batch-${String(i).padStart(2, '0')}.png`);
    await copyFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
      file,
    );
    files.push(file);
  }
  await page.setInputFiles(input, files);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-state="queued"]').length === 45,
  );
  const before = (await sql('SELECT count(*) AS n FROM upload_submissions'))[0]
    .n;
  await page.click(button('开始上传'));
  await page.waitForFunction(() => window.__uploadPending.length === 3);
  const [first] = await sql(
    'SELECT * FROM upload_submissions ORDER BY created_at DESC LIMIT 1',
  );
  assert.equal(
    (await sql('SELECT count(*) AS n FROM upload_submissions'))[0].n,
    before + 1,
  );
  assert.deepEqual(
    await sql(
      `SELECT group_index AS g, count(*) AS n FROM upload_sessions WHERE submission_id='${first.id}' GROUP BY group_index ORDER BY group_index`,
    ),
    [
      { g: 0, n: 20 },
      { g: 1, n: 20 },
      { g: 2, n: 5 },
    ],
  );
  await settings({ maxFileMiB: 1, batchSize: 1, queueLimit: 100 });
  await page.setInputFiles(input, files.slice(0, 2));
  await page.waitForFunction(
    () => document.querySelectorAll('[data-state="queued"]').length === 2,
  );
  const secondQueueId = await page.evaluate(
    () => document.querySelector('[data-state="queued"]').dataset.queueId,
  );
  await page.click('loc=role:button[name*="可见性"]');
  await page.click(
    `loc=role:option[name="${first.visibility === 'public' ? '私有' : '公开'}"]`,
  );
  await page.click(button('开始上传'));
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="upload-item"]').length === 47 &&
      document.querySelectorAll('[data-state="queued"]').length === 0,
  );
  const [second] = await sql(
    `SELECT s.* FROM upload_submissions s JOIN upload_sessions u ON u.submission_id=s.id WHERE u.queue_item_id='${secondQueueId}'`,
  );
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.visibility, second.visibility);
  assert.equal(second.batch_size, 1);
  assert.equal(second.max_file_bytes, 1024 * 1024);
  assert.equal(second.queue_limit, 100);
  assert.equal(
    (
      await sql(
        `SELECT batch_size FROM upload_submissions WHERE id='${first.id}'`,
      )
    )[0].batch_size,
    20,
  );
  assert.equal(
    await page.evaluate(() => window.__uploadPending.length),
    3,
    'Second submission shares the same three occupied transfer slots',
  );
  await layouts('two-frozen');
  let released = 0;
  while (released < 47) {
    await page.waitForFunction(() => window.__uploadPending.length > 0);
    const count = await page.evaluate(() => {
      const pending = window.__uploadPending.splice(0);
      pending.forEach((send) => send());
      return pending.length;
    });
    assert.ok(count <= 3);
    released += count;
  }
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-testid="upload-item"]')].every(
        (node) =>
          ['ready', 'unknown', 'upload-failed', 'processing-failed'].includes(
            node.dataset.state,
          ),
      ),
    undefined,
    { timeout: 60000 },
  );
  const uncertain = await page.evaluate(
    () => document.querySelectorAll('[data-state="unknown"]').length,
  );
  if (uncertain) {
    report.checks.push(
      `Explicitly reconciled ${uncertain} uncertain results using the real queue action; no file was resent.`,
    );
    for (let i = 0; i < uncertain; i++)
      await page.click(
        'loc=css:[data-state="unknown"] button:text-is("重新核对") >> nth=0',
      );
  }
  await page.waitForFunction(
    () => document.querySelectorAll('[data-state="ready"]').length === 47,
    undefined,
    { timeout: 60000 },
  );
  assert.ok(await page.evaluate(() => window.__uploadMaximum <= 3));
  assert.equal(await page.evaluate(() => window.__uploadSent.length), 47);
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS n FROM upload_sessions WHERE submission_id IN ('${first.id}','${second.id}') AND state='accepted'`,
      )
    )[0].n,
    47,
  );
  // The transfer harness must release its own completed XHR references first.
  await page.evaluate(() => {
    window.__uploadXHRs = [];
  });
  await page.cdp('HeapProfiler.collectGarbage');
  assert.deepEqual(
    await page.evaluate(() => ({
      files: window.__uploadRefs.filter((ref) => ref.deref()).length,
      urls: window.__uploadBlobURLs.size,
      input: document.querySelector('input[aria-label="选择图片文件"]').files
        .length,
    })),
    { files: 0, urls: 0, input: 0 },
  );
  await layouts('47-ready');
  await page.click(button('清空已完成'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-item"]'),
  );
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS n FROM upload_sessions WHERE submission_id IN ('${first.id}','${second.id}') AND image_id IS NOT NULL`,
      )
    )[0].n,
    47,
  );
  await settings({
    maxFileMiB: defaults.maxFileMiB,
    batchSize: defaults.batchSize,
    queueLimit: defaults.queueLimit,
  });
  await page.evaluate(() => {
    window.__uploadRestoreSend();
    window.__uploadXHRs = [];
  });
  await sql(
    "CREATE TRIGGER upload_submissions_fail_ready BEFORE UPDATE OF processing_status ON media_images WHEN NEW.processing_status='ready' BEGIN SELECT RAISE(ABORT, 'Issue160 controlled processing failure'); END",
  );
  let failedImage;
  try {
    await page.setInputFiles(input, files.slice(0, 1));
    await page.waitForSelector('[data-state="queued"]');
    await page.click(button('开始上传'));
    await page.waitForSelector('[data-state="processing-failed"]');
    failedImage = await page.evaluate(
      () =>
        document.querySelector('[data-testid="upload-item"]').dataset.imageId,
    );
    assert.ok(failedImage);
    await page.click(button('处理选项'));
    await page.waitForSelector(button('重新处理'));
    await layouts('processing-options');
    await page.click(button('重新处理'));
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="dialog"]')
          ?.textContent.includes('重处理失败：'),
      undefined,
      { timeout: 30000 },
    );
    assert.equal(
      (
        await sql(
          `SELECT count(*) AS n FROM media_jobs WHERE image_id='${failedImage}' AND status='failed'`,
        )
      )[0].n,
      2,
    );
    await layouts('reprocess-failed');
  } finally {
    await sql('DROP TRIGGER upload_submissions_fail_ready');
  }
  const countBeforeRetry = (
    await sql('SELECT count(*) AS n FROM media_images')
  )[0].n;
  const [failedJob] = await sql(
    `SELECT id FROM media_jobs WHERE image_id='${failedImage}' AND status='failed' ORDER BY created_at ASC LIMIT 1`,
  );
  await page.click(button('重新处理'));
  await page.waitForFunction(
    () =>
      document
        .querySelector('[role="dialog"]')
        ?.textContent.includes('当前图片已重新处理完成'),
    undefined,
    { timeout: 30000 },
  );
  assert.equal(
    (await sql('SELECT count(*) AS n FROM media_images'))[0].n,
    countBeforeRetry,
  );
  const retried = await sql(
    `SELECT id,status FROM media_jobs WHERE image_id='${failedImage}' ORDER BY created_at`,
  );
  assert.equal(retried.length, 3);
  assert.equal(retried[0].id, failedJob.id);
  assert.equal(retried[1].status, 'failed');
  assert.equal(retried[2].status, 'succeeded');
  await layouts('reprocess-ready');
  await page.evaluate((id) => {
    const original = window.fetch.bind(window);
    window.__reprocessPosts = 0;
    window.__restoreReprocessFetch = () => {
      window.fetch = original;
    };
    window.fetch = async (...args) => {
      if (
        String(args[0]) === `/api/images/${id}/reprocess` &&
        args[1]?.method === 'POST'
      ) {
        window.__reprocessPosts++;
        const response = await original(...args);
        window.__reprocessAcceptedStatus = response.status;
        window.__reprocessAcceptedJob = (await response.json()).jobId;
        throw new TypeError('Issue160: accepted reprocess response lost');
      }
      return original(...args);
    };
  }, failedImage);
  await page.click(button('重新处理'));
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const retry = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (node) => node.textContent === '重新处理',
    );
    return dialog?.textContent.includes('提交结果未知') && retry?.disabled;
  });
  assert.equal(await page.evaluate(() => window.__reprocessPosts), 1);
  assert.equal(
    await page.evaluate(() => window.__reprocessAcceptedStatus),
    202,
  );
  const acceptedJobId = await page.evaluate(
    () => window.__reprocessAcceptedJob,
  );
  assert.ok(acceptedJobId);
  assert.equal(
    (
      await sql(`SELECT image_id FROM media_jobs WHERE id='${acceptedJobId}'`)
    )[0].image_id,
    failedImage,
    'The response-lost POST really accepted a new job for the same image',
  );
  await layouts('reprocess-unknown');
  await page.evaluate(() => window.__restoreReprocessFetch());
  await page.click(button('查看详情'));
  await page.waitForSelector('[data-testid="detail-body"]');
  assert.equal(await page.evaluate(() => window.__reprocessPosts), 1);
  assert.equal(
    (await sql('SELECT count(*) AS n FROM media_images'))[0].n,
    countBeforeRetry,
  );
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/images/${id}`);
      if (!response.ok) return false;
      const detail = await response.json();
      return detail.processingStatus === 'ready' && !detail.activeJob;
    },
    failedImage,
    { timeout: 30000 },
  );
  assert.equal(
    (await sql(`SELECT status FROM media_jobs WHERE id='${acceptedJobId}'`))[0]
      .status,
    'succeeded',
    'The response-lost accepted job actually completed',
  );
  await page.click(button('关闭图片详情'));

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="upload-item"]').dataset.state,
    ),
    'processing-failed',
    'Original submission failure remains historical truth',
  );
  assert.equal(
    (
      await sql(
        `SELECT processing_status FROM media_images WHERE id='${failedImage}'`,
      )
    )[0].processing_status,
    'ready',
  );
  report.checks.push(
    'A failed reprocess displays the real new job failure and allows another explicit retry. Losing an accepted retry response disables duplicate POST and keeps the real image detail available for reconciliation.',
  );
  report.checks.push(
    'Processing failure retains the real original; reprocess creates a new job for the same image ID and reaches ready without a new image/submission, while the first upload failure remains visible.',
  );
  await page.click(button('清空已完成'));
  report.checks.push(
    '45 real files split into 20/20/5; changed settings apply to a second submission only; two submissions share three transfer slots and create 47 real images. Terminal File/Blob references are released and clearing keeps persisted images.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  report.page = await page.snapshot();
  await page.screenshot({
    path: join(config.output, 'submissions-failure.png'),
  });
  throw error;
} finally {
  if (xhrScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: xhrScript.identifier,
    });
  await writeFile(
    join(config.output, 'upload-submissions.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  status: report.status,
  checks: report.checks,
  layouts: report.layouts.length,
});
