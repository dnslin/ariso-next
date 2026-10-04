import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resizeViewport, setTheme, readGeometry } from './browser-geometry.mjs';

export async function storageDialogGeometry(page) {
  return page.evaluate(() => {
    const node = [
      ...document.querySelectorAll('[data-slot="alert-dialog-dialog"]'),
    ].find((node) => node.getClientRects().length);
    if (!node) return null;
    const style = getComputedStyle(node);
    const body = node.querySelector('[data-slot="alert-dialog-body"]');
    const footer = node.querySelector('[data-slot="alert-dialog-footer"]');
    const container = node.closest('[data-slot="alert-dialog-container"]');
    return {
      viewport: innerWidth,
      width: node.getBoundingClientRect().width,
      containerWidth: container.getBoundingClientRect().width,
      containerFlex: getComputedStyle(container).flex,
      padding: style.padding,
      gap: style.rowGap,
      titleSize: getComputedStyle(node.querySelector('h2')).fontSize,
      bodyMargin: getComputedStyle(body).marginTop,
      footerMargin: getComputedStyle(footer).marginTop,
      buttons: [...footer.querySelectorAll('button')].map(
        (button) => button.getBoundingClientRect().height,
      ),
      buttonWidths: [...footer.querySelectorAll('button')].map(
        (button) => button.getBoundingClientRect().width,
      ),
    };
  });
}

export function assertStorageShortDialog(dialog) {
  assert.ok(dialog);
  assert.equal(dialog.width, dialog.viewport >= 1200 ? 480 : 358);
  assert.equal(dialog.containerWidth, dialog.width);
  assert.equal(dialog.containerFlex, '0 0 auto');
  assert.equal(dialog.padding, '24px');
  assert.equal(dialog.gap, '16px');
  assert.equal(dialog.titleSize, '20px');
  assert.equal(dialog.bodyMargin, '0px');
  assert.equal(dialog.footerMargin, '0px');
  assert.ok(dialog.buttons.length > 0);
  assert.ok(dialog.buttons.every((height) => height === 48));
  assert.ok(
    dialog.buttonWidths.every((width) => width === dialog.width - 50),
    'Short dialog actions fill the padded body width',
  );
}

export async function storageLayouts(
  page,
  config,
  report,
  state,
  widths = [360, 390, 430, 768, 1440],
) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width);
      await page.evaluate(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document
          .querySelector('.shell-content')
          ?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document
          .querySelector('[role="dialog"],[role="alertdialog"]')
          ?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      });
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== 'running' ||
              animation.effect?.getTiming().iterations === Infinity,
          ),
      );
      const geometry = await readGeometry(page);
      if (state === 'list' && width === 1440) {
        const border = await page.evaluate(() => ({
          token: getComputedStyle(document.documentElement)
            .getPropertyValue('--border')
            .trim(),
          cells: [
            ...document.querySelectorAll('[data-testid="storage-list"] td'),
          ].map((cell) => getComputedStyle(cell).borderBottomColor),
        }));
        assert.ok(border.cells.length > 0, 'Desktop list has real table cells');
        const expected =
          theme === 'light' ? 'rgb(186, 232, 232)' : 'rgb(96, 125, 133)';
        assert.ok(
          border.cells.every((color) => color === expected),
          `${theme}: table separators use the design border token, got ${border.cells}`,
        );
        (report.listBorders ??= []).push({ theme, width, ...border });
      }
      assert.equal(
        geometry.overflow,
        false,
        `${state}/${theme}/${width}: document overflow`,
      );
      assert.equal(
        geometry.mainOverflow,
        false,
        `${state}/${theme}/${width}: main overflow`,
      );
      for (const target of geometry.targets) {
        assert.ok(
          target.width >= (width < 1200 ? 44 : 24) &&
            target.height >= (width < 1200 ? 44 : target.navigation ? 40 : 24),
          `${state}: ${target.name} target ${target.width}×${target.height}`,
        );
      }
      const screenshot = `storage-admin-${state}-${theme}-${width}.png`;
      const dialog = await storageDialogGeometry(page);
      if (dialog) (report.dialogs ??= []).push({ state, theme, ...dialog });
      const footer = await page.evaluate(() => {
        const node = document.querySelector('.shell-footer');
        if (!node) return null;
        return {
          height: node.getBoundingClientRect().height,
          success: node.textContent.includes('默认存储已更新'),
        };
      });
      await page.screenshot({ path: join(config.output, screenshot) });
      report.layouts.push({ state, theme, ...geometry, footer, screenshot });
    }
  }
  await resizeViewport(page, 390);
  await setTheme(page, 'light');
}

export async function storageShortViewport(page, config, report) {
  for (const width of [390, 1440]) {
    await resizeViewport(page, width, 480);
    await page.focus('[data-testid="storage-save"]');
    const focus = await page.evaluate(() => {
      const node = document.activeElement;
      const rect = node.getBoundingClientRect();
      return {
        name: node.dataset.testid,
        top: rect.top,
        bottom: rect.bottom,
        viewport: innerHeight,
      };
    });
    assert.equal(focus.name, 'storage-save');
    assert.ok(
      focus.top >= 0 && focus.bottom <= focus.viewport,
      'Short viewport reaches the fixed save action',
    );
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.testid),
      'storage-save',
      'Keyboard order returns to save',
    );
    const screenshot = `storage-admin-editor-short-${width}.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({ state: 'editor-short', width, ...focus, screenshot });
  }
  await resizeViewport(page, 390);
}

// The successful bytes still come from the production server. Only delivery of
// a response is held/lost, so these scenarios cannot manufacture saved data.
export async function storageReadFault(page, path, mode) {
  return page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const original = window.fetch;
      window.__storageReadMode = ${JSON.stringify(mode)};
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (new URL(String(args[0]), location.href).pathname === ${JSON.stringify(path)} && (!args[1]?.method || args[1].method === 'GET')) {
          if (window.__storageReadMode === 'hold') await new Promise(resolve => { window.__releaseStorageRead = resolve; });
          if (window.__storageReadMode === 'fail') throw new TypeError('Verification: actual storage read response was lost');
        }
        return response;
      };
    })();`,
  });
}

export async function loseStorageMutation(page, path, method) {
  await page.evaluate(
    ({ path, method }) => {
      const original = window.fetch;
      window.__storageMutationUsed = false;
      window.__storageMutationStatus = null;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (
          !window.__storageMutationUsed &&
          new URL(String(args[0]), location.href).pathname === path &&
          args[1]?.method === method
        ) {
          window.__storageMutationUsed = true;
          window.__storageMutationStatus = response.status;
          throw new TypeError(
            'Verification: actual storage mutation response was lost',
          );
        }
        return response;
      };
    },
    { path, method },
  );
}
