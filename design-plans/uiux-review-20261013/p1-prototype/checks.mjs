/* global taskSpace */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectDirectory = '/Volumes/data/project/ariso';
const { spaceId } = JSON.parse(
  await readFile(
    resolve(projectDirectory, '.data/uiux-p1-prototype/browser.json'),
    'utf8',
  ),
);
const page = (await taskSpace(spaceId)).page('p1');
const origin = 'http://127.0.0.1:61513';
const output = resolve(
  projectDirectory,
  'design-plans/uiux-review-20261013/p1-prototype/evidence',
);
await mkdir(output, { recursive: true });
const report = { status: 'running', checks: [], screenshots: [] };
const quality = '[data-field="quality"] input[type="text"]';
const settle = () =>
  page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.effect?.getTiming().duration === 'auto' ||
          animation.effect?.getTiming().iterations === Infinity ||
          animation.playState === 'finished',
      ),
  );
async function screenshot(name) {
  await settle();
  await page.screenshot({ path: `${output}/${name}.png` });
  report.screenshots.push(`${name}.png`);
}
async function open(path, width, mode = 'after', scenario = 'normal') {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height: width >= 1200 ? 1080 : 844,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  const url = new URL(path, origin);
  url.searchParams.set('frame', '1');
  url.searchParams.set('mode', mode);
  url.searchParams.set('scenario', scenario);
  await page.goto(url.href);
  await page.waitForSelector('main h1');
}
async function category(label, width) {
  if (width >= 1200) await page.click(`loc=role:tab[name="${label}"]`);
  else {
    await page.click('.settings-mobile button');
    await page.click(`loc=role:option[name="${label}"]`);
  }
}
async function check(name, run) {
  await run();
  const errors = await page.evaluate(() => window.__prototypeErrors ?? []);
  assert.deepEqual(errors, [], `${name}: browser errors`);
  const api = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).pathname.startsWith('/api/'))
      .map((entry) => entry.name),
  );
  assert.deepEqual(api, [], `${name}: prototype must not call product APIs`);
  report.checks.push(name);
  console.log(`PASS ${name}`);
}
try {
  for (const width of [1440, 390]) {
    await check(`F01-processing-confirm-${width}`, async () => {
      await open('/settings/processing?demo=edit', width);
      await page.waitForSelector(quality);
      await page.fill(quality, '73');
      await page.press(quality, 'Tab');
      await category('邮件服务', width);
      await page.waitForSelector('loc=role:dialog[name="放弃未保存的修改?"]');
      await screenshot(`edit-confirm-${width}`);
      await page.click('loc=role:button[name="继续编辑"]');
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
      );
      assert.equal(
        await page.evaluate(
          (selector) => document.querySelector(selector).value,
          quality,
        ),
        '73',
      );
      assert.equal(
        await page.evaluate(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          quality,
        ),
        true,
      );
      await category('邮件服务', width);
      await page.waitForSelector('loc=role:dialog[name="放弃未保存的修改?"]');
      await page.click('loc=role:button[name="放弃修改"]');
      await page.waitForSelector('#smtp-host');
      await category('图片处理', width);
      await page.waitForSelector(quality);
      assert.equal(
        await page.evaluate(
          (selector) => document.querySelector(selector).value,
          quality,
        ),
        '82',
      );
    });
    await check(`F01-smtp-save-${width}`, async () => {
      await category('邮件服务', width);
      await page.waitForSelector('#smtp-host');
      await page.fill('#smtp-host', 'smtp.photos.example');
      await category('基本设置', width);
      await page.waitForSelector('loc=role:dialog[name="放弃未保存的修改?"]');
      await page.click('loc=role:button[name="继续编辑"]');
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
      );
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        'smtp-host',
      );
      await page.click('loc=role:button[name="保存"]');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="prototype-settings"]')?.dataset
            .dirty === 'false',
      );
      await category('基本设置', width);
      await category('邮件服务', width);
      await page.waitForSelector('#smtp-host');
      assert.equal(
        await page.evaluate(() => document.querySelector('#smtp-host').value),
        'smtp.photos.example',
      );
      await screenshot(`edit-smtp-${width}`);
    });
    await check(`F02-query-position-${width}`, async () => {
      await open('/albums?demo=return&q=旅行&page=2&pageSize=20', width);
      await page.waitForSelector('[data-testid="prototype-albums-list"]');
      const source = await page.evaluate(() => {
        const main = document.querySelector('main');
        main.scrollTop = 550;
        const box = main.getBoundingClientRect();
        const target = [
          ...document.querySelectorAll('[id^="album-open-"]'),
        ].find((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= box.top && rect.bottom <= box.bottom;
        });
        return { top: main.scrollTop, id: target?.id };
      });
      assert.ok(source.id);
      await page.click(`#${source.id}`);
      await page.waitForSelector('button[aria-label="分享设置"]');
      await page.click('button[aria-label="分享设置"]');
      await page.waitForSelector('button[aria-label="返回相册"]');
      await page.click('button[aria-label="返回相册"]');
      await page.waitForSelector('button[aria-label="分享设置"]');
      await page.click('loc=role:button[name="返回"]');
      await page.waitForSelector('[data-testid="prototype-albums-list"]');
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
      await screenshot(`return-restored-${width}`);
      await page.click(`#${source.id}`);
      await page.waitForSelector('button[aria-label="分享设置"]');
      await page.evaluate(() => history.back());
      await page.waitForFunction(
        (id) => document.activeElement.id === id,
        source.id,
      );
      assert.equal(
        await page.evaluate(() => document.querySelector('main').scrollTop),
        source.top,
      );
    });
    await check(`F03-summary-and-freeze-${width}`, async () => {
      await open('/upload?demo=upload', width);
      await page.waitForSelector('[data-testid="upload-queue"]');
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll('[data-testid="upload-item"]').length,
        ),
        12,
      );
      if (width < 768) {
        assert.equal(
          await page.evaluate(() => {
            const rect = document
              .querySelector('[data-testid="upload-draft-summary"]')
              .getBoundingClientRect();
            return rect.top > 0 && rect.bottom < innerHeight - 70;
          }),
          true,
        );
        await screenshot(`upload-summary-${width}`);
        await page.click('button[aria-label="修改上传设置"]');
        await page.waitForFunction(() =>
          document
            .querySelector('[data-testid="upload-settings"]')
            .contains(document.activeElement),
        );
      } else {
        assert.equal(
          await page.evaluate(
            () =>
              getComputedStyle(
                document.querySelector('[data-testid="upload-draft-summary"]'),
              ).display,
          ),
          'none',
        );
        await screenshot(`upload-layout-${width}`);
      }
      await page.click(
        '[data-testid="upload-settings"] button[aria-label="可见性"]',
      );
      await page.click('loc=role:option[name="公开"]');
      await page.click('[data-testid="upload-start"]');
      await page.waitForSelector('[data-testid="upload-frozen-submission"]');
      const frozen = await page.evaluate(
        () =>
          document.querySelector('[data-testid="upload-frozen-submission"]')
            .innerText,
      );
      assert.ok(frozen.includes('公开'));
      await page.click(
        '[data-testid="upload-settings"] button[aria-label="可见性"]',
      );
      await page.click('loc=role:option[name="私有"]');
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="upload-frozen-submission"]')
              .innerText,
        ),
        frozen,
      );
      if (width < 768)
        assert.ok(
          (
            await page.evaluate(
              () =>
                document.querySelector('[data-testid="upload-draft-primary"]')
                  .innerText,
            )
          ).includes('私有'),
        );
      await screenshot(`upload-frozen-${width}`);
    });
    await check(`F04-object-navigation-${width}`, async () => {
      await open(
        '/settings/storage/archive?view=references&demo=storage',
        width,
      );
      await page.waitForSelector('[data-testid="reference-demo"]');
      await screenshot(`references-${width}`);
      await page.click('loc=role:link[name="查看图库"]');
      await page.waitForSelector('[data-testid="storage-object-list"]');
      assert.equal(
        await page.evaluate(() =>
          new URLSearchParams(location.search).get('storageId'),
        ),
        'archive',
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelectorAll('button[aria-label^="查看图片："]')
              .length,
        ),
        4,
      );
      await page.click('loc=role:button[name="返回"]');
      await page.waitForSelector('[data-testid="reference-demo"]');
      await page.click('loc=role:button[name="查看处理中的图片（2）"]');
      await page.waitForSelector(
        'button[aria-label="查看任务图片：雨后森林.jpg"]',
      );
      await page.click('button[aria-label="查看任务图片：雨后森林.jpg"]');
      await page.waitForSelector('loc=role:dialog[name="图片详情"]');
      const detail = await page.evaluate(
        () => document.querySelector('[role="dialog"]').innerText,
      );
      assert.ok(
        detail.includes('已就绪') &&
          detail.includes('重处理') &&
          detail.includes('摄影归档'),
      );
      await screenshot(`references-reprocess-${width}`);
      await page.click('loc=role:button[name="返回图库"]');
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
      );
      await page.click('loc=role:button[name="返回"]');
      await page.waitForSelector('[data-testid="reference-demo"]');
      await page.click('loc=role:link[name="查看删除清理"]');
      await page.waitForSelector('loc=role:dialog[name="回收记录"]');
      assert.equal(await page.evaluate(() => location.pathname), '/trash');
      assert.ok(
        (
          await page.evaluate(
            () => document.querySelector('[role="dialog"]').innerText,
          )
        ).includes('清理失败'),
      );
    });
  }
  await check('F01-pending-and-unknown-navigation', async () => {
    for (const scenario of ['slow', 'unknown']) {
      await open('/settings/processing?demo=edit', 1440, 'after', scenario);
      await page.fill(quality, '74');
      await page.press(quality, 'Tab');
      await page.click('loc=role:button[name="保存"]');
      if (scenario === 'unknown')
        await page.waitForFunction(() =>
          document.body.innerText.includes('操作结果待核对'),
        );
      await category('邮件服务', 1440);
      await page.waitForSelector('#smtp-host');
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll('[role="dialog"]').length,
        ),
        0,
      );
    }
  });
  await check('F01-before-discards-edits', async () => {
    await open('/settings/processing?demo=edit', 1440, 'before');
    await page.fill(quality, '73');
    await page.press(quality, 'Tab');
    await category('邮件服务', 1440);
    await page.waitForSelector('#smtp-host');
    await category('图片处理', 1440);
    await page.waitForSelector(quality);
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector).value,
        quality,
      ),
      '82',
    );
  });
  await check('F03-before-mobile-settings-after-queue', async () => {
    await open('/upload?demo=upload', 390, 'before');
    await page.waitForSelector('[data-testid="upload-queue"]');
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="upload-draft-summary"]'),
      ),
      null,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector('[data-testid="upload-settings"]')
            .getBoundingClientRect().top > innerHeight,
      ),
      true,
    );
    await screenshot('upload-before-390');
  });
  await check('F04-before-unfiltered-destination', async () => {
    await open(
      '/settings/storage/archive?view=references&demo=storage',
      390,
      'before',
    );
    await page.click('loc=role:link[name="前往回收站"]');
    await page.waitForSelector('[data-testid="storage-object-list"]');
    assert.equal(await page.evaluate(() => location.pathname), '/trash');
    assert.equal(
      await page.evaluate(() =>
        new URLSearchParams(location.search).get('storageId'),
      ),
      null,
    );
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  await page
    .screenshot({ path: `${output}/check-failure.png` })
    .catch(() => {});
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify(report, null, 2));
}
