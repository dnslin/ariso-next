/* global taskSpace */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base =
  '/Users/dnslin/.codex/worktrees/issue-179-analytics-ui/ariso/docs/verification/analytics-179/prototype-v2/header-total';
const task = await taskSpace(2);
const page = task.page('p2');
const report = { status: 'running', layouts: [], checks: [] };
async function stable() {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .every((a) => a.playState !== 'running'),
  );
}
async function viewport(width, height = 844) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await stable();
}
async function screen(name, width, height = 844) {
  await viewport(width, height);
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const { x, y, width, height, bottom, right } = document
        .querySelector(selector)
        .getBoundingClientRect();
      return { x, y, width, height, bottom, right };
    };
    const header = document.querySelector('.statistics-header');
    const body = document.querySelector('.statistics-body');
    return {
      header: rect('.statistics-header'),
      identity: rect('.image-identity'),
      total: rect('.header-total'),
      close: rect('.dialog-actions'),
      bodyTotal: !!body.querySelector('.header-total,.image-total'),
      headerOverflow: header.scrollWidth > header.clientWidth,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      value: document
        .querySelector('.rolling-number')
        .getAttribute('aria-label'),
    };
  });
  assert.equal(layout.bodyTotal, false);
  assert.equal(layout.headerOverflow, false);
  assert.equal(layout.documentOverflow, false);
  assert.ok(layout.total.bottom <= layout.header.bottom);
  assert.ok(layout.close.width >= 44 && layout.close.height >= 44);
  if (width >= 768) {
    assert.ok(layout.total.x >= layout.identity.right);
    assert.ok(layout.total.right <= layout.close.x);
  } else assert.ok(layout.total.y >= layout.identity.bottom);
  await page.screenshot({ path: `${base}/${name}.png` });
  report.layouts.push({ name, width, height, ...layout });
}
try {
  await page.reload();
  await page.waitForSelector('.header-total .number-wheel');
  await page.waitForSelector('.period-chart .recharts-line-curve');
  await screen('desktop', 1440, 1080);
  await screen('mobile', 390);
  await screen('mobile-360', 360);
  await screen('tablet', 768, 1024);
  await viewport(390);
  await page.click('button[aria-label="切换深色"] >> nth=-1');
  await screen('mobile-dark', 390);
  await page.selectOption('select[aria-label="原型状态"]', 'zero');
  await stable();
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('.rolling-number').getAttribute('aria-label'),
    ),
    '0',
  );
  await screen('zero-mobile-dark', 390);
  // Freeze native transitions only in this inspection, to measure actual
  // first-entry and value-change keyframes without slowing the product.
  await page.evaluate(() => {
    window.__headerRoll = [];
    window.__headerRollCapture = (event) => {
      if (
        !event.target.classList.contains('number-wheel') ||
        event.propertyName !== 'transform'
      )
        return;
      for (const animation of event.target.getAnimations()) {
        animation.pause();
        animation.currentTime = 140;
        window.__headerRoll.push({
          animation,
          duration: animation.effect.getTiming().duration,
          easing: animation.effect.getTiming().easing,
          keyframes: animation.effect
            .getKeyframes()
            .map(({ transform }) => transform),
        });
      }
    };
    document.addEventListener('transitionrun', window.__headerRollCapture);
  });
  await page.selectOption('select[aria-label="原型状态"]', 'ready');
  await page.waitForFunction(() => window.__headerRoll.length > 0);
  report.motion = await page.evaluate(() =>
    window.__headerRoll.map(({ duration, easing, keyframes }) => ({
      duration,
      easing,
      keyframes,
    })),
  );
  for (const animation of report.motion) {
    assert.equal(animation.duration, 280);
    assert.equal(animation.easing, 'cubic-bezier(0.23, 1, 0.32, 1)');
    assert.notEqual(animation.keyframes[0], animation.keyframes.at(-1));
  }
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('.rolling-number').getAttribute('aria-label'),
    ),
    '1,248',
  );
  await page.screenshot({ path: `${base}/rolling-midpoint.png` });
  await page.evaluate(() => {
    document.removeEventListener('transitionrun', window.__headerRollCapture);
    for (const { animation } of window.__headerRoll) animation.finish();
    delete window.__headerRoll;
    delete window.__headerRollCapture;
  });
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.selectOption('select[aria-label="原型状态"]', 'zero');
  await page.selectOption('select[aria-label="原型状态"]', 'ready');
  const reduced = await page.evaluate(() => ({
    value: document.querySelector('.rolling-number').getAttribute('aria-label'),
    durations: [...document.querySelectorAll('.number-wheel')].map(
      (n) => getComputedStyle(n).transitionDuration,
    ),
    running: document
      .getAnimations()
      .filter((a) => a.effect?.target?.classList.contains('number-wheel'))
      .length,
  }));
  assert.equal(reduced.value, '1,248');
  assert.ok(reduced.durations.every((d) => d === '0s'));
  assert.equal(reduced.running, 0);
  report.reduced = reduced;
  await screen('reduced-motion-mobile', 390);
  await page.cdp('Emulation.setEmulatedMedia', { features: [] });
  for (const state of ['loading', 'error', 'missing']) {
    await page.selectOption('select[aria-label="原型状态"]', state);
    await page.waitForFunction(() => !document.querySelector('.header-total'));
  }
  await page.selectOption('select[aria-label="原型状态"]', 'stale');
  await page.waitForSelector('.header-total');
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('.rolling-number').getAttribute('aria-label'),
    ),
    '1,248',
  );
  await screen('stale-mobile', 390);
  await page.selectOption('select[aria-label="原型状态"]', 'ready');
  await screen('short-mobile', 390, 400);
  const center = await page.evaluate(() => {
    const r = document
      .querySelector('.statistics-body')
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, 2000);
  await page.waitForFunction(() => {
    const body = document.querySelector('.statistics-body');
    return body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
  });
  await screen('short-bottom', 390, 400);
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('.statistics-dialog'),
  );
  // Reopen an actual long-name record to check identity/total/close coexist.
  await viewport(1440, 1080);
  await page.focus('button[aria-label="查看沿海公路的清晨与远处的灯塔统计"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.header-total');
  await screen('long-name-desktop', 1440, 1080);
  await screen('long-name-mobile', 390);
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') ===
      '查看沿海公路的清晨与远处的灯塔统计',
  );
  report.checks.push(
    'Header-only total with desktop identity/total/close columns and mobile second row, zero and stale values, no fake numbers in loading/error/missing, native 280ms rolling transitions with full immediate accessible value, reduced-motion instant final value, both themes, long names, short viewport scrolling, Escape source focus.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error);
  report.status = 'failed';
  throw error;
} finally {
  await writeFile(
    `${base}/browser.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
}
console.log({
  status: report.status,
  layouts: report.layouts.length,
  motion: report.motion?.length,
});
