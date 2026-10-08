/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const helpersUrl = new URL(
  './upload-settings-helpers.mjs',
  config.identitySessionScript,
).href;
const { uploadSettingsTools, limitsInput, limitsField } = await import(
  helpersUrl
);
const { uploadSettingsBehavior } = await import(
  new URL('./upload-settings-behavior.mjs', config.identitySessionScript).href
);
const { uploadSettingsRecovery } = await import(
  new URL('./upload-settings-recovery.mjs', config.identitySessionScript).href
);
const { uploadSettingsConsumers } = await import(
  new URL('./upload-settings-consumers.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const page = (await taskSpace(config.spaceId)).page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  origin: config.origin,
  phase: config.uploadSettingsPhase ?? 'all',
  checks: [],
  layouts: [],
  browserErrors: [],
  limitations: [
    'Only disposable runner data is changed; the manual preview remains independent.',
    'Network/gateway faults are controlled browser-boundary faults; lost PATCH responses follow real commits.',
    'Actual standalone restart persistence and old/new rules are verified by default integration tests.',
    'Physical touch, soft keyboard and device safe areas are outside current emulation acceptance.',
  ],
};
let tools;
let original;
let errorScript;
let failure;
try {
  errorScript = await installBrowserErrors(page);
  tools = await uploadSettingsTools(page, config, report);
  original = await tools.request('/api/settings/upload');
  for (const [phase, operation] of [
    [
      'representative',
      async () => {
        await tools.open();
        for (const theme of ['light', 'dark'])
          for (const width of [360, 390, 430, 768, 1440]) {
            await page.evaluate(() =>
              document
                .querySelector('.shell-content')
                ?.scrollTo({ top: 0, behavior: 'instant' }),
            );
            await tools.evidence('normal', width, theme);
          }
        await tools.evidence('normal-short', 390, 'dark', 560);
        await page.focus(limitsField('queueLimit'));
        for (const selector of [
          'main a[href="/settings/storage"]',
          'main a[href="/settings/processing"]',
          '#site-save',
          '[data-testid="upload-limits-save"]',
        ]) {
          await page.keyboard.press('Tab');
          await page.waitForFunction(
            (selector) =>
              document.activeElement === document.querySelector(selector),
            selector,
          );
        }
        const footer = await page.evaluate(() => {
          const rect = document
            .querySelector('.shell-footer')
            .getBoundingClientRect();
          const action = document
            .querySelector('[data-testid="upload-limits-save"]')
            .getBoundingClientRect();
          return {
            bottom: rect.bottom,
            height: rect.height,
            actionBottom: action.bottom,
            viewport: innerHeight,
          };
        });
        assert.equal(footer.bottom, footer.viewport);
        // Shared shell: 48px action + 12/20px padding + 1px border.
        assert.equal(footer.height, 81);
        assert.ok(footer.actionBottom <= footer.viewport);
        await page.focus(limitsField('batchSize'));
        await page.keyboard.press('Tab');
        await page.waitForFunction(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          limitsField('queueLimit'),
        );
        const focus = await page.evaluate(() => {
          const group = document.activeElement.closest(
            '[data-slot="number-field-group"]',
          );
          const style = getComputedStyle(group);
          return {
            visible: group.dataset.focusVisible,
            width: style.outlineWidth,
            style: style.outlineStyle,
          };
        });
        assert.deepEqual(
          focus,
          { visible: 'true', width: '2px', style: 'solid' },
          'Keyboard NumberField focus has a visible 2px outline',
        );
        report.keyboardFocus = focus;
        await tools.evidence('keyboard-focus', 390, 'dark', 560);
        report.checks.push(
          'Responsive 360/390/430/768/1440, both themes, 390x560, keyboard footer focus and usable controls',
        );
      },
    ],
    ['behavior', () => uploadSettingsBehavior(page, config, tools, report)],
    ['recovery', () => uploadSettingsRecovery(page, tools, report)],
    ['consumers', () => uploadSettingsConsumers(page, config, tools, report)],
  ]) {
    if (
      config.uploadSettingsPhase !== undefined &&
      config.uploadSettingsPhase !== phase
    )
      continue;
    report.stage = phase;
    await operation();
    const errors = await readBrowserErrors(page);
    report.browserErrors.push(...errors);
    assert.deepEqual(
      errors,
      [],
      `Upload settings ${phase}: no runtime/resource errors`,
    );
  }
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  await page.screenshot({
    path: join(config.output, 'upload-settings-failure.png'),
  });
} finally {
  try {
    if (tools && original) {
      await tools.authenticate();
      await tools.request(
        '/api/settings/upload',
        'PATCH',
        limitsInput(original),
      );
      assert.deepEqual(await tools.request('/api/settings/upload'), original);
    }
    if (errorScript)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
    const errors = await readBrowserErrors(page);
    report.browserErrors.push(...errors);
    assert.deepEqual(errors, [], 'Cleanup also has no runtime errors');
  } catch (error) {
    failure ??= error;
    report.status = 'failed';
    report.cleanupError = error.stack ?? String(error);
  }
  await writeFile(
    join(config.output, 'upload-settings.json'),
    JSON.stringify(report, null, 2),
  );
}
if (failure) throw failure;
console.log(
  JSON.stringify({
    status: report.status,
    phase: report.phase,
    layouts: report.layouts.length,
    checks: report.checks,
  }),
);
