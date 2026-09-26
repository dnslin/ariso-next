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
    collapsed: [],
    limitations: [
      'Chromium viewport emulation does not constitute physical-device verification.',
    ],
  };
  const navigationDialog = '[role="dialog"][aria-label="导航菜单"]';
  const accountDialog = '[role="dialog"][aria-label="当前账号"]';
  const expected = [
    { label: '总览', href: null },
    { label: '上传图片', href: '/upload' },
    { label: '图库', href: '/library' },
    { label: '相册', href: null },
    { label: '标签', href: null },
    { label: '分享管理', href: null },
    { label: '回收站', href: '/trash' },
    { label: '访问统计', href: null },
    { label: '存储管理', href: null },
    { label: '站点设置', href: null },
  ];
  const routes = ['/upload', '/library', '/trash'];
  const button = (name) => `loc=role:button[name="${name}"]`;
  let accountLabel;
  async function readNavigation(scope) {
    return page.evaluate((scope) => {
      const root = document.querySelector(scope);
      return {
        headerHeight: document
          .querySelector('.shell-mobile-header')
          .getBoundingClientRect().height,
        entries: [...root.querySelectorAll('nav .shell-nav-link')].map(
          (node) => {
            const label = node.querySelector('.shell-nav-label');
            const described = (node.getAttribute('aria-describedby') || '')
              .split(' ')
              .filter(Boolean)
              .map((id) => document.getElementById(id)?.textContent || '')
              .join(' ');
            return {
              href: node.getAttribute('href'),
              label: label?.textContent.trim(),
              accessibleName:
                node.getAttribute('aria-label') || node.textContent.trim(),
              description: [
                node.getAttribute('title'),
                described,
                node.getAttribute('aria-label'),
                node.textContent,
              ]
                .filter(Boolean)
                .join(' '),
              icon: !!node.querySelector('.shell-nav-icon svg'),
              current: node.getAttribute('aria-current'),
              disabled:
                node.getAttribute('aria-disabled') === 'true' ||
                node.disabled === true,
              decoration: getComputedStyle(node).textDecorationLine,
              labelDecoration: label
                ? getComputedStyle(label).textDecorationLine
                : null,
              labelHidden: label
                ? getComputedStyle(label).display === 'none' ||
                  getComputedStyle(label).visibility === 'hidden' ||
                  label.getBoundingClientRect().width <= 1
                : false,
            };
          },
        ),
        account: root
          .querySelector('button[aria-label="账号菜单"]')
          .textContent.trim(),
      };
    }, scope);
  }
  function verifyNavigation(actual, path, collapsed = false) {
    assert.deepEqual(
      actual.entries.map(({ href, label }) => ({ href, label })),
      expected,
    );
    assert.ok(
      actual.entries.every((entry) => entry.icon),
      'Every menu item retains its design icon',
    );
    assert.deepEqual(
      actual.entries
        .filter((entry) => entry.current === 'page')
        .map((entry) => entry.href),
      [path],
    );
    for (const entry of actual.entries) {
      assert.equal(
        entry.decoration,
        'none',
        `${entry.label}: actual navigation text has no underline`,
      );
      assert.equal(entry.labelDecoration, 'none');
      assert.equal(
        entry.disabled,
        entry.href === null,
        `${entry.label}: only implemented routes are enabled`,
      );
      assert.ok(
        entry.accessibleName.includes(entry.label),
        `${entry.label}: accessible name survives collapse`,
      );
      if (entry.disabled)
        assert.ok(
          entry.description.includes('尚未开放'),
          `${entry.label}: unavailable reason remains available`,
        );
      assert.equal(
        entry.labelHidden,
        collapsed,
        `${entry.label}: responsive label visibility`,
      );
    }
  }
  async function breadcrumb() {
    await page.waitForSelector('.shell-breadcrumb');
    return page.evaluate(() => {
      const node = document.querySelector('.shell-breadcrumb');
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  }
  function sameBreadcrumb(actual, expected) {
    for (const key of ['x', 'y', 'width', 'height'])
      assert.ok(
        Math.abs(actual[key] - expected[key]) <= 1,
        `Shared breadcrumb ${key}: ${actual[key]} versus ${expected[key]}`,
      );
  }
  async function sidebarWidth(width) {
    await page.waitForFunction(
      (width) =>
        Math.abs(
          document.querySelector('.shell-navigation').getBoundingClientRect()
            .width - width,
        ) < 1,
      width,
    );
  }
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
      if (width >= 1200) await sidebarWidth(232);
      let baseline;
      const openNavigation = async () => {
        if (width >= 1200) return;
        await page.click(button('菜单'));
        await page.waitForSelector(navigationDialog);
      };
      for (const path of routes) {
        const position = await breadcrumb();
        if (!baseline) baseline = position;
        sameBreadcrumb(position, baseline);
        await openNavigation();
        const actual = await readNavigation(scope);
        if (width < 1200)
          assert.equal(
            actual.headerHeight,
            64,
            'Design phone/tablet header is 64px',
          );
        verifyNavigation(actual, path);
        await page.hover(`${scope} nav a[href="${path}"]`);
        assert.equal(
          await page.evaluate(
            (scope) =>
              getComputedStyle(
                document.querySelector(`${scope} nav a[aria-current="page"]`),
              ).textDecorationLine,
            scope,
          ),
          'none',
          'Hovered current link has no underline',
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
        report.pages.push({ width, path, breadcrumb: position, ...actual });
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
      if (width >= 1200) {
        await page.focus(button('收起侧栏'));
        await page.keyboard.press('Enter');
        await sidebarWidth(72);
        await page.waitForSelector(button('展开侧栏'));
        report.stage = 'collapsed overview keyboard focus';
        await page.focus(button('展开侧栏'));
        await page.keyboard.press('Tab');
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('aria-label') ===
            '总览，尚未开放',
        );
        report.stage = 'collapsed overview tooltip';
        await page.waitForFunction(() =>
          [...document.querySelectorAll('[role="tooltip"]')].some((node) =>
            node.textContent.includes('总览，尚未开放'),
          ),
        );
        await page.keyboard.press('Escape');
        await sidebarWidth(72);
        report.stage = 'collapsed library hover tooltip';
        // Move through the content area before entering the icon, as a real
        // pointer does after keyboard input. A direct CDP jump can dispatch
        // pointerenter before pointermove updates React Aria's input modality.
        await page.mouse.move(800, 600, { label: 'move pointer into content' });
        await page.hover('.shell-navigation nav a[href="/library"]');
        await page.waitForFunction(() =>
          [...document.querySelectorAll('[role="tooltip"]')].some(
            (node) => node.textContent.trim() === '图库',
          ),
        );
        await page.keyboard.press('Escape');
        await sidebarWidth(72);
        report.checks.push(
          'Collapsed sidebar Tab reaches the unavailable overview and exposes its reason in a real tooltip; hover exposes the library label; Escape leaves collapse state unchanged.',
        );
        let compactBaseline;
        for (const path of routes) {
          if (path !== '/upload') {
            await page.click(`.shell-navigation nav a[href="${path}"]`);
            await page.waitForURL(`${config.origin}${path}`);
          }
          await sidebarWidth(72);
          const actual = await readNavigation('.shell-navigation');
          verifyNavigation(actual, path, true);
          const position = await breadcrumb();
          if (!compactBaseline) compactBaseline = position;
          sameBreadcrumb(position, compactBaseline);
          await page.screenshot({
            path: join(
              config.output,
              `owner-shell-collapsed-${path.slice(1)}.png`,
            ),
          });
          report.collapsed.push({ path, breadcrumb: position, ...actual });
          await page.reload();
          await sidebarWidth(72);
          await page.waitForSelector(button('展开侧栏'));
          verifyNavigation(
            await readNavigation('.shell-navigation'),
            path,
            true,
          );
        }
        await page.focus(button('展开侧栏'));
        await page.keyboard.press('Enter');
        await sidebarWidth(232);
        await page.reload();
        await sidebarWidth(232);
        await page.waitForSelector(button('收起侧栏'));
      }
    }
    // Hold a real settings response after its HTTP read, then interact with the
    // existing loading shell. Hydration must not replace that shell on success.
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector('input[type="file"]', { state: 'attached' });
    report.stage = 'loading sidebar persistence';
    const settingsScript = await page.cdp(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `const shellNativeFetch = window.fetch.bind(window); window.fetch = async (...args) => { if (new URL(String(args[0]), location.href).pathname === '/upload/settings') { window.fetch = shellNativeFetch; const response = await shellNativeFetch(...args); await new Promise(resolve => { window.__shellReleaseSettings = resolve; }); delete window.__shellReleaseSettings; return response; } return shellNativeFetch(...args); };`,
      },
    );
    try {
      await page.reload();
      await page.waitForFunction(
        () =>
          typeof window.__shellReleaseSettings === 'function' &&
          document.body.textContent.includes('正在读取上传设置'),
      );
      await sidebarWidth(232);
      await page.focus(button('收起侧栏'));
      await page.keyboard.press('Enter');
      await sidebarWidth(72);
      await page.evaluate(() => {
        window.__shellToggleReference = document.querySelector(
          'button[aria-label="展开侧栏"]',
        );
      });
      assert.equal(
        await page.evaluate(
          () => document.activeElement === window.__shellToggleReference,
        ),
        true,
      );
      await page.evaluate(() => window.__shellReleaseSettings());
      await page.waitForSelector('input[type="file"]', { state: 'attached' });
      await sidebarWidth(72);
      assert.deepEqual(
        await page.evaluate(() => ({
          connected: window.__shellToggleReference.isConnected,
          sameNode:
            window.__shellToggleReference ===
            document.querySelector('button[aria-label="展开侧栏"]'),
          focused: document.activeElement === window.__shellToggleReference,
        })),
        { connected: true, sameNode: true, focused: true },
      );
      await page.screenshot({
        path: join(config.output, 'owner-shell-settings-loading-collapse.png'),
      });
      report.checks.push(
        'Collapse during a held real upload-settings response survives data arrival at 72px, retaining the same toggle DOM node and keyboard focus.',
      );
    } finally {
      await page.evaluate(() => {
        window.__shellReleaseSettings?.();
        delete window.__shellToggleReference;
      });
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: settingsScript.identifier,
      });
    }
    await page.focus(button('展开侧栏'));
    await page.keyboard.press('Enter');
    await sidebarWidth(232);
    await page.reload();
    await page.waitForSelector('input[type="file"]', { state: 'attached' });
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 400,
      deviceScaleFactor: 1,
      mobile: true,
    });
    report.stage = 'short phone navigation';
    await page.click(button('菜单'));
    await page.waitForSelector(navigationDialog);
    await page.hover(
      `${navigationDialog} .shell-nav-link[aria-label="站点设置，尚未开放"]`,
    );
    const shortMenu = await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      const last = root
        .querySelector('.shell-nav-link[aria-label="站点设置，尚未开放"]')
        .getBoundingClientRect();
      const account = root
        .querySelector('button[aria-label="账号菜单"]')
        .getBoundingClientRect();
      const body = root.querySelector('.shell-menu-body');
      const bounds = body.getBoundingClientRect();
      return {
        scrolled: body.scrollTop,
        lastVisible: last.top >= bounds.top && last.bottom <= bounds.bottom,
        accountVisible: account.top >= 0 && account.bottom <= innerHeight,
      };
    }, navigationDialog);
    assert.ok(
      shortMenu.scrolled > 0,
      'Short phone menu scrolls its navigation area',
    );
    assert.equal(
      shortMenu.lastVisible,
      true,
      'Last unavailable entry remains readable',
    );
    assert.equal(
      shortMenu.accountVisible,
      true,
      'Account remains reachable below scrolling navigation',
    );
    await page.screenshot({
      path: join(config.output, 'owner-shell-short-phone-menu.png'),
    });
    await page.click(`${navigationDialog} button[aria-label="账号菜单"]`);
    await page.waitForSelector(accountDialog);
    await page.keyboard.press('Escape');
    await page.waitForSelector(accountDialog, { state: 'hidden' });
    await page.keyboard.press('Escape');
    await page.waitForSelector(navigationDialog, { state: 'hidden' });
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false,
    });
    report.checks.push(
      'At 390×400 the phone navigation scroll reaches the final settings entry while account access remains visible and functional.',
    );
    await assertNoBrowserErrors(page);
    report.checks.push(
      'Upload/library/trash share all ten design menu entries; only the three implemented routes are links, and the remaining seven explain that they are not yet available.',
      'Computed navigation text decoration is none, including hover; breadcrumb rectangles match across all three routes at desktop, phone and tablet widths.',
      'Desktop keyboard collapse changes sidebar 232 → 72; icons, accessible names and disabled reasons remain; navigation and real reload preserve collapsed preference, and expanded preference survives reload.',
      'Account Escape restores visible account trigger; phone/tablet menu Escape restores menu trigger; navigation clicks close the menu.',
    );
    report.status = 'passed';
    delete report.stage;
  } catch (error) {
    report.error = String(error.stack ?? error);
    report.failureSnapshot = await page.snapshot();
    await page.screenshot({
      path: join(config.output, 'owner-shell-failed.png'),
    });
    throw error;
  } finally {
    await writeFile(
      join(config.output, 'owner-shell.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  return report;
}
