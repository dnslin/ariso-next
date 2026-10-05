/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { randomBytes } = await import('node:crypto');
const { setTimeout: delay } = await import('node:timers/promises');
const { join } = await import('node:path');
const { createRequire } = await import('node:module');
const { pathToFileURL } = await import('node:url');
const projectRequire = createRequire(
  join(config.projectDirectory, 'package.json'),
);
const { verifyPassword } = await import(
  pathToFileURL(projectRequire.resolve('better-auth/crypto')).href
);
const { identitySql } = await import(config.identitySessionScript);
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const dialog = '[data-testid="account-dialog"]';
const route = `${config.origin}/settings/account`;
const button = (name) =>
  name === '取消'
    ? `loc=css:${dialog} form button:text-is("取消")`
    : `loc=role:button[name="${name}"]`;
const suffix = config.width ?? 'all';
const secrets = [config.credentials.password];
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  screenshots: [],
  requests: [],
  business: [],
  secondBrowserContext: 'unverified',
  limitations: [
    'Only the runner’s disposable production runtime/database are modified; the manual preview is untouched.',
    'Held/lost responses come from real writes. Transport injection does not invent successful server results.',
    'Chromium viewport emulation does not constitute physical touch, soft keyboard or safe-area verification.',
    'Separate HTTP Cookie sessions verify revocation; they do not constitute two browser contexts.',
    'The current Ego capability probe can create an empty BrowserContext but rejects Target.createTarget; two navigable browser contexts remain unverified.',
  ],
};
let currentEmail = config.credentials.email;
let currentPassword = config.credentials.password;
let errorScript;
let failure;
let sourceScroll;
let previousToastIds = [];
let businessWidth;
const readScripts = new Set();
const safe = (value) => {
  let result = String(value);
  for (const secret of secrets)
    result = result.replaceAll(secret, '[redacted]');
  return result;
};
async function screenshot(name) {
  const filename = `account-${businessWidth ?? suffix}-${name}.png`;
  await page.screenshot({ path: join(config.output, filename) });
  report.screenshots.push(filename);
}
async function loginRetryWindow(limited, source, attempt) {
  assert.ok(
    Number.isFinite(limited.retryAfter) &&
      limited.retryAfter > 0 &&
      limited.retryAfter <= 60,
    'Actual auth limiter supplies a bounded x-retry-after window',
  );
  report.loginRateLimits ??= [];
  report.loginRateLimits.push({
    source,
    attempt,
    width: businessWidth,
    ...limited,
  });
  assert.ok(attempt < 3, `${source} did not recover after three real attempts`);
  await delay(
    Math.max(0, limited.receivedAt + limited.retryAfter * 1000 - Date.now()),
  );
}
async function request(path, method = 'GET', body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await page.fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    let payload;
    if (response.body) payload = JSON.parse(response.body);
    report.requests.push({
      path,
      method,
      width: businessWidth,
      attempt,
      status: response.status,
      code: payload?.code,
    });
    if (path !== '/api/auth/sign-in/email' || response.status !== 429)
      return { status: response.status, payload };
    await loginRetryWindow(
      {
        path,
        status: response.status,
        retryAfter: Number(response.headers['x-retry-after']),
        receivedAt: Date.now(),
      },
      'page-fetch',
      attempt,
    );
  }
}
async function persistedPasswordMatches(password) {
  const rows = await identitySql(
    config,
    "SELECT password FROM account WHERE provider_id='credential'",
  );
  assert.equal(rows.length, 1, 'The independent database has one credential');
  assert.equal(
    await verifyPassword({ hash: rows[0].password, password }),
    true,
    'The actual persisted password matches the committed winner',
  );
}
async function independentSession() {
  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(`${config.origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: config.origin },
      body: JSON.stringify({ email: currentEmail, password: currentPassword }),
      signal: AbortSignal.timeout(10000),
    });
    report.requests.push({
      path: '/api/auth/sign-in/email',
      method: 'POST',
      source: 'independent-cookie',
      width: businessWidth,
      attempt,
      status: response.status,
    });
    if (response.status !== 429) break;
    const limited = {
      path: '/api/auth/sign-in/email',
      status: response.status,
      retryAfter: Number(response.headers.get('x-retry-after')),
      receivedAt: Date.now(),
    };
    await response.arrayBuffer();
    await loginRetryWindow(limited, 'independent-cookie', attempt);
  }
  assert.equal(
    response.status,
    200,
    'Independent real credential sign-in succeeds',
  );
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  assert.ok(cookie, 'The second real session receives its own Cookie');
  secrets.push(cookie);
  const sessionRequest = async () => {
    const result = await fetch(`${config.origin}/api/account`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(10000),
    });
    return { status: result.status, payload: await result.json() };
  };
  assert.equal((await sessionRequest()).status, 200);
  return sessionRequest;
}
async function signIn(email = currentEmail, password = currentPassword) {
  const current = new URL(await page.url());
  if (
    current.pathname !== '/login' ||
    current.searchParams.get('returnTo') !== '/settings/account'
  )
    await page.goto(route);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="account-email"]'),
  );
  if (new URL(await page.url()).pathname === '/login') {
    const login = new URL(await page.url());
    const returnTo = login.searchParams.get('returnTo');
    assert.equal(returnTo, '/settings/account');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.evaluate(() => {
      const original = window.fetch;
      window.__accountLoginNativeFetch = original;
      window.__accountLoginResponses = [];
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (
          /\/api\/auth\/(sign-in\/email|get-session)(?:\?|$)/.test(response.url)
        ) {
          window.__accountLoginResponses.push({
            path: new URL(response.url).pathname,
            status: response.status,
            retryAfter: Number(response.headers.get('x-retry-after')),
            receivedAt: Date.now(),
          });
        }
        return response;
      };
    });
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        assert.equal(
          await page.url(),
          login.href,
          'Login keeps its original destination and reason',
        );
        await page.waitForFunction(
          () => !document.querySelector('button[type="submit"]').disabled,
        );
        await page.evaluate(() => {
          window.__accountLoginResponses = [];
        });
        await page.focus(button('登录'));
        await page.keyboard.press('Enter');
        await page.waitForFunction(
          () =>
            location.pathname === '/settings/account' ||
            (window.__accountLoginResponses?.some(
              (response) => response.status >= 400,
            ) &&
              [...document.querySelectorAll('[role="alert"]')].some((alert) =>
                alert.textContent.includes('HTTP'),
              )),
        );
        if (new URL(await page.url()).pathname === '/settings/account') break;
        const limited = await page.evaluate(() =>
          window.__accountLoginResponses.findLast(
            (response) => response.status >= 400,
          ),
        );
        assert.equal(
          limited.status,
          429,
          'UI login only retries real rate limiting',
        );
        if (limited.path === '/api/auth/sign-in/email')
          assert.equal(
            await page.evaluate(
              () => document.querySelector('button[type="submit"]').disabled,
            ),
            true,
            'Actual sign-in rate limit disables the UI submit action',
          );
        await loginRetryWindow(limited, 'login-ui', attempt);
        await page.waitForFunction(
          () => !document.querySelector('button[type="submit"]').disabled,
        );
        await valuesRemain({ email, password });
      }
      await page.waitForURL(new URL(returnTo, config.origin).href);
    } finally {
      await page.evaluate(() => {
        if (window.__accountLoginNativeFetch) {
          window.fetch = window.__accountLoginNativeFetch;
          delete window.__accountLoginNativeFetch;
        }
      });
    }
  }
  await page.waitForSelector('[data-testid="account-email"]');
  await page.waitForFunction(
    (email) =>
      document.querySelector('[data-testid="account-email"]')?.textContent ===
      email,
    email,
  );
}
async function open(kind) {
  while (
    await page.evaluate(() =>
      Boolean(
        document.querySelector(
          '[data-slot="toast"][data-frontmost="true"]:not([data-exiting="true"])',
        ),
      ),
    )
  ) {
    const titleId = await page.evaluate(
      () =>
        document.querySelector(
          '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-title"]',
        )?.id,
    );
    assert.ok(titleId, 'The previous frontmost notification has a title ID');
    await page.focus(
      '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]',
    );
    await page.keyboard.press('Enter');
    await page.waitForFunction((id) => !document.getElementById(id), titleId);
  }
  await page.waitForFunction(
    () => !document.querySelector('[data-slot="toast"]'),
  );
  previousToastIds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="toast-title"]')].map(
      (node) => node.id,
    ),
  );
  sourceScroll = await page.evaluate(() => ({
    window: scrollY,
    content: document.querySelector('.shell-content').scrollTop,
  }));
  await page.focus(`[data-testid="account-change-${kind}"]`);
  await page.keyboard.press('Enter');
  await page.waitForSelector(dialog);
  await page.waitForFunction(
    (id) => document.activeElement?.id === id,
    kind === 'email' ? 'email' : 'currentPassword',
  );
}
async function close(kind) {
  await page.keyboard.press('Escape');
  await page.waitForSelector(dialog, { state: 'hidden' });
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    `[data-testid="account-change-${kind}"]`,
  );
  const focusStyles = await page.evaluate(() => ({
    container: getComputedStyle(document.querySelector('[data-slot="tabs"]'))
      .outlineStyle,
    outline: getComputedStyle(document.activeElement).outlineStyle,
    shadow: getComputedStyle(document.activeElement).boxShadow,
  }));
  assert.equal(
    focusStyles.container,
    'none',
    'Settings container has no encompassing focus outline',
  );
  assert.ok(
    focusStyles.outline !== 'none' || focusStyles.shadow !== 'none',
    'The keyboard-focused account action retains its own visible focus ring',
  );
}
async function fields(values) {
  for (const [id, value] of Object.entries(values))
    await page.fill(`#${id}`, value);
}
async function valuesRemain(values) {
  assert.equal(
    await page.evaluate(
      (values) =>
        Object.entries(values).every(
          ([id, value]) => document.querySelector(`#${id}`)?.value === value,
        ),
      values,
    ),
    true,
    'Account errors preserve entered values',
  );
}
async function fieldError(id) {
  await page.waitForSelector(`#${id}[aria-invalid="true"]`);
  await page.waitForFunction((id) => document.activeElement?.id === id, id);
  const associated = await page.evaluate((id) => {
    const input = document.getElementById(id);
    return [
      ...(input.getAttribute('aria-describedby') ?? '').split(' '),
      ...(input.getAttribute('aria-errormessage') ?? '').split(' '),
    ].some((id) => !!document.getElementById(id)?.textContent.trim());
  }, id);
  assert.equal(associated, true, 'Field feedback is associated with its input');
}
async function successful(kind, expectedEmail = currentEmail) {
  await page.waitForSelector(dialog, { state: 'hidden' });
  await page.waitForFunction(
    (email) =>
      document.querySelector('[data-testid="account-email"]')?.textContent ===
      email,
    expectedEmail,
  );
  await page.waitForFunction(
    ({ title, previousIds }) =>
      [...document.querySelectorAll('[data-slot="toast-title"]')].some(
        (node) =>
          node.textContent === title &&
          !!node.id &&
          !previousIds.includes(node.id),
      ),
    {
      title: kind === 'email' ? '登录邮箱已更新' : '密码已更新',
      previousIds: previousToastIds,
    },
  );
  assert.equal(new URL(await page.url()).pathname, '/settings/account');
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    `[data-testid="account-change-${kind}"]`,
  );
  const session = await request('/api/auth/get-session');
  assert.equal(session.status, 200);
  assert.equal(session.payload.user.email, expectedEmail);
  assert.deepEqual(
    await page.evaluate(() => ({
      window: scrollY,
      content: document.querySelector('.shell-content').scrollTop,
    })),
    sourceScroll,
    'Successful update preserves source scrolling',
  );
}
async function verifiedEmail(expectedEmail, name) {
  await page.waitForSelector(`${dialog}[data-state="verified"]`);
  await page.waitForSelector('loc=role:heading[name="已核对当前邮箱"]');
  assert.equal(
    await page.evaluate(
      ({ selector, email }) =>
        [...document.querySelector(selector).querySelectorAll('p')].some(
          (node) => node.textContent === `当前邮箱：${email}`,
        ),
      { selector: dialog, email: expectedEmail },
    ),
    true,
    'Reconciliation displays the actual current email',
  );
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(`${selector} button[type="submit"]`),
      dialog,
    ),
    null,
    'Reconciliation has no resubmit action',
  );
  await stateGeometry(name);
  await page.click(button('返回账号与安全'));
  await page.waitForSelector(dialog, { state: 'hidden' });
  await page.waitForFunction(
    (email) =>
      document.querySelector('[data-testid="account-email"]')?.textContent ===
      email,
    expectedEmail,
  );
  await page.waitForFunction(
    () =>
      document.activeElement ===
      document.querySelector('[data-testid="account-change-email"]'),
  );
  assert.equal(new URL(await page.url()).pathname, '/settings/account');
  assert.deepEqual(
    await page.evaluate(() => ({
      window: scrollY,
      content: document.querySelector('.shell-content').scrollTop,
    })),
    sourceScroll,
    'Returning from reconciliation preserves source scrolling',
  );
}
async function geometry(name) {
  const layout = await readGeometry(page);
  assertGeometry(layout, name);
  report.layouts.push({ name, businessWidth, ...layout });
  await screenshot(name);
}
async function stateGeometry(name) {
  async function busySpinnerColors(theme) {
    const spinners = await page.evaluate(
      (selector) =>
        [
          ...document.querySelectorAll(
            `${selector} button [data-slot="spinner"]`,
          ),
        ].map((spinner) => {
          const button = spinner.closest('button');
          return {
            button: button.textContent,
            disabled: button.disabled,
            color: getComputedStyle(spinner).color,
            foreground: getComputedStyle(button).color,
            background: getComputedStyle(button).backgroundColor,
          };
        }),
      dialog,
    );
    if (
      ['email-pending', 'password-pending', 'email-reconciling'].includes(name)
    )
      assert.equal(
        spinners.length,
        1,
        `${name}-${theme} exposes its busy spinner`,
      );
    for (const spinner of spinners) {
      report.busySpinnerColors ??= [];
      report.busySpinnerColors.push({
        name,
        theme,
        width: businessWidth,
        ...spinner,
      });
      assert.equal(
        spinner.disabled,
        true,
        `${name}-${theme} busy button is disabled`,
      );
      assert.equal(
        spinner.color,
        spinner.foreground,
        `${name}-${theme} spinner inherits button foreground`,
      );
      assert.notEqual(
        spinner.color,
        spinner.background,
        `${name}-${theme} spinner is distinct from button background`,
      );
    }
  }
  await geometry(`${name}-light`);
  await busySpinnerColors('light');
  await setTheme(page, 'dark');
  await geometry(`${name}-dark`);
  await busySpinnerColors('dark');
  await setTheme(page, 'light');
}
async function captureLayouts() {
  const widths =
    config.width === 1440
      ? [1440]
      : config.width === 390
        ? [360, 390, 430, 768]
        : [1440, 360, 390, 430, 768];
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width);
      await geometry(`page-${theme}-${width}`);
      for (const kind of ['email', 'password']) {
        await open(kind);
        await geometry(`${kind}-${theme}-${width}`);
        await page.click(button('显示当前密码'));
        assert.equal(
          await page.evaluate(
            () => document.querySelector('#currentPassword').type,
          ),
          'text',
        );
        await page.click(button('隐藏当前密码'));
        assert.equal(
          await page.evaluate(
            () => document.querySelector('#currentPassword').type,
          ),
          'password',
        );
        // Tab and Shift+Tab remain in the real modal focus scope.
        await page.focus(button('取消'));
        await page.keyboard.press('Tab');
        assert.equal(
          await page.evaluate(
            (selector) => !!document.activeElement?.closest(selector),
            dialog,
          ),
          true,
        );
        await page.keyboard.press('Shift+Tab');
        await close(kind);
      }
    }
    if (widths.includes(390)) {
      await resizeViewport(page, 390, 400);
      await open('password');
      await fields({
        currentPassword,
        newPassword: 'short',
        confirmPassword: 'other',
      });
      await page.click(button('保存密码'));
      await fieldError('newPassword');
      await page.focus(button('保存密码'));
      await page.evaluate(() =>
        document.activeElement.scrollIntoView({ block: 'center' }),
      );
      assert.equal(
        await page.evaluate(() => {
          const rect = document.activeElement.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
        'Short viewport keeps the save action reachable',
      );
      await geometry(`password-error-short-${theme}`);
      await close('password');
    }
  }
  await resizeViewport(page, config.width ?? 1440);
  await setTheme(page, 'light');
  report.checks.push(
    'Responsive/light/dark page and both modals; keyboard opening, focus trap, password visibility, Escape return focus and 390×400 error scrolling.',
  );
}
async function installReadFault(hold) {
  const { identifier } = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
        const original = window.fetch;
        const gate = new Promise((resolve) => { window.__releaseAccountLoad = resolve; });
        window.__accountLoadStarted = false;
        window.fetch = async (...args) => {
          if (new URL(String(args[0]), location.href).pathname !== '/api/account')
            return original(...args);
          window.fetch = original;
          const response = await original(...args);
          window.__accountLoadStatus = response.status;
          window.__accountLoadStarted = true;
          ${hold ? 'await gate; return response;' : "throw new TypeError('Verification: account read response connection lost');"}
        };
      })();`,
    },
  );
  readScripts.add(identifier);
  return identifier;
}
async function removeReadFault(identifier) {
  await page.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  readScripts.delete(identifier);
}
async function readError(name) {
  const script = await installReadFault(false);
  await page.reload();
  await page.waitForSelector('[data-testid="account-load-error"]');
  await removeReadFault(script);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="account-page"]').dataset.state,
    ),
    'error',
  );
  assert.equal(await page.evaluate(() => window.__accountLoadStatus), 200);
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('[data-testid="account-change-email"]'),
    ),
    null,
    'A failed account read does not expose editing from stale shell email',
  );
  await page.waitForSelector(button('重新读取'));
  await geometry(name);
}
async function accountReads() {
  const widths = config.width ? [config.width] : [1440, 390];
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width);
      const script = await installReadFault(true);
      await page.reload();
      await page.waitForSelector('[data-testid="account-loading"]');
      await page.waitForFunction(() => window.__accountLoadStarted);
      assert.equal(await page.evaluate(() => window.__accountLoadStatus), 200);
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('[data-testid="account-change-email"]'),
        ),
        null,
        'Account editing waits for the real account read',
      );
      await geometry(`loading-${theme}-${width}`);
      await removeReadFault(script);
      await page.evaluate(() => window.__releaseAccountLoad());
      await page.waitForSelector('[data-testid="account-email"]');
      await readError(`read-error-${theme}-${width}`);
      await page.click(button('重新读取'));
      await page.waitForSelector('[data-testid="account-email"]');
      assert.equal((await request('/api/account')).payload.email, currentEmail);
    }
  }
  await resizeViewport(page, config.width ?? 1440);
  await setTheme(page, 'light');
  await readError('before-session-expiry');
  // Keep the background session read pending so the explicit account retry
  // receives a real 401 before either reader can replace the existing error UI.
  await page.evaluate(() => {
    const original = window.fetch;
    window.__accountNativeFetch = original;
    const gate = new Promise((resolve) => {
      window.__releaseAccountSessionRead = resolve;
    });
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const response = await original(...args);
      if (path === '/api/auth/get-session') await gate;
      if (path === '/api/account')
        window.__accountRetryStatus = response.status;
      return response;
    };
  });
  await identitySql(config, `UPDATE session SET expires_at=${Date.now() - 1}`);
  await page.click(button('重新读取'));
  await page.waitForSelector(
    '[data-testid="account-page"][data-state="session"]',
  );
  assert.equal(await page.evaluate(() => window.__accountRetryStatus), 401);
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-testid="account-load-error"] [role="alert"]',
      )?.textContent === '请重新登录后管理账号。',
  );
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    await geometry(`session-expired-${theme}`);
  }
  await page.evaluate(() => {
    window.__releaseAccountSessionRead();
    window.fetch = window.__accountNativeFetch;
  });
  await page.click('loc=role:link[name="重新登录"]');
  await page.waitForSelector('#password');
  const login = new URL(await page.url());
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('reason'), 'expired');
  assert.equal(login.searchParams.get('returnTo'), '/settings/account');
  await signIn();
  await setTheme(page, 'light');
  report.checks.push(
    'Held real account reads expose loading; lost real read responses expose an explicit retry without stale editing; real expired-session account retry returns 401, shows the session notice and preserves the account destination through credential login.',
  );
}
async function holdWrite(path, { lose = false } = {}) {
  await page.evaluate(
    ({ path, lose }) => {
      const original = window.fetch;
      const gate = new Promise((resolve) => {
        window.__releaseAccountWrite = resolve;
      });
      window.__accountWriteRequests = 0;
      window.__accountWriteSettled = false;
      window.fetch = async (...args) => {
        if (new URL(String(args[0]), location.href).pathname !== path)
          return original(...args);
        window.__accountWriteRequests++;
        const response = await original(...args);
        window.__accountWriteStatus = response.status;
        window.__accountWriteSettled = true;
        await gate;
        window.fetch = original;
        if (lose)
          throw new TypeError(
            'Verification: account response lost after real write',
          );
        return response;
      };
    },
    { path, lose },
  );
}
async function pending(kind) {
  await page.waitForFunction(() => window.__accountWriteSettled);
  assert.equal(await page.evaluate(() => window.__accountWriteStatus), 200);
  report.requests.push({
    path: `/api/account/${kind}`,
    method: kind === 'email' ? 'PATCH' : 'POST',
    status: 200,
    heldRealResponse: true,
  });
  assert.equal(
    await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      return [
        ...root.querySelectorAll(
          'form input,form button,button[aria-label="关闭账号编辑"]',
        ),
      ].every((node) => node.matches(':disabled'));
    }, dialog),
    true,
    'Pending write disables fields and every modal action',
  );
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__accountWriteRequests), 1);
  await page.waitForSelector(dialog);
  await stateGeometry(`${kind}-pending`);
}
async function emailChanges() {
  const oldEmail = currentEmail;
  await open('email');
  await fields({ email: '', currentPassword: '' });
  await page.click(button('保存邮箱'));
  await fieldError('email');
  const newEmail = `account-${businessWidth}@example.test`;
  const input = {
    email: ` ${newEmail.toUpperCase()} `,
    currentPassword: 'incorrect-password',
  };
  await fields(input);
  await page.click(button('保存邮箱'));
  await fieldError('currentPassword');
  await valuesRemain(input);
  assert.equal((await request('/api/account')).payload.email, currentEmail);
  await stateGeometry('email-current-password-error');
  await page.fill('#currentPassword', currentPassword);
  await identitySql(config, 'UPDATE user SET email_verified=1');
  await holdWrite('/api/account/email');
  await page.click(button('保存邮箱'));
  await pending('email');
  await page.evaluate(() => window.__releaseAccountWrite());
  await successful('email', newEmail);
  currentEmail = newEmail;
  await stateGeometry('email-success');
  const account = await request('/api/account');
  assert.deepEqual(account.payload, { email: newEmail });
  const oldLogin = await request('/api/auth/sign-in/email', 'POST', {
    email: oldEmail,
    password: currentPassword,
  });
  assert.equal(oldLogin.status, 401, 'Old email cannot create a session');
  assert.equal(
    (await request('/api/auth/get-session')).payload.user.email,
    newEmail,
  );
  report.checks.push(
    'Real invalid current password leaves email unchanged and preserves fields; normalized email commits once, closes to neutral Toast and preserves the current session; old email login fails.',
  );

  // A real write commits, but delivery fails. Hold the following real account
  // read to expose reconciliation before releasing the exact server result.
  await open('email');
  const recoveredEmail = `account-recovered-${businessWidth}@example.test`;
  await fields({ email: recoveredEmail, currentPassword });
  await page.evaluate(() => {
    const original = window.fetch;
    const gate = new Promise((resolve) => {
      window.__releaseAccountRead = resolve;
    });
    window.__accountReconcileStarted = false;
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      if (path === '/api/account/email') {
        await original(...args);
        throw new TypeError('Verification: committed email response lost');
      }
      if (path === '/api/account') {
        const response = await original(...args);
        window.__accountReconcileStarted = true;
        await gate;
        window.fetch = original;
        return response;
      }
      return original(...args);
    };
  });
  await page.click(button('保存邮箱'));
  await page.waitForFunction(() => window.__accountReconcileStarted);
  await page.waitForSelector(`${dialog}[data-state="checking"]`);
  assert.equal(
    await page.evaluate(() =>
      document.querySelector(
        '[data-testid="account-dialog"] button[type="submit"]',
      ),
    ),
    null,
  );
  await stateGeometry('email-reconciling');
  await page.evaluate(() => window.__releaseAccountRead());
  await verifiedEmail(recoveredEmail, 'email-reconciled');
  currentEmail = recoveredEmail;
  report.checks.push(
    'Lost response after real email commit triggers a real account reread; while held it cannot resubmit, and the same modal reports only the actual current email before returning with focus and scrolling intact.',
  );

  await open('email');
  const preserved = {
    email: `account-unsent-${businessWidth}@example.test`,
    currentPassword,
  };
  await fields(preserved);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      if (path === '/api/account/email')
        throw new TypeError('Verification: email request not sent');
      if (path === '/api/account') {
        window.fetch = original;
        throw new TypeError('Verification: email reconciliation unavailable');
      }
      return original(...args);
    };
  });
  await page.click(button('保存邮箱'));
  await page.waitForSelector(button('重新核对邮箱'));
  await page.waitForSelector(`${dialog}[data-state="unknown"]`);
  assert.equal(
    await page.evaluate(() =>
      document.querySelector(
        '[data-testid="account-dialog"] button[type="submit"]',
      ),
    ),
    null,
  );
  await stateGeometry('email-reconcile-error');
  await page.click(button('重新核对邮箱'));
  await verifiedEmail(currentEmail, 'email-reconciled-unchanged');
  assert.equal((await request('/api/account')).payload.email, currentEmail);
  report.checks.push(
    'Unsent email plus failed reread stays unknown without a submit action; explicit real reread verifies the unchanged current email and returns to the same account page.',
  );
}
async function passwordConflict() {
  // Real crypto completion order is nondeterministic. A valid UI winner is
  // recorded before another distinct race; the 409 UI branch remains required.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await open('password');
    const concurrentPassword = randomBytes(18).toString('hex');
    const proposedPassword = randomBytes(18).toString('hex');
    secrets.push(concurrentPassword, proposedPassword);
    await fields({
      currentPassword,
      newPassword: proposedPassword,
      confirmPassword: proposedPassword,
    });
    await page.evaluate(
      ({ concurrentPassword }) => {
        const original = window.fetch;
        window.__accountConcurrent = null;
        window.fetch = async (...args) => {
          if (
            new URL(String(args[0]), location.href).pathname !==
            '/api/account/password'
          )
            return original(...args);
          window.fetch = original;
          const body = JSON.parse(args[1].body);
          const other = original(args[0], {
            ...args[1],
            body: JSON.stringify({
              ...body,
              newPassword: concurrentPassword,
              confirmPassword: concurrentPassword,
            }),
          });
          const own = original(...args);
          const [otherResponse, response] = await Promise.all([other, own]);
          window.__accountConcurrent = {
            otherStatus: otherResponse.status,
            otherCode: (await otherResponse.clone().json()).code,
            ownStatus: response.status,
            ownCode: (await response.clone().json()).code,
          };
          return response;
        };
      },
      { concurrentPassword },
    );
    await page.click(button('保存密码'));
    await page.waitForFunction(() => !!window.__accountConcurrent);
    const actual = await page.evaluate(() => window.__accountConcurrent);
    report.requests.push({
      path: '/api/account/password',
      method: 'POST',
      attempt,
      width: businessWidth,
      status: actual.ownStatus,
      concurrentWriterStatus: actual.otherStatus,
      concurrentWriterCode: actual.otherCode,
      code: actual.ownCode,
    });
    if (actual.ownStatus === 200) {
      assert.deepEqual(actual, {
        otherStatus: 409,
        otherCode: 'ACCOUNT_PASSWORD_CHANGED',
        ownStatus: 200,
        ownCode: 'ACCOUNT_PASSWORD_UPDATED',
      });
      await successful('password');
      currentPassword = proposedPassword;
      await persistedPasswordMatches(currentPassword);
      await stateGeometry(`password-concurrent-ui-winner-${attempt}`);
      continue;
    }
    assert.deepEqual(actual, {
      otherStatus: 200,
      otherCode: 'ACCOUNT_PASSWORD_UPDATED',
      ownStatus: 409,
      ownCode: 'ACCOUNT_PASSWORD_CHANGED',
    });
    await fieldError('currentPassword');
    await valuesRemain({
      currentPassword: '',
      newPassword: proposedPassword,
      confirmPassword: proposedPassword,
    });
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="account-dialog"] [role="alert"]')
        ?.textContent.includes('核对期间密码已发生变化'),
    );
    await stateGeometry('password-conflict');
    currentPassword = concurrentPassword;
    await persistedPasswordMatches(currentPassword);
    await page.fill('#currentPassword', currentPassword);
    await page.click(button('保存密码'));
    await successful('password');
    currentPassword = proposedPassword;
    await persistedPasswordMatches(currentPassword);
    report.checks.push(
      'Two real password HTTP requests race: the other writer commits and the UI receives 409, clears only the current password, preserves both proposed fields, focuses the associated error and succeeds only after an explicit retry with the actual current password.',
    );
    return;
  }
  assert.fail(
    'Three real races did not reach the required UI 409 recovery branch',
  );
}
async function passwordChanges() {
  await open('password');
  const newPassword = randomBytes(18).toString('hex');
  secrets.push(newPassword);
  await fields({
    currentPassword,
    newPassword,
    confirmPassword: `${newPassword}x`,
  });
  await page.click(button('保存密码'));
  await fieldError('confirmPassword');
  await valuesRemain({
    currentPassword,
    newPassword,
    confirmPassword: `${newPassword}x`,
  });
  await fields({
    currentPassword: 'incorrect-password',
    confirmPassword: newPassword,
  });
  await page.click(button('保存密码'));
  await fieldError('currentPassword');
  await valuesRemain({
    currentPassword: 'incorrect-password',
    newPassword,
    confirmPassword: newPassword,
  });
  await stateGeometry('password-current-password-error');
  await page.fill('#currentPassword', currentPassword);
  const otherSession = await independentSession();
  await holdWrite('/api/account/password');
  await page.click(button('保存密码'));
  await pending('password');
  await page.evaluate(() => window.__releaseAccountWrite());
  await successful('password');
  const revoked = await otherSession();
  assert.equal(
    revoked.status,
    401,
    'Real password change revokes the independent Cookie session',
  );
  assert.equal(revoked.payload.code, 'UNAUTHORIZED');
  await stateGeometry('password-success');
  const oldPassword = currentPassword;
  currentPassword = newPassword;
  const oldLogin = await request('/api/auth/sign-in/email', 'POST', {
    email: currentEmail,
    password: oldPassword,
  });
  assert.equal(oldLogin.status, 401, 'Old password cannot create a session');
  assert.equal(
    (await request('/api/auth/get-session')).payload.user.email,
    currentEmail,
  );
  report.checks.push(
    'Confirmation mismatch and real invalid old password preserve all entered fields; real password commits once, closes to Toast, current session survives, the independent real Cookie session is revoked and old password login fails.',
  );

  // Passwords cannot be reread. Preserve an uncertain result after a successful
  // actual write and require explicit sign-in rather than sending it again.
  await open('password');
  const unknownPassword = randomBytes(18).toString('hex');
  secrets.push(unknownPassword);
  const preserved = {
    currentPassword,
    newPassword: unknownPassword,
    confirmPassword: unknownPassword,
  };
  await fields(preserved);
  await holdWrite('/api/account/password', { lose: true });
  await page.click(button('保存密码'));
  await page.waitForFunction(() => window.__accountWriteSettled);
  assert.equal(await page.evaluate(() => window.__accountWriteStatus), 200);
  await page.evaluate(() => window.__releaseAccountWrite());
  await page.waitForSelector(button('前往登录核对'));
  assert.equal(
    await page.evaluate(() =>
      document.querySelector(
        '[data-testid="account-dialog"] button[type="submit"]',
      ),
    ),
    null,
    'An uncertain password result has no resubmit action',
  );
  assert.equal(await page.evaluate(() => window.__accountWriteRequests), 1);
  await stateGeometry('password-unknown');
  await identitySql(
    config,
    "CREATE TRIGGER reject_account_browser_logout BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'Account logout deletion failure'); END",
  );
  try {
    await page.click(button('前往登录核对'));
    await page.waitForFunction(() =>
      document
        .querySelector(
          '[data-testid="account-dialog"][data-state="unknown"] [role="alert"]',
        )
        ?.textContent.includes('HTTP 500'),
    );
    assert.equal(new URL(await page.url()).pathname, '/settings/account');
    assert.equal(
      (await request('/api/auth/get-session')).payload.user.email,
      currentEmail,
    );
    await stateGeometry('password-check-logout-error');
  } finally {
    await identitySql(config, 'DROP TRIGGER reject_account_browser_logout');
  }
  await page.click(button('前往登录核对'));
  await page.waitForSelector('#password');
  const login = new URL(await page.url());
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('reason'), 'signed-out');
  assert.equal(login.searchParams.get('returnTo'), '/settings/account');
  assert.equal((await request('/api/auth/get-session')).payload, null);
  currentPassword = unknownPassword;
  await signIn();
  report.checks.push(
    'Lost response after actual password commit never retries or pretends the old value survived; the unknown result offers no resubmit action; real logout persistence failure keeps its recovery modal and current session, then explicit successful logout carries the account destination to login and new credentials enter the same page.',
  );
}
try {
  errorScript = await installBrowserErrors(page);
  await signIn();
  assert.deepEqual((await request('/api/account')).payload, {
    email: currentEmail,
  });
  report.stage = 'responsive';
  await captureLayouts();
  report.stage = 'account-read';
  await accountReads();
  for (const width of config.width ? [config.width] : [1440, 390]) {
    businessWidth = width;
    await resizeViewport(page, width);
    await setTheme(page, 'light');
    report.stage = `email-${width}`;
    await emailChanges();
    report.stage = `password-conflict-${width}`;
    await passwordConflict();
    report.stage = `password-${width}`;
    await passwordChanges();
    report.business.push({ width, status: 'passed', email: currentEmail });
  }
  const rows = await identitySql(
    config,
    'SELECT email, email_verified FROM user',
  );
  assert.deepEqual(rows, [{ email: currentEmail, email_verified: 0 }]);
  report.persistedEmail = currentEmail;
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(
    report.browserErrors,
    [],
    'Account has no browser runtime/resource errors',
  );
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = safe(error.stack ?? String(error));
  await screenshot('failure');
} finally {
  for (const identifier of readScripts)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(
      config.output,
      `account${config.width ? `-${config.width}` : ''}.json`,
    ),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw new Error(report.error);
console.log({
  account: report.status,
  report: join(
    config.output,
    `account${config.width ? `-${config.width}` : ''}.json`,
  ),
});
