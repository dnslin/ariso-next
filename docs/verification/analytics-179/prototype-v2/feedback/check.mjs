/* global taskSpace */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base =
  '/Users/dnslin/.codex/worktrees/issue-179-analytics-ui/ariso/docs/verification/analytics-179/prototype-v2/feedback';
const t = await taskSpace(2);
const p = t.page('p2');
const report = { status: 'running', checks: [], screens: [] };
async function stable() {
  await p.waitForFunction(
    () =>
      [...document.querySelectorAll('.recharts-surface')].every(
        (n) =>
          Math.abs(
            n.getBoundingClientRect().width -
              n.closest('.recharts-responsive-container').clientWidth,
          ) < 1,
      ) &&
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .every((a) => a.playState !== 'running'),
  );
}
async function screen(name, width, height = 844) {
  await p.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await stable();
  await p.waitForFunction(
    (h) =>
      !document.querySelector('.statistics-dialog') ||
      document.querySelector('.statistics-dialog').getBoundingClientRect()
        .bottom <=
        h - 15,
    height,
  );
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.screenshot({ path: base + '/' + name + '.png' });
  report.screens.push({ name, width, height });
}
try {
  await p.reload();
  await p.waitForSelector('.period-chart .recharts-line-curve');
  await stable();
  assert.equal(
    await p.evaluate(
      () =>
        document.querySelector('.numbers') !== null ||
        document.body.textContent.includes('查看数值与范围'),
    ),
    false,
  );
  assert.equal(
    await p.evaluate(
      () =>
        getComputedStyle(document.querySelector('.statistics-dialog'))
          .borderRadius,
    ),
    '14px',
  );
  assert.equal(
    await p.evaluate(() =>
      document.querySelector('.period-chart').getAttribute('aria-label'),
    ),
    '近7天186次，近30天624次，近90天1032次',
  );
  assert.equal(
    await p.evaluate(
      () => document.querySelectorAll('.period-chart .recharts-bar').length,
    ),
    0,
  );
  assert.equal(
    await p.evaluate(
      () => document.querySelectorAll('.period-chart .recharts-dot').length,
    ),
    3,
  );
  await screen('statistics-desktop', 1440, 1080);
  await screen('statistics-mobile', 390);
  await p.click('.statistics-footer button[aria-label="切换深色"]');
  await screen('statistics-mobile-dark', 390);
  await p.click('.statistics-footer button[aria-label="切换浅色"]');
  await p.selectOption('select[aria-label="原型状态"]', 'zero');
  await stable();
  assert.equal(
    await p.evaluate(() =>
      document.querySelector('.period-chart').getAttribute('aria-label'),
    ),
    '近7天0次，近30天0次，近90天0次',
  );
  const zeros = await p.evaluate(() =>
    [...document.querySelectorAll('.period-chart .recharts-dot')].map((n) =>
      n.getAttribute('cy'),
    ),
  );
  assert.equal(new Set(zeros).size, 1);
  await screen('zero-mobile', 390);
  await p.selectOption('select[aria-label="原型状态"]', 'ready');
  await screen('short-mobile', 390, 400);
  await p.evaluate(() => {
    const b = document.querySelector('.statistics-body');
    b.scrollTop = b.scrollHeight;
  });
  await screen('short-bottom', 390, 400);
  assert.ok(
    await p.evaluate(
      () =>
        document.querySelector('.period-chart').getBoundingClientRect()
          .bottom <=
        document.querySelector('.statistics-footer').getBoundingClientRect()
          .top +
          1,
    ),
  );
  await screen('hover-desktop', 1440, 1080);
  const close = '.statistics-dialog button[aria-label="关闭图片统计"]';
  await p.hover(close);
  await stable();
  const hover = await p.evaluate(() => {
    const n = document.querySelector(
      '.statistics-dialog button[aria-label="关闭图片统计"]',
    );
    const s = getComputedStyle(n);
    return {
      radius: s.borderRadius,
      background: s.backgroundColor,
      transform: s.transform,
    };
  });
  assert.equal(hover.radius, '8px');
  assert.equal(hover.background, 'rgba(0, 0, 0, 0)');
  await p.mouse.down();
  assert.deepEqual(
    await p.evaluate(() => {
      const transform = getComputedStyle(
        document.querySelector(
          '.statistics-dialog button[aria-label="关闭图片统计"]',
        ),
      ).transform;
      const matrix = new DOMMatrixReadOnly(
        transform === 'none' ? undefined : transform,
      );
      return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
    }),
    [1, 0, 0, 1, 0, 0],
  );
  await p.mouse.up();
  await p.waitForSelector('[role="dialog"]', { state: 'hidden' });
  assert.equal(
    await p.evaluate(() =>
      document.querySelector('.ranking-list').textContent.includes('已删除'),
    ),
    false,
  );
  assert.equal(
    await p.evaluate(() => document.querySelectorAll('.rank-row').length),
    10,
  );
  await screen('ranking-desktop', 1440, 1080);
  await screen('ranking-mobile', 390);
  await p.click('button[aria-label="查看沿海公路的清晨与远处的灯塔统计"]');
  await p.keyboard.press('Escape');
  await p.waitForSelector('[role="dialog"]', { state: 'hidden' });
  assert.equal(
    await p.evaluate(() => document.activeElement.getAttribute('aria-label')),
    '查看沿海公路的清晨与远处的灯塔统计',
  );
  report.checks.push(
    'Line with three labelled period totals, no accordion, zero points align, 14px dialog/8px close, transparent hover, no pressed scale, short viewport scroll, ten synthetic existing ranking entries, Escape focus',
  );
  report.status = 'passed';
  await p.click('button[aria-label="查看林间晨光统计"]');
  await screen('final-desktop', 1440, 1080);
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack ?? error);
  console.log(await p.snapshot());
  throw error;
} finally {
  await writeFile(
    base + '/browser.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(report);
}
