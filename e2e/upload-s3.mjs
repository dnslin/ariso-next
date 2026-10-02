/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { copyFile, mkdir, readFile, writeFile } =
  await import('node:fs/promises');
const { join } = await import('node:path');
const { setTimeout: delay } = await import('node:timers/promises');
const { identitySql } = await import(config.identitySessionScript);
const { resizeViewport, setTheme, readGeometry } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const input = 'input[aria-label="选择图片文件"]';
const source = join(
  config.projectDirectory,
  'tests/fixtures/runtime/images/sample.png',
);
const report = {
  status: 'failed',
  scope: config.onlyCleanup ? 'cleanup' : 'all',
  checks: [],
  layouts: [],
  pressed: [],
  limitations: [
    'Local HTTP fixtures prove production SDK/PUT/owner/processing integration; they do not establish Cloudflare R2 or SeaweedFS compatibility.',
    'Physical touch, soft keyboard and safe-area hardware are not tested; Figma comparison and human acceptance are reported separately.',
    'Cleanup retry due times are advanced only in the disposable database; each failure is an actual SDK DELETE returning HTTP 403.',
    ...(config.onlyCleanup
      ? []
      : [
          'The first Local XHR send is held at the browser boundary; all released requests use the actual production endpoint and file bytes.',
          'The unused first direct signature expiresAt and its persisted signature_expires_at are moved near expiry; resubmit, the second signature, PUT and acceptance remain real.',
        ]),
  ],
};
async function control(route, body) {
  const response = await fetch(
    `${config.uploadS3[route].endpoint}/control`,
    body
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  assert.equal(response.status, 200);
  return response.json();
}
async function waitSql(statement, condition, message, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let result;
  while (Date.now() < deadline) {
    result = await sql(statement);
    if (condition(result)) return result;
    await delay(timeout > 30000 ? 1000 : 80);
  }
  throw new Error(`${message}; last result: ${JSON.stringify(result)}`);
}
async function chooseStorage(name) {
  await page.click(
    'loc=css:[data-testid="upload-settings"] [aria-haspopup="listbox"] >> nth=0',
  );
  await page.click(`loc=role:option[name="${name}"]`);
}
async function add(names) {
  const paths = [];
  for (const name of names) {
    const path = join(config.output, 'files', name);
    await copyFile(source, path);
    paths.push(path);
  }
  await page.setInputFiles(input, paths);
  await page.waitForFunction(
    (names) =>
      names.every((name) =>
        [
          ...document.querySelectorAll(
            '[data-testid="upload-item"][data-state="queued"]',
          ),
        ].some((node) => node.textContent.includes(name)),
      ),
    names,
  );
  await page.click(button('开始上传'));
}
async function waitForModalViewport() {
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return true;
    const bounds = dialog.getBoundingClientRect();
    return (
      Math.abs(
        parseFloat(getComputedStyle(dialog).maxHeight) - (innerHeight - 32),
      ) < 1 &&
      bounds.top >= 15 &&
      bounds.bottom <= innerHeight - 15
    );
  });
}
async function layouts(name, short = false, representative = false) {
  for (const widths of representative
    ? [[1440, 390]]
    : [
        [1440, 390],
        [360, 430, 768],
      ]) {
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      for (const width of widths) {
        await resizeViewport(page, width);
        await waitForModalViewport();
        await page.evaluate(() =>
          document.querySelector('#main-content')?.scrollTo(0, 0),
        );
        const geometry = await readGeometry(page);
        assert.equal(
          geometry.overflow,
          false,
          `${name}/${theme}/${width}: document overflow`,
        );
        assert.equal(
          geometry.mainOverflow,
          false,
          `${name}/${theme}/${width}: main overflow`,
        );
        for (const target of geometry.targets) {
          assert.ok(
            target.width >= 44 &&
              target.height >= (width >= 1200 && target.navigation ? 40 : 44),
            `${name}: ${target.name} target ${target.width}×${target.height}`,
          );
        }
        const screenshot = `s3-${name}-${theme}-${width}.png`;
        await page.screenshot({
          path: join(config.output, screenshot),
          fullPage: true,
        });
        report.layouts.push({ name, theme, screenshot, ...geometry });
      }
    }
  }
  if (short) {
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await resizeViewport(page, 390, 400);
      await waitForModalViewport();
      const startScroll = await page.evaluate(() => {
        const body = document.querySelector(
          '[role="dialog"] [data-slot="modal-body"]',
        );
        const rect = body.getBoundingClientRect();
        return {
          scrollTop: body.scrollTop,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      });
      if (startScroll.scrollTop > 0) {
        await page.mouse.move(startScroll.x, startScroll.y);
        await page.mouse.wheel(0, -startScroll.scrollTop, {
          label: 'read upload diagnostic from start',
        });
        await page.waitForFunction(
          () =>
            document.querySelector('[role="dialog"] [data-slot="modal-body"]')
              .scrollTop < 1,
        );
      }
      const beforeScroll = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const body = dialog.querySelector('[data-slot="modal-body"]');
        const rect = body.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          scrollHeight: body.scrollHeight,
          clientHeight: body.clientHeight,
          headerTop: dialog
            .querySelector('[data-slot="modal-header"]')
            .getBoundingClientRect().top,
          footerBottom: dialog
            .querySelector('[data-slot="modal-footer"]')
            .getBoundingClientRect().bottom,
          dialogScroll: dialog.scrollTop,
        };
      });
      const bodyOverflow =
        beforeScroll.scrollHeight > beforeScroll.clientHeight;
      if (name === 'cleanup-retry-error')
        assert.ok(
          bodyOverflow,
          'Long cleanup diagnostics must scroll in the body at 390×400',
        );
      let bodyScroll = 0;
      if (bodyOverflow) {
        await page.mouse.move(beforeScroll.x, beforeScroll.y);
        await page.mouse.wheel(0, 180, {
          label: 'scroll upload diagnostic body',
        });
        await page.waitForFunction(
          (target) =>
            Math.abs(
              document.querySelector('[role="dialog"] [data-slot="modal-body"]')
                .scrollTop - target,
            ) < 1,
          Math.min(180, beforeScroll.scrollHeight - beforeScroll.clientHeight),
        );
        const afterScroll = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          return {
            bodyScroll: dialog.querySelector('[data-slot="modal-body"]')
              .scrollTop,
            headerTop: dialog
              .querySelector('[data-slot="modal-header"]')
              .getBoundingClientRect().top,
            footerBottom: dialog
              .querySelector('[data-slot="modal-footer"]')
              .getBoundingClientRect().bottom,
            dialogScroll: dialog.scrollTop,
          };
        });
        assert.equal(
          afterScroll.headerTop,
          beforeScroll.headerTop,
          'Body scrolling keeps its header fixed',
        );
        assert.equal(
          afterScroll.footerBottom,
          beforeScroll.footerBottom,
          'Body scrolling keeps its actions fixed',
        );
        assert.equal(
          afterScroll.dialogScroll,
          beforeScroll.dialogScroll,
          'Only the modal body scrolls',
        );
        bodyScroll = afterScroll.bodyScroll;
      }
      const diagnosticScreenshots = [];
      let tipReadable = false;
      let alertStartReached = false;
      let alertEndReached = false;
      for (const part of ['tip', 'alert-start', 'alert-end']) {
        const position = await page.evaluate((part) => {
          const body = document.querySelector(
            '[role="dialog"] [data-slot="modal-body"]',
          );
          const target =
            part === 'tip'
              ? body.querySelector('p.rounded-lg')
              : body.querySelector('[role="alert"]');
          if (!target) return null;
          const bounds = body.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          const delta =
            part === 'alert-end'
              ? rect.bottom - bounds.bottom
              : rect.top - bounds.top;
          return {
            delta,
            targetScroll: Math.min(
              body.scrollHeight - body.clientHeight,
              Math.max(0, body.scrollTop + delta),
            ),
            unclipped: target.scrollHeight === target.clientHeight,
            text: target.textContent,
          };
        }, part);
        if (!position) continue;
        assert.ok(
          position.unclipped && position.text.length > 0,
          'Diagnostic paragraphs retain their complete text',
        );
        if (Math.abs(position.delta) > 1) {
          await page.mouse.move(beforeScroll.x, beforeScroll.y);
          await page.mouse.wheel(0, position.delta, {
            label: 'read complete upload diagnostic',
          });
          await page.waitForFunction(
            (target) =>
              Math.abs(
                document.querySelector(
                  '[role="dialog"] [data-slot="modal-body"]',
                ).scrollTop - target,
              ) < 1,
            position.targetScroll,
          );
        }
        await page.waitForFunction((part) => {
          const body = document.querySelector(
            '[role="dialog"] [data-slot="modal-body"]',
          );
          const target =
            part === 'tip'
              ? body.querySelector('p.rounded-lg')
              : body.querySelector('[role="alert"]');
          const bounds = body.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          return part === 'tip'
            ? rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1
            : part === 'alert-start'
              ? rect.top >= bounds.top - 1 && rect.top < bounds.bottom
              : rect.bottom <= bounds.bottom + 1 && rect.bottom > bounds.top;
        }, part);
        const diagnosticScreenshot = `s3-${name}-${theme}-390-short-${part}.png`;
        await page.screenshot({
          path: join(config.output, diagnosticScreenshot),
          fullPage: true,
        });
        diagnosticScreenshots.push({ part, screenshot: diagnosticScreenshot });
        if (part === 'tip') tipReadable = true;
        if (part === 'alert-start') alertStartReached = true;
        if (part === 'alert-end') alertEndReached = true;
      }
      await page.focus('loc=css:[role="dialog"] button >> nth=-1');
      const result = await page.evaluate(() => {
        const action = document.activeElement.getBoundingClientRect();
        const dialog = document
          .querySelector('[role="dialog"]')
          .getBoundingClientRect();
        return {
          bottom: action.bottom,
          top: action.top,
          dialogTop: dialog.top,
          dialogBottom: dialog.bottom,
        };
      });
      assert.ok(
        result.bottom <= 400 && result.top >= 0,
        'Short viewport reaches final modal action',
      );
      const screenshot = `s3-${name}-${theme}-390-short.png`;
      await page.screenshot({
        path: join(config.output, screenshot),
        fullPage: true,
      });
      report.layouts.push({
        name,
        theme,
        width: 390,
        height: 400,
        screenshot,
        bodyOverflow,
        bodyScroll,
        diagnosticScreenshots,
        tipReadable,
        alertStartReached,
        alertEndReached,
        ...result,
      });
    }
  }
}
async function closeModal(expectedTrigger) {
  await page.focus('loc=css:[role="dialog"] button >> nth=-1');
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    ),
    '关闭上传说明',
    'Tab wraps within the open dialog',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await page.waitForFunction(
    (expected) => document.activeElement?.textContent?.trim() === expected,
    expectedTrigger,
    { timeout: 5000 },
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent?.trim()),
    expectedTrigger,
    'Escape restores focus to the current available control',
  );
}
async function openWithPressedEvidence(selector, name) {
  for (const [target, label] of [
    [selector, `${name}-trigger`],
    [button('关闭上传说明'), `${name}-close`],
  ]) {
    await page.focus(target);
    await page.keyboard.down('Space');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-pressed') === 'true',
    );
    const pressed = await page.evaluate(() => {
      const target = document.activeElement.getBoundingClientRect();
      return {
        width: innerWidth,
        theme: document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light',
        targetWidth: target.width,
        targetHeight: target.height,
        transform: getComputedStyle(document.activeElement).transform,
      };
    });
    assert.ok(
      pressed.targetWidth >= 44 && pressed.targetHeight >= 44,
      `${label} pressed target remains at least 44×44`,
    );
    const screenshot = `s3-pressed-${label}-${pressed.theme}-${pressed.width}.png`;
    await page.screenshot({
      path: join(config.output, screenshot),
      fullPage: true,
    });
    report.pressed.push({ label, screenshot, ...pressed });
    await page.keyboard.up('Space');
    if (label.endsWith('-trigger'))
      await page.waitForSelector('[role="dialog"]');
    else
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
      );
  }
  await page.click(selector);
  await page.waitForSelector('[role="dialog"]');
}
const networkRequests = [];
async function collectNetworkRequests() {
  for (const event of await page.events()) {
    if (event.method !== 'Network.requestWillBeSent') continue;
    const request = event.params.request;
    const url = new URL(request.url);
    if (
      url.origin === config.origin &&
      url.pathname.startsWith('/api/uploads/')
    )
      networkRequests.push({ path: url.pathname, method: request.method });
  }
  return networkRequests;
}
async function retryUnderDeleteGate(screenshotName) {
  const before = (await control('direct')).entered.delete;
  const beforePosts = (await collectNetworkRequests()).filter(
    (entry) => entry.path === '/api/uploads/cleanup' && entry.method === 'POST',
  ).length;
  await control('direct', { deleteGate: true });
  await page.click(button('重试清理'));
  const deadline = Date.now() + 10000;
  let observed = await control('direct');
  while (observed.entered.delete === before && Date.now() < deadline) {
    await delay(80);
    observed = await control('direct');
  }
  assert.equal(
    observed.entered.delete,
    before + 1,
    'Actual SDK DELETE is in flight',
  );
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button')].every(
        (button) => button.disabled,
      ),
    ),
    'Pending cleanup disables close, configuration and repeated-submit controls',
  );
  await page.keyboard.press('Escape');
  assert.ok(
    await page.evaluate(() => !!document.querySelector('[role="dialog"]')),
    'In-flight cleanup prevents keyboard dismissal',
  );
  await page.keyboard.press('Space');
  assert.equal(
    (await collectNetworkRequests()).filter(
      (entry) =>
        entry.path === '/api/uploads/cleanup' && entry.method === 'POST',
    ).length,
    beforePosts + 1,
    'Actual Network evidence shows one cleanup POST despite repeated key activation',
  );
  if (screenshotName) await layouts(screenshotName, false, true);
  await control('direct', { deleteGate: false });
  await page.waitForFunction(() =>
    document
      .querySelector('[role="dialog"] [role="alert"]')
      ?.textContent.includes('清理重试失败'),
  );
}
async function cleanupFailure(name, accepted = false) {
  await control('direct', { copy: accepted ? null : 'error', delete: true });
  await chooseStorage('浏览器 S3 直传');
  await add([name]);
  const [session] = await waitSql(
    `SELECT * FROM upload_sessions WHERE original_name='${name}'`,
    (rows) => rows[0]?.state === (accepted ? 'accepted' : 'failed'),
    'Direct outcome was not settled',
  );
  assert.equal(session.route, 'direct');
  if (accepted) assert.ok(session.image_id);
  else assert.equal(session.image_id, null);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [before] = await sql(
      `SELECT cleanup_attempts AS attempts, cleanup_status AS status FROM upload_sessions WHERE id='${session.id}'`,
    );
    if (before.status === 'failed') break;
    // Advance only this disposable session's due time; the runtime performs every DELETE and persists its real result.
    await sql(
      `UPDATE upload_sessions SET next_cleanup_at=0 WHERE id='${session.id}' AND cleanup_status='pending'`,
    );
    await waitSql(
      `SELECT cleanup_attempts AS attempts FROM upload_sessions WHERE id='${session.id}'`,
      (rows) => rows[0].attempts > before.attempts,
      'Scheduled cleanup did not retry within its 60-second maintenance cycle',
      75000,
    );
  }
  await page.waitForSelector(button('临时文件清理失败'));
  assert.equal(
    (
      await sql(
        `SELECT cleanup_status AS status FROM upload_sessions WHERE id='${session.id}'`,
      )
    )[0].status,
    'failed',
  );
  const requests = await page.evaluate(
    (sessionId) =>
      window.__s3Requests.filter((entry) => entry.path.includes(sessionId)),
    session.id,
  );
  assert.ok(
    !requests.some((entry) => entry.path.endsWith('/content')),
    'Direct session never switches to relay',
  );
  return session;
}
async function renewUnusedSignature() {
  await chooseStorage('浏览器 S3 直传');
  await page.evaluate(() => {
    window.__s3FetchOriginal = window.fetch;
    window.__s3RenewalRequests = [];
    let expireFirst = true;
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input.url,
        location.href,
      );
      if (url.pathname.startsWith('/api/uploads/'))
        window.__s3RenewalRequests.push({
          path: url.pathname,
          method: init?.method ?? 'GET',
        });
      const response = await window.__s3FetchOriginal(input, init);
      if (!expireFirst || !url.pathname.endsWith('/begin') || !response.ok)
        return response;
      const result = await response.clone().json();
      if (!result.upload) return response;
      expireFirst = false;
      const expiresAt = Date.now() + 3000;
      window.__s3ExpiringSignature = {
        sessionId: url.pathname.split('/').at(-2),
        expiresAt,
      };
      await new Promise((resolve) => {
        window.__s3ReleaseExpiringSignature = resolve;
      });
      result.upload.expiresAt = new Date(expiresAt).toISOString();
      return new Response(JSON.stringify(result), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
  });
  try {
    await add(['unused-signature-renewal.png']);
    await page.waitForFunction(() => !!window.__s3ExpiringSignature);
    const fact = await page.evaluate(() => window.__s3ExpiringSignature);
    await sql(
      `UPDATE upload_sessions SET signature_expires_at=${fact.expiresAt} WHERE id='${fact.sessionId}' AND state='receiving'`,
    );
    assert.ok(
      !(await control('direct')).requests.some(
        (entry) =>
          entry.method === 'PUT' &&
          entry.path.includes(`/uploads/${fact.sessionId}/`),
      ),
      'Unused signature sends no PUT',
    );
    await page.evaluate(() => window.__s3ReleaseExpiringSignature());
    const rows = await waitSql(
      "SELECT * FROM upload_sessions WHERE original_name='unused-signature-renewal.png' ORDER BY created_at",
      (rows) =>
        rows.length === 2 && rows.some((row) => row.state === 'accepted'),
      'Near-expiry direct signature was not renewed into an accepted session',
    );
    const old = rows.find((row) => row.id === fact.sessionId);
    const replacement = rows.find((row) => row.id !== fact.sessionId);
    assert.equal(old.state, 'cancelled');
    assert.equal(old.image_id, null);
    assert.equal(replacement.state, 'accepted');
    assert.equal(replacement.route, 'direct');
    assert.equal(replacement.queue_item_id, old.queue_item_id);
    assert.equal(replacement.storage_id, old.storage_id);
    assert.notEqual(replacement.submission_id, old.submission_id);
    const frozen = await sql(
      `SELECT visibility, storage_id, album_ids, tag_ids FROM upload_submissions WHERE id IN ('${old.submission_id}','${replacement.submission_id}')`,
    );
    assert.deepEqual(
      frozen[0],
      frozen[1],
      'Signature renewal preserves frozen submission settings',
    );
    const fixture = await control('direct');
    assert.equal(
      fixture.requests.filter(
        (entry) =>
          entry.method === 'PUT' &&
          (entry.path.includes(`/uploads/${old.id}/`) ||
            entry.path.includes(`/uploads/${replacement.id}/`)),
      ).length,
      1,
      'Only replacement signature transfers actual file bytes',
    );
    const requests = await page.evaluate(() => window.__s3RenewalRequests);
    assert.equal(
      requests.filter(
        (entry) => entry.method === 'POST' && entry.path.endsWith('/resubmit'),
      ).length,
      1,
    );
    assert.equal(
      requests.filter(
        (entry) => entry.method === 'POST' && entry.path.endsWith('/begin'),
      ).length,
      2,
    );
    assert.ok(
      !requests.some((entry) => entry.path.endsWith('/content')),
      'Signature renewal stays direct without a relay request',
    );
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="upload-item"][data-state="ready"]',
        ).length === 1,
    );
    assert.equal((await sql('SELECT count(*) AS n FROM media_images'))[0].n, 5);
    report.checks.push(
      'An unused near-expiry direct signature is replaced through a real resubmit and second begin; the old session is cancelled, queue identity and frozen settings persist, and one actual PUT creates one image without relay.',
    );
  } finally {
    await page.evaluate(() => {
      window.__s3ReleaseExpiringSignature?.();
      window.fetch = window.__s3FetchOriginal;
    });
  }
}
try {
  await mkdir(join(config.output, 'files'), { recursive: true });
  await mkdir(join(config.output, 'originals'), { recursive: true });
  await page.goto(`${config.origin}/upload`);
  if (await page.evaluate(() => !!document.querySelector('#email'))) {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
  }
  await page.waitForSelector(input, { state: 'attached' });
  console.log(await page.snapshot());
  await page.cdp('Network.enable');
  await page.events();
  const original = await readFile(source);
  await page.evaluate(
    ({ directEndpoint, relayEndpoint }) => {
      window.__s3Requests = [];
      window.__s3Active = new Set();
      window.__s3Maximum = 0;
      window.__s3HoldLocal = true;
      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__s3Target = String(url);
        return open.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function (body) {
        const target = this.__s3Target ?? '';
        if (
          !target.includes('/api/uploads/sessions/') &&
          !target.startsWith(directEndpoint) &&
          !target.startsWith(relayEndpoint)
        )
          return send.call(this, body);
        const path = new URL(target, location.href).pathname;
        window.__s3Requests.push({ path });
        window.__s3Active.add(this);
        window.__s3Maximum = Math.max(
          window.__s3Maximum,
          window.__s3Active.size,
        );
        this.addEventListener('loadend', () => window.__s3Active.delete(this), {
          once: true,
        });
        if (window.__s3HoldLocal && path.endsWith('/content')) {
          window.__s3HoldLocal = false;
          window.__s3ReleaseLocal = () => send.call(this, body);
          return;
        }
        return send.call(this, body);
      };
    },
    {
      directEndpoint: config.uploadS3.direct.endpoint,
      relayEndpoint: config.uploadS3.relay.endpoint,
    },
  );
  if (!config.onlyCleanup) {
    await control('direct', { putGate: true });
    await control('relay', { putGate: true });
    await add(['mixed-local.png']);
    await page.waitForFunction(() => !!window.__s3ReleaseLocal);
    await chooseStorage('浏览器 S3 直传');
    await add(['mixed-direct.png']);
    await chooseStorage('浏览器 S3 中转');
    await add(['mixed-relay-0.png', 'mixed-relay-1.png']);
    const mixed = await waitSql(
      'SELECT original_name, state, route, storage_id FROM upload_sessions ORDER BY created_at, original_name',
      (rows) =>
        rows.length === 4 &&
        rows.filter((row) => row.state !== 'queued').length === 3,
      'Mixed queue did not enforce three active slots',
    );
    assert.equal(
      (await sql('SELECT count(*) AS n FROM upload_submissions'))[0].n,
      3,
    );
    for (const route of ['direct', 'relay']) {
      const deadline = Date.now() + 10000;
      let observed = await control(route);
      while (observed.entered.put === 0 && Date.now() < deadline) {
        await delay(80);
        observed = await control(route);
      }
      assert.equal(
        observed.entered.put,
        1,
        `${route}: exactly one actual PUT enters while three slots are occupied`,
      );
    }
    assert.deepEqual(
      mixed
        .map((row) => row.route)
        .filter(Boolean)
        .sort(),
      ['direct', 'local', 'relay'],
    );
    assert.equal(
      mixed.find((row) => row.original_name === 'mixed-direct.png').storage_id,
      config.uploadS3.direct.id,
    );
    assert.ok(
      mixed
        .filter((row) => row.original_name.startsWith('mixed-relay'))
        .every((row) => row.storage_id === config.uploadS3.relay.id),
    );
    assert.equal(await page.evaluate(() => window.__s3Maximum), 3);
    report.checks.push(
      'Three submissions preserve their storage snapshots and share exactly three Local/direct/relay transfer slots; the fourth file waits.',
    );
    const [activeRelay] = await sql(
      "SELECT queue_item_id FROM upload_sessions WHERE route='relay' LIMIT 1",
    );
    await resizeViewport(page, 1440);
    await setTheme(page, 'light');
    await openWithPressedEvidence(
      `loc=css:[data-queue-id="${activeRelay.queue_item_id}"] button:has-text("通过服务器中转")`,
      'relay',
    );
    await layouts('relay-representative', false, true);
    await closeModal('请求取消');
    await layouts('mixed-active');
    await page.evaluate(() => window.__s3ReleaseLocal());
    await control('direct', { putGate: false });
    await control('relay', { putGate: false });
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="upload-item"][data-state="ready"]',
        ).length === 4,
      undefined,
      { timeout: 30000 },
    );
    const accepted = await sql(
      'SELECT id, queue_item_id, image_id, route, state FROM upload_sessions ORDER BY created_at, original_name',
    );
    assert.ok(
      accepted.every((row) => row.state === 'accepted' && row.image_id),
    );
    assert.equal(
      (
        await sql(
          "SELECT count(*) AS n FROM media_images WHERE processing_status='ready'",
        )
      )[0].n,
      4,
    );
    for (const session of accepted) {
      const path = join(
        config.output,
        'originals',
        `${session.route}-${session.id}.png`,
      );
      const response = await page.fetch(
        `/i/${session.image_id}?type=original`,
        {
          saveAs: path,
        },
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await readFile(path), original);
    }
    const direct = accepted.find((row) => row.route === 'direct');
    for (let index = 0; index < 2; index++) {
      const response = await page.fetch(
        `/api/uploads/sessions/${direct.id}/complete`,
        { method: 'POST' },
      );
      assert.equal(response.status, 202, response.body);
      assert.equal(JSON.parse(response.body).imageId, direct.image_id);
    }
    assert.equal((await sql('SELECT count(*) AS n FROM media_images'))[0].n, 4);
    report.checks.push(
      'All four files reach real media ready; downloaded Local/S3 originals match their uploaded bytes; duplicate complete returns the same image.',
    );
    await layouts('ready');
    const relay = accepted.find((row) => row.route === 'relay');
    await page.click(
      `loc=css:[data-queue-id="${relay.queue_item_id}"] button:has-text("通过服务器中转")`,
    );
    await page.waitForSelector('[role="dialog"]');
    await page.focus(button('查看上传队列'));
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent?.trim()),
      '查看存储配置',
    );
    await layouts('relay-modal', true);
    await closeModal('查看详情');
    await page.click(button('清空已完成'));
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="upload-item"]'),
    );
    await renewUnusedSignature();
    await page.click(button('清空已完成'));
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="upload-item"]'),
    );
  }
  const expectedImages = config.onlyCleanup ? 0 : 5;
  const failed = await cleanupFailure('direct-cleanup-failed.png');
  await openWithPressedEvidence(button('临时文件清理失败'), 'cleanup');
  await layouts('cleanup-modal', true);
  await retryUnderDeleteGate('cleanup-retry-pending');
  await layouts('cleanup-retry-error', true);
  await closeModal('清空已完成');
  await page.click(button('清空已完成'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-item"]'),
  );
  const cleanup = await page.fetch('/api/uploads/cleanup');
  assert.equal(cleanup.status, 200);
  assert.ok(
    JSON.parse(cleanup.body).some(
      (row) =>
        row.id === failed.id &&
        row.cleanupStatus === 'pending' &&
        row.temporaryKey,
    ),
  );
  await control('direct', { copy: null, delete: false });
  const retry = await page.fetch('/api/uploads/cleanup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: failed.id }),
  });
  assert.equal(retry.status, 200, retry.body);
  assert.equal(JSON.parse(retry.body).cleanupStatus, 'none');
  assert.equal(
    (await sql('SELECT count(*) AS n FROM media_images'))[0].n,
    expectedImages,
  );
  report.checks.push(
    'Actual direct Copy failure never falls back to relay; deletion failure remains queryable via the owner cleanup API and referenced after clearing page results; owner manual cleanup retry removes exact objects without creating an image.',
  );
  const second = await cleanupFailure(
    'accepted-cleanup-retry-success.png',
    true,
  );
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-testid="upload-item"][data-state="ready"]',
      ),
  );
  assert.equal(
    (await sql('SELECT count(*) AS n FROM media_images'))[0].n,
    expectedImages + 1,
  );
  await layouts('accepted-cleanup-failed');
  await page.click(button('临时文件清理失败'));
  await page.waitForSelector('[role="dialog"]');
  await layouts('cleanup-accepted-modal', true);
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[role="dialog"] [data-slot="modal-body"]')
        .textContent.includes('Storage delete failed'),
    ),
    'Accepted cleanup modal shows the actual DeleteObject error',
  );
  const beforeRead = (await collectNetworkRequests()).filter(
    (entry) =>
      entry.path === `/api/uploads/submissions/${second.submission_id}` &&
      entry.method === 'GET',
  ).length;
  await retryUnderDeleteGate();
  assert.equal(
    (
      await sql(
        `SELECT cleanup_status AS status FROM upload_sessions WHERE id='${second.id}'`,
      )
    )[0].status,
    'pending',
  );
  assert.ok(
    (await collectNetworkRequests()).filter(
      (entry) =>
        entry.path === `/api/uploads/submissions/${second.submission_id}` &&
        entry.method === 'GET',
    ).length > beforeRead,
    'Failed retry reads the actual restarted cleanup responsibility',
  );
  await control('direct', { copy: null, delete: false });
  await sql(
    `UPDATE upload_sessions SET next_cleanup_at=0 WHERE id='${second.id}' AND cleanup_status='pending'`,
  );
  await waitSql(
    `SELECT cleanup_status AS status FROM upload_sessions WHERE id='${second.id}'`,
    (rows) => rows[0].status === 'none',
    'Actual maintenance cleanup did not succeed',
    75000,
  );
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[data-testid="upload-item"]')
        .textContent.includes('临时文件等待服务端清理') &&
      ![
        ...document.querySelectorAll('[data-testid="upload-item"] button'),
      ].some((button) => button.textContent.includes('临时文件清理失败')),
  );
  await closeModal('查看详情');
  assert.equal(
    (
      await sql(
        `SELECT cleanup_status AS status FROM upload_sessions WHERE id='${second.id}'`,
      )
    )[0].status,
    'none',
  );
  assert.ok(
    await page.evaluate(
      () =>
        document.activeElement instanceof HTMLButtonElement &&
        document.activeElement.getClientRects().length > 0,
    ),
    'Cleanup completion and Escape return focus to an available control',
  );
  assert.equal(
    (await sql('SELECT count(*) AS n FROM media_images'))[0].n,
    expectedImages + 1,
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="upload-item"]')
        ?.getAttribute('data-image-id'),
    ),
    second.image_id,
  );
  assert.equal(
    await page.evaluate(
      () =>
        !!document.querySelector('[data-testid="upload-item"] [role="alert"]'),
    ),
    false,
    'Successful cleanup removes historical cleanup diagnostics from the accepted card',
  );
  const keptOriginal = join(
    config.output,
    'originals',
    `after-cleanup-${second.image_id}.png`,
  );
  assert.equal(
    (
      await page.fetch(`/i/${second.image_id}?type=original`, {
        saveAs: keptOriginal,
      })
    ).status,
    200,
  );
  assert.deepEqual(await readFile(keptOriginal), original);
  report.checks.push(
    'Accepted S3 originals remain ready through real temporary cleanup failures; a failed UI retry reads pending, polling follows actual maintenance to none, diagnostics clear, the same original remains downloadable, and Escape returns focus.',
  );
  report.checks.push(
    `${config.onlyCleanup ? 'Cleanup' : 'Relay and cleanup'} dialogs trap keyboard actions, restore focus on Escape, and keep their final action reachable at 390×400; actual body scrolling exposes full diagnostics while headers and actions stay fixed. DELETE in flight disables close, configuration and duplicate-submit controls; pressed targets stay at least 44×44.`,
  );
  report.xhrMaximum = await page.evaluate(() => window.__s3Maximum);
  assert.equal(report.xhrMaximum, config.onlyCleanup ? 1 : 3);
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  await page.screenshot({
    path: join(config.output, 's3-failure.png'),
    fullPage: true,
  });
  console.log(await page.snapshot());
  throw error;
} finally {
  await control('direct', {
    putGate: false,
    copyGate: false,
    deleteGate: false,
    copy: null,
    delete: false,
  });
  await control('relay', { putGate: false, copyGate: false });
  await writeFile(
    join(config.output, 'upload-s3.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        status: report.status,
        checks: report.checks,
        layoutCount: report.layouts.length,
        error: report.error,
        limitations: report.limitations,
      },
      null,
      2,
    ),
  );
}
