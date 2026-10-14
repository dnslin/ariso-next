/* global taskSpace */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = '/Volumes/data/project/ariso';
const { spaceId } = JSON.parse(
  await readFile(resolve(root, '.data/uiux-p2-prototype/browser.json'), 'utf8'),
);
const task = await taskSpace(spaceId);
const page = task.page('p1');
const origin = 'http://127.0.0.1:61514';
const output = resolve(
  root,
  'design-plans/uiux-review-20261013/p2-prototype/evidence',
);
await mkdir(output, { recursive: true });
const report = { status: 'running', spaceId, checks: [], screenshots: [] };

async function open(
  path,
  width,
  mode = 'after',
  height = width >= 1200 ? 1080 : 844,
) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  const url = new URL(path, origin);
  url.searchParams.set('frame', '1');
  url.searchParams.set('mode', mode);
  await page.goto(url.href);
  await page.waitForSelector('h1');
}
async function shot(name) {
  await page.screenshot({ path: `${output}/${name}.png` });
  report.screenshots.push(`${name}.png`);
}
async function verify(name, run) {
  await run();
  assert.deepEqual(
    await page.evaluate(() => window.__prototypeErrors ?? []),
    [],
    `${name}: browser errors`,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => new URL(entry.name).pathname.startsWith('/api/'))
        .map((entry) => entry.name),
    ),
    [],
    `${name}: product API calls`,
  );
  assert.equal(
    await page.evaluate(() => document.body.scrollWidth > innerWidth + 1),
    false,
    `${name}: horizontal overflow`,
  );
  report.checks.push(name);
  console.log(`PASS ${name}`);
}

try {
  for (const width of [1440, 390]) {
    await verify(`F05-share-${width}`, async () => {
      await open('/shares/forest?flow=share', width);
      await shot(`f05-share-${width}`);
      await page.click('loc=role:button[name="已停用"]');
      assert.equal(
        await page.evaluate(
          () =>
            [...document.querySelectorAll('button')].find((button) =>
              button.textContent?.includes('查看分享'),
            )?.disabled,
        ),
        true,
      );
      await page.click('loc=role:button[name="地址待核对"]');
      assert.equal(
        await page.evaluate(
          () =>
            [...document.querySelectorAll('button')].find((button) =>
              button.textContent?.includes('查看分享'),
            )?.disabled,
        ),
        true,
      );
      await page.click('loc=role:button[name="分享中 · 地址已确认"]');
      assert.equal(
        await page.evaluate(
          () =>
            [...document.querySelectorAll('button')].find((button) =>
              button.textContent?.includes('查看分享'),
            )?.disabled,
        ),
        false,
      );
      if (width === 1440) {
        await page.click('label[data-slot="switch-content"]');
        for (const saved of [false, true]) {
          if (saved) await page.click('loc=role:button[name="保存展示"]');
          await page.click('loc=role:button[name="查看分享"]');
          const popup = (await task.tabs()).find(
            (tab) => tab.label && tab.label !== page.label,
          );
          assert.ok(popup?.label);
          const guest = task.page(popup.label);
          await guest.waitForSelector('input[type="password"]');
          await guest.fill('input[type="password"]', '123456');
          await guest.click('loc=role:button[name="查看图片"]');
          const guestView = await guest.snapshot();
          assert.equal(
            guestView.includes('林间光影.jpg'),
            !saved,
            'guest view must use saved display settings',
          );
          await guest.close();
        }
      }
    });

    await verify(`F06-picker-${width}`, async () => {
      await open('/albums/forest?flow=picker', width);
      await page.click('loc=role:button[name="从图库添加"]');
      await page.click('loc=role:button[name="选择图片：林间光影.jpg"]');
      await page.click('loc=role:button[name="下一页"]');
      await page.click('loc=role:button[name="已选 1 张 · 查看与移除"]');
      assert.match(await page.snapshot(), /移除已选图片：林间光影.jpg/);
      await shot(`f06-picked-${width}`);
      await page.click('loc=role:button[name="移除已选图片：林间光影.jpg"]');
      await page.click('loc=role:button[name="选择图片：海边日落.jpg"]');
      await page.click('loc=role:button[name="添加 1 张"]');
      assert.match(await page.snapshot(), /已添加 1 张图片/);
    });

    await verify(`F07-zone-${width}`, async () => {
      await open('/settings/general?flow=zone', width);
      await page.fill('input[role="combobox"]', 'Tokyo');
      await page.click('loc=role:option[name="Asia/Tokyo"]');
      await page.click('loc=role:button[name="保存站点"]');
      assert.match(await page.snapshot(), /已保存：.*Asia\/Tokyo/s);
      await shot(`f07-zone-${width}`);
    });

    await verify(`F08-reset-${width}`, async () => {
      await open('/reset-password?flow=reset', width);
      assert.match(await page.snapshot(), /重置结果待确认/);
      await shot(`f08-reset-${width}`);
      await page.click('loc=role:button[name="重新申请链接"]');
      await page.fill('input[type="email"]', 'owner@example.com');
      await page.click('loc=role:button[name="发送重置邮件（演示）"]');
      assert.match(await page.snapshot(), /已接受请求/);
    });

    await verify(`F09-compare-${width}`, async () => {
      await open('/settings/processing?flow=compare', width);
      await page.click('loc=role:button[name="原图 默认外链版本"]');
      await page.click('loc=role:option[name="压缩图"]');
      await page.click('loc=role:button[name="模拟保存响应丢失"]');
      await page.click('loc=role:button[name="核对已保存设置"]');
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('table tbody tr')].map(
          (row) => row.textContent,
        ),
      );
      assert.ok(
        rows.some((row) => row.includes('原图') && row.includes('压缩图')),
      );
      assert.ok(
        rows.every(
          (row) => !row.includes('original') && !row.includes('compressed'),
        ),
      );
      await shot(`f09-difference-${width}`);
      await page.click('loc=role:button[name="采用已保存值"]');
      assert.match(await page.snapshot(), /原图 默认外链版本/);
    });

    await verify(`F10-recovery-${width}`, async () => {
      await open('/forgot-password?flow=recovery', width);
      await shot(`f10-recovery-${width}`);
      await page.fill('input[type="email"]', 'owner@example.com');
      await page.click('loc=role:button[name="发送重置邮件"]');
      assert.match(await page.snapshot(), /已接受请求/);
    });

    await verify(`F11-search-${width}`, async () => {
      await open('/library?flow=search', width);
      await page.fill('loc=role:searchbox[name="搜索图片名称"]', '林间');
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('p[class*="text-[13px]"]')
            ?.textContent?.trim(),
        ),
        '6 条图片',
      );
      await page.click('loc=role:button[name="搜索图库图片"]');
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('p[class*="text-[13px]"]')
            ?.textContent?.trim(),
        ),
        '1 条图片',
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector('input[type="search"]')?.value,
        ),
        '林间',
      );
      await shot(`f11-search-${width}`);
      await page.click('loc=role:button[name="清除搜索"]');
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('p[class*="text-[13px]"]')
            ?.textContent?.trim(),
        ),
        '6 条图片',
      );
      await page.click('loc=role:button[name="回收站"]');
      await page.fill('loc=role:searchbox[name="搜索回收图片名称"]', '海边');
      await page.press('loc=role:searchbox[name="搜索回收图片名称"]', 'Enter');
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('p[class*="text-[13px]"]')
            ?.textContent?.trim(),
        ),
        '1 条记录',
      );
    });

    await verify(`F12-trash-${width}`, async () => {
      await open('/trash?flow=trash', width);
      const positions = await page.evaluate(() => {
        const toolbar = document.querySelector(
          '[data-testid="search-toolbar"]',
        );
        return {
          input: toolbar
            .querySelector('input')
            ?.getBoundingClientRect()
            .toJSON(),
          search: toolbar
            .querySelector('button[aria-label="搜索回收图片"]')
            ?.getBoundingClientRect()
            .toJSON(),
          select: toolbar
            .querySelector('button[aria-label="选择记录"]')
            ?.getBoundingClientRect()
            .toJSON(),
        };
      });
      assert.ok(positions.input && positions.search && positions.select);
      assert.ok(positions.select.height >= 44);
      if (width === 390)
        assert.ok(Math.abs(positions.input.y - positions.select.y) < 8);
      await shot(`f12-toolbar-${width}`);
      await page.click('loc=role:button[name="选择记录"]');
      await page.click('loc=role:button[name="选择记录：林间光影.jpg"]');
      assert.match(
        await page.evaluate(
          () => document.querySelector('[role="status"]')?.textContent ?? '',
        ),
        /已选\s*1\s*条/,
      );
      await shot(`f12-selected-${width}`);
      await page.click('loc=role:button[name="永久删除"]');
      assert.match(
        await page.evaluate(
          () =>
            document.querySelector('[role="dialog"] h2')?.textContent ??
            document.querySelector('[role="dialog"]')?.textContent ??
            '',
        ),
        /永久删除\s*1\s*条记录/,
      );
      await page.click('loc=role:button[name="取消"]');
    });

    await verify(`trash-delete-${width}`, async () => {
      await open('/trash?flow=cleanup', width);
      await page.click('loc=role:button[name="永久删除所选"]');
      await page.waitForFunction(
        () => {
          const backdrop = document.querySelector(
            '[data-slot="alert-dialog-backdrop"]',
          );
          return backdrop && Number(getComputedStyle(backdrop).opacity) > 0.99;
        },
        undefined,
        { timeout: 5000 },
      );
      assert.ok(
        await page.evaluate(
          () =>
            !!document.querySelector('[role="alertdialog"]') &&
            !!document.querySelector('section h1') &&
            document.querySelector('section h1')?.textContent === '回收站',
        ),
      );
      await shot(`trash-delete-confirm-${width}`);
      await page.click('loc=role:button[name="删除"]');
      await page.waitForSelector('[data-testid="trash-batch"]');
      assert.deepEqual(
        await page.evaluate(() => ({
          returns: [
            ...document.querySelectorAll('[data-testid="trash-batch-done"]'),
          ].map((button) => button.textContent.trim()),
          collapsed: [
            ...document.querySelectorAll(
              '[data-testid="trash-batch-item-details"] details',
            ),
          ].every((details) => !details.open),
        })),
        { returns: ['返回'], collapsed: true },
      );
      await shot(`trash-delete-result-${width}`);
      if (width === 390)
        await page.click('loc=css:[data-testid="trash-batch-item-trigger"]');
      await page.click(
        width === 390
          ? 'loc=css:[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-details"] summary'
          : 'loc=css:[data-testid="trash-batch-table"] [data-testid="trash-batch-item-details"] summary',
      );
      assert.match(await page.snapshot(), /demo-cleanup-sample-19-20261013/);
      await page.click('loc=role:button[name="返回"]');
      assert.match(await page.snapshot(), /回收站/);
    });
  }

  await verify('F10-short-before-after', async () => {
    await open('/forgot-password?flow=recovery', 1024, 'before', 600);
    const oldBottom = await page.evaluate(
      () =>
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent?.includes('返回登录'))
          ?.getBoundingClientRect().bottom,
    );
    assert.ok(oldBottom > 600);
    await shot('f10-short-before-1024x600');
    await open('/forgot-password?flow=recovery', 1024, 'after', 600);
    const newBottom = await page.evaluate(
      () =>
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent?.includes('返回登录'))
          ?.getBoundingClientRect().bottom,
    );
    assert.ok(newBottom <= 600);
    await shot('f10-short-after-1024x600');
  });

  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      screenshots: report.screenshots.length,
    }),
  );
}
