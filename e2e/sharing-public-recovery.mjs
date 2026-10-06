import assert from 'node:assert/strict';
import { readBrowserErrors } from './browser-errors.mjs';
import { unexpectedSharingErrors } from './sharing-public-errors.mjs';
import { assertCropped, json, waitForPaint } from './sharing-public-page.mjs';

export async function verifySharingPublicRecoveries({
  page,
  config,
  report,
  session,
  layouts,
}) {
  const { open, loaded, ensureVisible, sql } = session;
  const { capture, passwordHelp } = layouts;
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });
  report.stage = 'recovery';
  await open();
  await loaded(40);
  await ensureVisible();
  const url = await page.url();
  await page.evaluate(() => {
    const original = window.fetch;
    window.__shareFailLoad = true;
    window.__shareFailCheck = false;
    window.__shareHoldCheck = false;
    window.__shareCheckReleases = [];
    window.fetch = (...args) => {
      if (String(args[0]).includes('/items') && window.__shareFailLoad) {
        window.__shareFailLoad = false;
        return Promise.resolve(
          new Response(
            JSON.stringify({ message: 'Injected list dependency failure' }),
            { status: 503 },
          ),
        );
      }
      if (String(args[0]).endsWith('/refresh') && window.__shareFailCheck)
        return Promise.resolve(
          new Response(
            JSON.stringify({ message: 'Injected check dependency failure' }),
            { status: 503 },
          ),
        );
      if (String(args[0]).endsWith('/refresh') && window.__shareHoldCheck)
        return original(...args).then(async (response) => {
          await new Promise((resolve) =>
            window.__shareCheckReleases.push(resolve),
          );
          return response;
        });
      return original(...args);
    };
  });
  await page.click('[data-testid="share-load-more"]');
  await page.waitForSelector('[data-testid="share-load-error"]');
  await loaded(40);
  await capture('load-failed');
  await page.click('[data-testid="share-load-more"]');
  await loaded(80);
  assert.equal(await page.url(), url);
  await page.evaluate(() => {
    window.__shareFailCheck = true;
  });
  await page.waitForSelector('[data-testid="share-refresh-error"]', {
    timeout: 15000,
  });
  await loaded(80);
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, -100000, {
    label: 'show the album check feedback',
  });
  await waitForPaint(page);
  await capture('check-failed');
  await page.evaluate(() => {
    window.__shareHoldCheck = true;
    // Failed polling keeps the retry available until the real keyboard action.
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Enter' &&
          event.target.getAttribute('data-testid') === 'share-check-retry'
        )
          window.__shareFailCheck = false;
      },
      { capture: true, once: true },
    );
  });
  await page.focus('[data-testid="share-check-retry"]');
  await page.press('[data-testid="share-check-retry"]', 'Enter');
  await page.waitForFunction(() => window.__shareCheckReleases.length > 0);
  await loaded(80);
  const busy = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="share-check-retry"]');
    const rect = button.getBoundingClientRect();
    return {
      disabled: button.disabled,
      text: button.textContent.trim(),
      feedback: document.querySelector('[data-testid="share-refresh-error"]')
        ?.textContent,
      width: rect.width,
      height: rect.height,
    };
  });
  assert.equal(busy.disabled, true);
  assert.equal(busy.text, '检查中');
  assert.ok(busy.feedback.includes('状态检查失败，当前内容已保留。'));
  assert.ok(busy.width >= 44 && busy.height >= 44);
  await capture('checking');
  await page.evaluate(() => {
    window.__shareHoldCheck = false;
    for (const release of window.__shareCheckReleases) release();
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="share-refresh-error"]'),
  );
  await loaded(80);
  assert.equal(await page.url(), url);
  const injectedErrors = unexpectedSharingErrors(
    await readBrowserErrors(page),
    `${config.origin}/i/${config.statusIds.missing}?type=thumbnail`,
  );
  assert.deepEqual(
    injectedErrors.filter(
      (entry) =>
        entry.kind !== 'console.error' ||
        ![
          '分享列表读取失败 [object Object]',
          '分享状态检查失败 [object Object]',
        ].includes(entry.message),
    ),
    [],
    'Only the deliberately injected request failures were reported',
  );
  assert.equal(
    injectedErrors.filter(
      (entry) => entry.message === '分享列表读取失败 [object Object]',
    ).length,
    1,
  );
  assert.ok(
    injectedErrors.some(
      (entry) => entry.message === '分享状态检查失败 [object Object]',
    ),
  );
  record(
    'Injected list/check failures retain loaded cards and busy retry feedback; full successful retry stays on the same page, with expected diagnostic errors inspected',
    { busy },
  );
  await open('password');
  if (
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-password-input"]'),
    )
  ) {
    await page.fill('[data-testid="share-password-input"]', config.password);
    await page.click('[data-testid="share-password-submit"]');
    await page.waitForSelector('[data-testid="share-items"]');
  }
  await sql(
    `UPDATE album_shares SET auth_revision=auth_revision+1 WHERE album_id='${config.albums.password.id}'`,
  );
  await page.waitForSelector('[data-testid="share-password-input"]', {
    timeout: 15000,
  });
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length,
    ),
    0,
  );
  assert.equal(
    await page.evaluate(
      (name) => document.querySelector('main').textContent.includes(name),
      config.albums.password.name,
    ),
    false,
  );
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    ),
    'share-password-input',
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('main')
        .textContent.includes('访问已失效，请重新输入分享密码。'),
    ),
    true,
  );
  await capture('authorization-expired');
  await passwordHelp('authorization-expired');
  record(
    'Password grant revocation clears album data, returns to the existing password form and focuses its input',
  );
  await callbackFailure({ page, config, report, session });
  await firstReadRecovery({ page, config, report, session, layouts });
}

async function firstReadRecovery({ page, config, report, session, layouts }) {
  const { sql, open, path, loaded } = session;
  const { capture } = layouts;
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });
  await sql(
    `UPDATE album_shares SET auth_revision=auth_revision+1 WHERE album_id='${config.albums.password.id}'`,
  );
  await open('password');
  await page.waitForSelector('[data-testid="share-password-input"]');
  const url = await page.url();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/items')) {
        window.fetch = original;
        const response = await original(...args);
        window.__shareFirstReadHTTP = {
          status: response.status,
          count: (await response.json()).items?.length ?? null,
        };
        await new Promise((resolve) => {
          window.__releaseShareFirstRead = resolve;
        });
        return Response.json(
          { message: 'Injected first read failure' },
          { status: 503 },
        );
      }
      return original(...args);
    };
  });
  await page.fill('[data-testid="share-password-input"]', config.password);
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() => !!window.__releaseShareFirstRead);
  const firstRead = await page.evaluate(() => window.__shareFirstReadHTTP);
  assert.equal(
    firstRead.status,
    200,
    'The authorized first read actually succeeds',
  );
  assert.ok(firstRead.count > 0 && firstRead.count <= 40);
  await capture('first-read-loading');
  await page.evaluate(() => window.__releaseShareFirstRead());
  await page.waitForSelector('[data-testid="share-retry"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length,
    ),
    0,
  );
  await capture('first-read-failed', [1440, 390], ['light', 'dark'], {
    async inspect() {
      const retryWidth = await page.evaluate(() => {
        const button = document.querySelector('[data-testid="share-retry"]');
        return {
          button: button.getBoundingClientRect().width,
          content: button.parentElement.getBoundingClientRect().width,
        };
      });
      assert.equal(
        retryWidth.button,
        retryWidth.content,
        'Dependency retry fills the designed card content width',
      );
    },
  });
  const failures = await readBrowserErrors(page);
  assert.deepEqual(
    failures.map(({ kind, message }) => ({ kind, message })),
    [{ kind: 'console.error', message: '分享列表读取失败 [object Object]' }],
    'Only the deliberately injected first-read failure is reported',
  );
  const expected = json(await page.fetch(`${path('password')}/items`));
  assert.ok(expected.items.length > 0 && expected.items.length <= 40);
  assertCropped(expected);
  await page.click('[data-testid="share-retry"]');
  await loaded(expected.items.length);
  assert.equal(await page.url(), url);
  record(
    'A real successful unlock retains its grant through first-read dependency failure; retry loads the album on the same URL',
  );
}

async function callbackFailure({ page, config, report, session }) {
  const { open } = session;
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });
  await page.evaluate(() => {
    const original = window.fetch;
    window.__shareCallbackErrors = [];
    window.addEventListener('unhandledrejection', (event) => {
      window.__shareCallbackErrors.push(String(event.reason));
    });
    window.fetch = (...args) => {
      if (String(args[0]).includes('/items')) {
        window.fetch = original;
        // The successful unlock callback now encounters a programming/contract error.
        return Promise.resolve(Response.json({ showName: false, items: null }));
      }
      return original(...args);
    };
  });
  await page.fill('[data-testid="share-password-input"]', config.password);
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() => window.__shareCallbackErrors.length === 1);
  const callbackErrors = await page.evaluate(
    () => window.__shareCallbackErrors,
  );
  assert.deepEqual(callbackErrors, [
    "TypeError: Cannot read properties of null (reading 'map')",
  ]);
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('main')
        .textContent.includes('连接遇到问题，无法确认验证结果'),
    ),
    false,
    'A programming error in the unlock callback is not reported as a network error',
  );
  const errors = await readBrowserErrors(page);
  assert.deepEqual(
    errors.map(({ kind, message }) => ({ kind, message })),
    [
      {
        kind: 'unhandledrejection',
        message: callbackErrors[0],
      },
    ],
    'Only the deliberately injected callback error is reported',
  );
  await open('password');
  await page.waitForSelector('[data-testid="share-items"]');
  record(
    'Successful unlock callback errors retain their actual diagnostic instead of being swallowed by network handling',
  );
}
