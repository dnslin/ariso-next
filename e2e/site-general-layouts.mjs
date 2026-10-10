import assert from 'node:assert/strict';
import { field } from './site-general-helpers.mjs';
import { expectThemeEntries } from './theme-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

export async function verifySiteGeneralLayouts(page, tools, report) {
  await tools.open();
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 430, 768, 1440])
      await tools.evidence('ready', width, theme);
  }
  for (const width of [390, 1440])
    await tools.evidence('short', width, 'dark', 400);
  for (const width of [390, 1440]) {
    await tools.reveal('#site-timeZone', 'short-timezone', width, 'dark', 400);
    await tools.reveal(
      'main .divide-y > div:last-child',
      'short-last-related',
      width,
      'dark',
      400,
    );
  }
  await resizeViewport(page, 1440);
  const structure = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      heading: [...main.querySelectorAll('h2')].map((node) =>
        node.textContent.trim(),
      ),
      labels: ['name', 'description', 'publicUrl', 'timeZone'].map((name) => {
        const node = document.querySelector(`#site-${name}`);
        const label =
          node.labels?.[0] ??
          (node.getAttribute('aria-labelledby') ?? '')
            .split(' ')
            .map((id) => document.getElementById(id))
            .find((node) => node?.tagName === 'LABEL');
        return {
          name: node.name,
          text: label?.textContent.trim(),
          label: label?.getBoundingClientRect().toJSON(),
          input: node.getBoundingClientRect().toJSON(),
        };
      }),
      siteNavigation: document
        .querySelector('.shell-navigation a[aria-label="站点设置"]')
        ?.getAttribute('href'),
      related: [...main.querySelectorAll('a')].map((node) =>
        node.getAttribute('href'),
      ),
      placeholders: main.textContent,
    };
  });
  assert.ok(structure.heading.includes('站点信息'));
  assert.ok(structure.heading.includes('关联设置'));
  assert.equal(structure.siteNavigation, '/settings/general');
  for (const label of structure.labels) {
    assert.ok(label.text, `${label.name}: external label exists`);
    assert.ok(
      label.label.bottom <= label.input.top + 1,
      `${label.name}: label above control`,
    );
  }
  assert.ok(structure.related.includes('/settings/storage'));
  assert.ok(structure.related.includes('/settings/processing'));
  assert.ok(structure.related.includes('/settings/general/branding'));
  for (const text of ['Logo 与 Favicon', '上传限制'])
    assert.ok(structure.placeholders.includes(text));
  assert.equal(structure.placeholders.includes('界面主题'), false);
  await expectThemeEntries(page, true);
  report.structure = structure;
  await page.focus(field('name'));
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'site-description',
  );
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'site-publicUrl',
  );
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'site-timeZone',
  );
  await page.fill(field('description'), '键盘保存验证');
  await tools.save(true);
  assert.equal((await tools.read()).description, '键盘保存验证');
  function relatedFrame(visibleOnly = false) {
    const heading = [...document.querySelectorAll('main h2')].find(
      (node) => node.textContent.trim() === '关联设置',
    );
    const card = heading.closest('[data-slot="card"]');
    const main = document.querySelector('main').getBoundingClientRect();
    const footer = document
      .querySelector('.shell-footer')
      .getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    const rows = [...card.querySelector('.divide-y').children].map((node) => ({
      text: node.textContent.trim(),
      bounds: node.getBoundingClientRect().toJSON(),
    }));
    const bottom = Math.min(main.bottom, footer.top);
    const visible =
      bounds.top >= main.top &&
      bounds.bottom <= bottom &&
      rows.length === 3 &&
      rows.every(
        ({ bounds }) => bounds.top >= main.top && bounds.bottom <= bottom,
      );
    if (visibleOnly) return visible;
    return {
      visible,
      rows,
      card: bounds.toJSON(),
      footer: footer.toJSON(),
      save: document
        .querySelector('#site-save')
        .getBoundingClientRect()
        .toJSON(),
      pointer: {
        x: main.left + main.width / 2,
        y: main.top + (bottom - main.top) / 2,
      },
      delta: bounds.top - main.top - 16,
    };
  }
  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    const before = await page.evaluate(relatedFrame);
    if (!before.visible) {
      await page.mouse.move(before.pointer.x, before.pointer.y, {
        label: 'move into settings content',
      });
      await page.mouse.wheel(0, before.delta, {
        label: 'reveal all related settings',
      });
    }
    await page.waitForFunction(relatedFrame, true);
    const detail = await page.evaluate(relatedFrame);
    assert.equal(
      detail.rows.length,
      3,
      'All three real related settings rows are visible',
    );
    assert.ok(
      detail.save.top >= detail.footer.top &&
        detail.save.bottom <= detail.footer.bottom,
      'Fixed save action remains inside the footer',
    );
    await tools.evidence('related-settings', width, 'light');
    report.layouts.at(-1).relatedSettings = detail;
    await expectThemeEntries(page, true);
  }
  report.checks.push(
    'Desktop/mobile/light/dark/short viewport have no horizontal overflow and all actual targets meet the shared size boundary; four external labels, public shell, real related entries and sequential keyboard fields are verified.',
  );
}
