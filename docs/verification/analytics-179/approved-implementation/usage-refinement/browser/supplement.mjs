const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const assert = (await import('node:assert/strict')).default;
const project = '/Users/dnslin/.codex/worktrees/issue-179-analytics-ui/ariso';
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  `file://${project}/e2e/browser-geometry.mjs`
);
const output = join(project, 'test-results/analytics-179-usage-refinement');
const task = await taskSpace(2);
const page = task.page('p2');
const report = {
  status: 'running',
  origin: 'http://ariso-179.localhost:4180',
  readOnly: true,
  layouts: [],
  checks: [],
  hover: [],
};
const savedTheme = await page.evaluate(() => localStorage.getItem('theme'));
await writeFile(
  join(output, 'supplement-state.json'),
  JSON.stringify({ savedTheme }),
);
await page.evaluate(() => localStorage.setItem('theme', 'system'));
await page.reload();
await page.waitForSelector('[data-testid="analytics-usage"]');
for (const theme of ['light', 'dark'])
  for (const width of [390, 1440]) {
    await resizeViewport(page, width);
    await setTheme(page, theme);
    await page.focus('loc=role:link[name="占用说明"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="analytics-scope-dialog"]');
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const filename = `usage-scope-normal-${theme}-${width}.png`;
    await page.screenshot({ path: join(output, filename) });
    const geom = await readGeometry(page);
    assertGeometry(geom, filename);
    const dimensions = await page.evaluate(() => {
      const d = document.querySelector(
        '[data-testid="analytics-scope-dialog"]',
      );
      const c = d.querySelector('[aria-label="关闭统计说明"]');
      return {
        width: d.getBoundingClientRect().width,
        radius: getComputedStyle(d).borderRadius,
        closeWidth: c.getBoundingClientRect().width,
        closeHeight: c.getBoundingClientRect().height,
        bodyScroll: d.querySelector('[data-slot="modal-body"]').scrollHeight,
      };
    });
    assert.equal(dimensions.width, width === 390 ? 358 : 480);
    assert.equal(dimensions.radius, '12px');
    assert.equal(dimensions.closeWidth, 44);
    assert.equal(dimensions.closeHeight, 44);
    report.layouts.push({ width, theme, filename, ...dimensions });
    const selector =
      '[data-testid="analytics-scope-dialog"] [aria-label="关闭统计说明"]';
    await page.mouse.move(4, 4);
    const before = await page.evaluate(
      (s) => ({
        background: getComputedStyle(document.querySelector(s)).backgroundColor,
        transform: getComputedStyle(document.querySelector(s)).transform,
      }),
      selector,
    );
    await page.hover(selector);
    const hover = await page.evaluate(
      (s) => ({
        background: getComputedStyle(document.querySelector(s)).backgroundColor,
        transform: getComputedStyle(document.querySelector(s)).transform,
      }),
      selector,
    );
    report.hover.push({ width, theme, before, hover });
    await page.screenshot({
      path: join(output, `usage-scope-hover-${theme}-${width}.png`),
    });
    await page.click(selector);
    await page.waitForSelector('[data-testid="analytics-scope-dialog"]', {
      state: 'hidden',
    });
    await page.waitForFunction(
      () => document.activeElement?.textContent.trim() === '占用说明',
    );
    await page.click('loc=role:link[name="占用说明"]');
    await page.waitForSelector('[data-testid="analytics-scope-dialog"]');
    await page.focus('loc=role:button[name="返回当前占用"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="analytics-scope-dialog"]', {
      state: 'hidden',
    });
    await page.waitForFunction(
      () => document.activeElement?.textContent.trim() === '占用说明',
    );
    report.checks.push(
      `${width}/${theme}: source Enter opens, 44px close pointer and return Enter close and restore source focus`,
    );
    await page.click('loc=role:link[name="占用说明"]');
    await page.waitForSelector('[data-testid="analytics-scope-dialog"]');
    await resizeViewport(page, width, 400);
    const body =
      '[data-testid="analytics-scope-dialog"] [data-slot="modal-body"]';
    await page.hover(body);
    const center = await page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, body);
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, 1000, { label: '检查占用说明末尾' });
    await page.waitForFunction((s) => {
      const b = document.querySelector(s);
      return b.scrollTop + b.clientHeight >= b.scrollHeight - 1;
    }, body);
    const short = await page.evaluate(() => {
      const d = document.querySelector(
        '[data-testid="analytics-scope-dialog"]',
      );
      const r = d.getBoundingClientRect();
      const f = d
        .querySelector('[data-slot="modal-footer"]')
        .getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        footerBottom: f.bottom,
        height: innerHeight,
      };
    });
    assert.ok(
      short.top >= 15 && short.bottom <= 385 && short.footerBottom <= 385,
    );
    await page.screenshot({
      path: join(output, `usage-scope-bottom-${theme}-${width}x400.png`),
    });
    report.checks.push(
      `${width}/${theme}: 400px body reaches end and return remains visible`,
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="analytics-scope-dialog"]', {
      state: 'hidden',
    });
  }
await page.evaluate((v) => {
  if (v === null) localStorage.removeItem('theme');
  else localStorage.setItem('theme', v);
}, savedTheme);
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await resizeViewport(page, 1440);
await page.reload();
await page.waitForSelector('[data-testid="analytics-usage"]');
report.status = 'passed';
report.themeRestored = true;
report.finishedAt = new Date().toISOString();
await writeFile(
  join(output, 'supplement.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log({
  status: report.status,
  layouts: report.layouts.length,
  checks: report.checks.length,
  themeRestored: true,
});
console.log(await page.snapshot());
