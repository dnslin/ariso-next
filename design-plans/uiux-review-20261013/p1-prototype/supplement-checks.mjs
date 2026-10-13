/* global taskSpace */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const page = (await taskSpace(24)).page('p1');
const origin = 'http://127.0.0.1:61513';
const output =
  '/Volumes/data/project/ariso/design-plans/uiux-review-20261013/p1-prototype/evidence';
const report = { status: 'running', checks: [] };
const sizes = (width) => ({
  width,
  height: width >= 1200 ? 1080 : 844,
  deviceScaleFactor: 1,
  mobile: width < 768,
});
async function open(path, width) {
  await page.cdp('Emulation.setDeviceMetricsOverride', sizes(width));
  await page.goto(`${origin}${path}`);
}
async function verify(name) {
  const errors = await page.evaluate(() => window.__prototypeErrors ?? []);
  assert.deepEqual(errors, []);
  const api = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => new URL(e.name).pathname.startsWith('/api/'))
      .map((e) => e.name),
  );
  assert.deepEqual(api, []);
  report.checks.push(name);
  console.log(`PASS ${name}`);
}
try {
  for (const width of [1440, 390]) {
    await open(
      '/shares?demo=return&q=旅行&page=2&pageSize=20&frame=1&mode=after',
      width,
    );
    await page.waitForSelector(
      width < 768
        ? '[id^="share-settings-"][id$="-mobile"]'
        : '[id^="share-settings-"]:not([id$="-mobile"])',
    );
    const source = await page.evaluate(() => {
      const main = document.querySelector('main');
      main.scrollTop = 500;
      const box = main.getBoundingClientRect();
      const target = [
        ...document.querySelectorAll('[id^="share-settings-"]'),
      ].find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.top >= box.top && r.bottom <= box.bottom;
      });
      return { top: main.scrollTop, id: target?.id };
    });
    assert.ok(source.id);
    await page.click(`#${source.id}`);
    await page.waitForSelector('[aria-label="返回分享列表"]');
    await page.click('[role="radio"]:text-is("瀑布流")');
    await page.click('[aria-label="保存访客展示"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="保存访客展示"]')?.disabled ===
          true &&
        document.querySelector('main')?.textContent.includes('已保存'),
    );
    await page.click('[aria-label="返回分享列表"]');
    await page.waitForFunction(
      (id) => document.activeElement.id === id,
      source.id,
    );
    const result = await page.evaluate(() => ({
      q: new URLSearchParams(location.search).get('q'),
      page: new URLSearchParams(location.search).get('page'),
      size: new URLSearchParams(location.search).get('pageSize'),
      top: document.querySelector('main').scrollTop,
    }));
    assert.deepEqual(result, {
      q: '旅行',
      page: '2',
      size: '20',
      top: source.top,
    });
    await verify(`F02-share-list-return-${width}`);
  }
  for (const width of [360, 768]) {
    for (const [demo, path] of [
      ['edit', '/settings/processing'],
      ['return', '/albums'],
      ['upload', '/upload'],
      ['storage', '/settings/storage/archive?view=references'],
    ]) {
      const url = new URL(path, origin);
      url.searchParams.set('demo', demo);
      url.searchParams.set('frame', '1');
      url.searchParams.set('mode', 'after');
      await open(`${url.pathname}${url.search}`, width);
      await page.waitForSelector('main h1');
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll('html,body,main')]
          .map((e) => ({
            tag: e.tagName,
            extra: e.scrollWidth - e.clientWidth,
          }))
          .filter((e) => e.extra > 1),
      );
      assert.deepEqual(overflow, [], `${demo} ${width} horizontal overflow`);
      await verify(`responsive-${demo}-${width}`);
    }
  }
  await open('/settings/processing', 1440);
  await page.waitForSelector('iframe[data-prototype-frame]');
  for (const [label, path] of [
    ['编辑保护', '/settings/processing'],
    ['返回位置', '/albums'],
    ['上传设置', '/upload'],
    ['引用跳转', '/settings/storage/archive'],
  ]) {
    await page.click(`loc=role:button[name="${label}"]`);
    await page.waitForFunction((path) => {
      const frame = document.querySelector('iframe[data-prototype-frame]');
      return (
        frame?.contentWindow?.location.pathname === path &&
        frame.contentDocument.querySelector('main h1')
      );
    }, path);
    await page.click('loc=role:button[name="手机预览"]');
    await page.waitForFunction(
      () =>
        document
          .querySelector('iframe[data-prototype-frame]')
          .getBoundingClientRect().width === 390,
    );
    await page.click('loc=role:button[name="现状"]');
    await page.waitForFunction(
      () =>
        new URL(
          document.querySelector('iframe[data-prototype-frame]').src,
        ).searchParams.get('mode') === 'before',
    );
    await page.click('loc=role:button[name="优化方案"]');
    await page.waitForFunction(
      () =>
        new URL(
          document.querySelector('iframe[data-prototype-frame]').src,
        ).searchParams.get('mode') === 'after',
    );
    await page.click('loc=role:button[name="桌面预览"]');
    const frameErrors = await page.evaluate(
      () =>
        document.querySelector('iframe[data-prototype-frame]').contentWindow
          .__prototypeErrors ?? [],
    );
    assert.deepEqual(frameErrors, []);
    await verify(`harness-${label}`);
  }
  await page.click('loc=role:button[name="编辑保护"]');
  await page.waitForFunction(() =>
    document
      .querySelector('iframe[data-prototype-frame]')
      ?.contentDocument.querySelector('[data-field="quality"]'),
  );
  await page.screenshot({ path: `${output}/prototype-harness.png` });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await writeFile(
    `${output}/supplement-checks.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
