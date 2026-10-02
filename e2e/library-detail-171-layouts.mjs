import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  verifyDetailControls,
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';

export async function measureReprocessConfirmation(page) {
  const measured = await page.evaluate(() => {
    const dialog = document.querySelector(
      '[data-testid="reprocess-confirmation"]',
    );
    const rect = dialog.getBoundingClientRect();
    const body = dialog.querySelector('[data-slot="alert-dialog-body"]');
    const footer = dialog.querySelector('[data-slot="alert-dialog-footer"]');
    const footerRect = footer.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      role: dialog.getAttribute('role'),
      dialog: {
        width: rect.width,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        overflow: dialog.scrollWidth > dialog.clientWidth,
        tip: !!dialog.querySelector('[aria-haspopup="dialog"]'),
        returned: !!dialog.querySelector('[data-testid="detail-return"]'),
      },
      body: {
        overflowY: getComputedStyle(body).overflowY,
        minHeight: getComputedStyle(body).minHeight,
        overflowX: body.scrollWidth > body.clientWidth,
      },
      footer: {
        shrink: getComputedStyle(footer).flexShrink,
        columns:
          getComputedStyle(footer).gridTemplateColumns.split(/\s+/).length,
        top: footerRect.top,
        bottom: footerRect.bottom,
      },
      targets: [...footer.querySelectorAll('button')].map((node) => ({
        name: node.textContent.trim(),
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      })),
      bodyActions: [...body.querySelectorAll('button')].map((node) => ({
        name: node.textContent.trim(),
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      })),
      shellFooter: !!document.querySelector('.shell-footer'),
    };
  });
  assert.equal(measured.role, 'alertdialog');
  assert.equal(measured.overflow, false);
  assert.ok(measured.dialog.width <= Math.min(480, measured.width - 32));
  assert.ok(
    measured.dialog.left >= 15 &&
      measured.dialog.right <= measured.width - 15 &&
      measured.dialog.top >= 15 &&
      measured.dialog.bottom <= measured.height - 15,
    'Confirmation fits the viewport with its 16px outer space',
  );
  assert.equal(measured.dialog.overflow, false);
  assert.equal(measured.dialog.tip, false);
  assert.equal(measured.dialog.returned, false);
  assert.equal(measured.body.overflowX, false);
  assert.equal(measured.body.overflowY, 'auto');
  assert.equal(measured.body.minHeight, '0px');
  assert.equal(measured.footer.shrink, '0');
  assert.equal(measured.footer.columns, 2);
  assert.ok(
    measured.footer.top >= measured.dialog.top &&
      measured.footer.bottom <= measured.dialog.bottom,
  );
  assert.equal(measured.targets.length, 2);
  for (const target of measured.targets) {
    assert.ok(target.width >= 44);
    assert.equal(target.height, 48);
  }
  for (const action of measured.bodyActions)
    assert.ok(
      action.width >= 44 && action.height >= 44,
      `${action.name} retains a 44px target`,
    );
  assert.equal(measured.shellFooter, false);
  return measured;
}

export async function verifyReprocessLayout(
  { page, config, report },
  state,
  widths = [390, 1440],
) {
  for (const theme of ['light', 'dark']) {
    await setDetail171Theme(page, theme);
    for (const width of widths) {
      await setDetail171Viewport(page, width);
      if (state.startsWith('reprocess-confirm')) {
        const measured = await measureReprocessConfirmation(page);
        await page.screenshot({
          path: join(
            config.output,
            `detail-171-${state}-${theme}-${width}.png`,
          ),
        });
        report.layouts.push({
          state: `detail-171-${state}`,
          theme,
          ...measured,
        });
        continue;
      }
      const measured = await page.evaluate(() => ({
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        state: document.querySelector('[data-testid="detail-reprocess"]')
          .dataset.jobStatus,
        targets: [
          ...document.querySelectorAll(
            '[data-testid="detail-reprocess"] button,[data-slot="radio-content"][data-testid^="reprocess-scope-"],.shell-footer button',
          ),
        ]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({
            name: node.textContent.trim(),
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
        tip: !!document.querySelector('button[aria-label="查看处理说明"]'),
        scopeLayout: (() => {
          const group = document.querySelector(
            '[data-testid="detail-reprocess"] [role="radiogroup"]',
          );
          if (!group) return null;
          const options = [
            ...group.querySelectorAll('[data-slot="radio-content"]'),
          ];
          const updates = [...group.parentElement.querySelectorAll('p')].filter(
            (node) => node.textContent.trim().startsWith('本次将更新：'),
          );
          return {
            width: group.getBoundingClientRect().width,
            display: getComputedStyle(group).display,
            columns:
              getComputedStyle(group).gridTemplateColumns.split(/\s+/).length,
            controls: options.map((option) => ({
              x: option.getBoundingClientRect().x,
              y: option.getBoundingClientRect().y,
              height: option.getBoundingClientRect().height,
              native: option.querySelector('input')?.type === 'radio',
              control: !!option.querySelector('[data-slot="radio-control"]'),
            })),
            updates: updates.map((node) => ({
              insideGroup: group.contains(node),
              singleLine:
                node.getBoundingClientRect().height <=
                Number.parseFloat(getComputedStyle(node).lineHeight) + 1,
            })),
          };
        })(),
        footer: [...document.querySelectorAll('.shell-footer button')]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
      }));
      assert.equal(measured.overflow, false, `${state}/${theme}/${width}`);
      for (const target of measured.targets)
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `${state}: ${target.name} has a 44px target`,
        );
      if (measured.scopeLayout) {
        const scope = measured.scopeLayout;
        assert.equal(scope.display, 'grid');
        assert.ok(
          scope.width <= 640,
          'Scope choices stay within their 640px content width',
        );
        assert.equal(scope.columns, width < 768 ? 1 : 2);
        assert.equal(scope.controls.length, 4);
        for (const control of scope.controls) {
          assert.equal(control.native, true);
          assert.equal(control.control, true);
          assert.ok(
            control.height >= 56,
            'Scope choice retains its 56px target',
          );
        }
        if (width < 768)
          for (const control of scope.controls)
            assert.ok(Math.abs(control.x - scope.controls[0].x) <= 1);
        else {
          assert.ok(scope.controls[1].x > scope.controls[0].x);
          assert.ok(Math.abs(scope.controls[1].y - scope.controls[0].y) <= 1);
        }
        assert.deepEqual(scope.updates, [
          { insideGroup: false, singleLine: true },
        ]);
      }
      if (measured.scopeLayout)
        for (const action of measured.footer) {
          assert.equal(action.height, 48);
          if (width === 1440) assert.equal(action.width, 200);
        }
      if ([390, 1440].includes(width))
        await verifyDetailControls(page, {
          tip: measured.tip ? '处理说明' : null,
          returnText: '返回图片详情',
          explanation: '关闭处理开关不会删除或隐藏已有压缩图、水印图。',
        });
      await page.screenshot({
        path: join(config.output, `detail-171-${state}-${theme}-${width}.png`),
      });
      report.layouts.push({
        state: `detail-171-${state}`,
        theme,
        ...measured,
      });
    }
  }
}
