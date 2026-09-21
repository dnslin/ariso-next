// Appended to the existing Ego runner; the caller owns its page and TaskSpace.
export async function verifyShell(page, config) {
  const { default: assert } = await import('node:assert/strict');
  const { writeFile } = await import('node:fs/promises');
  const report = { status: 'failed', layouts: [], checks: [] };
  const origin = config.shellOrigin;
  const resize = async (width, height = 844) => {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.waitForFunction((value) => innerWidth === value, width);
  };
  const current = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          'nav[aria-label="后台导航"] a[aria-current="page"]',
        ),
      ]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .map((node) => node.getAttribute('href')),
    );
  try {
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__shellErrors=[];window.addEventListener('error',e=>window.__shellErrors.push(e.message || 'Resource failed: ' + (e.target.src || e.target.href)),true);window.addEventListener('unhandledrejection',e=>window.__shellErrors.push(String(e.reason)));const shellOriginalError=console.error;console.error=(...args)=>{window.__shellErrors.push(args.map(String).join(' '));shellOriginalError.apply(console,args)};`,
    });
    await resize(1440);
    await page.goto(`${origin}/dashboard`);
    await page.waitForSelector('#fixture-content');
    console.log(await page.snapshot());
    assert.deepEqual(await current(), ['/dashboard']);
    await page.click('nav[aria-label="后台导航"] a[href="/images"]');
    await page.waitForURL(`${origin}/images`);
    await page.waitForFunction(
      () => document.querySelector('#fixture-route').textContent === 'images',
    );
    assert.deepEqual(await current(), ['/images']);
    await page.click('nav[aria-label="后台导航"] a[href="/settings"]');
    await page.waitForURL(`${origin}/settings/basic`);
    console.log(await page.snapshot());
    await page.focus('loc=role:tab[name="基本设置"]');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.waitForURL(`${origin}/settings/storage`);
    assert.deepEqual(await current(), ['/settings']);
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('#fixture-content').length,
      ),
      1,
    );
    assert.equal(
      await page.evaluate(() => {
        const tab = document.querySelector(
          '[role="tab"][aria-selected="true"]',
        );
        const panel = document.getElementById(
          tab.getAttribute('aria-controls'),
        );
        return (
          panel?.getAttribute('role') === 'tabpanel' &&
          !!panel.querySelector('#fixture-content')
        );
      }),
      true,
    );
    report.checks.push(
      'Real Next navigation, current ancestor, Tabs category navigation, single content tree',
    );

    for (const theme of ['light', 'dark']) {
      await page.click(`#fixture-${theme}`);
      await page.waitForFunction(
        (value) => document.documentElement.classList.contains(value),
        theme,
      );
      for (const width of [360, 390, 430, 768, 1440]) {
        await resize(width);
        const layout = await page.evaluate(() => {
          const footer = document
            .querySelector('.shell-footer')
            .getBoundingClientRect();
          const main = document
            .querySelector('#main-content')
            .getBoundingClientRect();
          return {
            errors: window.__shellErrors,
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            background: getComputedStyle(document.body).backgroundColor,
            footer: { top: footer.top, bottom: footer.bottom },
            main: { top: main.top, bottom: main.bottom },
            targets: [
              ...document.querySelectorAll('button,input,a,[role="tab"]'),
            ]
              .filter((node) => node.getBoundingClientRect().width > 0)
              .map((node) => ({
                name: node.textContent || node.id,
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height,
              })),
          };
        });
        assert.deepEqual(
          layout.errors,
          [],
          'No browser runtime or resource errors',
        );
        assert.equal(layout.width, width);
        assert.ok(layout.scrollWidth <= width, 'No horizontal overflow');
        assert.ok(
          layout.footer.bottom <= 845 && layout.footer.top >= 0,
          'Footer visible',
        );
        assert.ok(
          layout.main.bottom <= layout.footer.top + 1,
          'Footer does not overlap main',
        );
        if (width < 768)
          assert.ok(
            layout.targets.every(
              (target) => target.width >= 44 && target.height >= 44,
            ),
            JSON.stringify(layout.targets),
          );
        report.layouts.push({ theme, ...layout });
        await page.screenshot({
          path: `${config.output}/shell-${theme}-${width}.png`,
        });
      }
    }
    assert.notEqual(report.layouts[0].background, report.layouts[5].background);
    for (const width of [767, 768, 1199, 1200]) {
      await resize(width);
      const boundary = await page.evaluate(() => {
        const navigation = document
          .querySelector('.shell-navigation')
          .getBoundingClientRect();
        const header = document
          .querySelector('.shell-mobile-header')
          .getBoundingClientRect();
        const main = document
          .querySelector('#main-content')
          .getBoundingClientRect();
        return {
          navigationWidth: navigation.width,
          navigationBottom: navigation.bottom,
          headerWidth: header.width,
          mainLeft: main.left,
          mainTop: main.top,
        };
      });
      assert.equal(boundary.headerWidth > 0, width < 768);
      assert.equal(boundary.navigationWidth > 0, width >= 768);
      if (width >= 1200) {
        assert.equal(boundary.navigationWidth, 232);
        assert.equal(boundary.mainLeft, 232);
      } else if (width >= 768)
        assert.ok(boundary.mainTop >= boundary.navigationBottom);
    }
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('#fixture-save'))
            .transitionDuration,
      ),
      '0s',
    );
    report.checks.push(
      '767/768/1199/1200 navigation boundaries; reduced-motion disables transitions',
    );
    await resize(390);
    console.log(await page.snapshot());
    await page.click('loc=role:button[name="菜单"]');
    await page.waitForSelector('[role="dialog"]');
    console.log(await page.snapshot());
    assert.deepEqual(await current(), ['/settings']);
    const dialog = await page.evaluate(() => {
      const r = document
        .querySelector('[role="dialog"]')
        .getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        viewportHeight: innerHeight,
      };
    });
    const navWidth = await page.evaluate(() => {
      const link = document.querySelector('[role="dialog"] .shell-nav-link');
      return {
        link: link.getBoundingClientRect().width,
        nav: link.parentElement.getBoundingClientRect().width,
      };
    });
    assert.equal(navWidth.link, navWidth.nav);
    assert.deepEqual(dialog, {
      left: 0,
      top: 0,
      width: 390,
      height: dialog.viewportHeight,
      viewportHeight: dialog.viewportHeight,
    });
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(
          () => !!document.activeElement.closest('[role="dialog"]'),
        ),
        true,
        'Modal focus containment',
      );
    }
    const before = await page.evaluate(
      () => document.querySelector('#main-content').scrollTop,
    );
    await page.mouse.move(380, 750);
    await page.mouse.wheel(0, 600, { label: 'check background scroll lock' });
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#main-content').scrollTop,
      ),
      before,
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    await page.waitForFunction(() =>
      document.activeElement.textContent.includes('菜单'),
    );
    report.checks.push(
      'Mobile Modal Tab containment, background scroll lock, Escape and trigger focus restoration',
    );
    await page.click('loc=role:button[name="菜单"]');
    await page.waitForSelector('[role="dialog"]');
    await page.click('loc=role:button[name="关闭"]');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    await page.waitForFunction(() =>
      document.activeElement.textContent.includes('菜单'),
    );
    await page.click('loc=role:button[name="菜单"]');
    await page.waitForSelector('[role="dialog"]');
    await page.click('[role="dialog"] a[href="/images"]');
    await page.waitForURL(`${origin}/images`);
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    await page.goto(`${origin}/settings/storage`);
    await page.waitForSelector('#fixture-content');
    console.log(await page.snapshot());
    await page.click('loc=role:button[name*="设置分类"]');
    await page.waitForSelector('[role="listbox"]');
    console.log(await page.snapshot());
    await page.click('loc=role:option[name="基本设置"]');
    await page.waitForURL(`${origin}/settings/basic`);
    report.checks.push(
      'Mobile navigation closes Modal; Select changes actual category route',
    );

    await resize(390, 400);
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
    await page.focus('#fixture-field-19');
    await page.fill('#fixture-field-19', '短视口输入');
    const short = await page.evaluate(() => {
      const main = document.querySelector('#main-content');
      const footer = document
        .querySelector('.shell-footer')
        .getBoundingClientRect();
      const input = document
        .querySelector('#fixture-field-19')
        .getBoundingClientRect();
      return {
        scrollTop: main.scrollTop,
        footerTop: footer.top,
        footerBottom: footer.bottom,
        inputTop: input.top,
        inputBottom: input.bottom,
        height: innerHeight,
      };
    });
    assert.ok(short.scrollTop > 0, 'Main content scrolls');
    assert.ok(
      short.footerBottom <= short.height + 1 && short.footerTop >= 0,
      'Short viewport footer remains visible',
    );
    assert.ok(
      short.inputBottom <= short.footerTop + 1 && short.inputTop >= 0,
      'Focused field not hidden by footer',
    );
    await page.screenshot({
      path: `${config.output}/shell-short-viewport.png`,
    });
    report.shortViewport = short;
    report.checks.push(
      'Short viewport input remains reachable above persistent footer',
    );
    await resize(390);
    for (const route of ['long-name', 'empty']) {
      await page.goto(`${origin}/${route}`);
      await page.waitForSelector('#fixture-content');
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        'Boundary layout has no horizontal overflow',
      );
      if (route === 'empty') {
        await page.click('loc=role:button[name="菜单"]');
        await page.waitForSelector('[role="dialog"]');
        assert.equal(
          await page.evaluate(
            () => document.querySelectorAll('[role="dialog"] nav a').length,
          ),
          0,
        );
        await page.keyboard.press('Escape');
      }
      await page.screenshot({ path: `${config.output}/shell-${route}.png` });
    }
    report.checks.push(
      'Long workspace name wraps; empty navigation invents no business entries; explicit menu close button',
    );
    report.limitations = [
      'Desktop Chromium emulation does not verify physical soft keyboard, touch hardware, or safe-area insets',
    ];
    assert.deepEqual(await page.evaluate(() => window.__shellErrors), []);
    report.status = 'passed';
  } catch (error) {
    report.error = error.stack ?? String(error);
    throw error;
  } finally {
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    await writeFile(
      `${config.output}/shell-browser.json`,
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  return report;
}
