import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import {
  libraryPreferencesKey,
  readLibraryPreferences,
} from '../src/app/library/library-preferences.ts';
import {
  control,
  screen,
  watchBlobUrls,
  assertBlobReleased,
  brandingFault,
} from './site-branding-helpers.mjs';

export async function verifyBrandingBehavior(page, config, tools, report) {
  await resizeViewport(page, 1440);
  await setTheme(page, 'light');
  await tools.open();
  await watchBlobUrls(page);
  const baseline = await tools.api();
  await tools.choose('logo');
  const first = await page.evaluate(
    () => document.querySelector('[data-testid="branding-logo-preview"]').src,
  );
  assert.match(first, /^blob:/);
  await page.click(control('logo', 'cancel'));
  await page.waitForSelector('[data-testid="branding-logo"]');
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('data-testid') ===
      'branding-logo-choose',
  );
  await assertBlobReleased(page, first, 'cancel before replacement');
  await tools.choose('logo', 'second.png');
  const second = await page.evaluate(
    () => document.querySelector('[data-testid="branding-logo-preview"]').src,
  );
  assert.notEqual(second, first);
  await page.click(control('logo', 'cancel'));
  await page.waitForSelector('[data-testid="branding-logo"]');
  await assertBlobReleased(page, second, 'cancel');
  assert.equal(
    (await tools.api()).logoUrl,
    baseline.logoUrl,
    'Selection and cancellation never persist',
  );
  await resizeViewport(page, 1440);
  await tools.choose('logo');
  const leavingPreview = await page.evaluate(
    () => document.querySelector('[data-testid="branding-logo-preview"]').src,
  );
  await page.click('.shell-navigation a[href="/library"]');
  await page.waitForSelector('[role="dialog"]:has-text("放弃未保存的修改")');
  await page.click('loc=role:button[name="继续编辑"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="branding-logo-preview"]').src,
    ),
    leavingPreview,
  );
  await page.click('.shell-navigation a[href="/library"]');
  await page.waitForSelector('[role="dialog"]:has-text("放弃未保存的修改")');
  const rawPreferences = await page.evaluate(
    (key) => localStorage.getItem(key),
    libraryPreferencesKey,
  );
  const { loadingMode } = readLibraryPreferences({
    getItem: () => rawPreferences,
  });
  await page.click('loc=role:button[name="放弃修改"]');
  await page.waitForURL(
    `${config.origin}/library${loadingMode === 'pages' ? '?page=1' : ''}`,
  );
  await assertBlobReleased(
    page,
    leavingPreview,
    'discarding selection on route unmount',
  );
  await tools.open();
  await watchBlobUrls(page);
  for (const [kind, files] of [
    ['logo', ['source.png', 'static.jpg', 'static.webp', 'static.svg']],
    ['favicon', ['source.png', 'multiple.ico', 'static.svg']],
  ]) {
    for (const file of files) {
      const before = await tools.api();
      await tools.choose(kind, file);
      const url = await page.evaluate(
        (kind) =>
          document.querySelector(`[data-testid="branding-${kind}-preview"]`)
            .src,
        kind,
      );
      const after = await tools.save(kind);
      await page.waitForFunction(
        (kind) =>
          document.activeElement?.getAttribute('data-testid') ===
          `branding-${kind}-choose`,
        kind,
      );
      assert.ok(after[`${kind}Url`]);
      assert.notEqual(after[`${kind}Url`], before[`${kind}Url`]);
      const other = kind === 'logo' ? 'favicon' : 'logo';
      assert.equal(
        after[`${other}Url`],
        before[`${other}Url`],
        'Each asset writes independently',
      );
      for (const field of ['name', 'description', 'publicUrl', 'timeZone'])
        assert.equal(after[field], baseline[field]);
      await assertBlobReleased(page, url, `successful ${kind}/${file}`);
      await page.reload();
      await page.waitForSelector(`${screen}[data-state="ready"]`);
      assert.equal((await tools.api())[`${kind}Url`], after[`${kind}Url`]);
      report.checks.push(
        `Real UI ${kind}/${file} persists independently through reload`,
      );
      await watchBlobUrls(page);
    }
  }
  const directory = join(config.output, 'site-branding-files');
  await mkdir(directory, { recursive: true });
  try {
    const large = join(directory, 'too-large.png');
    const png = await readFile(
      join(config.projectDirectory, 'tests/fixtures/media-formats/source.png'),
    );
    await writeFile(
      large,
      Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 + 1 - png.length)]),
    );
    for (const [kind, path] of [
      [
        'logo',
        join(
          config.projectDirectory,
          'tests/fixtures/media-formats/static.gif',
        ),
      ],
      [
        'favicon',
        join(
          config.projectDirectory,
          'tests/fixtures/media-formats/static.jpg',
        ),
      ],
      ['logo', large],
    ]) {
      const monitor = await brandingFault(page);
      const before = await tools.api();
      try {
        await page.setInputFiles(control(kind, 'file'), [path]);
        await tools.state('selected');
        await page.click(control(kind, 'save'));
        await tools.state('failed');
        assert.equal(
          (await monitor.observed()).writes,
          1,
          'The real service rejects unsupported format or >5 MiB',
        );
        assert.equal((await tools.api())[`${kind}Url`], before[`${kind}Url`]);
      } finally {
        await monitor.dispose();
      }
      await page.click(control(kind, 'cancel'));
      await tools.open();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  for (const kind of ['logo', 'favicon']) {
    const before = await tools.api();
    await page.click(control(kind, 'delete'));
    await page.waitForSelector('[role="alertdialog"]');
    if (kind === 'favicon')
      assert.equal(
        await page.evaluate(() =>
          [...document.querySelectorAll('[data-slot="toast"]')].some((node) =>
            node.textContent.includes('Logo 已移除'),
          ),
        ),
        false,
        'Starting the next operation dismisses this editor’s previous success toast before viewport settling',
      );
    for (const width of [390, 768, 1440])
      for (const theme of ['light', 'dark']) {
        await resizeViewport(page, width);
        await setTheme(page, theme);
        // React Aria updates --visual-viewport-height after the native resize.
        await page.waitForFunction(() => {
          const container = document.querySelector(
            '[data-slot="alert-dialog-container"]',
          );
          return (
            container &&
            Math.abs(container.getBoundingClientRect().height - innerHeight) <=
              1 &&
            !document
              .getAnimations()
              .some((animation) => animation.playState === 'running')
          );
        });
        try {
          await page.waitForFunction(
            (kind) => {
              const targets = ['cancel', 'confirm-delete'].map((action) => {
                const button = document.querySelector(
                  `[data-testid="branding-${kind}-${action}"]`,
                );
                if (!button || button.disabled)
                  return { action, receives: false };
                const rect = button.getBoundingClientRect();
                const hit = document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                );
                return {
                  action,
                  receives: hit !== null && button.contains(hit),
                  rect: rect.toJSON(),
                  hit: hit?.outerHTML.slice(0, 400),
                };
              });
              window.__brandingDeleteHit = {
                width: innerWidth,
                height: innerHeight,
                targets,
                toasts: [
                  ...document.querySelectorAll('[data-slot="toast"]'),
                ].map((node) => ({
                  text: node.textContent,
                  exiting: node.getAttribute('data-exiting'),
                })),
              };
              return targets.every((target) => target.receives);
            },
            kind,
            { timeout: 1000 },
          );
        } catch (error) {
          report.deleteHitFailure = await page.evaluate(
            () => window.__brandingDeleteHit,
          );
          await page.screenshot({
            path: join(config.output, 'delete-hit-failure.png'),
          });
          throw error;
        }
        await tools.evidence(`delete-${kind}`, width, theme);
      }
    await page.click(control(kind, 'cancel'));
    await page.waitForSelector('[role="alertdialog"]', { state: 'hidden' });
    await page.waitForFunction(
      (kind) =>
        document.activeElement?.getAttribute('data-testid') ===
        `branding-${kind}-choose`,
      kind,
    );
    assert.equal(
      (await tools.api())[`${kind}Url`],
      before[`${kind}Url`],
      'Delete cancellation retains the asset',
    );
    await page.click(control(kind, 'delete'));
    await page.waitForSelector('[role="alertdialog"]');
    await page.focus(control(kind, 'confirm-delete'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (kind) =>
        document
          .querySelector(`[data-testid="branding-${kind}"]`)
          ?.textContent.includes('内置'),
      kind,
    );
    assert.equal((await tools.api())[`${kind}Url`], null);
    await page.waitForFunction(
      (kind) =>
        document.activeElement?.getAttribute('data-testid') ===
        `branding-${kind}-choose`,
      kind,
    );
    assert.equal(
      (await page.fetch(before[`${kind}Url`])).status,
      404,
      'Confirmed delete removes the old real file',
    );
  }
  report.checks.push(
    'Replace/cancel/success revoke Blob previews and restore focus to the corresponding choose button; unsupported GIF/JPEG and >5 MiB are rejected by the real service, delete cancellation preserves and confirmed delete removes each independent asset.',
  );
}
