/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { installBrowserErrors, assertNoBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(
  config.spaceId ?? 'Ariso production browser smoke',
);
console.log({ taskSpaceId: task.spaceId });
const page = task.page('p1');
const report = { taskSpaceId: task.spaceId, status: 'failed', layouts: [] };
let errorScript;
async function verifyHome() {
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme }],
    });
    await page.waitForFunction(
      (value) => document.documentElement.classList.contains(value),
      theme,
    );
    await page.evaluate(() => document.fonts.ready);
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: 844,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      const state = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        background: getComputedStyle(document.body).backgroundColor,
        font: document.fonts.check('112px Caveat'),
      }));
      assert.equal(state.width, width);
      assert.ok(state.scrollWidth <= width);
      assert.ok(state.font);
      assert.equal(
        state.background,
        theme === 'dark' ? 'rgb(24, 26, 34)' : 'rgb(255, 255, 254)',
      );
      await page.screenshot({
        path: join(config.output, `home-${theme}-${width}.png`),
      });
    }
  }
  await page.goto(`${config.origin}/missing-shell-page`);
  await page.waitForSelector('loc=role:link[name="返回首页"]');
  console.log(await page.snapshot());
  await page.focus('loc=role:link[name="返回首页"]');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${config.origin}/`);
  await page.waitForSelector('#home-heading');
}
try {
  errorScript = await installBrowserErrors(page);
  await page.goto(config.origin);
  await page.waitForSelector('#home-heading');
  await assertNoBrowserErrors(page);
  const marker = `Ariso error collector self-test ${Date.now()}`;
  const expectedError = {
    url: await page.evaluate(() => location.href),
    kind: 'console.error',
    message: marker,
  };
  await page.evaluate((message) => console.error(message), marker);
  await page.goto(`${config.origin}/missing-shell-page`);
  await page.waitForSelector('loc=role:link[name="返回首页"]');
  await assert.rejects(
    () => assertNoBrowserErrors(page),
    (error) => {
      assert.deepEqual(error.actual, [expectedError]);
      return true;
    },
  );
  report.errorCollectorSelfTest = { status: 'passed', expectedError };
  await page.goto(config.origin);
  await page.waitForSelector('loc=css:#home-heading', { state: 'visible' });
  await page.waitForFunction(
    () => [...document.images].every((image) => image.complete),
    undefined,
    { timeout: 15000 },
  );
  report.page = await page.evaluate(() => ({
    title: document.title,
    userAgent: navigator.userAgent,
    lang: document.documentElement.lang,
    text: document.body.innerText,
    images: [...document.images].map((image) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
  }));
  assert.equal(report.page.title, 'Ariso');
  assert.equal(report.page.lang, 'zh-CN');
  assert.ok(report.page.text.includes('轻装简从'));
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          'a[href="/login"],a[href="/upload"],a[href="/library"]',
        ).length,
    ),
    0,
  );
  assert.ok(report.page.text.includes('账号初始化、登录和图片上传尚未开放。'));
  assert.deepEqual(report.page.images, []);
  const home = await page.fetch('/');
  assert.equal(home.status, 200);
  report.homeStatus = home.status;
  report.privateFixtures = [];
  for (const path of [
    '/verification/fixtures/sample.jpg',
    '/verification/fixtures/sample.png',
    '/sample.jpg',
    '/sample.png',
  ]) {
    const response = await page.fetch(path);
    assert.equal(response.status, 404, path);
    report.privateFixtures.push({ path, status: response.status });
  }
  const health = await page.fetch('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(health.body), { status: 'ok' });
  report.health = {
    status: health.status,
    cacheControl: health.headers['cache-control'],
    body: health.body,
  };
  const resources = await page.evaluate(() =>
    [...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(
      (element) => element.src || element.href,
    ),
  );
  assert.ok(
    resources.some(
      (url) => url.includes('/_next/static/') && url.includes('.js'),
    ),
  );
  report.resources = [];
  for (const url of ['/runtime.svg', ...resources]) {
    const response = await page.fetch(url);
    assert.equal(response.status, 200, url);
    assert.ok(response.body.length > 0, url);
    if (url === '/runtime.svg')
      assert.ok(response.headers['content-type'].includes('image/svg+xml'));
    report.resources.push({
      url,
      status: response.status,
      contentType: response.headers['content-type'],
    });
  }
  for (const width of [390, 1440]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.waitForFunction((expected) => innerWidth === expected, width, {
      timeout: 5000,
    });
    const layout = await page.evaluate(() => {
      const heading = document.querySelector('#home-heading');
      const rect = heading.getBoundingClientRect();
      const style = getComputedStyle(heading);
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        headingVisible:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          style.visibility === 'visible' &&
          style.display !== 'none',
      };
    });
    assert.equal(layout.width, width);
    assert.ok(layout.scrollWidth <= width, 'Horizontal overflow');
    assert.equal(layout.headingVisible, true);
    report.layouts.push(layout);
    await page.screenshot({
      path: join(config.output, `viewport-${width}.png`),
    });
  }
  await verifyHome();
  report.errors = await assertNoBrowserErrors(page);
  await (await import(config.shellScript)).verifyShell(page, config);
  await assertNoBrowserErrors(page);
  report.recovery = await (
    await import(config.recoveryScript)
  ).verifyErrorRecovery(page, config);
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  throw error;
} finally {
  await writeFile(
    join(config.output, 'browser.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
}
if (!config.keepSpace) await task.finish({ keep: [] });
console.log(report);
