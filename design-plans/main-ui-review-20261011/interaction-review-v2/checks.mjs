import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const origin = 'http://127.0.0.1:61511';
const output = fileURLToPath(new URL('./evidence/', import.meta.url));
const sample = fileURLToPath(
  new URL('../../issue179-review-v2/public/sample-photo.jpg', import.meta.url),
);
const button = (name, scope = '') =>
  `css:${scope ? `${scope} ` : ''}button:text-is("${name}")`;
const menuItem = (name) => `css:[role="menuitem"]:text-is("${name}")`;

export async function runChecks(task, options = {}) {
  const page = task.page('p1');
  const results = [];
  const names = options.names ? new Set(options.names) : null;
  await mkdir(output, { recursive: true });
  async function viewport(width = 1440, height = 900) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
  async function text(selector = 'body') {
    return page.evaluate(
      (value) => document.querySelector(value)?.textContent ?? '',
      selector,
    );
  }
  async function count(selector) {
    return page.evaluate(
      (value) => document.querySelectorAll(value).length,
      selector,
    );
  }
  async function gone(selector) {
    await page.waitForFunction(
      (value) => !document.querySelector(value),
      selector,
      { timeout: 10000 },
    );
  }
  async function waitText(selector, expected) {
    await page.waitForFunction(
      ({ selector, expected }) =>
        document.querySelector(selector)?.textContent.includes(expected),
      { selector, expected },
      { timeout: 10000 },
    );
  }
  async function goto(route, scenario = 'sample') {
    const url = new URL(route, origin);
    url.searchParams.set('scenario', scenario);
    url.searchParams.set('frame', '1');
    await page.goto(url.href);
    await page.waitForSelector('main h1');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('main img')].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
  }
  async function selected(name) {
    await page.click(`css:label:has(input[aria-label="选择 ${name}"])`);
  }
  async function rightClick(name) {
    await page.click(`css:button[aria-label="查看 ${name}"]`, {
      button: 'right',
    });
    await page.waitForSelector('[role="menu"]');
    return page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
    );
  }
  async function more() {
    await page.click('css:button[aria-label="更多图片操作"]');
    await page.waitForSelector('[role="menu"]');
  }
  async function chooseAdd(name) {
    await page.click('css:button[aria-label="添加图片"]');
    await page.waitForSelector('[role="menu"][aria-label="添加图片方式"]');
    await page.click(menuItem(name));
  }
  async function nav(route) {
    await page.click(`css:aside a[href="${route}"]`);
    await page.waitForFunction(
      (value) => window.location.pathname === value,
      route,
    );
    await page.waitForSelector('main h1');
  }
  async function run(name, fn) {
    if (names && !names.has(name)) return;
    try {
      await viewport();
      await fn();
      const errors = await page.evaluate(() => window.__prototypeErrors ?? []);
      assert.deepEqual(errors, []);
      results.push({ name, status: 'passed' });
      console.log(`PASS ${name}`);
    } catch (error) {
      await page.screenshot({ path: `${output}failed-${name}.png` });
      results.push({ name, status: 'failed', error: error.message });
      await writeFile(
        `${output}workflow-results.json`,
        JSON.stringify(results, null, 2),
      );
      throw error;
    }
  }

  await run('conditional-context', async () => {
    await goto('/library');
    assert.equal(await count('main button[aria-label="上传"]'), 0);
    const publicItems = await rightClick('群山之间.jpg');
    assert.ok(!publicItems.includes('设为公开'));
    assert.ok(publicItems.includes('设为私有'));
    assert.ok(!publicItems.includes('从相册移出'));
    await page.keyboard.press('Escape');
    await gone('[role="menu"]');
    const privateItems = await rightClick('森林小路.jpg');
    assert.ok(privateItems.includes('设为公开'));
    assert.ok(!privateItems.includes('设为私有'));
    assert.ok(!privateItems.includes('从相册移出'));
    assert.ok(!privateItems.some((name) => /清空|全选|已选清单/.test(name)));
    await page.keyboard.press('Escape');
  });
  await run('selection-manager', async () => {
    await goto('/library');
    await selected('林间清晨.jpg');
    await page.click('css:button[aria-label="管理选择，已选 1 张"]');
    await page.waitForSelector('[role="dialog"][aria-label="选择管理"]');
    await page.waitForFunction(
      () => !document.querySelector('[data-entering]'),
    );
    await page.click('css:button[aria-label="全选已加载"]');
    await page.waitForSelector('button[aria-label="管理选择，已选 6 张"]');
    assert.equal(await count('ul[aria-label="已选清单"] li'), 6);
    await page.waitForFunction(() => document.activeElement?.tagName === 'H2');
    await page.keyboard.press('Escape');
    await gone('[role="dialog"][aria-label="选择管理"]');
    await more();
    const items = await page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.textContent.trim(),
      ),
    );
    assert.ok(
      !items.some((name) =>
        /复制链接|添加标签|添加到相册|清空|全选/.test(name),
      ),
    );
    await page.keyboard.press('Escape');
    await gone('[role="menu"]');
    await page.click('css:button[aria-label="管理选择，已选 6 张"]');
    await page.click('css:button[aria-label="清空全部选择"]');
    await gone('button[aria-label^="管理选择"]');
  });
  await run('tag-duplicate-and-retry', async () => {
    await goto('/library', 'attention');
    await selected('林间清晨.jpg');
    await page.click('css:button[aria-label="添加标签"]');
    await page.waitForSelector('[data-testid="tag-drawer"]');
    await page.fill('css:input[aria-label="新标签名称"]', ' fellow ');
    await page.click('css:button[aria-label="创建标签"]');
    await waitText('[data-testid="tag-drawer"]', '已有同名标签');
    assert.ok(
      !/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(
        await text('[data-testid="tag-drawer"]'),
      ),
    );
    await page.click('css:label:has(input[aria-label="风景"])');
    await page.click(button('添加', '[data-testid="tag-drawer"]'));
    await waitText('[data-testid="tag-drawer"] [role="alert"]', '操作失败');
    assert.equal(
      await count(
        '[data-testid="tag-drawer"] input[aria-label="风景"]:checked',
      ),
      1,
    );
    assert.equal(await count('button[aria-label="管理选择，已选 1 张"]'), 1);
    await page.click(button('添加', '[data-testid="tag-drawer"]'));
    await gone('[data-testid="tag-drawer"]');
    await waitText('body', '标签已更新');
  });
  await run('album-picker-and-retry', async () => {
    await goto('/albums/empty', 'attention');
    await chooseAdd('从图库选择');
    await page.waitForSelector('[role="dialog"]');
    await page.click(
      'css:[role="dialog"] button[aria-label="选择 林间清晨.jpg"]',
    );
    await page.click(button('添加', '[role="dialog"]'));
    await waitText('[role="dialog"] [role="alert"]', '已保留选择');
    await page.click(button('重试', '[role="dialog"]'));
    await gone('[role="dialog"]');
    await page.waitForSelector('main article[data-photo-id="forest"]');
    assert.equal(await count('main article[data-photo-id]'), 1);
  });
  await run('album-upload-and-draft', async () => {
    await goto('/albums/forest', 'attention');
    await chooseAdd('上传新图片');
    await page.waitForSelector('[data-testid="upload-dropzone"]');
    assert.ok((await page.url()).includes('albumId=forest'));
    assert.equal(await count('[role="dialog"]'), 0);
    await page.setInputFiles('css:[data-testid="upload-input"]', [sample]);
    await waitText('main', 'sample-photo.jpg');
    await nav('/upload');
    assert.ok(!(await text('main')).includes('sample-photo.jpg'));
    await nav('/albums');
    await page.click('css:button[aria-label="打开相册 林间日记"]');
    await chooseAdd('上传新图片');
    await page.waitForSelector('[data-testid="upload-dropzone"]');
    await waitText('main', 'sample-photo.jpg');
    await page.click(button('开始上传'));
    await waitText('main', '上传失败');
    await page.click(button('重试上传'));
    await page.waitForSelector('css:button:text-is("返回相册")');
    await page.click(button('返回相册'));
    await waitText('main h1', '林间日记');
    assert.equal(await count('main article[data-photo-id]'), 4);
    assert.ok((await text('main')).includes('sample-photo.jpg'));
  });
  await run('album-context-and-header', async () => {
    await goto('/albums');
    await page.click('css:button[aria-label="打开相册 林间日记"]', {
      button: 'right',
    });
    await page.waitForSelector('[role="menu"]');
    assert.ok((await text('[role="menu"]')).includes('分享设置'));
    await page.click(menuItem('打开相册'));
    await waitText('main h1', '林间日记');
    const positions = await page.evaluate(() => {
      const title = document.querySelector('main h1').getBoundingClientRect();
      const back = [...document.querySelectorAll('main header button')]
        .find((el) => el.textContent.includes('返回'))
        .getBoundingClientRect();
      const add = document
        .querySelector('button[aria-label="添加图片"]')
        .getBoundingClientRect();
      return {
        title: title.y + title.height / 2,
        back: back.y + back.height / 2,
        add: add.y,
      };
    });
    assert.ok(Math.abs(positions.title - positions.back) < 5);
    assert.ok(positions.add > positions.title + 35);
    await page.click('css:button[aria-label="分享设置"]');
    await page.waitForSelector('[data-testid="prototype-share-editor"]');
    assert.equal(await count('[role="dialog"]'), 0);
    assert.ok(!(await text('main')).includes('尚未创建分享'));
  });
  await run('share-explicit-create-and-retry', async () => {
    await goto('/shares/forest?from=album', 'attention');
    await page.waitForSelector('[data-testid="prototype-share-editor"]');
    assert.equal(await count('input[aria-label="分享地址"]'), 0);
    await page.click('[data-testid="prototype-share-save"]');
    await waitText('main [role="alert"]', '创建失败');
    await page.click('[data-testid="prototype-share-save"]');
    await waitText('main', '分享中');
    await page.click(button('预览'));
    await page.waitForSelector('[role="dialog"][aria-label="分享预览"]');
    await page.click('css:button[aria-label="关闭预览"]');
    await gone('[role="dialog"]');
    await page.click(button('返回', 'main header'));
    await waitText('main h1', '林间日记');
  });
  await run('trash-toast-and-partial-retry', async () => {
    await goto('/library', 'attention');
    await selected('林间清晨.jpg');
    await selected('远山与湖.jpg');
    await more();
    await page.click(menuItem('移入回收站'));
    await page.waitForSelector('[role="dialog"]');
    await page.click(button('确认', '[role="dialog"]'));
    await waitText('[role="dialog"] [role="alert"]', '1 张操作失败');
    assert.equal(await count('button[aria-label="管理选择，已选 1 张"]'), 1);
    await page.click(button('重试', '[role="dialog"]'));
    await gone('[role="dialog"]');
    await waitText('body', '已移入回收站 1 张');
    assert.equal(await count('main article[data-photo-id]'), 4);
    await nav('/trash');
    await page.waitForSelector('main article[data-photo-id="forest"]');
    const items = await rightClick('林间清晨.jpg');
    assert.deepEqual(items, ['查看图片', '恢复图片', '永久删除']);
    await page.click(menuItem('恢复图片'));
    await page.waitForSelector('[role="dialog"] [role="alert"]');
    await page.click(button('重试', '[role="dialog"]'));
    await gone('[role="dialog"]');
    await waitText('body', '已恢复 1 张');
    await gone('main article[data-photo-id="forest"]');
  });
  await run('deleting-records-not-reported-restored', async () => {
    await goto('/trash');
    await selected('湖面倒影.jpg');
    await page.click('css:button[aria-label="永久删除"]');
    await page.waitForSelector('[role="dialog"]');
    assert.equal(await count('main article[data-photo-id="old-lake"] img'), 1);
    await page.click(button('永久删除', '[role="dialog"]'));
    await gone('[role="dialog"]');
    await waitText('main article[data-photo-id="old-lake"]', '删除中');
    await selected('湖面倒影.jpg');
    await selected('旧日森林.jpg');
    await page.click('css:button[aria-label="恢复图片"]');
    await waitText('body', '已恢复 1 张；1 张正在删除');
    assert.equal(await count('button[aria-label="管理选择，已选 1 张"]'), 1);
    assert.equal(await count('main article[data-photo-id="old-lake"]'), 1);
    assert.equal(await count('main article[data-photo-id="old-forest"]'), 0);
    assert.equal(await count('button[aria-label="恢复图片"]:disabled'), 1);
  });

  if (!options.skipLayouts) {
    const layouts = [];
    const routes = [
      '/library',
      '/albums',
      '/albums/forest',
      '/upload?albumId=forest',
      '/tags',
      '/shares/forest',
      '/trash',
    ];
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => localStorage.setItem('theme', value),
        theme,
      );
      for (const [width, height] of [
        [360, 800],
        [390, 844],
        [430, 932],
        [768, 1024],
        [1440, 900],
        [1440, 600],
      ]) {
        await viewport(width, height);
        for (const route of routes) {
          await goto(route);
          await page.waitForFunction(
            (value) => document.documentElement.classList.contains(value),
            theme,
          );
          const measured = await page.evaluate(() => {
            const main = document.querySelector('main');
            const overflowing = [
              ...main.querySelectorAll('button,input,label,h1'),
            ]
              .filter((el) => {
                const rect = el.getBoundingClientRect();
                return (
                  rect.width > 0 && (rect.x < -1 || rect.right > innerWidth + 1)
                );
              })
              .map((el) => el.getAttribute('aria-label') || el.textContent);
            return {
              rootOverflow:
                document.documentElement.scrollWidth > innerWidth + 1,
              mainOverflow: main.scrollWidth > main.clientWidth + 1,
              overflowing,
              brokenImages: [...main.querySelectorAll('img')].filter(
                (img) => !img.complete || !img.naturalWidth,
              ).length,
              errors: window.__prototypeErrors ?? [],
            };
          });
          assert.equal(
            measured.rootOverflow,
            false,
            `${theme} ${width} ${route}: root overflow`,
          );
          assert.equal(
            measured.mainOverflow,
            false,
            `${theme} ${width} ${route}: main overflow`,
          );
          assert.deepEqual(
            measured.overflowing,
            [],
            `${theme} ${width} ${route}: control overflow`,
          );
          assert.equal(measured.brokenImages, 0);
          assert.deepEqual(measured.errors, []);
          layouts.push({ theme, width, height, route, status: 'passed' });
          if (
            (width === 390 || (width === 1440 && height === 900)) &&
            ['/albums/forest', '/shares/forest'].includes(route)
          ) {
            await page.screenshot({
              path: `${output}${theme}-${width}-${route.split('/')[1]}.png`,
            });
          }
        }
      }
    }
    await writeFile(
      `${output}layout-results.json`,
      JSON.stringify(layouts, null, 2),
    );
    console.log(`PASS ${layouts.length} layout cases`);
  }
  await writeFile(
    `${output}workflow-results.json`,
    JSON.stringify(results, null, 2),
  );
  return { workflows: results, evidence: output };
}
