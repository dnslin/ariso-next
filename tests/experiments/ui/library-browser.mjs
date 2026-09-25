import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function verifyLibrary(page, config) {
  const report = { status: 'failed', checks: [], layouts: [] };
  const requests = () => page.evaluate(() => window.__libraryRequests.length);
  const state = () =>
    page.evaluate(() => ({
      url: location.search,
      history: window.__libraryHistoryPushes,
      scroll: scrollY,
      selection: document.querySelector('#library-selection').textContent,
      focus: document.activeElement.id,
    }));
  try {
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__libraryRequests=[];const originalFetch=window.fetch;window.fetch=(...args)=>{if(String(args[0]).startsWith('/library/data?'))window.__libraryRequests.push(String(args[0]));return originalFetch(...args)};`,
    });
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.goto(`${config.origin}/library`);
    await page.waitForSelector('#open-image-001');
    console.log(await page.snapshot());
    report.environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      fullscreenEnabled: document.fullscreenEnabled,
    }));
    // A reused Chromium tab can evict old entries at its history limit.
    // Observe successful pushes, then verify their actual Back/Forward behavior.
    await page.evaluate(() => {
      const pushState = history.pushState;
      window.__libraryHistoryPushes = 0;
      history.pushState = function (...args) {
        const result = pushState.apply(this, args);
        window.__libraryHistoryPushes++;
        return result;
      };
      window.__restoreLibraryHistory = () => {
        history.pushState = pushState;
      };
    });
    try {
      const initial = await state();
      const initialRequests = await requests();
      await page.fill('#library-search', '海');
      await page.keyboard.type('边');
      assert.equal((await state()).url, initial.url);
      assert.equal((await state()).history, initial.history);
      assert.equal(await requests(), initialRequests);
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () => new URLSearchParams(location.search).get('q') === '海边',
      );
      await page.waitForFunction(
        () =>
          document.querySelector('#library-state').textContent ===
          '共 60 张 · 第 1 页',
      );
      assert.equal((await state()).history, initial.history + 1);
      await page.evaluate(() => history.back());
      await page.waitForFunction(
        () =>
          !new URLSearchParams(location.search).has('q') &&
          document.querySelector('#library-search').value === '',
      );
      await page.evaluate(() => history.forward());
      await page.waitForFunction(
        () => document.querySelector('#library-search').value === '海边',
      );
    } finally {
      await page.evaluate(() => window.__restoreLibraryHistory());
    }
    report.checks.push(
      'Local search draft: no URL, history or HTTP writes; one submit entry; Back/Forward restore applied input',
    );

    await page.click('#select-image-002');
    const beforeLayout = await requests();
    await page.click('#layout');
    await page.waitForSelector('[data-layout="rows"]');
    assert.equal(await requests(), beforeLayout);
    assert.equal((await state()).selection, '已选 1');
    await page.click('#next-page');
    await page.waitForSelector('#open-image-042');
    assert.equal((await state()).selection, '已选 1');
    await page.evaluate(() => history.back());
    await page.waitForSelector('#select-image-002[aria-pressed="true"]');
    await page.click('#layout');
    await page.waitForSelector('[data-layout="grid"]');
    report.checks.push(
      'Layout preserves query/cache/selection; same-query page history preserves explicit selection',
    );

    await page.focus('#open-image-018');
    const beforeViewer = await state();
    const beforeViewerRequests = await requests();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.yarl__root');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.yarl__slide_current img')].some(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    console.log(await page.snapshot());
    assert.equal(
      new URLSearchParams((await state()).url).get('image'),
      'image-018',
    );
    await page.click('loc=role:button[name="下一张"]');
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get('image') === 'image-020',
    );
    await page.click('#rebuild-slides');
    assert.equal(
      new URLSearchParams((await state()).url).get('image'),
      'image-020',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('.yarl__slide_current img').alt,
      ),
      '海边 20',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('button[aria-label="下一张"]').disabled,
      ),
      true,
    );
    await page.click('loc=role:button[name="放大"]');
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.yarl__slide_current [data-zoom]')
            .textContent,
        ) > 1,
    );
    const transformBefore = await page.evaluate(
      () =>
        document.querySelector('.yarl__slide_current .yarl__slide_wrapper')
          .style.transform,
    );
    await page.keyboard.press('ArrowRight');
    const transformAfter = await page.evaluate(
      () =>
        document.querySelector('.yarl__slide_current .yarl__slide_wrapper')
          .style.transform,
    );
    assert.notEqual(
      transformAfter,
      transformBefore,
      'Zoomed arrow key pans the image',
    );
    assert.equal(
      new URLSearchParams((await state()).url).get('image'),
      'image-020',
    );
    assert.ok(
      await page.evaluate(
        () => document.querySelectorAll('.yarl__slide').length <= 3,
      ),
      'Only current + adjacent slide window',
    );
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('.yarl__root button')].some((button) =>
          /download|share|slideshow|下载|分享|幻灯片/i.test(
            button.textContent + button.getAttribute('aria-label'),
          ),
        ),
      ),
      false,
    );
    await page.click('loc=role:button[name="进入全屏"]');
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.click('loc=role:button[name="退出全屏"]');
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.yarl__root', { state: 'hidden' });
    await page.waitForFunction(
      () => document.activeElement.id === 'open-image-018',
    );
    const returned = await state();
    assert.equal(returned.url, beforeViewer.url);
    assert.equal(returned.scroll, beforeViewer.scroll);
    assert.equal(returned.selection, beforeViewer.selection);
    assert.equal(await requests(), beforeViewerRequests);
    report.checks.push(
      'Three-slide finite window, controlled image identity after rebuilding slides, zoom and keyboard pan, real desktop fullscreen enter/exit, Escape restores URL/scroll/selection/focus without list HTTP',
    );

    for (const theme of ['light', 'dark']) {
      await page.click(`#library-${theme}`);
      for (const width of [360, 390, 430, 768, 1440]) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height: 844,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          background: getComputedStyle(document.body).backgroundColor,
          targets: [...document.querySelectorAll('button,input')].map((el) => ({
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          })),
        }));
        assert.equal(layout.width, width);
        assert.ok(layout.scrollWidth <= width);
        assert.ok(
          layout.targets.every(
            ({ width, height }) => width >= 44 && height >= 44,
          ),
        );
        report.layouts.push({ theme, ...layout });
        if ([390, 1440].includes(width))
          await page.screenshot({
            path: `${config.output}/library-${theme}-${width}.png`,
          });
      }
    }
    assert.notEqual(report.layouts[0].background, report.layouts[5].background);
    // Explicit capability emulation proves the unsupported branch, not Safari/device support.
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 400,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await page.evaluate(() => {
      Object.defineProperty(document, 'fullscreenEnabled', {
        configurable: true,
        value: false,
      });
    });
    await page.click('#open-image-018');
    await page.waitForSelector('.yarl__root');
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('button[aria-label="进入全屏"]'),
      ),
      false,
    );
    const viewport = await page.evaluate(() => {
      const rect = document
        .querySelector('.yarl__root')
        .getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      };
    });
    assert.equal(viewport.width, viewport.viewportWidth);
    assert.equal(viewport.height, viewport.viewportHeight);
    await page.click('loc=role:button[name="放大"]');
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.yarl__slide_current [data-zoom]')
            .textContent,
        ) > 1,
    );
    await page.screenshot({
      path: `${config.output}/library-no-fullscreen.png`,
    });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.yarl__root', { state: 'hidden' });
    report.checks.push(
      'Light/dark at 360/390/430/768/1440, 44px controls, short viewport; emulated missing Fullscreen API hides its button but retains viewport viewer and zoom',
    );

    await page.fill('#library-search', 'error');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#library-state').textContent === '正在加载',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[id^="open-image"]').length,
      ),
      0,
      'Old result cannot be operated during new query',
    );
    await page.waitForFunction(() =>
      document.querySelector('#library-state').textContent.includes('HTTP 503'),
    );
    await page.fill('#library-search', '不存在');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        document.querySelector('#library-state').textContent ===
        '共 0 张 · 第 1 页',
    );
    await page.fill('#library-search', '海边');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#open-image-002');
    assert.equal(
      (await state()).selection,
      '已选 0',
      'Changed query must not resurrect old selection',
    );
    report.checks.push(
      'Pending hides stale actions; HTTP 503, empty and cached recovery; changed query clears selection',
    );
    report.errors = await page.evaluate(() => window.__uiErrors);
    assert.deepEqual(report.errors, []);
    report.requests = await page.evaluate(() => window.__libraryRequests);
    report.limitations = [
      'HTTP fixture has 120 lightweight records, separate SQLite experiment supplies 100k scale evidence',
      'Fullscreen unavailable is an explicit capability override, not real mobile Safari',
      'No production library, cross-page neighbor API, permissions or physical-device acceptance',
    ];
    report.status = 'passed';
  } catch (error) {
    report.error = error.stack ?? String(error);
    throw error;
  } finally {
    await writeFile(
      `${config.output}/library.json`,
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
