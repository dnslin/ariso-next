/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
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
  if (config.phase === 'setup') {
    await page.waitForSelector('a[href="/setup"]');
    const initial = await page.fetch('/api/auth/get-session');
    assert.equal(initial.status, 409);
    assert.equal(initial.headers['cache-control'], 'no-store');
    assert.equal(JSON.parse(initial.body).code, 'SETUP_REQUIRED');
    await page.click('a[href="/setup"]');
    await page.waitForSelector('#code');
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
    const focusStyles = await page.evaluate(() => {
      const input = document.querySelector('#password');
      const group = input.closest('[data-slot="input-group"]');
      const style = getComputedStyle(input);
      return {
        innerBorder: style.borderTopWidth,
        innerOutline: style.outlineWidth,
        groupOutline: getComputedStyle(group).outlineWidth,
        groupShadow: getComputedStyle(group).boxShadow,
        buttonRadius: getComputedStyle(
          document.querySelector('button[type="submit"]'),
        ).borderRadius,
      };
    });
    assert.equal(focusStyles.innerBorder, '0px');
    assert.equal(focusStyles.innerOutline, '0px');
    assert.equal(focusStyles.groupOutline, '0px');
    assert.notEqual(
      focusStyles.groupShadow,
      'none',
      'HeroUI retains the group focus ring',
    );
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
    await page.fill('#timeZone', 'Tokyo');
    await page.press('#timeZone', 'ArrowDown');
    await page.press('#timeZone', 'Enter');
    assert.equal(
      await page.evaluate(() => document.querySelector('#timeZone').value),
      'Asia/Tokyo',
    );
    await page.fill('#timeZone', 'no-such-time-zone');
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
    await page.click('loc=role:button[name="完成初始化"]');
    await page.waitForSelector('#code[aria-invalid="true"]');
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
    if (config.width === 1440) {
      // Deliver the real request, then lose its response at the browser boundary.
      await page.evaluate(() => {
        const original = window.fetch;
        window.fetch = async (...args) => {
          if (args[0] === '/api/setup' && args[1]?.method === 'POST') {
            window.fetch = original;
            await original(...args);
            throw new TypeError('Verification: setup response connection lost');
          }
          return original(...args);
        };
      });
    }
    await page.click('loc=role:button[name="完成初始化"]');
    if (config.width === 1440) {
      await page.waitForSelector('loc=role:button[name="核对初始化结果"]');
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
    await layouts('login');
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', 'incorrect-password');
    await page.click('loc=role:button[name="登录"]');
    await page.waitForFunction(() =>
      document
        .querySelector('[role="alert"]')
        ?.textContent.includes('邮箱或密码不正确'),
    );
    assert.equal(new URL(await page.url()).pathname, '/login');
    assert.equal(
      JSON.parse((await page.fetch('/api/auth/get-session')).body),
      null,
    );
    report.checks.push(
      'Empty DATA_DIR; uninitialized login; two-step setup; real invalid-code feedback preserves fields; no partial owner; explicit timezone; no secret persistence; setup creates no session; wrong-password feedback',
    );
  } else {
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
    report.sessionChecks = await (
      await import(config.identitySessionScript)
    ).verifyIdentitySession(page, config);
  }
  await noPersistedSecrets();
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
}
if (!config.keepSpace) await task.finish({ keep: [] });
console.log(report);
