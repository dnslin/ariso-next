/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql, openIdentityAccountMenu } = await import(
  config.identitySessionScript
);
const page = (await taskSpace(config.spaceId)).page('p1');
const width = config.width;
const height = width < 768 ? 844 : 1000;
const button = (name) => `loc=role:button[name="${name}"]`;
const report = { status: 'running', width, height, checks: [] };
const output = (name) => join(config.output, `workspace-${width}-${name}`);
const fixture = (name) =>
  join(config.projectDirectory, 'tests/fixtures/runtime/images', name);
const traceKey = `ariso-workspace-e2e-${width}`;
let instrumentation;

async function login() {
  await page.waitForSelector('input[name="email"]');
  await page.fill('input[name="email"]', config.credentials.email);
  await page.fill('input[name="password"]', config.credentials.password);
  await page.click(button('登录'));
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
}
async function navigate(label, pathname) {
  if (width < 1200) {
    await page.click(button('菜单'));
    await page.waitForSelector('loc=role:dialog[name="导航菜单"]');
  }
  const receipt = await page.click(`a[aria-label="${label}"]`);
  assert.ok(
    !receipt.dialog,
    'Internal navigation must not raise a beforeunload dialog',
  );
  await page.waitForURL(`${config.origin}${pathname}`);
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"][aria-label="导航菜单"]'),
  );
}
async function privateSetting() {
  await page.click('loc=role:button[name*="可见性"]');
  await page.click('loc=role:option[name="私有"]');
}
async function queued() {
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  return page.evaluate(async () => {
    const rows = [...document.querySelectorAll('[data-testid="upload-item"]')];
    return {
      document: window.__workspaceDocument,
      visibility: [
        ...document.querySelectorAll(
          '[data-testid="upload-settings"] [data-slot="select"]',
        ),
      ]
        .find(
          (select) =>
            select.querySelector('[data-slot="label"]')?.textContent ===
            '可见性',
        )
        ?.querySelector('[data-slot="select-trigger"]')
        ?.textContent.trim(),
      settings: document.querySelector('[data-testid="upload-settings"]')
        .textContent,
      rows: await Promise.all(
        rows.map(async (row) => {
          const blob = row.querySelector('img')?.src;
          const response = await fetch(blob);
          return {
            id: row.dataset.queueId,
            state: row.dataset.state,
            blob,
            bytes: (await response.arrayBuffer()).byteLength,
          };
        }),
      ),
    };
  });
}
async function queueOne() {
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    fixture('sample.jpg'),
  ]);
  await privateSetting();
  const state = await queued();
  assert.equal(state.rows.length, 1);
  assert.equal(state.visibility, '私有');
  assert.ok(
    state.rows[0].id &&
      state.rows[0].blob.startsWith('blob:') &&
      state.rows[0].bytes > 0,
  );
  return state;
}
async function assertRetained(before) {
  const after = await queued();
  assert.deepEqual(
    after,
    before,
    'Navigation retains document, queue identity, Blob bytes and selected settings',
  );
}
async function assertEmpty() {
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-testid="upload-item"]').length,
    ),
    0,
  );
}
async function revoked(url) {
  const state = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)),
    traceKey,
  );
  assert.ok(
    state.revoked.includes(url),
    'Session boundary explicitly revokes the queued Blob before navigation',
  );
  return state;
}

try {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  instrumentation = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const key = ${JSON.stringify(traceKey)};
      window.__workspaceDocument = crypto.randomUUID();
      window.__workspaceFetch = window.fetch.bind(window);
      window.fetch = (...args) => window.__workspaceFetch(...args);
      const original = URL.revokeObjectURL;
      URL.revokeObjectURL = function(url) {
        const trace = JSON.parse(sessionStorage.getItem(key) || '{"revoked":[],"unloads":[]}');
        trace.revoked.push(url); sessionStorage.setItem(key, JSON.stringify(trace));
        return original.call(this, url);
      };
    })();`,
  });
  await page.goto(`${config.origin}/upload`);
  if (await page.evaluate(() => location.pathname === '/login')) await login();
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  await page.evaluate(
    (key) =>
      sessionStorage.setItem(key, JSON.stringify({ revoked: [], unloads: [] })),
    traceKey,
  );
  const before = await queueOne();
  await page.screenshot({ path: output('queued-before-navigation.png') });
  await navigate('图库', '/library');
  assert.equal(
    await page.evaluate(() => window.__workspaceDocument),
    before.document,
  );
  await navigate('回收站', '/trash');
  assert.equal(
    await page.evaluate(() => window.__workspaceDocument),
    before.document,
  );
  await navigate('上传', '/upload');
  await assertRetained(before);
  await page.evaluate(() => history.back());
  await page.waitForURL(`${config.origin}/trash`);
  await page.evaluate(() => history.forward());
  await page.waitForURL(`${config.origin}/upload`);
  await assertRetained(before);
  await page.screenshot({ path: output('queued-after-history.png') });
  report.checks.push(
    'Native sidebar links and real browser history retain queued IDs, live Blob bytes, private visibility and the same document.',
  );

  // Hold real XHR completion and status responses until navigation finishes.
  // Polling can otherwise finish the upload before the mobile menu closes.
  await page.evaluate(() => {
    const originalFetch = window.__workspaceFetch;
    const originalSend = XMLHttpRequest.prototype.send;
    const trace = {
      submissions: [],
      reads: [],
      releases: [],
      readReleases: [],
      heldReadPaths: [],
      holdReads: true,
    };
    window.__workspaceNetwork = trace;
    window.__workspaceFetch = async (...args) => {
      const response = await originalFetch(...args);
      const path = new URL(String(args[0]), location.href).pathname;
      if (path === '/api/uploads/submissions' && args[1]?.method === 'POST')
        trace.submissions.push(await response.clone().json());
      if (
        path.startsWith('/api/uploads/submissions/') &&
        (!args[1]?.method || args[1].method === 'GET')
      ) {
        const body = await response.clone().json();
        if (trace.holdReads) {
          trace.heldReadPaths.push(location.pathname);
          await new Promise((resolve) => trace.readReleases.push(resolve));
        }
        trace.reads.push({ pathname: location.pathname, body });
      }
      return response;
    };
    XMLHttpRequest.prototype.send = function (body) {
      const loaded = this.onload;
      this.onload = (event) => {
        trace.releases.push(() => loaded.call(this, event));
      };
      return originalSend.call(this, body);
    };
    window.__restoreWorkspaceNetwork = () => {
      trace.holdReads = false;
      for (const release of trace.readReleases.splice(0)) release();
      for (const release of trace.releases.splice(0)) release();
      window.__workspaceFetch = originalFetch;
      XMLHttpRequest.prototype.send = originalSend;
    };
  });
  try {
    await page.click(button('开始上传'));
    await page.waitForFunction(
      () =>
        window.__workspaceNetwork.releases.length === 1 &&
        window.__workspaceNetwork.readReleases.length === 1,
    );
    await page.waitForSelector(
      '[data-testid="upload-item"][data-state="saving"]',
    );
    await navigate('图库', '/library');
    await page.evaluate(() => {
      const trace = window.__workspaceNetwork;
      trace.holdReads = false;
      for (const release of trace.releases.splice(0)) release();
      for (const release of trace.readReleases.splice(0)) release();
    });
    await page.waitForFunction(
      () =>
        window.__workspaceNetwork.reads.some(
          (read) =>
            read.pathname === '/library' &&
            read.body.sessions?.some(
              (session) => session.job?.status === 'succeeded',
            ),
        ),
      undefined,
      { timeout: 20000 },
    );
    const network = await page.evaluate(() => ({
      submissions: window.__workspaceNetwork.submissions,
      reads: window.__workspaceNetwork.reads,
      heldReadPaths: window.__workspaceNetwork.heldReadPaths,
    }));
    assert.deepEqual(
      network.heldReadPaths,
      ['/upload'],
      'A real status response waits on Upload until navigation completes',
    );
    assert.equal(
      network.submissions.length,
      1,
      'Navigation does not resubmit the file',
    );
    const submission = network.submissions[0];
    const rows = await identitySql(
      config,
      `SELECT queue_item_id,image_id,state FROM upload_sessions WHERE submission_id='${submission.id}'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].queue_item_id, before.rows[0].id);
    assert.equal(rows[0].state, 'accepted');
    assert.ok(rows[0].image_id);
    await navigate('上传', '/upload');
    await page.waitForSelector(
      '[data-testid="upload-item"][data-state="ready"]',
    );
    const returned = await page.evaluate(() => ({
      document: window.__workspaceDocument,
      rows: [...document.querySelectorAll('[data-testid="upload-item"]')].map(
        (row) => ({ id: row.dataset.queueId, image: row.dataset.imageId }),
      ),
    }));
    assert.equal(returned.document, before.document);
    assert.deepEqual(returned.rows, [
      { id: before.rows[0].id, image: rows[0].image_id },
    ]);
    report.background = { network, returned, persisted: rows };
    await page.screenshot({ path: output('background-completed.png') });
    report.checks.push(
      'Real XHR acceptance survives leaving Upload; automatic submission reads complete on Library, with the original queue/image identity and exactly one submission.',
    );
  } finally {
    await page.evaluate(() => window.__restoreWorkspaceNetwork?.());
  }
  await page.click(button('清空已完成'));
  await assertEmpty();

  const refreshQueue = await queueOne();
  await page.evaluate((key) => {
    window.addEventListener('beforeunload', (event) => {
      const trace = JSON.parse(sessionStorage.getItem(key));
      trace.unloads.push({
        prevented: event.defaultPrevented,
        document: window.__workspaceDocument,
      });
      sessionStorage.setItem(key, JSON.stringify(trace));
    });
  }, traceKey);
  const reload = await page.reload();
  if (reload?.dialog) await page.acceptDialog();
  await assertEmpty();
  const refresh = await page.evaluate(
    (key) => ({
      document: window.__workspaceDocument,
      trace: JSON.parse(sessionStorage.getItem(key)),
    }),
    traceKey,
  );
  assert.notEqual(refresh.document, refreshQueue.document);
  assert.ok(
    refresh.trace.unloads.some(
      (event) => event.document === refreshQueue.document && event.prevented,
    ),
    'Hard refresh still invokes the unsent-work beforeunload warning',
  );
  report.hardRefresh = refresh;
  report.checks.push(
    'Hard reload still warns for unsent work and starts a fresh document with no persisted queue.',
  );

  const logoutQueue = await queueOne();
  await openIdentityAccountMenu(page);
  await page.click(button('退出登录'));
  await page.waitForSelector('input[name="email"]');
  assert.equal(
    new URL(await page.url()).searchParams.get('reason'),
    'signed-out',
  );
  report.logout = await revoked(logoutQueue.rows[0].blob);
  await login();
  await assertEmpty();
  const expiryQueue = await queueOne();
  const session = JSON.parse((await page.fetch('/api/auth/get-session')).body);
  assert.ok(session?.session?.id);
  await identitySql(
    config,
    `UPDATE session SET expires_at=${Date.now() - 1} WHERE id='${session.session.id}'`,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector('input[name="email"]');
  assert.equal(new URL(await page.url()).searchParams.get('reason'), 'expired');
  report.expiry = await revoked(expiryQueue.rows[0].blob);
  await login();
  await assertEmpty();
  report.checks.push(
    'Actual logout and expiry of the current real session revoke queued Blobs and clear the queue before a fresh sign-in.',
  );
  // Cover useUploadResult's own 401 branch: a completed row coexists with unsent work.
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    fixture('sample.jpg'),
  ]);
  await page.click(button('开始上传'));
  await page.waitForSelector('[data-testid="upload-item"][data-state="ready"]');
  await page.waitForFunction(() => {
    const image = document.querySelector(
      '[data-testid="upload-item"][data-state="ready"] img',
    );
    return (
      image?.complete &&
      image.naturalWidth > 0 &&
      !image.src.startsWith('blob:')
    );
  });
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    fixture('sample.png'),
  ]);
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  const mixed = await page.evaluate(() => ({
    imageId: document.querySelector(
      '[data-state="ready"][data-testid="upload-item"]',
    ).dataset.imageId,
    blob: document.querySelector(
      '[data-state="queued"][data-testid="upload-item"] img',
    ).src,
  }));
  const resultSession = JSON.parse(
    (await page.fetch('/api/auth/get-session')).body,
  );
  assert.ok(resultSession?.session?.id);
  await page.evaluate(
    ({ key, imageId }) => {
      const original = window.__workspaceFetch;
      const trace = JSON.parse(sessionStorage.getItem(key));
      trace.result401 = {
        imageId,
        reads: [],
        sessionChecksHeld: 0,
        beforeUnload: [],
      };
      sessionStorage.setItem(key, JSON.stringify(trace));
      window.__workspaceResultReleases = [];
      window.__workspaceResultReadReleases = [];
      window.__workspaceFetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === `/api/images/${imageId}`) {
          await new Promise((resolve) =>
            window.__workspaceResultReadReleases.push(resolve),
          );
        }
        const response = await original(...args);
        const latest = JSON.parse(sessionStorage.getItem(key));
        if (path === `/api/images/${imageId}`) {
          latest.result401.reads.push({ path, status: response.status });
          sessionStorage.setItem(key, JSON.stringify(latest));
        }
        if (path === '/api/auth/get-session') {
          latest.result401.sessionChecksHeld++;
          sessionStorage.setItem(key, JSON.stringify(latest));
          // Delay the real null session response so session-controls cannot perform this reset.
          await new Promise((resolve) =>
            window.__workspaceResultReleases.push(resolve),
          );
        }
        return response;
      };
      window.__restoreWorkspaceResult = () => {
        window.__workspaceFetch = original;
        for (const release of window.__workspaceResultReleases.splice(0))
          release();
        for (const release of window.__workspaceResultReadReleases.splice(0))
          release();
      };
      window.addEventListener('beforeunload', (event) => {
        const latest = JSON.parse(sessionStorage.getItem(key));
        latest.result401.beforeUnload.push(event.defaultPrevented);
        sessionStorage.setItem(key, JSON.stringify(latest));
      });
    },
    { key: traceKey, imageId: mixed.imageId },
  );
  try {
    await navigate('图库', '/library');
    await navigate('上传', '/upload');
    await page.waitForFunction(
      () => window.__workspaceResultReadReleases.length > 0,
    );
    await identitySql(
      config,
      `UPDATE session SET expires_at=${Date.now() - 1} WHERE id='${resultSession.session.id}'`,
    );
    await page.evaluate(() => {
      for (const release of window.__workspaceResultReadReleases.splice(0))
        release();
    });
    await page.waitForSelector('input[name="email"]');
    assert.equal(
      new URL(await page.url()).searchParams.get('reason'),
      'expired',
    );
    const evidence = await revoked(mixed.blob);
    assert.ok(
      evidence.result401.reads.some(
        (read) =>
          read.path === `/api/images/${mixed.imageId}` && read.status === 401,
      ),
      'The completed row receives a real server 401',
    );
    assert.ok(
      evidence.result401.beforeUnload.length > 0 &&
        evidence.result401.beforeUnload.every((prevented) => !prevented),
      'Result 401 clears unsent work before navigation without a beforeunload warning',
    );
    report.result401 = evidence.result401;
    await page.screenshot({ path: output('result-401-cleared.png') });
  } finally {
    await page.evaluate(() => window.__restoreWorkspaceResult?.());
  }
  await login();
  await assertEmpty();
  report.checks.push(
    'A real upload-result 401 independently resets a mixed completed/unsent queue, revokes its Blob and navigates without beforeunload; the separate session check response is held.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  report.page = await page.snapshot();
  throw error;
} finally {
  if (instrumentation)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: instrumentation.identifier,
    });
  await writeFile(
    join(config.output, `workspace-continuity-${width}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
