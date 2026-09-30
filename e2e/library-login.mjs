import assert from 'node:assert/strict';

/** Real UI sign-in; successive suites honor both auth endpoints' retry headers. */
export async function signInToLibrary(page, config, report) {
  const returnTo = new URL(await page.url()).searchParams.get('returnTo');
  assert.ok(returnTo, 'Library login preserves its full destination');
  await page.waitForSelector('#email');
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.evaluate(() => {
    const original = window.fetch;
    window.__libraryLoginResponses = [];
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (
        /\/api\/auth\/(sign-in\/email|get-session)(?:\?|$)/.test(response.url)
      ) {
        window.__libraryLoginResponses.push({
          path: new URL(response.url).pathname,
          status: response.status,
          retryAfter: Number(response.headers.get('x-retry-after')),
          receivedAt: Date.now(),
        });
      }
      return response;
    };
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      window.__libraryLoginResponses = [];
    });
    await page.click('loc=role:button[name="登录"]');
    await page.waitForFunction(
      () =>
        location.pathname === '/library' ||
        (window.__libraryLoginResponses?.some(
          (response) => response.status === 429,
        ) &&
          [...document.querySelectorAll('[role="alert"]')].some((alert) =>
            alert.textContent.includes('HTTP 429'),
          )),
    );
    if (new URL(await page.url()).pathname === '/library') {
      await page.waitForURL(new URL(returnTo, config.origin).href);
      await page.waitForLoadState();
      await page.waitForSelector('[data-testid="library-list"]');
      return;
    }
    const limited = await page.evaluate(() =>
      window.__libraryLoginResponses.findLast(
        (response) => response.status === 429,
      ),
    );
    assert.ok(
      limited?.retryAfter > 0 && limited.retryAfter <= 60,
      'Actual auth limiter supplies a bounded retry window',
    );
    report.loginRateLimits ??= [];
    report.loginRateLimits.push(limited);
    if (attempt === 2) break;
    await page.waitForFunction(
      (deadline) => Date.now() >= deadline,
      limited.receivedAt + limited.retryAfter * 1000,
      { timeout: limited.retryAfter * 1000 + 1000 },
    );
    await page.waitForFunction(
      () => !document.querySelector('button[type="submit"]').disabled,
    );
  }
  assert.fail(
    'Real library sign-in did not recover after the server retry windows',
  );
}
