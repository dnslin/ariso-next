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
  const recordFailure = async (stage, theme, width) => {
    report.layoutFailure = {
      state,
      stage,
      theme,
      width,
      ...(await page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight },
        themeClass: document.documentElement.className,
        storedTheme: localStorage.getItem('theme'),
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
        animations: document.getAnimations().map((animation) => ({
          name: animation.animationName ?? null,
          transition: animation.transitionProperty ?? null,
          playState: animation.playState,
          currentTime: animation.currentTime,
          target: animation.effect?.target
            ? {
                tag: animation.effect.target.tagName,
                slot: animation.effect.target.getAttribute?.('data-slot'),
                testId: animation.effect.target.getAttribute?.('data-testid'),
                className: animation.effect.target.getAttribute?.('class'),
              }
            : null,
          timing: animation.effect
            ? {
                ...animation.effect.getTiming(),
                iterations: String(animation.effect.getTiming().iterations),
              }
            : null,
        })),
      }))),
    };
    await page.screenshot({
      path: join(
        config.output,
        `storage-admin-${state}-${theme}-${width}-layout-failure.png`,
      ),
    });
  };
  for (const theme of ['light', 'dark']) {
    try {
      await setTheme(page, theme);
    } catch (error) {
      await recordFailure('theme', theme, widths[0]);
      throw error;
    }
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
      try {
        await page.waitForFunction(() =>
          document
            .getAnimations()
            .every(
              (animation) =>
                animation.playState !== 'running' ||
                animation.effect?.getTiming().iterations === Infinity,
            ),
        );
      } catch (error) {
        await recordFailure('animations', theme, width);
        throw error;
      }
      const geometry = await readGeometry(page);
      if (state === 'list' && width === 1440) {
        const border = await page.evaluate(() => ({
          token: getComputedStyle(document.documentElement)
            .getPropertyValue('--border')
            .trim(),
          rows: [
            ...document.querySelectorAll(
              '[data-testid="storage-list"] [data-storage-id]',
            ),
          ].map((row) => getComputedStyle(row).borderBottomColor),
        }));
        assert.ok(border.rows.length > 0, 'Desktop list has real storage rows');
        const expected =
          theme === 'light' ? 'rgb(186, 232, 232)' : 'rgb(96, 125, 133)';
        assert.ok(
          border.rows.every((color) => color === expected),
          `${theme}: list separators use the design border token, got ${border.rows}`,
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
  const initialize = ({ path, mode }) => {
    const state = {
      original: window.fetch,
      mode,
      releases: [],
      observed: { settled: false },
    };
    const gate = new Promise((resolve) => state.releases.push(resolve));
    window.__storageReadFault = state;
    window.fetch = async (...args) => {
      const response = await state.original(...args);
      if (
        new URL(String(args[0]), location.href).pathname !== path ||
        (args[1]?.method ?? 'GET').toUpperCase() !== 'GET'
      )
        return response;
      state.observed = { settled: true, status: response.status };
      if (state.mode === 'hold') await gate;
      if (state.mode === 'fail')
        throw new TypeError(
          'Verification: actual storage read response was lost',
        );
      return response;
    };
  };
  const { identifier } = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(${initialize.toString()})(${JSON.stringify({ path, mode })});`,
    },
  );
  return {
    async result() {
      await page.waitForFunction(
        () => window.__storageReadFault?.observed.settled,
      );
      return page.evaluate(() => window.__storageReadFault.observed);
    },
    async release() {
      await page.evaluate(() => {
        const state = window.__storageReadFault;
        if (!state) return;
        state.mode = 'normal';
        for (const release of state.releases) release();
      });
    },
    async dispose() {
      try {
        await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier,
        });
      } finally {
        await page.evaluate(() => {
          const state = window.__storageReadFault;
          if (!state) return;
          state.mode = 'normal';
          for (const release of state.releases) release();
          window.fetch = state.original;
          delete window.__storageReadFault;
        });
      }
    },
  };
}

export async function loseStorageMutation(page, path, method) {
  await page.evaluate(
    ({ path, method }) => {
      const original = window.fetch;
      window.__storageMutationOriginal = original;
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
  return {
    async dispose() {
      await page.evaluate(() => {
        if (!window.__storageMutationOriginal) return;
        window.fetch = window.__storageMutationOriginal;
        delete window.__storageMutationOriginal;
        delete window.__storageMutationUsed;
        delete window.__storageMutationStatus;
      });
    },
  };
}
