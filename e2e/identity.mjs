/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { readFile, writeFile } = await import('node:fs/promises');
const { identitySql, verifyIdentitySession } = await import(
  config.identitySessionScript
);
const { join } = await import('node:path');
const { installBrowserErrors, assertNoBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const report = {
  status: 'failed',
  width: config.width,
  phase: config.phase,
  checks: [],
  layouts: [],
};
let errorScript;
let secondPage;
const post = (path, body) =>
  page.fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const setupBody = {
  code: config.code,
  ...config.credentials,
  publicUrl: config.origin,
  timeZone: 'UTC',
};
async function settingsSnapshot() {
  const tables = [
    'site_settings',
    'media_settings',
    'storage_settings',
    'storage_configs',
  ];
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [
        table,
        await identitySql(config, `SELECT * FROM ${table}`),
      ]),
    ),
  );
}
async function health() {
  const response = await page.fetch('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
  return {
    status: response.status,
    cacheControl: response.headers['cache-control'],
    body: JSON.parse(response.body),
  };
}
async function resize(width, height = 844) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.waitForFunction((expected) => innerWidth === expected, width);
}
async function layouts(name) {
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme }],
    });
    await page.waitForFunction(
      (value) => document.documentElement.classList.contains(value),
      theme,
    );
    for (const width of config.width === 1440 ? [768, 1440] : [360, 390, 430]) {
      await resize(width);
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        targets: [...document.querySelectorAll('button,input,a')]
          .filter((node) => node.getBoundingClientRect().width > 0)
          .map((node) => ({
            name:
              node.getAttribute('aria-label') || node.id || node.textContent,
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
      }));
      assert.ok(
        layout.scrollWidth <= width,
        'Identity page must not overflow horizontally',
      );
      if (width < 768)
        assert.ok(
          layout.targets.every(
            (target) => target.width >= 44 && target.height >= 44,
          ),
          JSON.stringify(layout.targets),
        );
      report.layouts.push({ name, theme, ...layout });
      const snapshot = await page.snapshot();
      if (snapshot.includes('保存登录')) {
        await page.click('loc=role:button[name="关闭"]');
      }
      await page.screenshot({
        path: join(config.output, `identity-${name}-${theme}-${width}.png`),
      });
    }
  }
  await resize(config.width);
}
async function noPersistedSecrets() {
  const clean = await page.evaluate(
    ({ code, password }) => {
      const stored = [
        JSON.stringify(localStorage),
        JSON.stringify(sessionStorage),
        location.href,
      ].join(' ');
      return !stored.includes(code) && !stored.includes(password);
    },
    { code: config.code, password: config.credentials.password },
  );
  assert.equal(
    clean,
    true,
    'Setup code and password must not be stored in browser storage or URLs',
  );
}
async function loginAndLogout() {
  await page.goto(`${config.origin}/admin`);
  await page.waitForSelector('#email');
  assert.equal(new URL(await page.url()).pathname, '/login');
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.focus('loc=role:button[name="登录"]');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${config.origin}/admin`);
  await page.waitForSelector('loc=role:button[name="退出登录"]');
  assert.equal(
    JSON.parse((await page.fetch('/api/auth/get-session')).body).user.email,
    config.credentials.email,
  );
  if (secondPage) {
    assert.equal(
      JSON.parse((await secondPage.fetch('/api/auth/get-session')).body),
      null,
      'The second hostname has an independent browser cookie jar',
    );
    report.checks.push(
      'Owner session on 127.0.0.1 does not authenticate the localhost browser page',
    );
  }
  await page.focus('loc=role:button[name="退出登录"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#email');
  assert.equal(new URL(await page.url()).pathname, '/login');
  assert.equal(
    JSON.parse((await page.fetch('/api/auth/get-session')).body),
    null,
  );
  await page.goto(`${config.origin}/admin`);
  await page.waitForSelector('#email');
  assert.equal(new URL(await page.url()).pathname, '/login');
}
try {
  errorScript = await installBrowserErrors(page);
  await resize(config.width);
  await page.goto(`${config.origin}/login`);
  report.health = [await health()];
  if (config.phase === 'setup') {
    await page.waitForSelector('a[href="/setup"]');
    const initial = await page.fetch('/api/auth/get-session');
    assert.equal(initial.status, 409);
    assert.equal(initial.headers['cache-control'], 'no-store');
    assert.equal(JSON.parse(initial.body).code, 'SETUP_REQUIRED');
    await page.click('a[href="/setup"]');
    await page.waitForSelector('#code');
    // Navigating away before the final submit must not leave a partial account.
    await page.fill('#code', 'invalid-setup-code');
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.fill('#confirmPassword', 'different-confirmation');
    await page.click('loc=role:button[name="下一步：设置站点"]');
    await page.waitForSelector('#confirmPassword[aria-invalid="true"]');
    await page.waitForFunction(
      () => document.activeElement.id === 'confirmPassword',
    );
    await page.screenshot({
      path: join(config.output, `identity-confirm-error-${config.width}.png`),
    });
    await page.fill('#confirmPassword', config.credentials.password);
    await page.click('loc=role:button[name="下一步：设置站点"]');
    await page.waitForSelector('#publicUrl');
    await page.reload();
    await page.waitForSelector('#code');
    assert.equal(
      await page.evaluate(() => document.querySelector('#code').value),
      '',
    );
    assert.equal(
      await page.evaluate(() => document.querySelector('#password').value),
      '',
    );
    assert.equal((await page.fetch('/api/auth/get-session')).status, 409);
    await noPersistedSecrets();
    report.checks.push(
      'Reload before final submission leaves setup open and clears in-memory secrets',
    );
    await layouts('setup');
    if (config.width === 390) {
      // Exercise browsers without a usable timezone recommendation; no HTTP result is substituted.
      await page.evaluate(() => {
        const Original = Intl.DateTimeFormat;
        Intl.DateTimeFormat = function (locales, options) {
          const formatter = new Original(locales, options);
          if (!options?.timeZone) {
            Intl.DateTimeFormat = Original;
            const resolved = formatter.resolvedOptions.bind(formatter);
            formatter.resolvedOptions = () => ({
              ...resolved(),
              timeZone: undefined,
            });
          }
          return formatter;
        };
        Intl.DateTimeFormat.prototype = Original.prototype;
        Object.setPrototypeOf(Intl.DateTimeFormat, Original);
      });
    }
    // An invalid code is submitted to the real endpoint; all other fields survive.
    await page.fill('#code', 'invalid-setup-code');
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.fill('#confirmPassword', config.credentials.password);
    await page.focus('loc=role:button[name="显示密码"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#password').type === 'text',
    );
    assert.equal(
      await page.evaluate(() => {
        const button = document.querySelector('button[aria-label="隐藏密码"]');
        return (
          !!button?.querySelector('svg') && button.textContent.trim() === ''
        );
      }),
      true,
      'Password visibility uses a named icon button without visible label text',
    );
    await page.focus('loc=role:button[name="隐藏密码"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#password').type === 'password',
    );
    await page.focus('#password');
    await page.waitForFunction(() =>
      getComputedStyle(
        document
          .querySelector('#password')
          .closest('[data-slot="input-group"]'),
      ).boxShadow.includes('0px 0px 0px 2px'),
    );
    const focusStyles = await page.evaluate(() => {
      const input = document.querySelector('#password');
      const group = input.closest('[data-slot="input-group"]');
      const style = getComputedStyle(input);
      return {
        innerBorder: style.borderTopWidth,
        innerOutline: style.outlineStyle,
        groupOutline: getComputedStyle(group).outlineStyle,
        groupShadow: getComputedStyle(group).boxShadow,
        buttonRadius: getComputedStyle(
          document.querySelector('button[type="submit"]'),
        ).borderRadius,
      };
    });
    assert.equal(focusStyles.innerBorder, '0px');
    assert.equal(focusStyles.innerOutline, 'none');
    assert.equal(focusStyles.groupOutline, 'none');
    assert.match(
      focusStyles.groupShadow,
      /rgb\(\d+, \d+, \d+\) 0px 0px 0px 2px/,
      'HeroUI retains the group focus ring',
    );
    report.focusStyles = focusStyles;
    assert.equal(focusStyles.buttonRadius, '12px');
    await page.focus('loc=role:button[name="下一步：设置站点"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#publicUrl');
    assert.equal((await page.fetch('/api/auth/get-session')).status, 409);
    if (config.width === 390) {
      assert.equal(
        await page.evaluate(() => document.querySelector('#timeZone').value),
        '',
      );
      assert.equal(
        await page.evaluate(
          () =>
            [...document.querySelectorAll('button')].find(
              (button) => button.textContent === '完成初始化',
            ).disabled,
        ),
        true,
      );
      report.checks.push(
        'Unavailable browser timezone recommendation requires an explicit selection',
      );
    }
    await page.fill('#publicUrl', config.origin);
    await layouts('site');
    await page.fill('#timeZone', 'Tokyo');
    await page.press('#timeZone', 'ArrowDown');
    await page.press('#timeZone', 'Enter');
    assert.equal(
      await page.evaluate(() => document.querySelector('#timeZone').value),
      'Asia/Tokyo',
    );
    await page.fill('#timeZone', 'no-such-time-zone');
    // HeroUI's empty option uses display:contents, so observe its visible listbox.
    await page.waitForFunction(
      () =>
        document.querySelector('[role="listbox"][data-empty="true"]')
          ?.textContent === '没有匹配的时区',
    );
    await page.screenshot({
      path: join(config.output, `identity-timezone-empty-${config.width}.png`),
    });
    await page.press('#timeZone', 'Escape');
    assert.equal(
      await page.evaluate(() => document.querySelector('#timeZone').value),
      'Asia/Tokyo',
    );
    await page.fill('#timeZone', 'US/Eastern');
    await page.press('#timeZone', 'ArrowDown');
    await page.press('#timeZone', 'Enter');
    assert.equal(
      await page.evaluate(() => document.querySelector('#timeZone').value),
      'America/New_York',
    );
    await page.fill('#timeZone', 'UTC');
    await page.press('#timeZone', 'ArrowDown');
    await page.press('#timeZone', 'Enter');
    await page.fill('#publicUrl', `${config.origin}/invalid-subpath`);
    await page.click('loc=role:button[name="完成初始化"]');
    await page.waitForSelector('#publicUrl[aria-invalid="true"]');
    await page.waitForFunction(() => document.activeElement.id === 'publicUrl');
    await page.screenshot({
      path: join(config.output, `identity-address-error-${config.width}.png`),
    });
    await page.fill('#publicUrl', config.origin);
    await page.click('loc=role:button[name="完成初始化"]');
    await page.waitForSelector('#code[aria-invalid="true"]');
    await page.waitForFunction(() => document.activeElement.id === 'code');
    await layouts('code-error');
    assert.equal(
      await page.evaluate(
        ({ email, password }) =>
          document.querySelector('#email').value === email &&
          document.querySelector('#password').value === password &&
          document.querySelector('#confirmPassword').value === password,
        config.credentials,
      ),
      true,
    );
    await page.fill('#code', config.code);
    await page.click('loc=role:button[name="下一步：设置站点"]');
    await page.waitForSelector('#publicUrl');
    assert.equal(
      await page.evaluate(() => document.querySelector('#timeZone').value),
      'UTC',
    );
    await noPersistedSecrets();
    if (config.width === 390) {
      // A transport failure before sending is distinct from a committed response loss.
      await page.evaluate(() => {
        const original = window.fetch;
        window.fetch = async (...args) => {
          if (args[0] === '/api/setup' && args[1]?.method === 'POST') {
            window.fetch = original;
            throw new TypeError(
              'Verification: connection lost before setup was sent',
            );
          }
          return original(...args);
        };
      });
      await page.click('loc=role:button[name="完成初始化"]');
      await page.waitForSelector('loc=role:button[name="核对初始化结果"]');
      await layouts('unknown');
      await page.evaluate(() => {
        const original = window.fetch;
        window.fetch = async (...args) => {
          window.fetch = original;
          if (args[0] === '/api/auth/get-session')
            throw new TypeError('Verification: status connection lost');
          return original(...args);
        };
      });
      await page.click('loc=role:button[name="核对初始化结果"]');
      await page.waitForFunction(() =>
        document
          .querySelector('[role="alert"]')
          ?.textContent.includes('仍无法确认'),
      );
      assert.equal(
        await page.evaluate(
          () => !!document.querySelector('button[type="submit"]'),
        ),
        false,
      );
      await page.click('loc=role:button[name="核对初始化结果"]');
      await page.waitForSelector('loc=role:button[name="完成初始化"]');
      assert.equal(
        await page.evaluate(() => document.querySelector('#publicUrl').value),
        config.origin,
      );
      report.checks.push(
        'Unsent setup and failed status check remain unknown; real SETUP_REQUIRED unlocks retry without losing fields',
      );
    }
    if (config.width === 390) {
      await resize(390, 400);
      await page.focus('#publicUrl');
      await page.focus('loc=role:button[name="完成初始化"]');
      await page.evaluate(() =>
        document.activeElement.scrollIntoView({ block: 'center' }),
      );
      assert.equal(
        await page.evaluate(() => {
          const rect = document.activeElement.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
      );
      report.checks.push(
        '390×400 shortened viewport can scroll and focus the submit button (not a physical soft-keyboard test)',
      );
      await resize(config.width);
    }
    // Separate hostnames keep cookie jars independent without a second Ego TaskSpace.
    // Both pages use the same real server; this is not a second browser-engine claim.
    secondPage = await task.newPage();
    const secondOrigin = config.origin.replace('127.0.0.1', 'localhost');
    await secondPage.goto(`${secondOrigin}/setup`);
    await secondPage.waitForSelector('#code');
    await secondPage.fill('#code', config.code);
    await secondPage.fill('#email', 'second-owner@example.test');
    await secondPage.fill('#password', config.credentials.password);
    await secondPage.fill('#confirmPassword', config.credentials.password);
    await secondPage.click('loc=role:button[name="下一步：设置站点"]');
    await secondPage.waitForSelector('#publicUrl');
    await secondPage.fill('#publicUrl', config.origin);
    await secondPage.fill('#timeZone', 'UTC');
    await secondPage.press('#timeZone', 'ArrowDown');
    await secondPage.press('#timeZone', 'Enter');
    // Hold the real response to observe pending/disabled on both layouts.
    await page.evaluate((loseResponse) => {
      const original = window.fetch;
      const gate = new Promise((resolve) => {
        window.__releaseSetupResponse = resolve;
      });
      window.__setupRequests = 0;
      window.fetch = async (...args) => {
        if (args[0] === '/api/setup' && args[1]?.method === 'POST') {
          window.__setupRequests++;
          const response = await original(...args);
          await gate;
          window.fetch = original;
          if (loseResponse)
            throw new TypeError('Verification: setup response connection lost');
          return response;
        }
        return original(...args);
      };
    }, config.width === 1440);
    await page.click('loc=role:button[name="完成初始化"]');
    await page.waitForFunction(() =>
      document
        .querySelector('button[type="submit"]')
        ?.textContent.includes('正在提交'),
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('button[type="submit"]').disabled,
      ),
      true,
    );
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__setupRequests), 1);
    await page.screenshot({
      path: join(config.output, `identity-pending-${config.width}.png`),
    });
    await page.evaluate(() => window.__releaseSetupResponse());
    if (config.width === 1440) {
      await page.waitForSelector('loc=role:button[name="核对初始化结果"]');
      await layouts('unknown');
      assert.equal(
        await page.evaluate(() =>
          [...document.querySelectorAll('button')].some(
            (button) => button.textContent === '完成初始化',
          ),
        ),
        false,
      );
      await page.click('loc=role:button[name="核对初始化结果"]');
      report.checks.push(
        'A deliberately lost real setup response requires status verification before any retry',
      );
    }
    await page.waitForSelector('#email');
    assert.equal(new URL(await page.url()).pathname, '/login');
    assert.equal((await page.fetch('/api/auth/get-session')).status, 200);
    assert.equal(
      JSON.parse((await page.fetch('/api/auth/get-session')).body),
      null,
    );
    await noPersistedSecrets();
    // The second page was already collecting a different owner before setup completed.
    await secondPage.click('loc=role:button[name="完成初始化"]');
    await secondPage.waitForSelector('#email');
    assert.equal(new URL(await secondPage.url()).pathname, '/login');
    const secondAttempt = await secondPage.fetch('/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...setupBody,
        email: 'second-owner@example.test',
      }),
    });
    assert.equal(secondAttempt.status, 409);
    assert.equal(
      JSON.parse(secondAttempt.body).code,
      'SETUP_ALREADY_COMPLETED',
    );
    report.checks.push(
      'Two browser pages with separate hostname cookie jars: the stale second-owner form returns to login and HTTP refuses another owner',
    );
    report.settings = await settingsSnapshot();
    assert.equal(report.settings.site_settings[0].public_url, config.origin);
    assert.equal(report.settings.site_settings[0].time_zone, 'UTC');
    assert.equal(report.settings.media_settings[0].quality, 82);
    assert.equal(report.settings.storage_configs.length, 1);
    assert.equal(
      report.settings.storage_settings[0].default_storage_id,
      report.settings.storage_configs[0].id,
    );
    await layouts('login');
    await page.click('loc=role:button[name="登录"]');
    await page.waitForSelector('#email[aria-invalid="true"]');
    await page.waitForFunction(() => document.activeElement.id === 'email');
    await page.screenshot({
      path: join(config.output, `identity-login-required-${config.width}.png`),
    });
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await identitySql(
      config,
      "CREATE TRIGGER reject_m1_login BEFORE INSERT ON session BEGIN SELECT RAISE(ABORT, 'M1 login persistence failure'); END",
    );
    try {
      await page.evaluate(() => {
        const original = window.fetch;
        window.fetch = async (...args) => {
          const response = await original(...args);
          if (args[0] === '/api/auth/sign-in/email') {
            window.fetch = original;
            window.__loginFailure = {
              status: response.status,
              body: await response.clone().text(),
            };
          }
          return response;
        };
      });
      await page.click('loc=role:button[name="登录"]');
      await page.waitForFunction(() =>
        document
          .querySelector('[role="alert"]')
          ?.textContent.includes('无法确认登录结果'),
      );
      report.loginFailure = await page.evaluate(() => window.__loginFailure);
      assert.equal(report.loginFailure.status, 500);
      assert.equal(report.loginFailure.body, '');
      assert.equal(
        await page.evaluate(() => document.querySelector('#email').value),
        config.credentials.email,
      );
      assert.equal(
        await page.evaluate(() => document.querySelector('#password').value),
        config.credentials.password,
      );
      assert.equal(
        JSON.parse((await page.fetch('/api/auth/get-session')).body),
        null,
      );
      await page.screenshot({
        path: join(
          config.output,
          `identity-login-unavailable-${config.width}.png`,
        ),
      });
    } finally {
      await identitySql(config, 'DROP TRIGGER reject_m1_login');
    }
    report.checks.push(
      'Required login fields focus the error; real SQLite login failure returns empty HTTP 500, shows unconfirmed-result feedback, retains fields and creates no session; later login recovers',
    );
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', 'incorrect-password');
    await page.click('loc=role:button[name="登录"]');
    await page.waitForFunction(() =>
      document
        .querySelector('[role="alert"]')
        ?.textContent.includes('邮箱或密码不正确'),
    );
    await layouts('password-error');
    assert.equal(new URL(await page.url()).pathname, '/login');
    assert.equal(
      JSON.parse((await page.fetch('/api/auth/get-session')).body),
      null,
    );
    report.checks.push(
      'Empty DATA_DIR; uninitialized login; two-step setup; real invalid-code feedback preserves fields; no partial owner; explicit timezone; no secret persistence; setup creates no session; wrong-password feedback',
    );
  } else {
    const initialReport = JSON.parse(
      await readFile(
        join(config.output, `identity-${config.width}-setup.json`),
        'utf8',
      ),
    );
    assert.equal(initialReport.status, 'passed');
    report.settings = await settingsSnapshot();
    assert.deepEqual(
      report.settings,
      initialReport.settings,
      'Real restart must retain all site/media/storage fields, IDs and timestamps',
    );
    assert.equal((await page.fetch('/api/auth/get-session')).status, 200);
    const repeat = await post('/api/setup', setupBody);
    assert.equal(repeat.status, 409);
    assert.equal(JSON.parse(repeat.body).code, 'SETUP_ALREADY_COMPLETED');
    await page.goto(`${config.origin}/setup`);
    await page.waitForSelector('#email');
    assert.equal(new URL(await page.url()).pathname, '/login');
    report.checks.push(
      'Real process restart retains initialized owner; old setup code rejected over HTTP; /setup redirects to /login',
    );
  }
  await loginAndLogout();
  if (config.phase === 'restart') {
    report.sessionChecks = await verifyIdentitySession(page, config);
  }
  await noPersistedSecrets();
  report.health.push(await health());
  report.checks.push(
    'Real credential login; protected route return; real logout; anonymous protected page redirects',
  );
  report.errors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error)
    .replaceAll(config.code, '[redacted]')
    .replaceAll(config.credentials.password, '[redacted]');
  throw new Error(report.error);
} finally {
  await writeFile(
    join(config.output, `identity-${config.width}-${config.phase}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  if (secondPage) await secondPage.close();
}
if (!config.keepSpace) await task.finish({ keep: [] });
console.log(report);
