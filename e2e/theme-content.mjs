import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';
import { installBrowserErrors, readBrowserErrors } from './browser-errors.mjs';
import {
  settingsTrigger,
  publicTrigger,
  openTheme,
  chooseTheme,
  closeTheme,
  expectTheme,
  readContrast,
  themeEvidence,
} from './theme-helpers.mjs';

async function revealRegion(page, selectors) {
  const position = await page.evaluate((selectors) => {
    const main = document.querySelector('main').getBoundingClientRect();
    const bounds = selectors.map((selector) =>
      document.querySelector(selector).getBoundingClientRect(),
    );
    return {
      x: main.left + main.width / 2,
      y: main.top + main.height / 2,
      delta: Math.min(...bounds.map((rect) => rect.top)) - main.top - 16,
    };
  }, selectors);
  await page.mouse.move(position.x, position.y);
  await page.mouse.wheel(0, position.delta, {
    label: '显示主题状态完整内容',
  });
  await page.waitForFunction((selectors) => {
    const main = document.querySelector('main').getBoundingClientRect();
    const footer = document
      .querySelector('.shell-footer')
      ?.getBoundingClientRect();
    const bottom = Math.min(
      main.bottom,
      innerHeight,
      footer?.top ?? innerHeight,
    );
    return selectors.every((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return rect.top >= main.top && rect.bottom <= bottom;
    });
  }, selectors);
}

export async function verifyThemeContent(task, page, config, fixture, report) {
  const contrasts = (report.contrasts ??= []);
  const photos = (report.photos ??= []);
  const peer = await task.newPage();
  await installBrowserErrors(peer);
  await peer.goto(`${config.origin}/`);
  await peer.waitForSelector(publicTrigger);
  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    for (const resolved of ['light', 'dark']) {
      await peer.snapshot();
      await openTheme(peer, publicTrigger);
      await chooseTheme(peer, resolved, resolved);
      await closeTheme(peer, publicTrigger);
      await page.goto(`${config.origin}/library`);
      await page.waitForFunction(
        (ids) =>
          ids.every((id) => {
            const image = document.querySelector(`[data-image-id="${id}"] img`);
            return image?.complete && image.naturalWidth > 0;
          }),
        fixture.ids,
      );
      await expectTheme(page, resolved, resolved);
      const imageStates = await page.evaluate(
        (ids) =>
          ids.map((id) => {
            const image = document.querySelector(`[data-image-id="${id}"] img`);
            const effects = [];
            for (let node = image; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              effects.push({
                filter: style.filter,
                blend: style.mixBlendMode,
                opacity: style.opacity,
              });
            }
            const control = image
              .closest('[data-testid="library-card"]')
              .querySelector('[data-slot="checkbox-control"]');
            return {
              id,
              source: new URL(image.currentSrc).pathname,
              width: image.naturalWidth,
              height: image.naturalHeight,
              effects,
              overlayBackground: control
                ? getComputedStyle(control).backgroundColor
                : null,
            };
          }),
        fixture.ids,
      );
      for (const image of imageStates) {
        for (const effect of image.effects) {
          assert.equal(
            effect.filter,
            'none',
            'Neither image nor ancestor inverts or filters its colors',
          );
          assert.equal(effect.blend, 'normal');
          assert.equal(effect.opacity, '1');
        }
        assert.ok(
          image.overlayBackground && !image.overlayBackground.includes('0)'),
          'Photo checkbox uses an opaque semantic surface rather than bare photo pixels',
        );
      }
      photos.push({ width, resolved, images: imageStates });
      await page.snapshot();
      await page.click(
        `[data-image-id="${fixture.ids[0]}"] label[data-slot="checkbox-content"]`,
      );
      await page.waitForSelector(
        `[data-image-id="${fixture.ids[0]}"][data-selected="true"]`,
      );
      const scroll = await page.evaluate(
        () => document.querySelector('main').scrollTop,
      );
      await openTheme(peer, publicTrigger);
      await chooseTheme(
        peer,
        resolved === 'light' ? 'dark' : 'light',
        resolved === 'light' ? 'dark' : 'light',
      );
      await expectTheme(page, resolved === 'light' ? 'dark' : 'light');
      await chooseTheme(peer, resolved, resolved);
      await closeTheme(peer, publicTrigger);
      await expectTheme(page, resolved, resolved);
      assert.equal(
        await page.evaluate(
          (id) =>
            document
              .querySelector(`[data-image-id="${id}"]`)
              .getAttribute('data-selected'),
          fixture.ids[0],
        ),
        'true',
      );
      assert.equal(
        await page.evaluate(() => document.querySelector('main').scrollTop),
        scroll,
      );
      await themeEvidence(
        page,
        config,
        report,
        'filled-library-selected-photo',
        width,
        resolved,
      );

      await page.goto(`${config.origin}/analytics?days=7`);
      await page.waitForSelector('[data-testid="analytics-overview"]');
      await page.waitForSelector(
        '[data-testid="analytics-chart"] svg.recharts-surface',
      );
      const overviewResponse = await page.fetch(
        '/api/analytics/overview?days=7',
      );
      const overview = JSON.parse(overviewResponse.body);
      assert.ok(overview.versions.total >= 21);
      assert.ok(
        overview.popular.some((item) => fixture.ids.includes(item.imageId)),
        'Chart and ranking contain actual fixture accesses',
      );
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="analytics-versions"]')
            .textContent.includes('原图'),
        ),
      );
      const line = await readContrast(
        page,
        '[data-testid="analytics-chart"] path.recharts-line-curve',
        'stroke',
      );
      assert.ok(line.ratio >= 3, `Trend line contrast ${line.ratio}`);
      contrasts.push({ width, resolved, ...line });
      await themeEvidence(
        page,
        config,
        report,
        'filled-chart',
        width,
        resolved,
      );
      await revealRegion(page, ['[data-testid="analytics-trend"]']);
      await themeEvidence(
        page,
        config,
        report,
        'filled-chart-detail',
        width,
        resolved,
      );
      await page.goto(`${config.origin}/analytics?view=daily&days=7`);
      await page.waitForSelector('[data-testid="analytics-daily"]');
      const rows = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-testid="analytics-daily"] tr[data-date]',
          ),
        ].map((row) => ({
          date: row.getAttribute('data-date'),
          count: row.querySelector('td:last-child').textContent.trim(),
        })),
      );
      assert.deepEqual(
        rows,
        overview.trend.map((row) => ({
          date: row.date,
          count: new Intl.NumberFormat('zh-CN').format(row.count),
        })),
        'Daily table exposes the same date/count data as the real chart',
      );
      await themeEvidence(
        page,
        config,
        report,
        'filled-chart-equivalent-values',
        width,
        resolved,
      );

      await page.goto(`${config.origin}/s/${fixture.token}`);
      await page.waitForFunction(
        (ids) =>
          ids.every((id) => {
            const image = document.querySelector(
              `[data-share-item="${id}"] img`,
            );
            return image?.complete && image.naturalWidth > 0;
          }),
        fixture.ids,
      );
      await themeEvidence(
        page,
        config,
        report,
        'filled-public-share',
        width,
        resolved,
      );
      await page.goto(`${config.origin}/settings/general`);
      await page.waitForSelector(
        '[data-testid="site-general"][data-state="ready"]',
      );
      const name = await page.evaluate(
        () => document.querySelector('#site-name').value,
      );
      await page.fill('#site-name', '');
      await page.click('#site-save');
      const errorSelector = '[data-slot="field-error"]';
      await page.waitForSelector(errorSelector);
      const error = await readContrast(page, errorSelector);
      assert.ok(
        error.text.length > 0,
        'Validation error provides text beyond border color',
      );
      assert.ok(error.ratio >= 4.5, `Small error text contrast ${error.ratio}`);
      contrasts.push({ width, resolved, ...error });
      await page.snapshot();
      await openTheme(page, settingsTrigger);
      await chooseTheme(page, resolved, resolved);
      await closeTheme(page);
      assert.equal(
        await page.evaluate(
          (selector) => document.querySelector(selector).textContent.trim(),
          errorSelector,
        ),
        error.text,
        'Theme selection retains existing validation feedback',
      );
      await page.focus('#site-name');
      await revealRegion(page, ['#site-name', errorSelector]);
      await themeEvidence(
        page,
        config,
        report,
        'validation-error',
        width,
        resolved,
      );
      await page.fill('#site-name', name);
      await page.goto(`${config.origin}/upload`);
      await page.waitForSelector('loc=role:button[name="开始上传"]');
      assert.equal(
        await page.evaluate(
          () =>
            [...document.querySelectorAll('button')].find(
              (node) => node.textContent.trim() === '开始上传',
            ).disabled,
        ),
        true,
        'No queued files is a real disabled upload state',
      );
      await themeEvidence(
        page,
        config,
        report,
        'disabled-upload',
        width,
        resolved,
      );
    }
  }
  const errors = await readBrowserErrors(peer);
  report.browserErrors.push(...errors);
  assert.deepEqual(
    errors,
    [],
    'Photo selection theme source tab has no hydration/runtime/resource errors',
  );
  await peer.close();
  report.checks.push(
    'real PNG/JPEG photos remain unfiltered, surface-backed photo controls, selection/scroll retained across live tab changes, non-zero chart and equivalent real daily table, public shared photos, 4.5:1 error text and actual disabled upload in both themes',
  );
}
