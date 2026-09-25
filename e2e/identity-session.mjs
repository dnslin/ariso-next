import { verifyLoginFeedbackFocus } from './login-focus.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// Mutations only affect the runner's disposable real database.
export async function identitySql(config, statement) {
  const { stdout } = await promisify(execFile)(
    config.nodeExecutable,
    [
      '--input-type=module',
      '-e',
      "import Database from 'better-sqlite3'; const db = new Database(process.argv[1]); try { const statement = db.prepare(process.argv[2]); console.log(JSON.stringify(statement.reader ? statement.all() : statement.run())); } finally { db.close(); }",
      config.databasePath,
      statement,
    ],
    { cwd: config.projectDirectory },
  );
  return JSON.parse(stdout);
}

// Faults are injected at the browser's fetch boundary. Session checks follow
// real successful sign-ins and verify/clean up the actual cookie afterward.
export async function verifyLoginFailures(page, config, checks = []) {
  const networkMessage = '连接中断，无法确认登录结果，请检查网络后重试。';
  const failures = [
    { name: 'HTML gateway error', status: 502, body: '<h1>Bad Gateway</h1>' },
    { name: 'malformed error JSON', status: 500, body: '{"code":' },
    { name: 'null error JSON', status: 400, body: 'null' },
    { name: 'array error JSON', status: 400, body: '[]' },
    { name: 'non-string error code', status: 400, body: '{"code":42}' },
    {
      name: 'stable server error code',
      status: 503,
      body: '{"code":"SERVICE_UNAVAILABLE"}',
      message:
        '登录失败，请稍后重试或检查服务日志。（HTTP 503 / SERVICE_UNAVAILABLE）',
    },
    {
      name: 'credential error code',
      status: 401,
      body: '{"code":"INVALID_PASSWORD"}',
      message: '邮箱或密码不正确，请检查后重试。（INVALID_PASSWORD）',
    },
    { name: 'login request rejected', network: true, message: networkMessage },
    {
      name: 'empty rate-limit response',
      status: 429,
      body: '',
      headers: { 'x-retry-after': '1' },
      message: '登录请求过于频繁，请等待服务允许后重试。（HTTP 429）',
    },
    {
      name: 'session HTTP failure',
      session: true,
      status: 500,
      body: '',
      message:
        '无法确认登录结果，请稍后重试或检查服务日志。（会话核对 HTTP 500）',
    },
    {
      name: 'invalid session response',
      session: true,
      status: 200,
      body: '<h1>Unexpected proxy response</h1>',
      message:
        '登录状态响应格式异常，无法确认登录结果，请稍后重试。（HTTP 200）',
    },
    {
      name: 'unconfirmed session',
      session: true,
      status: 200,
      body: 'null',
      message: '尚未确认登录会话，请重试。',
    },
    {
      name: 'session request rejected',
      session: true,
      network: true,
      message: networkMessage,
    },
  ];
  for (const failure of failures) {
    await page.goto(`${config.origin}/login`);
    await page.waitForSelector('#email');
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.evaluate((fault) => {
      const original = window.fetch;
      window.__loginFaultUsed = false;
      window.__loginStatuses = [];
      window.fetch = async (...args) => {
        const target = fault.session
          ? '/api/auth/get-session'
          : '/api/auth/sign-in/email';
        if (args[0] === target) {
          window.fetch = original;
          window.__loginFaultUsed = true;
          if (fault.network) throw new TypeError('controlled network failure');
          return new Response(fault.body, {
            status: fault.status,
            headers: fault.headers,
          });
        }
        const response = await original(...args);
        if (args[0] === '/api/auth/sign-in/email')
          window.__loginStatuses.push(response.status);
        return response;
      };
    }, failure);
    const submit = async () => {
      await page.focus('loc=role:button[name="登录"]');
      await page.keyboard.press('Enter');
    };
    await submit();
    await page.waitForFunction(
      () =>
        window.__loginFaultUsed ||
        document
          .querySelector('[role="alert"]')
          ?.textContent.includes('HTTP 429'),
    );
    // Repeated real sign-ins can reach the existing limiter. Honor its actual
    // wait window, then explicitly retry; never bypass the server's limit.
    if (!(await page.evaluate(() => window.__loginFaultUsed))) {
      await page.waitForFunction(
        () => !document.querySelector('button[type="submit"]').disabled,
        undefined,
        { timeout: 15000 },
      );
      await submit();
    }
    const expected =
      failure.message ??
      `登录失败，请稍后重试或检查服务日志。（HTTP ${failure.status}）`;
    await page.waitForFunction(
      (message) =>
        document.querySelector('[role="alert"]')?.textContent.includes(message),
      expected,
    );
    if (failure.status === 429) {
      assert.equal(
        await page.evaluate(
          () => document.querySelector('button[type="submit"]').disabled,
        ),
        true,
      );
    }
    await page.waitForFunction(
      () => !document.querySelector('button[type="submit"]').disabled,
      undefined,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('tabindex') === '-1' &&
        document.activeElement.contains(
          document.querySelector('[role="alert"]'),
        ),
    );
    const message = await page.evaluate(() =>
      document.querySelector('[role="alert"]').textContent.trim(),
    );
    assert.equal(message, expected);
    assert.equal(new URL(await page.url()).pathname, '/login');
    assert.equal(
      await page.evaluate(
        ({ email, password }) =>
          document.querySelector('#email').value === email &&
          document.querySelector('#password').value === password,
        config.credentials,
      ),
      true,
    );
    const session = JSON.parse(
      (await page.fetch('/api/auth/get-session')).body,
    );
    const loginStatuses = await page.evaluate(() => window.__loginStatuses);
    if (failure.session) {
      assert.equal(
        loginStatuses.at(-1),
        200,
        'Session faults must follow real successful login',
      );
      assert.equal(session.user.email, config.credentials.email);
      assert.equal(
        (
          await page.fetch('/api/auth/sign-out', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
        ).status,
        200,
      );
      assert.equal(
        JSON.parse((await page.fetch('/api/auth/get-session')).body),
        null,
      );
    } else assert.equal(session, null);
    checks.push({
      scenario: failure.name,
      injection: 'browser fetch boundary',
      message,
      loginStatuses,
    });
  }
  checks.push(await verifyLoginFeedbackFocus(page, config));
  return checks;
}

export async function verifyIdentitySession(page, config, checks = []) {
  const sql = (statement) => identitySql(config, statement);
  const signIn = async () => {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.focus('loc=role:button[name="登录"]');
    await page.keyboard.press('Enter');
    await page.waitForURL(`${config.origin}/admin`);
    await page.waitForSelector('loc=role:button[name="退出登录"]');
  };
  const post = (password) =>
    page.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: config.credentials.email, password }),
    });
  await page.goto(`${config.origin}/login`);
  await page.waitForSelector('#email');
  let limited;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await post('incorrect-password');
    if (response.status === 429) {
      limited = response;
      break;
    }
    assert.equal(response.status, 401);
  }
  assert.ok(
    limited,
    'Real login attempts must reach the production rate limiter',
  );
  const retrySeconds = Number(limited.headers['x-retry-after']);
  assert.ok(retrySeconds > 0 && retrySeconds <= 10);
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.focus('loc=role:button[name="登录"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes('HTTP 429'),
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('button[type="submit"]').disabled,
    ),
    true,
  );
  const disabledAt = Date.now();
  await page.waitForFunction(
    () => !document.querySelector('button[type="submit"]').disabled,
    undefined,
    { timeout: 15000 },
  );
  assert.ok(
    Date.now() - disabledAt >= (retrySeconds - 1) * 1000,
    'UI must honor the actual retry window',
  );
  checks.push({
    check:
      'Real HTTP 429 feedback disables login until the retry header window expires',
    retrySeconds,
  });
  await signIn();

  const day = 86400000;
  const now = Date.now();
  await sql(
    `UPDATE session SET created_at = ${now - day - 60000}, updated_at = ${now - day - 60000}, expires_at = ${now + 6 * day - 60000}`,
  );
  const cookieExpiry = async () =>
    (
      await page.cdp('Network.getCookies', { urls: [config.origin] })
    ).cookies.find((cookie) => cookie.name === 'ariso.session_token')?.expires;
  const beforeExpiry = await cookieExpiry();
  assert.ok(beforeExpiry > 0);
  // Wait for the next cookie expiry second; this makes a new Set-Cookie observable.
  await page.waitForFunction(
    (expiry) => Date.now() / 1000 > expiry - 7 * 86400 + 1,
    beforeExpiry,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const deadline = Date.now() + 10000;
  let renewed;
  while (Date.now() < deadline) {
    [renewed] = await sql('SELECT updated_at, expires_at FROM session');
    if (renewed?.updated_at >= now) break;
    await delay(50);
  }
  assert.ok(
    renewed.updated_at >= now,
    'The visible page focus check must renew the real session',
  );
  assert.ok(renewed.expires_at >= now + 7 * day - 1000);
  const afterExpiry = await cookieExpiry();
  assert.ok(
    afterExpiry > beforeExpiry,
    'The browser must accept the renewed HttpOnly cookie',
  );
  checks.push({
    check:
      'Aged real session renews on window focus and browser cookie expiry advances',
    beforeExpiry,
    afterExpiry,
  });

  await sql(`UPDATE session SET expires_at = ${Date.now() - 1}`);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector('#email');
  const expiredUrl = new URL(await page.url());
  assert.equal(expiredUrl.pathname, '/login');
  assert.equal(expiredUrl.searchParams.get('reason'), 'expired');
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes('失效'),
  );
  checks.push({
    check:
      'Expired real session redirects from the visible admin page to the expiry notice',
  });
  await signIn();

  await sql(
    "CREATE TRIGGER reject_browser_logout BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'injected browser logout deletion failure'); END",
  );
  try {
    await page.focus('loc=role:button[name="退出登录"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() =>
      document
        .querySelector('[role="alert"]')
        ?.textContent.includes('退出失败（HTTP 500）'),
    );
    assert.equal(new URL(await page.url()).pathname, '/admin');
    assert.equal(
      JSON.parse((await page.fetch('/api/auth/get-session')).body).user.email,
      config.credentials.email,
    );
    await page.evaluate(() => {
      const fetch = window.fetch;
      window.__identityFocusSettled = false;
      window.fetch = async (...args) => {
        window.fetch = fetch;
        const response = await fetch(...args);
        void response
          .clone()
          .json()
          .then(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.__identityFocusSettled = true;
              });
            });
          });
        return response;
      };
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForFunction(() => window.__identityFocusSettled);
    assert.ok(
      (
        await page.evaluate(
          () => document.querySelector('[role="alert"]')?.textContent,
        )
      )?.includes('退出失败（HTTP 500）'),
      'A successful background session check must preserve the failed logout message',
    );
  } finally {
    await sql('DROP TRIGGER reject_browser_logout');
  }

  // Reorder real responses so the background check observes the deleted session
  // while the explicit logout is still awaiting its own successful response.
  await page.evaluate(() => {
    const fetch = window.fetch;
    let releaseBackground;
    const backgroundGate = new Promise((resolve) => {
      releaseBackground = resolve;
    });
    const signOutGate = new Promise((resolve) => {
      window.__identityReleaseSignOut = resolve;
    });
    window.__identityBackgroundStarted = false;
    window.__identityBackgroundSettled = false;
    window.fetch = async (...args) => {
      if (args[0] === '/api/auth/sign-out') {
        const response = await fetch(...args);
        releaseBackground();
        await signOutGate;
        return response;
      }
      if (
        args[0] === '/api/auth/get-session' &&
        !window.__identityBackgroundStarted
      ) {
        window.__identityBackgroundStarted = true;
        await backgroundGate;
        const response = await fetch(...args);
        window.__identityBackgroundSession = await response.clone().json();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.__identityBackgroundSettled = true;
          });
        });
        return response;
      }
      return fetch(...args);
    };
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForFunction(() => window.__identityBackgroundStarted);
  await page.focus('loc=role:button[name="退出登录"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__identityBackgroundSettled);
  assert.equal(
    await page.evaluate(() => window.__identityBackgroundSession),
    null,
  );
  assert.equal(
    new URL(await page.url()).pathname,
    '/admin',
    'A background empty session must not redirect while explicit logout is pending',
  );
  await page.evaluate(() => window.__identityReleaseSignOut());
  await page.waitForSelector('#email');
  assert.equal(
    new URL(await page.url()).searchParams.get('reason'),
    'signed-out',
  );
  assert.equal(
    JSON.parse((await page.fetch('/api/auth/get-session')).body),
    null,
  );
  checks.push({
    check:
      'Real SQLite logout deletion failure keeps owner signed in; window focus preserves the error; background expiry cannot override the successful retry',
  });
  return checks;
}
