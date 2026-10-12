import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'http://127.0.0.1:61512';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = resolve(root, '.data/clarity-review-v3');
const period = (days) =>
  `[data-testid="analytics-period-controls"] [role="radio"]:text-is("${days} 天")`;
const tagInput = 'input[placeholder="标签名称"]';
const shareSwitch = 'label:has(input[aria-label="启用分享"])';
const button = (name) => `loc=role:button[name="${name}"]`;

export async function runChecks(page) {
  await mkdir(output, { recursive: true });
  const results = [];
  const screenshots = [];
  async function record(name, check) {
    try {
      const detail = await check();
      results.push({ name, passed: true, detail });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
      throw error;
    }
  }
  async function size(width, height = 900) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
  async function goto(path) {
    const separator = path.includes('?') ? '&' : '?';
    await page.goto(`${origin}${path}${separator}frame=1`);
    await page.waitForSelector('h1');
    assert.deepEqual(await page.evaluate(() => window.__prototypeErrors), []);
  }
  async function shot(name) {
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter((animation) =>
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
        )
        .every((animation) => animation.playState !== 'running'),
    );
    const path = `${output}/${name}.png`;
    await page.screenshot({ path });
    screenshots.push(path);
  }
  try {
    await size(1440);
    await goto('/shares/testr');
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await goto('/shares/testr');
    await record('分享普通停用直接提交，无确认弹窗', async () => {
      await page.click(shareSwitch);
      await page.waitForFunction(
        () => !document.querySelector('input[aria-label="启用分享"]').checked,
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll('[role="dialog"]').length,
        ),
        0,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="share-status"]').textContent,
        ),
        '已停用',
      );
      assert.ok(
        await page.evaluate(() =>
          document.body.innerText.includes('分享已停用'),
        ),
      );
      await page.click(shareSwitch);
      await page.waitForFunction(
        () => document.querySelector('input[aria-label="启用分享"]').checked,
      );
    });
    await record('分享保留轮换确认，短保存与预览', async () => {
      await page.click(button('重新生成'));
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[role="dialog"]')
            .innerText.includes('旧地址'),
        ),
      );
      await page.click(button('取消'));
      await page.click('label:has(input[aria-label="显示图片名称"])');
      await page.click(button('保存'));
      await page.waitForFunction(
        () =>
          document.body.innerText.includes('已保存') &&
          document.querySelector('button:has(svg.lucide-save)')?.disabled,
      );
      await page.click(button('预览'));
      await page.waitForSelector('[role="dialog"] img');
      assert.ok(
        await page.evaluate(() =>
          [...document.querySelectorAll('[role="dialog"] img')].every(
            (image) => image.complete && image.naturalWidth > 0,
          ),
        ),
      );
      await page.click('button[aria-label="关闭分享预览"]');
      await shot('share-settings-desktop');
    });
    await record('分享失败保留旧状态，明确失败后可重试', async () => {
      await goto('/shares/testr?scenario=error');
      await page.click(shareSwitch);
      await page.waitForSelector('[role="alert"]');
      assert.equal(
        await page.evaluate(
          () => document.querySelector('input[aria-label="启用分享"]').checked,
        ),
        true,
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll('[role="dialog"]').length,
        ),
        0,
      );
      await page.click(shareSwitch);
      await page.waitForFunction(
        () => !document.querySelector('input[aria-label="启用分享"]').checked,
      );
      await goto('/shares/testr?expired=1');
      await page.click(shareSwitch);
      await page.waitForSelector('[role="dialog"]');
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[role="dialog"]')
            .innerText.includes('有效期'),
        ),
      );
    });
    await record('标签图标组、Tips、重名错误与输入保留', async () => {
      await goto('/tags');
      const hitAreas = await page.evaluate(() =>
        [...document.querySelectorAll('ul[aria-label="标签列表"] button')].map(
          (node) => {
            const rect = node.getBoundingClientRect();
            return {
              name: node.getAttribute('aria-label'),
              width: rect.width,
              height: rect.height,
            };
          },
        ),
      );
      assert.ok(
        hitAreas.every(
          ({ name, width, height }) => name && width >= 44 && height >= 44,
        ),
      );
      await page.click('button[aria-label="编辑标签：fellow"]');
      assert.ok(
        !(
          await page.evaluate(
            () => document.querySelector('[role="dialog"]').innerText,
          )
        ).includes('不合并标签'),
      );
      await page.click('button[aria-label="标签名称说明"]');
      await page.waitForSelector('[role="dialog"][aria-label="标签名称说明"]');
      await shot('tag-tip-desktop');
      await page.keyboard.press('Escape');
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.getAttribute('aria-label'),
        ),
        '标签名称说明',
      );
      await page.fill(tagInput, '旅行');
      await page.click(button('保存'));
      await page.waitForFunction(() =>
        document
          .querySelector('[role="dialog"]')
          .innerText.includes('已有同名标签'),
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector('input[placeholder="标签名称"]').value,
        ),
        '旅行',
      );
      await shot('tag-duplicate-desktop');
      await page.fill(tagInput, '新名称');
      await page.click(button('保存'));
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
      );
      await page.waitForSelector('button[aria-label="编辑标签：新名称"]');
      return hitAreas;
    });
    await record('标签明确失败后保留内容，删除确认仍有对象和后果', async () => {
      await goto('/tags?scenario=error');
      await page.click('button[aria-label="编辑标签：fellow"]');
      await page.fill(tagInput, 'fellow 新名称');
      await page.click(button('保存'));
      await page.waitForFunction(() =>
        document
          .querySelector('[role="dialog"]')
          .innerText.includes('保存失败'),
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector('input[placeholder="标签名称"]').value,
        ),
        'fellow 新名称',
      );
      await page.click(button('保存'));
      await page.waitForSelector(
        'button[aria-label="删除标签：fellow 新名称"]',
      );
      await page.click('button[aria-label="删除标签：fellow 新名称"]');
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[role="dialog"]')
            .innerText.includes('图片不会删除'),
        ),
      );
    });
    await record('回收站局部中性 hover、尺寸稳定与独立菜单', async () => {
      await goto('/trash');
      await page.mouse.move(1000, 100);
      const before = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="trash-row-open"]');
        const rect = node.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          background: getComputedStyle(node).backgroundColor,
        };
      });
      await page.hover('[data-testid="trash-row-open"]');
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="trash-row-open"]')
          .matches(':hover'),
      );
      await shot('trash-hover-light');
      const after = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="trash-row-open"]');
        const rect = node.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          background: getComputedStyle(node).backgroundColor,
          transform: getComputedStyle(node).transform,
        };
      });
      assert.equal(before.width, after.width);
      assert.equal(before.height, after.height);
      assert.equal(after.transform, 'none');
      assert.notEqual(before.background, after.background);
      await page.click('button[aria-label="图片操作"]');
      await page.waitForSelector('[role="menu"][aria-label="图片操作"]');
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll('button button').length,
        ),
        0,
      );
      await page.keyboard.press('Escape');
      await page.focus('[data-testid="trash-row-open"]');
      await page.keyboard.press('Shift+F10');
      await page.waitForSelector('[role="menu"]');
      await page.click('loc=role:menuitem[name="恢复"]');
      await page.waitForFunction(() =>
        document.body.innerText.includes('已恢复 1 张'),
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll('[role="dialog"]').length,
        ),
        0,
      );
      return { before, after };
    });
    await record(
      '统计慢请求保留结果、图表和周期节点，数据归属准确',
      async () => {
        await goto('/analytics?scenario=slow');
        await page.evaluate(() => {
          window.__overview = document.querySelector(
            '[data-testid="analytics-overview"]',
          );
          window.__chart = document.querySelector('.recharts-wrapper');
          window.__periods = document.querySelector(
            '[data-testid="analytics-period-controls"]',
          );
        });
        await page.click(period(30));
        await page.waitForSelector(
          '[data-testid="clarity-analytics"][data-phase="loading"]',
        );
        const during = await page.evaluate(() => ({
          requested: document.querySelector('[data-testid="clarity-analytics"]')
            .dataset.requestedDays,
          displayed: document.querySelector('[data-testid="clarity-analytics"]')
            .dataset.displayedDays,
          retained:
            window.__overview ===
              document.querySelector('[data-testid="analytics-overview"]') &&
            window.__chart === document.querySelector('.recharts-wrapper') &&
            window.__periods ===
              document.querySelector(
                '[data-testid="analytics-period-controls"]',
              ),
          status: document.querySelector(
            '[data-testid="analytics-request-status"]',
          ).textContent,
          date: document.querySelector('[data-testid="analytics-trend"]')
            .innerText,
        }));
        assert.equal(during.requested, '30');
        assert.equal(during.displayed, '7');
        assert.ok(during.retained);
        assert.ok(during.status.includes('暂示 7 天'));
        assert.ok(during.date.includes('2026-10-05'));
        await shot('analytics-loading-desktop');
        await page.waitForSelector(
          '[data-testid="clarity-analytics"][data-phase="ready"][data-displayed-days="30"]',
        );
        await page.click(period(7));
        await page.click(period(90));
        await page.waitForSelector(
          '[data-testid="clarity-analytics"][data-phase="ready"][data-displayed-days="90"]',
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('[data-testid="clarity-analytics"]')
                .dataset.requestedDays,
          ),
          '90',
        );
        return during;
      },
    );
    await record(
      '统计失败保留上次结果，重试目标正确；空数据有零值',
      async () => {
        await goto('/analytics?scenario=error');
        await page.click(period(30));
        await page.waitForSelector(
          '[data-testid="clarity-analytics"][data-phase="error"]',
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('[data-testid="clarity-analytics"]')
                .dataset.displayedDays,
          ),
          '7',
        );
        await shot('analytics-error-desktop');
        await page.click(button('重试'));
        await page.waitForSelector(
          '[data-testid="clarity-analytics"][data-phase="ready"][data-displayed-days="30"]',
        );
        await goto('/analytics?scenario=empty');
        assert.ok(
          await page.evaluate(() =>
            document
              .querySelector('[data-testid="analytics-overview"]')
              .innerText.includes('0'),
          ),
        );
        await page.click(button('每日数值'));
        await page.waitForSelector('[role="dialog"] table');
      },
    );
    await record('基本设置同级图标统一，两个保存独立', async () => {
      await goto('/settings/general');
      assert.equal(
        await page.evaluate(
          () =>
            [...document.querySelectorAll('h2')].filter(
              (heading) =>
                ['站点信息', '上传限制', '关联设置'].includes(
                  heading.textContent.trim(),
                ) && heading.querySelector('svg'),
            ).length,
        ),
        3,
      );
      await page.fill('loc=role:textbox[name="站点名称"]', 'Ariso 原型');
      await page.fill(
        'loc=css:[data-testid="clarity-upload-limits"] input >> nth=0',
        '60',
      );
      const limits = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-testid="clarity-upload-limits"] input',
          ),
        ].map((node) => node.value),
      );
      await page.click(button('保存站点'));
      await page.waitForFunction(() =>
        document.body.innerText.includes('站点已保存'),
      );
      assert.deepEqual(
        await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-testid="clarity-upload-limits"] input',
            ),
          ].map((node) => node.value),
        ),
        limits,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector(
              '[data-testid="clarity-upload-limits"] [role="status"]',
            ).textContent,
        ),
        '未保存',
      );
      assert.ok(
        !(await page.evaluate(() => document.body.innerText)).includes(
          '上传限制已保存',
        ),
      );
      await page.click(button('保存限制'));
      await page.waitForFunction(() =>
        document.body.innerText.includes('上传限制已保存'),
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector(
              '[data-testid="clarity-upload-limits"] [role="status"]',
            ).textContent,
        ),
        '已保存',
      );
      await shot('settings-desktop');
      await goto('/settings/general?scenario=error');
      await page.fill('loc=role:textbox[name="站点名称"]', '保留输入');
      await page.click(button('保存站点'));
      await page.waitForSelector('[role="alert"]');
      assert.equal(
        await page.evaluate(
          () =>
            [...document.querySelectorAll('input')].find(
              (node) => node.value === '保留输入',
            )?.value,
        ),
        '保留输入',
      );
    });
    await record('品牌行图标组与原生文件预览可用', async () => {
      await goto('/settings/general/branding');
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelectorAll('button[aria-label="替换 Logo"]').length,
        ),
        1,
      );
      await page.setInputFiles('input[aria-label="选择 Logo 文件"]', [
        resolve(
          root,
          'design-plans/issue179-review-v2/public/sample-photo.jpg',
        ),
      ]);
      await page.waitForFunction(
        () => document.querySelector('h1').textContent === '品牌预览',
      );
      await page.waitForFunction(
        () => document.querySelector('img[alt="Logo 预览"]')?.naturalWidth > 0,
      );
      await page.click(button('取消'));
      await page.waitForFunction(
        () => document.querySelector('h1').textContent === 'Logo 与 Favicon',
      );
    });
    await record('手机可点开 Tips 并回焦，深色 hover 与焦点', async () => {
      await size(390, 844);
      await goto('/tags');
      await page.click('button[aria-label="编辑标签：fellow"]');
      await page.click('button[aria-label="标签名称说明"]');
      await page.waitForSelector('[role="dialog"][aria-label="标签名称说明"]');
      await shot('tag-tip-mobile');
      await page.keyboard.press('Escape');
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.getAttribute('aria-label'),
        ),
        '标签名称说明',
      );
      await goto('/shares/testr');
      await shot('share-settings-mobile');
      await goto('/settings/general');
      await shot('settings-mobile');
      await page.evaluate(() => localStorage.setItem('theme', 'dark'));
      await size(1440);
      await goto('/trash');
      await page.hover('[data-testid="trash-row-open"]');
      await shot('trash-hover-dark');
      await page.mouse.move(1000, 100);
      await page.focus('[data-testid="trash-row-open"]');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await shot('trash-focus-dark');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.testid),
        'trash-row-open',
      );
    });
    await record('响应式与浅深色布局矩阵', async () => {
      const routes = [
        '/tags',
        '/shares',
        '/shares/testr',
        '/trash',
        '/analytics',
        '/settings/general',
        '/settings/general/branding',
      ];
      const viewports = [
        [360, 800],
        [390, 844],
        [430, 900],
        [768, 900],
        [1440, 900],
        [390, 600],
        [1440, 600],
      ];
      const cases = [];
      for (const theme of ['light', 'dark']) {
        await page.evaluate(
          (value) => localStorage.setItem('theme', value),
          theme,
        );
        for (const [width, height] of viewports) {
          await size(width, height);
          for (const route of routes) {
            await goto(route);
            const detail = await page.evaluate(() => ({
              viewport: innerWidth,
              document: document.documentElement.scrollWidth,
              nestedButtons: document.querySelectorAll('button button').length,
              images: [...document.images].every(
                (image) => image.complete && image.naturalWidth > 0,
              ),
              errors: window.__prototypeErrors,
            }));
            assert.ok(
              detail.document <= detail.viewport + 1,
              `${route} ${theme} ${width}: overflow ${detail.document}`,
            );
            assert.equal(detail.nestedButtons, 0);
            assert.ok(detail.images, `${route}: missing image`);
            assert.deepEqual(detail.errors, []);
            cases.push({ route, theme, width, height, ...detail });
          }
        }
      }
      return { count: cases.length, cases };
    });
    await record('审阅工具栏手机预览与状态切换', async () => {
      await size(1440);
      await page.evaluate(() => localStorage.setItem('theme', 'light'));
      await page.goto(`${origin}/analytics`);
      await page.waitForSelector('iframe');
      await page.click('button[aria-label="手机预览"]');
      await page.click(button('慢请求'));
      await page.waitForFunction(() =>
        document
          .querySelector('iframe')
          ?.contentDocument?.querySelector('[data-testid="clarity-analytics"]'),
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector('iframe').getBoundingClientRect().width,
        ),
        390,
      );
      assert.ok(
        await page.evaluate(() =>
          document.querySelector('iframe').src.includes('scenario=slow'),
        ),
      );
      await page.click('button[aria-label="桌面预览"]');
      await page.click(button('正常'));
      await page.goto(`${origin}/shares/testr`);
      await page.waitForFunction(() =>
        document
          .querySelector('iframe')
          ?.contentDocument?.querySelector(
            '[data-testid="clarity-share-settings"]',
          ),
      );
      await shot('review-harness-desktop');
    });
  } finally {
    await writeFile(
      `${output}/checks.json`,
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          origin,
          scope: 'standalone prototype only',
          results,
          screenshots,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        passed: results.filter((item) => item.passed).length,
        failed: results.filter((item) => !item.passed).length,
        report: `${output}/checks.json`,
      }),
    );
  }
}
