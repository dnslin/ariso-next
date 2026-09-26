import { assertNoBrowserErrors } from './browser-errors.mjs';

// Call after owner login, before fault injection. Uses real application routes.
export async function verifyOwnerShell(page, config) {
  const { default: assert } = await import('node:assert/strict');
  const { writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const report = {
    status: 'failed',
    checks: [],
    pages: [],
    limitations: [
      'The current four navigation entries are checked for cross-page consistency only; the workspace and unimplemented-entry design policy remain pending user confirmation.',
    ],
  };
  const navigationDialog = '[role="dialog"][aria-label="导航菜单"]';
  const accountDialog = '[role="dialog"][aria-label="当前账号"]';
  const expected = [
    { href: '/admin', label: '工作空间' },
    { href: '/upload', label: '上传图片' },
    { href: '/library', label: '图库' },
    { href: '/trash', label: '回收站' },
  ];
  let accountLabel;
  try {
    for (const width of [1440, 390, 768]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: width >= 1200 ? 1080 : 844,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await page.waitForFunction((value) => innerWidth === value, width);
      await page.goto(`${config.origin}/upload`);
      await page.waitForSelector('input[type="file"]', { state: 'attached' });
      const scope = width >= 1200 ? '.shell-navigation' : navigationDialog;
      const openNavigation = async () => {
        if (width >= 1200) return;
        await page.click('loc=role:button[name="菜单"]');
        await page.waitForSelector(navigationDialog);
      };
      for (const path of ['/upload', '/library', '/trash']) {
        await openNavigation();
        const actual = await page.evaluate((scope) => {
          const root = document.querySelector(scope);
          return {
            headerHeight: document
              .querySelector('.shell-mobile-header')
              .getBoundingClientRect().height,
            entries: [...root.querySelectorAll('nav a')].map((node) => ({
              href: node.getAttribute('href'),
              label: node.textContent.trim(),
              icon: !!node.querySelector('.shell-nav-icon svg'),
              current: node.getAttribute('aria-current'),
            })),
            account: root
              .querySelector('button[aria-label="账号菜单"]')
              .textContent.trim(),
          };
        }, scope);
        if (width < 1200)
          assert.equal(
            actual.headerHeight,
            64,
            'Design mobile/tablet header is 64px',
          );
        assert.deepEqual(
          actual.entries.map(({ href, label }) => ({ href, label })),
          expected,
        );
        assert.ok(actual.entries.every((entry) => entry.icon));
        assert.deepEqual(
          actual.entries
            .filter((entry) => entry.current === 'page')
            .map((entry) => entry.href),
          [path],
        );
        if (accountLabel === undefined) accountLabel = actual.account;
        assert.equal(
          actual.account,
          accountLabel,
          'Same owner presentation across routes and widths',
        );
        await page.click(`${scope} button[aria-label="账号菜单"]`);
        await page.waitForSelector(accountDialog);
        assert.equal(
          await page.evaluate(
            (selector) =>
              document.querySelector(selector).textContent.includes('退出登录'),
            accountDialog,
          ),
          true,
        );
        assert.equal(
          await page.evaluate(
            ({ selector, email }) =>
              document.querySelector(selector).textContent.includes(email),
            { selector: accountDialog, email: config.credentials.email },
          ),
          true,
        );
        await page.keyboard.press('Escape');
        await page.waitForSelector(accountDialog, { state: 'hidden' });
        await page.waitForFunction((scope) => {
          const active = document.activeElement;
          return (
            active ===
              document.querySelector(
                `${scope} button[aria-label="账号菜单"]`,
              ) && active.getBoundingClientRect().width > 0
          );
        }, scope);
        if (width < 1200) {
          await page.keyboard.press('Escape');
          await page.waitForSelector(navigationDialog, { state: 'hidden' });
          await page.waitForFunction(
            () =>
              document.activeElement?.textContent.trim() === '菜单' &&
              document.activeElement.getBoundingClientRect().width > 0,
          );
          await openNavigation();
        }
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.effect?.getComputedTiming().iterations !== Infinity,
              )
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        await page.screenshot({
          path: join(
            config.output,
            `owner-shell-${path.slice(1)}-${width}.png`,
          ),
        });
        report.pages.push({ width, path, ...actual });
        const next =
          path === '/upload'
            ? '/library'
            : path === '/library'
              ? '/trash'
              : '/upload';
        await page.click(`${scope} nav a[href="${next}"]`);
        await page.waitForURL(`${config.origin}${next}`);
        if (width < 1200)
          await page.waitForSelector(navigationDialog, { state: 'hidden' });
      }
    }
    await assertNoBrowserErrors(page);
    report.checks.push(
      'Real upload/library/trash share entry order, labels, icons and owner presentation at 1440/390/768; actual navigation clicks update current route.',
      'Account Escape restores visible account trigger; phone/tablet menu Escape restores the menu trigger; navigation clicks close the full-screen menu.',
    );
    report.status = 'passed';
  } catch (error) {
    report.error = String(error.stack ?? error);
    throw error;
  } finally {
    await writeFile(
      join(config.output, 'owner-shell.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  return report;
}
