/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const button = (name) => `loc=role:button[name="${name}"]`;
const item = '[data-testid="upload-item"]';
const source = join(
  config.projectDirectory,
  'tests/fixtures/runtime/images/sample.png',
);
const report = {
  status: 'failed',
  checks: [],
  limitations: [
    'Browser-boundary holds delay real responses without changing their payloads; no controller methods are called.',
  ],
};
let transportScript;
async function clear() {
  await page.click(button('清空已完成'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-item"]'),
  );
}
async function overlappingRead(name) {
  await page.evaluate(() => {
    const originalFetch = window.__pollingFetch;
    const originalSend = XMLHttpRequest.prototype.send;
    const trace = {
      reads: 0,
      heldPastDeadline: false,
      accepted: false,
      held: false,
    };
    window.__pollingTrace = trace;
    window.__pollingFetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const statusRead =
        path.startsWith('/api/uploads/submissions/') &&
        (!args[1]?.method || args[1].method === 'GET');
      if (statusRead) trace.reads++;
      const response = await originalFetch(...args);
      if (statusRead && trace.reads === 1) {
        trace.held = true;
        await new Promise((resolve) => {
          window.__releasePollingRead = resolve;
        });
        trace.held = false;
      }
      return response;
    };
    // Preserve the real Uppy XHR and response; only postpone its load callback.
    XMLHttpRequest.prototype.send = function (body) {
      XMLHttpRequest.prototype.send = originalSend;
      this.upload.addEventListener('progress', (event) => {
        trace.uploadProgress = {
          loaded: event.loaded,
          total: event.total,
          lengthComputable: event.lengthComputable,
        };
      });
      const loaded = this.onload;
      this.onload = (event) => {
        window.__releasePollingLoad = () => {
          trace.accepted = true;
          loaded.call(this, event);
        };
      };
      return originalSend.call(this, body);
    };
    window.__restorePolling = () => {
      window.__releasePollingLoad?.();
      window.__releasePollingRead?.();
      delete window.__releasePollingLoad;
      delete window.__releasePollingRead;
      window.__pollingFetch = originalFetch;
      XMLHttpRequest.prototype.send = originalSend;
    };
  });
  try {
    await page.setInputFiles('input[type=file]', [source]);
    await page.waitForSelector(`${item}[data-state="queued"]`);
    await page.click(button('开始上传'));
    await page.waitForFunction(
      () =>
        typeof window.__releasePollingLoad === 'function' &&
        typeof window.__releasePollingRead === 'function',
    );
    await page.waitForSelector(`${item}[data-state="saving"]`);
    assert.ok(
      await page.evaluate(() =>
        document.body.textContent.includes(
          '文件传输结束，正在核对保存与处理结果。',
        ),
      ),
    );
    const progress = await page.evaluate(
      () => window.__pollingTrace.uploadProgress,
    );
    assert.ok(
      progress?.lengthComputable,
      'Real XHR upload reports a computable byte total',
    );
    assert.ok(progress.total > 0, 'Real XHR upload transmits a non-empty file');
    assert.equal(
      progress.loaded,
      progress.total,
      'Real XHR upload reaches 100% while its load callback is held',
    );
    await page.evaluate(() => {
      const release = window.__releasePollingLoad;
      delete window.__releasePollingLoad;
      release();
    });
    await page.waitForSelector(`${item}[data-state="processing-queued"]`);
    // Intentionally hold the obsolete response beyond the visible 2s poll.
    await page.evaluate(() => {
      setTimeout(() => {
        window.__pollingTrace.heldPastDeadline = true;
      }, 3000);
    });
    await page.waitForFunction(
      () => window.__pollingTrace.heldPastDeadline,
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.evaluate(() => window.__pollingTrace.reads),
      1,
      'Overlapping automatic poll does not issue a concurrent status request',
    );
    report.checks.push({
      name,
      overlap: await page.evaluate(() => window.__pollingTrace),
    });
    await page.evaluate(() => {
      const release = window.__releasePollingRead;
      delete window.__releasePollingRead;
      release();
    });
    // No retry click, reload, visibility change or direct refresh may rescue it.
    await page.waitForSelector(`${item}[data-state="ready"]`, {
      timeout: 8000,
    });
    const result = await page.evaluate(() => ({
      imageId: document.querySelector('[data-testid="upload-item"]').dataset
        .imageId,
      ...window.__pollingTrace,
    }));
    assert.ok(
      result.reads >= 2,
      'Automatic polling resumes after the obsolete read completes',
    );
    assert.ok(result.imageId);
    assert.equal(
      (
        await identitySql(
          config,
          `SELECT processing_status FROM media_images WHERE id='${result.imageId}'`,
        )
      )[0].processing_status,
      'ready',
    );
    report.checks.push({ name, result });
  } finally {
    await page.evaluate(() => window.__restorePolling?.());
  }
}
try {
  transportScript = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source:
      'window.__pollingFetch = window.fetch.bind(window); window.fetch = (...args) => window.__pollingFetch(...args);',
  });
  await page.goto(`${config.origin}/upload`);
  await page.waitForFunction(
    () =>
      document.querySelector('#email') ||
      document.querySelector('input[type=file]'),
  );
  if (await page.evaluate(() => !!document.querySelector('#email'))) {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
  }
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  await overlappingRead(
    'Content acceptance invalidates an outstanding automatic read',
  );
  await clear();

  // Delay transmission so cancellation is answered by the real queued session.
  await page.evaluate(() => {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      XMLHttpRequest.prototype.send = send;
      window.__pollingSendHeld = true;
    };
  });
  await page.setInputFiles('input[type=file]', [source]);
  await page.click(button('开始上传'));
  await page.waitForFunction(() => window.__pollingSendHeld === true);
  await page.click(button('请求取消'));
  await page.click(button('确认取消'));
  await page.waitForSelector(`${item}[data-state="cancelled"]`);
  await clear();
  await overlappingRead(
    'A new file after cancellation and clearing also resumes automatic polling',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  report.trace = await page.evaluate(() => window.__pollingTrace);
  report.page = await page.snapshot();
  throw error;
} finally {
  if (transportScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: transportScript.identifier,
    });
  await writeFile(
    join(config.output, 'upload-polling.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
