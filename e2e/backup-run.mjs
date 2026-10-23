/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const load = (file) => import(new URL(file, config.helperScript).href);
const {
  beginBackup,
  waitForBackupDownload,
  verifyPausedPages,
  importBackupThroughPage,
  prepareRestoreThroughPage,
  verifyRestoreReauthorization,
  verifyRestoreActivated,
} = await import(config.helperScript);
const { signInToLibrary } = await load('./library-login.mjs');
const { backupBrowserSecrets, serializeBackupBrowserReport } = await load(
  './backup-secrets.mjs',
);
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await load(
  './browser-geometry.mjs',
);
const { installBrowserErrors, assertNoBrowserErrors, isBrowserControlStop } =
  await load('./browser-errors.mjs');
assert.ok(Number.isInteger(config.spaceId) && config.spaceId > 0);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel);
const report = { status: 'failed', phase: config.phase, layouts: [] };
let errorScript, failure;

async function signIn(origin) {
  await page.goto(`${origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login') {
    await signInToLibrary(
      page,
      { origin, credentials: config.credentials },
      report,
    );
  }
  await page.waitForSelector('[data-testid="library-list"]');
}

async function capture(name) {
  for (const [width, height] of [
    [1440, 1080],
    [390, 844],
    [360, 780],
    [430, 932],
    [768, 1024],
    [390, 560],
  ]) {
    await resizeViewport(page, width, height);
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
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
      if (name === 'home') {
        assert.equal(geometry.overflow, false, 'Home fits the viewport');
        assert.equal(geometry.mainOverflow, false, 'Home content fits');
        assert.equal(
          await page.evaluate(() =>
            document.body.innerText.includes('开源 · 极简 · 图片托管'),
          ),
          false,
          'Home omits the removed caption',
        );
      } else {
        assertGeometry(geometry, `${name}/${width}x${height}/${theme}`);
      }
      if (name === 'confirm-backup') {
        const buttons = await page.evaluate(() => {
          const footer = document.querySelector('.alert-dialog__footer');
          const rect = footer.getBoundingClientRect();
          return {
            width: rect.width,
            buttons: [...footer.querySelectorAll('button')].map((button) => {
              const box = button.getBoundingClientRect();
              return {
                left: box.left - rect.left,
                width: box.width,
                top: box.top,
              };
            }),
          };
        });
        const [cancel, confirm] = buttons.buttons;
        assert.equal(buttons.buttons.length, 2);
        assert.ok(
          Math.abs(cancel.width - confirm.width) < 1,
          'Equal button widths',
        );
        assert.ok(
          Math.abs(cancel.top - confirm.top) < 1,
          'Buttons share a row',
        );
        assert.ok(Math.abs(cancel.left) < 1, 'Cancel aligns to the left edge');
        assert.ok(
          Math.abs(confirm.left + confirm.width - buttons.width) < 1,
          'Confirm aligns to the right edge',
        );
      }
      const filename = `backup-${name}-${width}x${height}-${theme}.png`;
      await page.screenshot({
        path: join(config.output, filename),
      });
      report.layouts.push({
        name,
        width,
        height,
        theme,
        screenshot: filename,
        geometry,
      });
    }
  }
  await resizeViewport(page, 1440, 1080);
  await setTheme(page, 'light');
  if (name === 'confirm-backup') {
    await page.focus('.alert-dialog__footer button:first-child');
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.testid),
      'backup-confirm-submit',
      'Tab reaches the confirmation button',
    );
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      '取消',
      'Shift+Tab returns to cancel',
    );
  }
}

async function api(path) {
  const response = await page.fetch(path);
  assert.equal(response.status, 200, `Restored API ${path}`);
  return JSON.parse(response.body);
}

try {
  errorScript = await installBrowserErrors(page);
  await resizeViewport(page, 1440, 1080);
  if (config.phase === 'create') {
    await page.goto(config.sourceOrigin);
    await page.waitForSelector('#home-heading');
    await capture('home');
    await signIn(config.sourceOrigin);
    await page.goto(`${config.sourceOrigin}/settings/backup`);
    await page.waitForSelector('#backup-create');
    await capture('empty');
    report.backupId = await beginBackup(page, {
      origin: config.sourceOrigin,
      password: config.password,
      onStep: capture,
    });
    await verifyPausedPages(page, {
      origin: config.sourceOrigin,
      imageId: config.imageId,
    });
    report.publicReadStatus = (await page.fetch(config.publicPath)).status;
    assert.equal(
      report.publicReadStatus,
      200,
      'Public original remains readable during backup',
    );
    await page.goto(`${config.sourceOrigin}/upload`);
    await page.waitForSelector('[data-testid="backup-pause-notice"]');
    await capture('paused');
    // Host-side release occurs between phases; leave no poller behind.
    await page.goto('about:blank');
  } else if (config.phase === 'download') {
    report.download = await waitForBackupDownload(page, {
      origin: config.sourceOrigin,
      id: config.backupId,
      path: config.download,
    });
    assert.equal(
      (await api('/api/backups/activity')).paused,
      false,
      'Normal writes reopen after success',
    );
    await capture('download');
    await page.goto('about:blank');
  } else if (config.phase === 'restore') {
    await page.goto(`${config.targetOrigin}/setup/restore`);
    await page.waitForSelector('#restore-code');
    await page.waitForSelector('#restore-password');
    assert.equal(
      await page.evaluate(() => document.querySelector('#restore-code').value),
      '',
    );
    await capture('import');
    await resizeViewport(page, 390, 560);
    await page.press('#restore-code', 'Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      'restore-file-button',
      'Keyboard skips the hidden native file input',
    );
    await page.keyboard.press('Tab');
    const focusedPassword = await page.evaluate(() => {
      const field = document.getElementById('restore-password');
      const rect = field.getBoundingClientRect();
      return {
        id: document.activeElement.id,
        top: rect.top,
        bottom: rect.bottom,
        footerTop: document.querySelector('footer').getBoundingClientRect().top,
      };
    });
    assert.equal(focusedPassword.id, 'restore-password');
    assert.ok(
      focusedPassword.top >= 0 &&
        focusedPassword.bottom <= focusedPassword.footerTop,
      'Keyboard-focused password remains above the fixed footer',
    );
    report.keyboard = { passed: true, viewport: '390x560' };
    await resizeViewport(page, 1440, 1080);
    await importBackupThroughPage(page, {
      origin: config.targetOrigin,
      setupCode: config.setupCode,
      password: config.password,
      file: config.download,
    });
    await capture('review');
    report.restoreReady = await prepareRestoreThroughPage(page, {
      publicUrl: config.targetOrigin,
      onStep: capture,
      targets: config.restoreTargets ?? [],
    });
    report.reauthorizationReady = await verifyRestoreReauthorization(page, {
      setupCode: config.setupCode,
      hasRemoteTargets: !!config.restoreTargets?.length,
    });
    await capture('ready');
    // The runner restarts the target after this call. Avoid abandoned polling
    // requests during that deliberate offline window.
    await page.goto('about:blank');
  } else if (config.phase === 'activated') {
    await verifyRestoreActivated(page, { origin: config.targetOrigin });
    await signIn(config.targetOrigin);
    if (config.remoteStorageIds?.length) {
      const storages = await api('/api/storages');
      const settings = await api('/api/settings/storage');
      assert.equal(
        settings.defaultStorageId,
        config.remoteStorageIds[0],
        'Original S3 default is retained',
      );
      assert.equal(
        storages.find((storage) => storage.id === config.remoteStorageIds[0])
          ?.enabled,
        true,
      );
      assert.equal(
        storages.find((storage) => storage.id === config.remoteStorageIds[1])
          ?.enabled,
        false,
        'Second S3 remains disabled after activation',
      );
      report.retainedRemoteState = {
        defaultStorageId: settings.defaultStorageId,
        disabledStorageId: config.remoteStorageIds[1],
      };
      // Disabled media is intentionally unavailable. Only after proving its original
      // state, enable this disposable destination to check every image in a browser.
      const enabled = await page.fetch(
        `/api/storages/${config.remoteStorageIds[1]}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        },
      );
      assert.equal(
        enabled.status,
        200,
        'Enable the disposable second S3 solely for visual verification',
      );
      report.visualVerificationChange =
        'Second S3 explicitly enabled after its retained disabled state was verified';
      await page.reload();
      await page.waitForSelector('[data-testid="library-list"]');
    }
    for (const id of config.imageIds) {
      await page.waitForSelector(`[data-image-id="${id}"]`);
      await page.waitForFunction((imageId) => {
        const image = document.querySelector(
          `[data-image-id="${imageId}"] img`,
        );
        return image?.complete && image.naturalWidth > 0;
      }, id);
      const detail = await api(`/api/images/${id}`);
      assert.ok(
        detail.albums.some((album) => album.id === config.albumId),
        'Album relationship restored',
      );
      assert.ok(
        detail.tags.some((tag) => tag.id === config.tagId),
        'Tag relationship restored',
      );
    }
    assert.equal(
      (await page.fetch(config.publicPath)).status,
      200,
      'The restored original reads from the new instance',
    );
    report.images = config.imageIds.length;
    await capture('activated');
  } else {
    assert.fail(`Unsupported backup browser phase: ${config.phase}`);
  }
  report.browserErrors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error)) {
    try {
      await page.screenshot({
        path: join(config.output, `backup-${config.phase}-failure.png`),
      });
      report.failureSnapshot = await page.snapshot();
    } catch (diagnostic) {
      report.diagnosticError = String(diagnostic);
    }
  }
} finally {
  if (errorScript && !isBrowserControlStop(failure)) {
    try {
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
    } catch (error) {
      failure ??= error;
      report.status = 'failed';
      report.cleanupError = String(error);
    }
  }
  // Failure snapshots can contain entered fake secrets. Keep them out of reports.
  const json = serializeBackupBrowserReport(
    report,
    backupBrowserSecrets(config),
  );
  await writeFile(
    join(config.output, `backup-${config.phase}.json`),
    `${json}\n`,
  );
}
if (failure) throw failure;
console.log({ phase: config.phase, status: report.status });
