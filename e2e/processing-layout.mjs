import assert from 'node:assert/strict';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { testId } from './processing-helpers.mjs';

export async function verifyProcessingLayouts(page, tools, report) {
  const { request, open, fill, value, switchTo, evidence } = tools;
  await request('/api/settings/media', 'PATCH', {
    compressionEnabled: true,
    watermarkMode: 'off',
    watermarkAssetId: null,
    defaultLinkVersion: 'compressed',
    quality: 82,
  });
  await open();
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.evaluate(() => {
        document
          .querySelector('.shell-content')
          ?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      });
      await evidence('settings', width, theme);
    }
  }
  const categories = await page.evaluate(() => {
    const container = document.querySelector(
      '.settings-desktop [data-slot="tabs-list-container"]',
    );
    const tab = container.querySelector('[role="tab"]');
    return {
      containerHeight: container.getBoundingClientRect().height,
      optionHeight: tab.getBoundingClientRect().height,
      containerRadius: getComputedStyle(container).borderTopLeftRadius,
      paintedListRadius: getComputedStyle(
        container.querySelector('[role="tablist"]'),
      ).borderTopLeftRadius,
      optionRadius: getComputedStyle(tab).borderTopLeftRadius,
    };
  });
  assert.equal(categories.containerHeight, 52);
  assert.equal(categories.optionHeight, 44);
  assert.equal(categories.containerRadius, '16px');
  assert.equal(categories.paintedListRadius, '16px');
  assert.equal(categories.optionRadius, '12px');
  await resizeViewport(page, 1440);
  await setTheme(page, 'light');
  await switchTo('启用水印', true);
  await page.click('[data-watermark-mode="text"]');
  await fill('watermarkText', 'Ariso 真实预览');
  for (const width of [1440, 390]) {
    await evidence('watermark-text', width, width === 1440 ? 'light' : 'dark');
    await page.click('[data-watermark-mode="image"]');
    await evidence(
      'watermark-image-empty',
      width,
      width === 1440 ? 'light' : 'dark',
    );
    await page.click('[data-watermark-mode="text"]');
  }
  await fill('watermarkFontSize', 3.5);
  const sliderPaint = await page.evaluate(() => {
    const slider = document.querySelector(
      '[data-field="watermarkFontSize"] [data-slot="slider"]',
    );
    const track = slider.querySelector('[data-slot="slider-track"]');
    const thumb = slider.querySelector('[data-slot="slider-thumb"]');
    const thumbRect = thumb.getBoundingClientRect();
    const paint = getComputedStyle(thumb, '::after');
    const foreground = getComputedStyle(document.body).color;
    const trackColor = getComputedStyle(track).backgroundColor;
    const luminance = (color) => {
      const channels = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const thumbLuminance = luminance(paint.backgroundColor);
    const trackLuminance = luminance(trackColor);
    return {
      theme: document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light',
      rootHeight: slider.getBoundingClientRect().height,
      thumbWidth: thumbRect.width,
      thumbHeight: thumbRect.height,
      paintWidth: paint.width,
      paintHeight: paint.height,
      paintRadius: paint.borderTopLeftRadius,
      paintColor: paint.backgroundColor,
      foreground,
      trackColor,
      trackContrast:
        (Math.max(thumbLuminance, trackLuminance) + 0.05) /
        (Math.min(thumbLuminance, trackLuminance) + 0.05),
    };
  });
  assert.equal(sliderPaint.theme, 'dark');
  assert.ok(sliderPaint.rootHeight >= 44);
  assert.ok(sliderPaint.thumbWidth >= 44 && sliderPaint.thumbHeight >= 44);
  assert.equal(sliderPaint.paintWidth, '20px');
  assert.equal(sliderPaint.paintHeight, '20px');
  assert.ok(parseFloat(sliderPaint.paintRadius) >= 10);
  assert.equal(sliderPaint.paintColor, sliderPaint.foreground);
  assert.ok(
    sliderPaint.trackContrast >= 3,
    'Dark thumb is visible against its track',
  );
  await page.focus('[data-field="watermarkFontSize"] input[type="range"]');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-field="watermarkFontSize"] input:not([type="hidden"]):not([type="range"])',
      ).value === '3.6',
  );
  assert.equal(await value('watermarkFontSize'), '3.6');
  const watermarkSegments = [];
  for (const [state, fields] of [
    ['watermark-position-margin', ['watermarkPosition', 'watermarkMargin']],
    ['watermark-text-font', ['watermarkText', 'watermarkFont']],
    [
      'watermark-style-bottom',
      [
        'watermarkFontSize',
        'watermarkColor',
        'watermarkOpacity',
        'watermarkStrokeColor',
        'watermarkStrokeWidth',
      ],
    ],
  ]) {
    await resizeViewport(page, 390, 844);
    await setTheme(page, 'dark');
    const segment = await page.evaluate((fields) => {
      const main = document.querySelector('.shell-content');
      const frame = main.getBoundingClientRect();
      const first = document.querySelector(`[data-field="${fields[0]}"]`);
      main.scrollTo({
        top:
          main.scrollTop + first.getBoundingClientRect().top - frame.top - 16,
        behavior: 'instant',
      });
      return {
        scrollTop: main.scrollTop,
        frame: { top: frame.top, bottom: frame.bottom },
        fields: fields.map((name) => {
          const rect = document
            .querySelector(`[data-field="${name}"]`)
            .getBoundingClientRect();
          return { name, top: rect.top, bottom: rect.bottom };
        }),
      };
    }, fields);
    assert.ok(segment.scrollTop > (watermarkSegments.at(-1)?.scrollTop ?? 0));
    for (const item of segment.fields)
      assert.ok(
        item.top >= segment.frame.top - 1 &&
          item.bottom <= segment.frame.bottom + 1,
        `${state}: ${item.name} is inside the actual content viewport`,
      );
    await evidence(state, 390, 'dark', 844);
    report.layouts.at(-1).scrollTop = segment.scrollTop;
    report.layouts.at(-1).visibleFields = segment.fields;
    watermarkSegments.push({ state, ...segment });
  }
  await page.focus(testId('preview-open'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.testid),
    'processing-preview-open',
  );
  const focus = await page.evaluate(() => {
    const node = document.activeElement;
    const style = getComputedStyle(node);
    return {
      marker: node.getAttribute('data-focus-visible'),
      outline: style.outlineStyle,
      shadow: style.boxShadow,
    };
  });
  assert.ok(
    focus.marker === 'true' ||
      focus.outline !== 'none' ||
      focus.shadow !== 'none',
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector(testId('preview'));
  const previewStructure = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="processing-preview"]');
    const heading = root.querySelector('h1');
    const back = [...root.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === '返回图片处理',
    );
    const group = root.querySelector('[role="group"]');
    const label = document.getElementById(
      group.getAttribute('aria-labelledby'),
    );
    const targets = [...group.querySelectorAll('[data-preview-target]')];
    return {
      title: heading.textContent,
      backBeforeHeading: Boolean(
        back.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      targetLabel: label.textContent,
      labelOutsideGroup: !group.contains(label),
      targets: targets.map((node) => ({
        target: node.dataset.previewTarget,
        width: node.getBoundingClientRect().width,
      })),
      emptyResultRegions: root.querySelectorAll(
        '[data-testid="processing-preview-result"]',
      ).length,
      emptyStatusHeadings: [...root.querySelectorAll('h2')].filter(
        (node) => node.textContent === '预览状态',
      ).length,
    };
  });
  assert.equal(previewStructure.title, '临时处理预览');
  assert.equal(previewStructure.backBeforeHeading, true);
  assert.equal(previewStructure.targetLabel, '预览目标');
  assert.equal(previewStructure.labelOutsideGroup, true);
  assert.deepEqual(
    previewStructure.targets.map((item) => item.target),
    ['original', 'thumbnail', 'compressed', 'watermark'],
  );
  assert.ok(
    previewStructure.targets.every(
      (item) => Math.abs(item.width - previewStructure.targets[0].width) < 1,
    ),
    'Preview target buttons have equal widths',
  );
  assert.equal(previewStructure.emptyResultRegions, 0);
  assert.equal(previewStructure.emptyStatusHeadings, 0);
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 430, 768, 1440])
      await evidence('preview-empty', width, theme);
    for (const [width, height] of [
      [390, 500],
      [1440, 600],
    ]) {
      await evidence('preview-short', width, theme, height);
      const footer = await page.evaluate(() => {
        const button = document.querySelector(
          '[data-testid="processing-preview-create"]',
        );
        const rect = button.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          viewport: innerHeight,
        };
      });
      assert.ok(
        footer.top >= 0 &&
          footer.bottom <= footer.viewport &&
          footer.height >= 44,
        'Preview footer stays reachable in a short viewport',
      );
    }
  }
  await page.click(testId('preview-return'));
  await page.waitForSelector(`${testId('editor')}[data-state="ready"]`);
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.testid),
    'processing-preview-open',
  );
  assert.equal(await value('watermarkText'), 'Ariso 真实预览');
  report.checks.push({
    check:
      'Actual settings and empty preview use the shared owner shell in light/dark at 360/390/430/768/1440; text/image states preserve their values. Keyboard opens the preview and returns focus to its exact entry. Short 390×500 and 1440×600 keep the action footer reachable.',
    focus,
    categories,
    sliderPaint,
    sliderKeyboard: { from: 3.5, key: 'ArrowRight', to: 3.6 },
    watermarkSegments,
    previewStructure,
  });
}
