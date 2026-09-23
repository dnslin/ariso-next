/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const task = await taskSpace(config.spaceId ?? 'EV-UI-01');
const page = task.page('p1');
const report = {
  taskSpaceId: task.spaceId,
  status: 'failed',
  layouts: [],
  checks: [],
};
console.log({ taskSpaceId: task.spaceId });
try {
  await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__uiErrors=[];window.addEventListener('error',e=>window.__uiErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__uiErrors.push(String(e.reason)));const original=console.error;console.error=(...args)=>{window.__uiErrors.push(args.map(String).join(' '));original.apply(console,args)};`,
  });
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
  await page.goto(config.origin);
  await page.waitForSelector('#theme-system:not([disabled])');
  console.log(await page.snapshot());
  report.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    lang: document.documentElement.lang,
  }));
  const html = await page.fetch('/');
  assert.ok(html.body.includes('前端依赖组合验证'), 'SSR markup');
  assert.equal(
    await page.evaluate(() => document.documentElement.className),
    'light',
  );
  await page.click('#theme-system');
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  });
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('dark'),
  );
  await page.click('#theme-light');
  assert.deepEqual(await page.evaluate(() => window.__uiErrors), []);
  await page.reload();
  await page.waitForSelector('#theme-light[aria-pressed="true"]');
  assert.equal(
    await page.evaluate(() => document.documentElement.className),
    'light',
  );
  assert.deepEqual(await page.evaluate(() => window.__uiErrors), []);
  report.checks.push(
    'SSR, hydration, system theme change, explicit preference survives reload',
  );
  await page.focus('#submit');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      document.querySelector('#probe-name').getAttribute('aria-invalid') ===
      'true',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'probe-name',
  );
  assert.ok(
    await page.evaluate(() =>
      document.body.innerText.includes('请输入至少两个字符'),
    ),
  );
  await page.fill('#probe-name', 'Ariso 验证');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      document.querySelector('#submitted').textContent === '已验证：Ariso 验证',
  );
  report.checks.push(
    'RHF invalid message, invalid field focus, keyboard submit, preserved value',
  );
  await page.click('#query-empty');
  await page.waitForFunction(
    () => document.querySelector('#query-state').textContent === '正在加载',
  );
  await page.waitForFunction(
    () => document.querySelector('#query-state').textContent === '没有记录',
  );
  await page.click('#query-error');
  await page.waitForFunction(
    () =>
      document.querySelector('#query-state').textContent ===
      '实验请求失败：HTTP 503',
  );
  await page.click('#query-success');
  await page.waitForFunction(
    () => document.querySelector('#query-state').textContent === '查询成功',
  );
  report.checks.push('Query loading, empty, HTTP error and recovery');
  await page.focus('#open-modal');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement.closest('[role="dialog"]'),
      ),
      true,
      'Modal focus containment',
    );
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  await page.waitForFunction(() => document.activeElement.id === 'open-modal');
  report.checks.push('Modal Enter/Tab containment/Escape/focus restoration');
  for (const theme of ['light', 'dark']) {
    await page.click(`#theme-${theme}`);
    await page.waitForFunction(
      (value) => document.documentElement.classList.contains(value),
      theme,
    );
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: 844,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        background: getComputedStyle(document.body).backgroundColor,
        targets: [...document.querySelectorAll('button,input')].map((el) => ({
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
        })),
      }));
      assert.equal(layout.width, width);
      assert.ok(layout.scrollWidth <= width, 'No horizontal overflow');
      assert.ok(
        layout.targets.every(
          ({ width, height }) => width >= 44 && height >= 44,
        ),
        '44px controls',
      );
      report.layouts.push({ theme, ...layout });
      await page.screenshot({ path: `${config.output}/${theme}-${width}.png` });
    }
  }
  assert.notEqual(
    report.layouts[0].background,
    report.layouts[5].background,
    'Theme CSS changes actual background',
  );
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 400,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.click('#open-modal');
  await page.waitForSelector('#modal-input');
  await page.fill('#modal-input', '短视口验证');
  await page.click('loc=role:button[name="完成"]');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  report.checks.push(
    'Short viewport modal input and close with touch emulation and reduced motion',
  );
  report.errors = await page.evaluate(() => window.__uiErrors);
  assert.deepEqual(report.errors, []);
  report.limitations = [
    'Desktop Chromium emulation is not physical touch/soft keyboard/safe-area validation',
    'No business UI, Firefox, Safari or Edge acceptance',
  ];
  const { verifyLibrary } = await import(config.libraryScript);
  await verifyLibrary(page, config);
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  throw error;
} finally {
  await writeFile(
    `${config.output}/browser.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (!config.keepSpace) await task.finish({ keep: [] });
console.log(JSON.stringify(report));
