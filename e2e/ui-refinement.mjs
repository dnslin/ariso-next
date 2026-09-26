import assert from 'node:assert/strict';
import { join } from 'node:path';

const disclosure = 'loc=role:dialog[name="访问说明"]';

export async function verifyAccessDisclosure(page, trigger, report) {
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[role="dialog"][aria-label="访问说明"]'),
    ),
    false,
    'Access explanation is not permanently expanded',
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('p')]
        .filter(
          (node) =>
            node.getClientRects().length > 0 &&
            /原有外链仍不可访问|公开原图可能包含 GPS|切换预览不会改变站点默认外链/.test(
              node.textContent,
            ),
        )
        .map((node) => node.textContent),
    ),
    [],
    'Detailed policy text is hidden until the explanation opens',
  );
  for (const input of ['pointer', 'keyboard']) {
    if (input === 'pointer') await page.click(trigger);
    else {
      await page.focus(trigger);
      await page.keyboard.press('Enter');
    }
    await page.waitForSelector(disclosure);
    const dialog = await page.evaluate(() => {
      const node = document.querySelector(
        '[role="dialog"][aria-label="访问说明"]',
      );
      const rect = node.getBoundingClientRect();
      return {
        text: node.textContent,
        dialogPadding: [
          'paddingTop',
          'paddingRight',
          'paddingBottom',
          'paddingLeft',
        ].map((key) => parseFloat(getComputedStyle(node)[key])),
        contentPadding: [
          'paddingTop',
          'paddingRight',
          'paddingBottom',
          'paddingLeft',
        ].map((key) => parseFloat(getComputedStyle(node.parentElement)[key])),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: innerWidth,
        height: innerHeight,
      };
    });
    assert.ok(
      dialog.text.trim().length > 10,
      'Expanded explanation contains the access policy',
    );
    assert.deepEqual(
      dialog.dialogPadding,
      [16, 16, 16, 16],
      'Explanation uses one 16px inner padding layer',
    );
    assert.deepEqual(
      dialog.contentPadding,
      [0, 0, 0, 0],
      'Popover content does not add default padding around the dialog',
    );
    assert.ok(dialog.left >= 0 && dialog.right <= dialog.width + 1);
    assert.ok(dialog.top >= 0 && dialog.bottom <= dialog.height + 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector(disclosure, { state: 'hidden' });
    await page.waitForFunction(() => {
      const active = document.activeElement;
      return (
        active?.getAttribute('aria-expanded') === 'false' &&
        active.getBoundingClientRect().width > 0
      );
    });
    const focused = await page.evaluate(() => ({
      name:
        document.activeElement?.getAttribute('aria-label') ||
        document.activeElement?.textContent.trim(),
      label: document.activeElement?.textContent.trim(),
    }));
    if (trigger.includes('查看访问说明')) {
      assert.ok(['公开', '私有'].includes(focused.label));
      assert.equal(
        focused.name,
        `${focused.label}：查看访问说明`,
        'Access explanation accessible name retains its visible visibility label',
      );
    } else {
      assert.equal(focused.name, '仅管理员可见');
    }
  }
  report.checks.push(
    'Access explanation opens by pointer and keyboard, fits the viewport, and Escape closes it and restores its trigger.',
  );
}

export async function verifyNaturalPreview(page, report) {
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="detail-preview"]');
    return image?.complete && image.naturalWidth > 0;
  });
  const preview = await page.evaluate(() => {
    const image = document.querySelector('[data-testid="detail-preview"]');
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    const body = document.querySelector('[data-testid="detail-body"]');
    const bodyRect = body?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      bounds: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      body: bodyRect
        ? {
            left: bodyRect.left,
            right: bodyRect.right,
            top: bodyRect.top,
            bottom: bodyRect.bottom,
            scrollTop: body.scrollTop,
          }
        : null,
      width: rect.width,
      height: rect.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      fit: style.objectFit,
      background: getComputedStyle(image.parentElement).backgroundColor,
    };
  });
  assert.ok(preview.width > 0 && preview.height > 0);
  if (
    preview.body &&
    preview.viewport.width >= 768 &&
    preview.viewport.height >= 540
  ) {
    assert.equal(
      preview.body.scrollTop,
      0,
      'Initial desktop detail body is at its scroll origin',
    );
    for (const edge of ['left', 'top'])
      assert.ok(
        preview.bounds[edge] >= preview.body[edge] - 1,
        `Preview ${edge} lies within the visible detail body`,
      );
    for (const edge of ['right', 'bottom'])
      assert.ok(
        preview.bounds[edge] <= preview.body[edge] + 1,
        `Preview ${edge} lies within the visible detail body`,
      );
  }

  assert.equal(
    preview.fit,
    'contain',
    'Decoded image fits fully inside the fixed preview stage without cropping',
  );
  assert.ok(
    preview.naturalWidth > 0 && preview.naturalHeight > 0,
    'The real preview decoded successfully',
  );
  assert.equal(
    preview.background,
    'rgba(0, 0, 0, 0)',
    'Preview has no large painted background',
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="返回"]')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => node.textContent.trim())
        .filter((text) => text !== '返回'),
    ),
    [],
    'Visible return controls use the same concise label while preserving destination-specific accessible names',
  );
  if (preview.body && preview.viewport.width >= 768) {
    const waitForDetailViewport = async (viewport) => {
      await page.waitForFunction(({ width, height }) => {
        const dialog = document.querySelector('[data-testid="library-detail"]');
        const body = document.querySelector('[data-testid="detail-body"]');
        if (!dialog || !body) return false;
        const visualHeight = parseFloat(
          getComputedStyle(dialog).getPropertyValue('--visual-viewport-height'),
        );
        const rect = dialog.getBoundingClientRect();
        return (
          innerWidth === width &&
          innerHeight === height &&
          Math.abs(visualHeight - height) <= 1 &&
          rect.top >= -1 &&
          rect.bottom <= height + 1 &&
          body.clientHeight > 0
        );
      }, viewport);
    };
    try {
      for (const height of [400, 320]) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width: 1440,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await waitForDetailViewport({ width: 1440, height });
        const short = await page.evaluate(() => {
          const body = document.querySelector('[data-testid="detail-body"]');
          const image = document.querySelector(
            '[data-testid="detail-preview"]',
          );
          body.scrollTop = 0;
          const rect = image.getBoundingClientRect();
          const frame = body.getBoundingClientRect();
          const metrics = {
            width: rect.width,
            height: rect.height,
            scrollHeight: body.scrollHeight,
            clientHeight: body.clientHeight,
          };
          body.scrollTop = Math.max(0, rect.bottom - frame.bottom);
          return metrics;
        });
        assert.ok(
          short.width > 0 && short.height > 0,
          'Short viewport retains a usable nonzero image',
        );
        assert.ok(
          short.scrollHeight > short.clientHeight,
          'Short detail body provides internal scrolling',
        );
        assert.equal(
          await page.evaluate(
            () =>
              document
                .querySelector('[data-testid="detail-preview"]')
                .getBoundingClientRect().bottom <=
              document
                .querySelector('[data-testid="detail-body"]')
                .getBoundingClientRect().bottom +
                1,
          ),
          true,
          'Scrolling reaches the bottom of the complete preview',
        );
      }
    } finally {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        ...preview.viewport,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForDetailViewport(preview.viewport);
      await page.evaluate(() => {
        document.querySelector('[data-testid="detail-body"]').scrollTop = 0;
      });
    }
  }
  report.checks.push(
    'Decoded preview preserves its natural aspect ratio without cropping or a large colored background.',
  );
}

export async function verifyUIRefinement({ page, config, report }) {
  const initial = await page.url();
  const measurements = [];
  try {
    for (const width of [390, 768, 1440, 1920]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: width < 1200 ? 844 : 1080,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      for (const path of ['/upload', '/library', '/trash']) {
        await page.goto(`${config.origin}${path}`);
        await page.waitForSelector('main h1');
        await page.waitForSelector('.shell-footer');
        const geometry = await page.evaluate(() => {
          const workspace = document
            .querySelector('.shell-workspace')
            .getBoundingClientRect();
          const footer = document.querySelector('.shell-footer');
          const rect = footer.getBoundingClientRect();
          const style = getComputedStyle(footer);
          return {
            workspaceLeft: workspace.left,
            workspaceRight: workspace.right,
            footerLeft: rect.left,
            footerRight: rect.right,
            paddingLeft: parseFloat(style.paddingLeft),
            paddingRight: parseFloat(style.paddingRight),
            hasBreadcrumb: !!document.querySelector('.shell-breadcrumb'),
            hasWorkspaceLabel: document
              .querySelector('main')
              .textContent.includes('工作空间'),
            titleFocused:
              document.activeElement === document.querySelector('main h1'),
          };
        });
        assert.equal(geometry.hasBreadcrumb, false);
        assert.equal(geometry.hasWorkspaceLabel, false);
        assert.ok(Math.abs(geometry.footerLeft - geometry.workspaceLeft) <= 1);
        assert.ok(
          Math.abs(geometry.footerRight - geometry.workspaceRight) <= 1,
        );
        assert.equal(geometry.paddingLeft, width < 1200 ? 16 : 32);
        assert.equal(geometry.paddingRight, width < 1200 ? 16 : 32);
        if (path === '/upload') {
          await page.waitForSelector('[data-testid="upload-composition"]');
          const upload = await page.evaluate(() => {
            const section = document.querySelector(
              '[aria-labelledby="upload-title"]',
            );
            const composition = document.querySelector(
              '[data-testid="upload-composition"]',
            );
            const picker = document
              .querySelector('[data-testid="upload-picker"]')
              .getBoundingClientRect();
            const settings = document
              .querySelector('[data-testid="upload-settings"]')
              .getBoundingClientRect();
            return {
              sectionWidth: section.getBoundingClientRect().width,
              availableWidth: (() => {
                const main = document.querySelector('main');
                const style = getComputedStyle(main);
                return (
                  main.clientWidth -
                  parseFloat(style.paddingLeft) -
                  parseFloat(style.paddingRight)
                );
              })(),
              compositionWidth: composition.getBoundingClientRect().width,
              gap: parseFloat(getComputedStyle(composition).columnGap),
              picker: {
                width: picker.width,
                height: picker.height,
                top: picker.top,
                bottom: picker.bottom,
              },
              settings: {
                width: settings.width,
                height: settings.height,
                top: settings.top,
              },
            };
          });
          assert.ok(
            Math.abs(upload.sectionWidth - upload.availableWidth) <= 1,
            'Upload fills the workspace content width',
          );
          assert.ok(
            Math.abs(upload.compositionWidth - upload.sectionWidth) <= 1,
          );
          if (width >= 768) {
            assert.equal(upload.settings.width, 360);
            assert.equal(upload.gap, 24);
            assert.ok(
              Math.abs(
                upload.picker.width + 360 + 24 - upload.compositionWidth,
              ) <= 1,
            );
            assert.ok(Math.abs(upload.picker.top - upload.settings.top) <= 1);
            assert.ok(
              upload.picker.height >= 360 && upload.settings.height >= 360,
            );
          } else {
            assert.ok(upload.settings.top >= upload.picker.bottom);
            assert.ok(
              Math.abs(upload.picker.width - upload.settings.width) <= 1,
            );
            assert.ok(upload.picker.height >= 280);
          }
          if (width === 1440) {
            const reduced = await page.evaluate(
              () => matchMedia('(prefers-reduced-motion: reduce)').matches,
            );
            try {
              await page.cdp('Emulation.setEmulatedMedia', {
                features: [
                  { name: 'prefers-reduced-motion', value: 'no-preference' },
                ],
              });
              await page.hover('.shell-footer');
              await page.waitForFunction(
                () =>
                  getComputedStyle(
                    document.querySelector(
                      '[data-testid="upload-idle-motion"]',
                    ),
                  ).animationName === 'upload-float',
              );
              const y = await page.evaluate(
                () =>
                  document
                    .querySelector('[data-testid="upload-idle-motion"]')
                    .getBoundingClientRect().y,
              );
              await page.waitForFunction(
                (y) =>
                  Math.abs(
                    document
                      .querySelector('[data-testid="upload-idle-motion"]')
                      .getBoundingClientRect().y - y,
                  ) > 1,
                y,
              );
              await page.cdp('Emulation.setEmulatedMedia', {
                features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
              });
              await page.waitForFunction(
                () =>
                  getComputedStyle(
                    document.querySelector(
                      '[data-testid="upload-idle-motion"]',
                    ),
                  ).animationName === 'none',
              );
              report.checks.push(
                'Idle upload cloud moves continuously without hover; reduced motion disables the animation.',
              );
            } finally {
              await page.cdp('Emulation.setEmulatedMedia', {
                features: [
                  {
                    name: 'prefers-reduced-motion',
                    value: reduced ? 'reduce' : 'no-preference',
                  },
                ],
              });
            }
          }
          measurements.push({ width, path, upload });
        }
        if (path === '/trash') {
          assert.equal(
            geometry.titleFocused,
            false,
            'Initial trash route does not steal focus into its heading',
          );
          await verifyAccessDisclosure(
            page,
            'loc=role:button[name="仅管理员可见"]',
            report,
          );
        }
        measurements.push({ width, path, ...geometry });
        await page.screenshot({
          path: join(
            config.output,
            `ui-refinement-${path.slice(1)}-${width}.png`,
          ),
        });
      }
      // Reproduce the original heading focus bug through a real pointer navigation.
      await page.goto(`${config.origin}/library`);
      await page.waitForSelector('#library-title');
      if (width < 1200) {
        await page.click('loc=role:button[name="菜单"]');
        await page.waitForSelector('loc=role:dialog[name="导航菜单"]');
      }
      const scope =
        width < 1200
          ? '[role="dialog"][aria-label="导航菜单"]'
          : '.shell-navigation';
      await page.click(`${scope} a[href="/trash"]`);
      await page.waitForURL(`${config.origin}/trash`);
      await page.waitForSelector('#trash-title');
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('#trash-title').matches(':focus-visible'),
        ),
        false,
        'Pointer navigation to trash has no heading focus ring',
      );
      await page.focus('loc=role:button[name="仅管理员可见"]');
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await page.evaluate(() => {
          const active = document.activeElement;
          return (
            active?.getAttribute('aria-label') === '刷新回收站' &&
            active.matches(':focus-visible,[data-focus-visible="true"]') &&
            active.getBoundingClientRect().width > 0
          );
        }),
        true,
        'Shift+Tab returns to the trash refresh control with visible keyboard focus',
      );
    }
    report.refinement = measurements;
    report.checks.push(
      'All real owner routes remove the workspace breadcrumb, paint the footer to workspace edges with responsive inner padding, and preserve keyboard focus without a pointer-triggered trash heading ring.',
    );
  } finally {
    await page.goto(initial);
    await page.waitForSelector('main h1');
  }
}
