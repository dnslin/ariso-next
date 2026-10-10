/* global taskSpace */
const { mkdir, writeFile } = await import('node:fs/promises');
const assert = (await import('node:assert/strict')).default;
const output =
  '/Users/dnslin/.codex/worktrees/issue-179-analytics-ui/ariso/docs/verification/analytics-179/prototype-v2';
await mkdir(output, { recursive: true });
const t = await taskSpace(2);
const p = t.page('p2');
const report = {
  status: 'running',
  kind: 'Isolated prototype with synthetic samples; no product API verification',
  layouts: [],
  checks: [],
};
const injected = await p.cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__v2Errors=[];for(const key of ['error','warn']){const original=console[key].bind(console);console[key]=(...args)=>{window.__v2Errors.push({type:key,text:args.map(String).join(' ')});original(...args)}};window.addEventListener('error',e=>window.__v2Errors.push({type:'error',text:e.message}));`,
});
async function size(width, height = 844) {
  await p.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await p.waitForFunction(
    ({ w, h }) =>
      innerWidth === w &&
      innerHeight === h &&
      (!document.querySelector('.statistics-dialog') ||
        document.querySelector('.statistics-dialog').getBoundingClientRect()
          .bottom <=
          h - 15),
    { w: width, h: height },
  );
  await p.waitForFunction(() =>
    [...document.querySelectorAll('.recharts-surface')].every(
      (n) =>
        Math.abs(
          n.getBoundingClientRect().width -
            n.closest('.recharts-responsive-container').clientWidth,
        ) < 1,
    ),
  );
}
async function capture(name, width, height) {
  await size(width, height);
  await p.waitForFunction(() =>
    [...document.images].every((img) => img.complete),
  );
  await p.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .every((a) => a.playState !== 'running'),
  );
  const geometry = await p.evaluate(() => {
    const d = document.querySelector('.statistics-dialog');
    const r = d?.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      dialog: r ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom } : null,
      tableCount: document.querySelectorAll('[role="dialog"] table').length,
      images: [...document.querySelectorAll('[role="dialog"] img')].map(
        (n) => ({
          width: n.getBoundingClientRect().width,
          height: n.getBoundingClientRect().height,
        }),
      ),
      targets: [
        ...document.querySelectorAll(
          '[role="dialog"] button,[role="dialog"] select',
        ),
      ]
        .filter((n) => n.getBoundingClientRect().width > 0)
        .map((n) => ({
          label: n.getAttribute('aria-label') || n.textContent,
          width: n.getBoundingClientRect().width,
          height: n.getBoundingClientRect().height,
        })),
    };
  });
  assert.equal(geometry.documentOverflow, false);
  if (geometry.dialog) {
    assert.ok(geometry.dialog.x >= 15 && geometry.dialog.right <= width - 15);
    assert.ok(geometry.dialog.y >= 15 && geometry.dialog.bottom <= height - 15);
    assert.equal(geometry.tableCount, 0);
    assert.ok(geometry.images.every((i) => i.width <= 64 && i.height <= 64));
    assert.ok(
      geometry.targets.every((b) => b.width >= 43 && b.height >= 43),
      JSON.stringify(geometry.targets),
    );
  }
  await p.screenshot({ path: `${output}/${name}.png` });
  report.layouts.push({ name, width, height, ...geometry });
}
try {
  await p.reload();
  await p.waitForSelector('.period-chart .recharts-bar-rectangle');
  for (const w of [360, 390, 430, 768, 1440])
    await size(w, w === 1440 ? 1080 : 844);
  await capture('statistics-desktop', 1440, 1080);
  await capture('statistics-mobile', 390, 844);
  await p.click('.statistics-footer button[aria-label="切换深色"]');
  await p.waitForFunction(() =>
    document.documentElement.classList.contains('dark'),
  );
  await capture('statistics-mobile-dark', 390, 844);
  await p.click('.statistics-footer button[aria-label="切换浅色"]');
  await p.click('.image-total button[aria-label="统计口径"]');
  await p.waitForSelector('.info-popover');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.info-popover', { state: 'hidden' });
  await p.click('loc=role:button[name="查看数值与范围"]');
  await p.waitForSelector('.numbers dl');
  assert.ok(
    (
      await p.evaluate(() => document.querySelector('.numbers dl').textContent)
    ).includes('1032'),
  );
  await p.click('loc=role:button[name="查看数值与范围"]');
  for (const state of [
    'zero',
    'loading',
    'error',
    'stale',
    'delay',
    'incomplete',
    'missing',
  ]) {
    await p.selectOption('select[aria-label="原型状态"]', state);
    await p.waitForFunction(
      (s) =>
        document.querySelector('select[aria-label="原型状态"]').value === s,
      state,
    );
    if (['error', 'loading', 'missing'].includes(state))
      assert.ok(
        (
          await p.evaluate(
            () => document.querySelector('.statistics-footer').textContent,
          )
        ).includes('尚未取得统计'),
      );
    if (state === 'zero') {
      assert.equal(
        await p.evaluate(
          () => document.querySelector('.image-total strong').textContent,
        ),
        '0次',
      );
      await capture('statistics-zero-mobile', 390, 844);
      assert.ok(
        await p.evaluate(() =>
          [...document.querySelectorAll('.version-fill')].every((n) =>
            getComputedStyle(n).transform.startsWith('matrix(0,'),
          ),
        ),
      );
    }
    if (state === 'error') {
      await capture('statistics-error-mobile', 390, 844);
      await p.click('loc=role:button[name="重试"]');
      await p.waitForSelector('.version-row');
    }
  }
  await p.selectOption('select[aria-label="原型状态"]', 'ready');
  await capture('statistics-short-mobile', 390, 400);
  await p.click('loc=role:button[name="查看数值与范围"]');
  await p.waitForSelector('.numbers dl');
  await p.waitForFunction(() =>
    document
      .querySelector('.numbers')
      .getAnimations({ subtree: true })
      .every((a) => a.playState !== 'running'),
  );
  await p.evaluate(() => {
    const b = document.querySelector('.statistics-body');
    b.scrollTop = b.scrollHeight;
  });
  assert.ok(
    await p.evaluate(
      () =>
        document.querySelector('.numbers dl').getBoundingClientRect().bottom <=
        document.querySelector('.statistics-footer').getBoundingClientRect()
          .top +
          1,
    ),
  );
  await p.keyboard.press('Escape');
  await p.waitForSelector('[role="dialog"][aria-label="图片访问统计"]', {
    state: 'hidden',
  });
  await capture('ranking-desktop', 1440, 1080);
  await capture('ranking-mobile', 390, 844);
  await p.click('button[aria-label="查看沿海公路的清晨与远处的灯塔统计"]');
  await p.waitForSelector('[role="dialog"][aria-label="图片访问统计"]');
  await p.keyboard.press('Escape');
  await p.waitForSelector('[role="dialog"][aria-label="图片访问统计"]', {
    state: 'hidden',
  });
  assert.equal(
    await p.evaluate(() => document.activeElement.getAttribute('aria-label')),
    '查看沿海公路的清晨与远处的灯塔统计',
  );
  report.checks.push(
    'Thumbnail-only dialog; no preview/version/download controls; keyboard Escape restores ranking trigger focus.',
  );
  await p.click('loc=role:tab[name="处理异常"]');
  await p.waitForSelector('.failure-card');
  await capture('failures-mobile', 390, 844);
  await capture('failures-desktop', 1440, 1080);
  await p.click('loc=role:radio[name*="重新处理"]');
  await p.waitForFunction(
    () => document.querySelectorAll('.failure-card').length === 1,
  );
  await p.click('loc=role:button[name="重试"]');
  await p.waitForFunction(() =>
    document.querySelector('.failure-card').textContent.includes('已提交'),
  );
  report.checks.push(
    'Two failure filters, sample retry stays in place; synthetic actions only.',
  );
  await p.cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.ok(
    await p.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  );
  await p.cdp('Emulation.setEmulatedMedia', { features: [] });
  report.browserErrors = await p.evaluate(() => window.__v2Errors);
  assert.deepEqual(report.browserErrors, []);
  report.checks.push(
    'Popover/Accordion, eight sample states, responsive widths, short-body scroll, themes, reduced-motion query.',
  );
  report.status = 'passed';
  await p.click('loc=role:tab[name="访问统计"]');
  await p.click('button[aria-label="查看林间晨光统计"]');
  await size(1440, 1080);
} catch (e) {
  report.status = 'failed';
  report.error = String(e.stack ?? e);
  console.log(await p.snapshot());
  throw e;
} finally {
  await p.cdp('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: injected.identifier,
  });
  await writeFile(
    `${output}/browser.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      status: report.status,
      layouts: report.layouts.length,
      error: report.error,
    }),
  );
}
