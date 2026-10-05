import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyPassword } from 'better-auth/crypto';
import { identitySql } from './identity-session.mjs';
import { observeAccountLogin } from './account-transport.mjs';

async function loginRetryWindow(report, width, limited, source, attempt) {
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
    width,
    ...limited,
  });
  assert.ok(attempt < 3, `${source} did not recover after three real attempts`);
  await delay(
    Math.max(0, limited.receivedAt + limited.retryAfter * 1000 - Date.now()),
  );
}
export async function accountRequest(
  page,
  report,
  width,
  path,
  method = 'GET',
  body,
) {
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
      width,
      attempt,
      status: response.status,
      code: payload?.code,
    });
    if (path !== '/api/auth/sign-in/email' || response.status !== 429)
      return { status: response.status, payload };
    await loginRetryWindow(
      report,
      width,
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
export async function assertPersistedPassword(config, password) {
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
export async function independentAccountSession(
  config,
  report,
  credentials,
  width,
  registerSecret,
) {
  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(`${config.origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: config.origin },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
      signal: AbortSignal.timeout(10000),
    });
    report.requests.push({
      path: '/api/auth/sign-in/email',
      method: 'POST',
      source: 'independent-cookie',
      width,
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
    await loginRetryWindow(
      report,
      width,
      limited,
      'independent-cookie',
      attempt,
    );
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
  registerSecret(cookie);
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
export async function accountSignIn(page, config, report, credentials, width) {
  const { email, password } = credentials;
  const route = `${config.origin}/settings/account`;
  const current = new URL(await page.url());
  if (
    current.origin !== config.origin ||
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
    const observer = await observeAccountLogin(page);
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
        await observer.reset();
        await page.focus('loc=role:button[name="登录"]');
        await page.keyboard.press('Enter');
        await page.waitForFunction(
          () =>
            location.pathname === '/settings/account' ||
            (window.__accountFault?.observed.responses.some(
              (response) => response.status >= 400,
            ) &&
              [...document.querySelectorAll('[role="alert"]')].some((alert) =>
                alert.textContent.includes('HTTP'),
              )),
        );
        if (new URL(await page.url()).pathname === '/settings/account') break;
        const limited = await observer.lastFailure();
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
        await loginRetryWindow(report, width, limited, 'login-ui', attempt);
        await page.waitForFunction(
          () => !document.querySelector('button[type="submit"]').disabled,
        );
        assert.equal(
          await page.evaluate(
            ({ email, password }) =>
              document.querySelector('#email')?.value === email &&
              document.querySelector('#password')?.value === password,
            { email, password },
          ),
          true,
          'Actual login limiting preserves entered credentials',
        );
      }
      await page.waitForURL(new URL(returnTo, config.origin).href);
    } finally {
      await observer.dispose();
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
