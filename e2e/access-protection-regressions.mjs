import assert from 'node:assert/strict';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const settingsPath = '/settings/general/access-protection';
const rateInput = '[data-protection-field="rate"] input[type="text"]';
const ready = '[data-testid="access-protection-settings"][data-state="ready"]';

/** Extra acceptance probes honor the existing auth limiter; never retry writes. */
export async function retrySessionRead(read, report) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await read();
    if (response.status !== 429 || attempt === 2) return response;
    const seconds = Number(response.headers.get('x-retry-after'));
    assert.ok(
      seconds > 0 && seconds <= 60,
      'Auth read supplies a bounded retry window',
    );
    report.authReadRateLimits ??= [];
    report.authReadRateLimits.push({ retryAfter: seconds });
    await response.arrayBuffer();
    await delay(seconds * 1000);
  }
}

export async function readBrowserSession(page, report) {
  const response = await retrySessionRead(async () => {
    const result = await page.fetch('/api/auth/get-session');
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  }, report);
  assert.equal(response.status, 200);
  return response.json();
}

async function expireAndSignIn(page, config) {
  const response = await page.fetch('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector('[data-state="expired"]');
  await page.click('loc=role:link[name="重新登录"]');
  await page.waitForSelector('#email');
  assert.equal(
    new URL(await page.url()).searchParams.get('returnTo'),
    settingsPath,
  );
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.click('loc=role:button[name="登录"]');
  await page.waitForURL(`${config.origin}${settingsPath}`);
  await page.waitForSelector(ready);
}

export async function verifyDraftRecovery(page, config, owner, report) {
  report.stage = 'settings-draft-login-recovery';
  await page.fill(rateInput, '27');
  await page.press(rateInput, 'Tab');
  await expireAndSignIn(page, config);
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).value,
      rateInput,
    ),
    '27',
  );
  assert.equal(
    (await owner('/api/settings/access-protection')).rate,
    10,
    'Login recovery does not submit the draft',
  );
  await page.screenshot({
    path: join(config.output, 'access-draft-restored.png'),
  });
  await page.click('loc=role:button[name="返回基本设置"]');
  await page.waitForSelector('[role="dialog"][aria-label="放弃未保存的修改?"]');
  await page.click('loc=role:button[name="放弃修改"]');
  await page.waitForURL(`${config.origin}/settings/general`);
  await page.click(`a[href="${settingsPath}"]`);
  await page.waitForSelector(ready);
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).value,
      rateInput,
    ),
    '10',
  );
  report.checks.push({
    scenario: 'draft-survives-real-login-and-explicit-discard-clears-it',
    passed: true,
  });

  report.stage = 'settings-uncertain-save-login-recovery';
  await page.fill(rateInput, '29');
  await page.press(rateInput, 'Tab');
  // The server really commits the PATCH. Only its successful reply is dropped.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (
        String(input) === '/api/settings/access-protection' &&
        init?.method === 'PATCH' &&
        response.ok
      )
        throw new Error('QA: deliberately lost successful settings response');
      return response;
    };
  });
  await page.click('[data-testid="access-protection-save"]');
  await page.waitForSelector('[data-state="unknown"]');
  const committed = await owner('/api/settings/access-protection');
  assert.equal(committed.rate, 29);
  await expireAndSignIn(page, config);
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).value,
      rateInput,
    ),
    '29',
  );
  const reconciled = await owner('/api/settings/access-protection');
  assert.equal(
    reconciled.updatedAt,
    committed.updatedAt,
    'Fresh login GET reconciles without replaying PATCH',
  );
  await page.screenshot({
    path: join(config.output, 'access-uncertain-reconciled.png'),
  });
  await page.click('loc=role:button[name="使用建议值"]');
  await page.click('[data-testid="access-protection-save"]');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="access-protection-settings"]')
        ?.dataset.state === 'ready' &&
      document.querySelector('input[name="rate"]')?.value === '10',
  );
  assert.equal((await owner('/api/settings/access-protection')).rate, 10);
  report.checks.push({
    scenario: 'uncertain-save-reconciles-after-real-login-without-replay',
    passed: true,
  });
}

export async function verifyLoadedShare(page, config, owner, report) {
  report.stage = 'loaded-share-background-rate-limit';
  const policy = (mode, rate = 10, burst = 200) =>
    owner('/api/settings/access-protection', 'PATCH', { mode, rate, burst });
  await policy('off');
  await policy('enforce');
  await page.goto(`${config.origin}/s/image/${config.imageShareToken}`);
  await page.cdp('Page.bringToFront');
  await page.waitForFunction(() => !document.hidden);
  await page.waitForFunction(() => {
    const image = document.querySelector('img[alt="临时分享的图片"]');
    return image?.complete && image.naturalWidth > 0;
  });
  await policy('enforce', 1, 1);
  const spent = await page.evaluate(async () => {
    const image = document.querySelector('img[alt="临时分享的图片"]');
    window.__accessLoadedImage = image;
    window.__accessBackgroundChecks = [];
    window.__accessOriginalFetch = window.fetch;
    const media = new URL(image.src).pathname;
    const getCount = () =>
      performance
        .getEntriesByType('resource')
        .filter(
          (entry) =>
            entry.initiatorType === 'img' &&
            new URL(entry.name).pathname === media,
        ).length;
    window.__accessImageGetCount = getCount();
    window.fetch = async (input, init) => {
      const response = await window.__accessOriginalFetch(input, init);
      if (String(input) === media && init?.method === 'HEAD')
        window.__accessBackgroundChecks.push({
          status: response.status,
          retryAt:
            Date.now() +
            Number(response.headers.get('retry-after') ?? 0) * 1000,
        });
      return response;
    };
    const statuses = await Promise.all(
      Array.from(
        { length: 8 },
        async () =>
          (
            await window.__accessOriginalFetch(media, {
              method: 'HEAD',
              cache: 'no-store',
            })
          ).status,
      ),
    );
    document.dispatchEvent(new Event('visibilitychange'));
    return statuses;
  });
  assert.ok(spent.includes(429), 'The real anonymous quota was exhausted');
  await page.waitForFunction(() =>
    window.__accessBackgroundChecks.some((result) => result.status === 429),
  );
  const retained = await page.evaluate(() => {
    const image = document.querySelector('img[alt="临时分享的图片"]');
    const media = new URL(window.__accessLoadedImage.src).pathname;
    return {
      sameNode: image === window.__accessLoadedImage,
      decoded: !!image?.complete && image.naturalWidth > 0,
      extraImageGets:
        performance
          .getEntriesByType('resource')
          .filter(
            (entry) =>
              entry.initiatorType === 'img' &&
              new URL(entry.name).pathname === media,
          ).length - window.__accessImageGetCount,
    };
  });
  assert.deepEqual(retained, {
    sameNode: true,
    decoded: true,
    extraImageGets: 0,
  });
  await page.screenshot({
    path: join(config.output, 'access-loaded-share-retained.png'),
  });
  await page.waitForFunction(
    () =>
      Date.now() >=
      Math.max(
        ...window.__accessBackgroundChecks.map((entry) => entry.retryAt),
      ),
  );
  await policy('off');
  await owner(`/api/images/${config.privateImageId}/share`, 'DELETE');
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('分享已失效') &&
      !document.querySelector('img[alt="临时分享的图片"]'),
  );
  await page.evaluate(() => {
    window.fetch = window.__accessOriginalFetch;
  });
  await policy('observe');
  report.checks.push({
    scenario:
      'background-429-retains-loaded-share-without-redownload-and-revocation-still-removes-it',
    ...retained,
    passed: true,
  });
}
