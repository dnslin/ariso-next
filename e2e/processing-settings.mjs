import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { testId, field, quote } from './processing-helpers.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';

export async function verifyProcessingSettings(page, config, tools, report) {
  const {
    request,
    settings,
    open,
    fill,
    value,
    select,
    switchTo,
    monitor,
    browser,
    sql,
    evidence: baseEvidence,
    scrollDetails,
  } = tools;
  const evidence = async (state, width = 1440, theme = 'light', height) => {
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => {
      const region = document.querySelector('[data-slot="toast-region"]');
      return (
        !region?.hasAttribute('data-expanded') &&
        [...document.querySelectorAll('[data-slot="toast"]')].every(
          (toast) =>
            !toast.hasAttribute('data-entering') &&
            !toast.hasAttribute('data-exiting') &&
            toast
              .getAnimations({ subtree: true })
              .every((animation) => animation.playState !== 'running'),
        )
      );
    });
    const targets = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="toast"]')].map((toast) => {
          const close = toast.querySelector('[data-slot="toast-close"]');
          const rect = close.getBoundingClientRect();
          const style = getComputedStyle(close);
          return {
            title: toast.querySelector('[data-slot="toast-title"]').textContent,
            frontmost: toast.hasAttribute('data-frontmost'),
            hidden: toast.hasAttribute('data-hidden'),
            blocked: Boolean(toast.closest('[inert],[aria-hidden="true"]')),
            expanded: toast.hasAttribute('data-expanded'),
            ariaHidden: toast.getAttribute('aria-hidden'),
            inert: toast.hasAttribute('inert'),
            opacity: Number(style.opacity),
            pointerEvents: style.pointerEvents,
            tabIndex: close.tabIndex,
            width: rect.width,
            height: rect.height,
            hit: close.contains(
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              ),
            ),
          };
        }),
      );
    const collapsed = await targets();
    report.toastTargetLayouts ??= [];
    const entry = { state, width, theme, collapsed };
    report.toastTargetLayouts.push(entry);
    for (const target of collapsed) {
      if (target.hidden) {
        assert.equal(target.ariaHidden, 'true');
        assert.equal(target.inert, true);
        assert.equal(target.hit, false);
      } else if (target.blocked) {
        assert.equal(target.hit, false);
      } else if (target.frontmost) {
        assert.ok(target.width >= 44 && target.height >= 44);
        assert.equal(target.hit, true);
      } else {
        // HeroUI does not mark the ordinary collapsed second/third toast inert.
        // Check its actual pointer hit instead of inventing that attribute.
        assert.equal(
          target.hit,
          false,
          'A collapsed older toast close must not expose a scaled click target',
        );
      }
    }
    const visible = collapsed.filter(
      (target) => !target.hidden && !target.blocked,
    );
    try {
      if (visible.length > 1) {
        await page.hover('[data-slot="toast"][data-frontmost="true"]');
        await page.waitForFunction(() =>
          [...document.querySelectorAll('[data-slot="toast"]')]
            .filter((toast) => !toast.hasAttribute('data-hidden'))
            .every(
              (toast) =>
                toast.hasAttribute('data-expanded') &&
                !toast.hasAttribute('data-entering') &&
                !toast.hasAttribute('data-exiting') &&
                toast
                  .getAnimations({ subtree: true })
                  .every((animation) => animation.playState !== 'running'),
            ),
        );
        entry.expanded = await targets();
        for (const target of entry.expanded.filter((target) => !target.hidden))
          assert.ok(
            target.width >= 44 && target.height >= 44,
            'Every actually expanded close target is at least 44 px',
          );
      }
      await baseEvidence(state, width, theme, height);
    } finally {
      await page.mouse.move(5, 5);
    }
  };
  const assetDetails = async (state) => {
    for (const [segment, selectors] of [
      ['identity', [testId('asset')]],
      [
        'controls',
        [
          '[data-field="watermarkWidth"]',
          '[data-field="watermarkOpacity"]',
          '[data-slot="card"]:has([data-field="watermarkWidth"]) > p:last-child',
        ],
      ],
    ]) {
      const details = await scrollDetails(selectors);
      await evidence(`${state}-${segment}`, 390, 'dark');
      Object.assign(report.layouts.at(-1), details);
    }
  };
  const toastPosition = async (title, bottom, remember = false) => {
    await page.waitForFunction(
      ({ title, bottom }) => {
        const toast = document.querySelector(
          '[data-slot="toast"][data-frontmost="true"]:not([data-exiting="true"])',
        );
        return (
          toast?.querySelector('[data-slot="toast-title"]')?.textContent ===
            title &&
          !toast.hasAttribute('data-entering') &&
          parseFloat(
            getComputedStyle(toast.closest('[data-slot="toast-region"]'))
              .bottom,
          ) === bottom &&
          toast
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== 'running')
        );
      },
      { title, bottom },
    );
    const geometry = await page.evaluate((remember) => {
      const toast = document.querySelector(
        '[data-slot="toast"][data-frontmost="true"]:not([data-exiting="true"])',
      );
      if (remember) window.__processingSavedToast = toast;
      const rect = toast.getBoundingClientRect();
      const save = document.querySelector('[data-testid="processing-save"]');
      const button = save?.getBoundingClientRect();
      return {
        path: location.pathname,
        width: innerWidth,
        height: innerHeight,
        theme: document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light',
        title: toast.querySelector('[data-slot="toast-title"]').textContent,
        bottomGap: innerHeight - rect.bottom,
        footerTop: document
          .querySelector('.shell-footer')
          ?.getBoundingClientRect().top,
        saveHit: save
          ? save.contains(
              document.elementFromPoint(
                button.x + button.width / 2,
                button.y + button.height / 2,
              ),
            )
          : null,
        sameNotification: toast === window.__processingSavedToast,
      };
    }, remember);
    assert.ok(Math.abs(geometry.bottomGap - bottom) < 1);
    if (geometry.path === '/settings/processing') {
      assert.ok(
        geometry.height - geometry.bottomGap <= geometry.footerTop,
        'Processing notification is entirely above the fixed footer',
      );
      assert.equal(
        geometry.saveHit,
        true,
        'Toast never intercepts the save center',
      );
    }
    report.toastLayouts ??= [];
    report.toastLayouts.push(geometry);
    return geometry;
  };
  await request('/api/settings/media', 'PATCH', {
    compressionEnabled: true,
    defaultLinkVersion: 'compressed',
    watermarkMode: 'off',
    watermarkAssetId: null,
    quality: 82,
    concurrency: 1,
  });
  await open();
  await resizeViewport(page, 1440);
  await monitor();
  const before = await settings();
  assert.equal(await value('quality'), String(before.quality));
  await fill('quality', 76);
  await select('defaultVisibility', 'private');
  await fill('concurrency', 2);
  await page.focus(testId('save'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    window.__processingBrowser.requests.some(
      (row) => row.method === 'PATCH' && row.status === 200,
    ),
  );
  const saved = await settings();
  assert.equal(saved.quality, 76);
  assert.equal(saved.defaultVisibility, 'private');
  assert.equal(saved.concurrency, 2);
  assert.equal(new URL(await page.url()).pathname, '/settings/processing');
  const savedToast = await toastPosition('处理设置已保存', 100, true);
  savedToast.screenshot = 'processing-toast-saved-1440.png';
  await page.screenshot({ path: join(config.output, savedToast.screenshot) });
  await page.click('.shell-navigation a[href="/upload"]');
  await page.waitForURL(`${config.origin}/upload`);
  assert.equal(
    (await toastPosition('处理设置已保存', 28)).sameNotification,
    true,
  );
  await resizeViewport(page, 390);
  assert.equal(
    (await toastPosition('处理设置已保存', 24)).sameNotification,
    true,
  );
  await resizeViewport(page, 1440);
  await page.click('.shell-navigation a[href="/settings/processing"]');
  await page.waitForURL(`${config.origin}/settings/processing`);
  await page.waitForSelector(`${testId('editor')}[data-state="ready"]`);
  await page.waitForFunction(() =>
    window.__processingBrowser.requests.some(
      (row) =>
        row.path === '/api/settings/media' &&
        row.method === 'GET' &&
        row.status === 200 &&
        row.response?.quality === 76,
    ),
  );
  assert.equal(await value('quality'), '76');
  report.checks.push({
    check:
      'Real GET fills the form; keyboard save persists quality, visibility and concurrency. Its live neutral Toast sits 100 px above the viewport bottom without intercepting save; real client navigation to Upload keeps that same notification and restores ordinary desktop/mobile offsets 28/24. Returning through the actual sidebar reads saved values without a success page.',
    saved: {
      quality: saved.quality,
      defaultVisibility: saved.defaultVisibility,
      concurrency: saved.concurrency,
    },
  });

  await monitor();
  await fill('quality', 101);
  await page.click(testId('save'));
  await page.waitForFunction(() => {
    const field = document.querySelector('[data-field="quality"]');
    return (
      field?.textContent.includes('100') &&
      field?.querySelector('input:not([type="hidden"]):not([type="range"])')
        ?.value === '101'
    );
  });
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'PATCH').length,
    0,
  );
  assert.equal((await settings()).quality, 76);
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return (
      active?.matches(
        'input:not([type="hidden"]):not([type="range"]),textarea',
      ) && active.closest('[data-field]')?.dataset.field === 'quality'
    );
  });
  assert.equal(
    await page.evaluate(
      () => document.activeElement?.closest('[data-field]')?.dataset.field,
    ),
    'quality',
  );
  report.checks.push({
    check:
      'Out-of-range quality stays entered, receives its field error and keyboard focus, and sends no invalid PATCH.',
  });

  // The real server rejects this update. The browser must keep the entered value.
  await sql(
    "CREATE TRIGGER processing_reject_save BEFORE UPDATE ON media_settings BEGIN SELECT RAISE(ABORT, 'processing browser save failure'); END",
  );
  try {
    await fill('quality', 73);
    await monitor();
    await page.click(testId('save'));
    await page.waitForFunction(() =>
      window.__processingBrowser.requests.some(
        (row) => row.method === 'PATCH' && row.status === 500,
      ),
    );
    await page.waitForSelector(`${testId('editor')} [role="alert"]`);
    assert.equal(await value('quality'), '73');
    assert.equal((await settings()).quality, 76);
    await evidence('save-failure', 390, 'dark');
  } finally {
    await sql('DROP TRIGGER processing_reject_save');
  }
  await page.click(testId('settings-reconcile'));
  await page.waitForSelector(testId('settings-preserve'));
  await page.click(testId('settings-preserve'));
  await toastPosition('输入已保留，请点击保存', 100);
  await monitor({ path: '/api/settings/media', method: 'PATCH' });
  await page.click(testId('save'));
  await page.waitForSelector(testId('settings-reconcile'));
  assert.equal(await value('quality'), '73');
  await page.click(testId('settings-reconcile'));
  await page.waitForFunction(() =>
    window.__processingBrowser.requests.some(
      (row) =>
        row.method === 'GET' &&
        row.path === '/api/settings/media' &&
        row.status === 200,
    ),
  );
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="processing-settings-reconcile"]'),
  );
  await toastPosition('已确认上次保存，当前输入已保留', 100);
  const verified = await browser();
  assert.equal(
    verified.requests.filter((row) => row.method === 'PATCH').length,
    1,
  );
  assert.equal((await settings()).quality, 73);
  report.checks.push({
    check:
      'Real HTTP 500 preserves input; a lost real successful PATCH is explicitly reconciled through GET without repeating the mutation.',
    requests: verified.requests,
  });

  await fill('quality', 71);
  await monitor({
    path: '/api/settings/media',
    method: 'PATCH',
    concurrentSettings: { quality: 68 },
  });
  await page.click(testId('save'));
  await page.waitForSelector(testId('settings-reconcile'));
  await page.click(testId('settings-reconcile'));
  await page.waitForSelector(testId('settings-preserve'));
  assert.equal(await value('quality'), '71');
  assert.equal((await settings()).quality, 68);
  await evidence('save-different', 390);
  await page.click(testId('settings-preserve'));
  assert.equal(await value('quality'), '71');
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'PATCH').length,
    1,
  );
  await page.click(testId('save'));
  await page.waitForFunction(
    () =>
      window.__processingBrowser.requests.filter(
        (row) => row.method === 'PATCH' && row.status === 200,
      ).length === 2,
  );
  assert.equal((await settings()).quality, 71);
  report.checks.push({
    check:
      'A real concurrent update makes reconciliation different; preserve keeps local input without saving it, and only the next explicit save submits again.',
  });

  await open();
  await monitor();
  await switchTo('压缩版本', false);
  await page.waitForSelector(testId('default-confirmation'));
  await evidence('default-confirmation', 390, 'dark');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[role="switch"][aria-label="压缩版本"]')
          .checked,
    ),
    true,
  );
  await switchTo('压缩版本', false);
  await page.click(testId('confirm-default'));
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'PATCH').length,
    0,
  );
  await page.click(testId('save'));
  await page.waitForFunction(() =>
    window.__processingBrowser.requests.some(
      (row) => row.method === 'PATCH' && row.status === 200,
    ),
  );
  assert.equal((await settings()).compressionEnabled, false);
  assert.equal((await settings()).defaultLinkVersion, 'original');
  report.checks.push({
    check:
      'Disabling the default compressed version requires confirmation; Escape preserves compression, confirmation changes only the draft until explicit save.',
  });

  await switchTo('启用水印', true);
  await page.click('[data-watermark-mode="image"]');
  await page.setInputFiles(testId('asset-file'), [
    new URL('../tests/fixtures/media-formats/alpha.png', import.meta.url)
      .pathname,
  ]);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="processing-asset"]')?.dataset
        .assetId,
  );
  const assetId = await page.evaluate(
    () =>
      document.querySelector('[data-testid="processing-asset"]').dataset
        .assetId,
  );
  let asset = await request(`/api/media/watermark-assets/${assetId}`);
  assert.equal(asset.status, 'ready');
  assert.ok(asset.expiresAt);
  assert.equal((await settings()).watermarkAssetId, null);
  await page.waitForSelector(`${testId('asset')}[data-state="temporary"]`);
  await evidence('temporary-asset', 390, 'dark');
  await assetDetails('temporary-asset');
  await page.click(testId('save'));
  await page.waitForFunction(
    (id) =>
      window.__processingBrowser.requests.some(
        (row) =>
          row.path === '/api/settings/media' &&
          row.method === 'PATCH' &&
          row.status === 200 &&
          row.response?.watermarkAssetId === id,
      ),
    assetId,
  );
  assert.equal((await settings()).watermarkAssetId, assetId);
  asset = await request(`/api/media/watermark-assets/${assetId}`);
  assert.equal(asset.expiresAt, null);
  await open();
  await page.waitForFunction(
    (id) =>
      document.querySelector('[data-testid="processing-asset"]')?.dataset
        .assetId === id,
    assetId,
  );
  const metadata = await page.evaluate(
    () =>
      document.querySelector('[data-testid="processing-asset"]').textContent,
  );
  assert.ok(metadata.includes(assetId));
  assert.ok(metadata.includes(asset.mime) || metadata.includes(asset.format));
  assert.ok(
    metadata.includes(String(asset.width)) &&
      metadata.includes(String(asset.height)),
  );
  assert.equal(
    (
      await sql(
        `SELECT expires_at FROM media_watermark_assets WHERE id=${quote(assetId)}`,
      )
    )[0].expires_at,
    null,
  );
  await evidence('saved-asset', 390, 'dark');
  await assetDetails('saved-asset');
  report.checks.push({
    check:
      'Actual file upload creates an expiring asset without saving settings; explicit save adopts it; re-entry reads persisted ID, format and dimensions through the real owner metadata endpoint.',
    asset: {
      id: assetId,
      mime: asset.mime,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
    },
  });

  await page.cdp('Network.enable');
  try {
    await page.cdp('Network.setBlockedURLs', {
      urls: ['*/api/media/watermark-assets/*'],
    });
    await open();
    await page.waitForSelector(testId('asset-retry'));
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="processing-asset"]').dataset
            .assetId,
      ),
      assetId,
    );
    await evidence('asset-read-error', 390, 'dark');
    await assetDetails('asset-read-error');
  } finally {
    await page.cdp('Network.setBlockedURLs', { urls: [] });
  }
  await monitor();
  await page.click(testId('asset-retry'));
  await page.waitForFunction(
    (id) =>
      window.__processingBrowser.requests.some(
        (row) =>
          row.path === `/api/media/watermark-assets/${id}` &&
          row.method === 'GET' &&
          row.status === 200,
      ),
    assetId,
  );
  assert.equal((await settings()).watermarkAssetId, assetId);
  report.checks.push({
    check:
      'A blocked actual saved-asset metadata request retains its persisted ID and exposes a retry; successful retry reads the actual row without uploading a replacement.',
  });

  for (const [name, bytes, status] of [
    [
      'processing-invalid-watermark.png',
      Buffer.from('Invalid watermark bytes supplied to the real inspector.'),
      422,
    ],
    [
      'processing-large-watermark.png',
      Buffer.alloc(5 * 1024 * 1024 + 1, 1),
      413,
    ],
  ]) {
    const path = join(config.output, name);
    await writeFile(path, bytes);
    await monitor();
    await page.setInputFiles(testId('asset-file'), [path]);
    await page.waitForFunction(
      (status) =>
        window.__processingBrowser.requests.some(
          (row) =>
            row.path === '/api/media/watermark-assets' &&
            row.method === 'POST' &&
            row.status === status,
        ),
      status,
    );
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="processing-asset"] [role="alert"]')
        ?.textContent.includes('上传失败'),
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="processing-asset"]').dataset
            .assetId,
      ),
      assetId,
    );
    assert.equal((await settings()).watermarkAssetId, assetId);
    await evidence(`asset-upload-rejected-${status}`, 390, 'dark');
    await assetDetails(`asset-upload-rejected-${status}`);
    report.checks.push({
      check:
        'Actual invalid or oversized watermark upload is explicitly rejected and retains the previous adopted asset ID.',
      file: name,
      status,
      retainedAssetId: assetId,
    });
  }

  await page.click('[data-watermark-mode="text"]');
  await fill('watermarkText', 'Ariso 验证');
  await fill('watermarkOpacity', 67);
  await page.click('[data-watermark-mode="image"]');
  assert.equal(await value('watermarkOpacity'), '67');
  await page.click('[data-watermark-mode="text"]');
  assert.equal(await value('watermarkOpacity'), '67');
  assert.equal(await value('watermarkText'), 'Ariso 验证');
  report.checks.push({
    check:
      'Text/image mode changes share one opacity value and retain text input.',
  });

  await fill('watermarkMargin', 2.125);
  await fill('watermarkFontSize', 3.5);
  await page.click('[data-watermark-mode="image"]');
  await fill('watermarkWidth', 12.25);
  await page.click('[data-watermark-mode="text"]');
  await monitor();
  const positions = [
    'top-left',
    'top-center',
    'top-right',
    'center-left',
    'center',
    'center-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ];
  for (const position of positions) {
    const selector = `[data-position="${position}"]`;
    await page.focus(selector);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (selector) =>
        document.querySelector(selector)?.getAttribute('aria-pressed') ===
        'true',
      selector,
    );
    assert.equal(
      await page.evaluate(
        (position) =>
          document
            .querySelector(`[data-position="${position}"]`)
            ?.getAttribute('aria-pressed'),
        position,
      ),
      'true',
    );
  }
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'PATCH').length,
    0,
  );
  await fill('watermarkColor', '#AB');
  await page.focus(field('watermarkOpacity'));
  assert.equal(await value('watermarkColor'), '#AB');
  await page.click(testId('save'));
  await page.waitForFunction(() =>
    document
      .querySelector('[data-field="watermarkColor"]')
      ?.textContent.includes('#RRGGBB'),
  );
  assert.equal(await value('watermarkColor'), '#AB');
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'PATCH').length,
    0,
  );
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return (
      active?.matches(
        'input:not([type="hidden"]):not([type="range"]),textarea',
      ) && active.closest('[data-field]')?.dataset.field === 'watermarkColor'
    );
  });
  assert.equal(
    await page.evaluate(
      () => document.activeElement?.closest('[data-field]')?.dataset.field,
    ),
    'watermarkColor',
  );
  await fill('watermarkColor', '#FFFFFF');
  await page.click(testId('save'));
  await page.waitForFunction(() =>
    window.__processingBrowser.requests.some(
      (row) =>
        row.path === '/api/settings/media' &&
        row.method === 'PATCH' &&
        row.status === 200,
    ),
  );
  const decimals = await settings();
  assert.equal(decimals.watermarkMargin, 2.125);
  assert.equal(decimals.watermarkFontSize, 3.5);
  assert.equal(decimals.watermarkWidth, 12.25);
  assert.equal(decimals.watermarkPosition, 'bottom-right');
  await open();
  assert.equal(await value('watermarkMargin'), '2.125');
  assert.equal(await value('watermarkFontSize'), '3.5');
  await page.click('[data-watermark-mode="image"]');
  assert.equal(await value('watermarkWidth'), '12.25');
  report.checks.push({
    check:
      'All nine position buttons are keyboard-selectable. Invalid #AB survives blur and field validation without a PATCH; exact margin 2.125, font size 3.5 and width 12.25 persist through real save and re-entry.',
    watermarkMargin: decimals.watermarkMargin,
    watermarkFontSize: decimals.watermarkFontSize,
    watermarkWidth: decimals.watermarkWidth,
  });

  await switchTo('最长边限制', true);
  await fill('maxEdge', 2048);
  await fill('maxEdge', '');
  await page.focus(field('quality'));
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    field('maxEdge'),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[role="switch"][aria-label="最长边限制"]')
          .checked,
    ),
    false,
  );
  await monitor();
  await page.click(testId('save'));
  await page.waitForFunction(() =>
    window.__processingBrowser.requests.some(
      (row) =>
        row.path === '/api/settings/media' &&
        row.method === 'PATCH' &&
        row.status === 200 &&
        row.response?.maxEdge === null,
    ),
  );
  assert.equal((await settings()).maxEdge, null);
  report.checks.push({
    check:
      'Clearing the actual longest-edge numeric control turns the optional limit off and explicitly saves null; required numeric fields retain validation behavior.',
  });

  await page.setInputFiles(testId('asset-file'), [
    join(config.projectDirectory, 'tests/fixtures/media-formats/alpha.png'),
  ]);
  await page.waitForFunction((previous) => {
    const area = document.querySelector('[data-testid="processing-asset"]');
    return area?.dataset.assetId && area.dataset.assetId !== previous;
  }, assetId);
  const expiringId = await page.evaluate(
    () =>
      document.querySelector('[data-testid="processing-asset"]').dataset
        .assetId,
  );
  await sql(
    `UPDATE media_watermark_assets SET expires_at=${Date.now() - 1} WHERE id=${quote(expiringId)}`,
  );
  const expiredAsset = await request(
    `/api/media/watermark-assets/${expiringId}`,
  );
  assert.equal(expiredAsset.available, false);
  assert.ok(Date.parse(expiredAsset.expiresAt) < Date.now());
  await monitor();
  await page.click(testId('save'));
  await page.waitForFunction(() =>
    window.__processingBrowser.requests.some(
      (row) =>
        row.path === '/api/settings/media' &&
        row.method === 'PATCH' &&
        row.status === 409,
    ),
  );
  await page.waitForFunction(
    (id) =>
      document
        .querySelector('[data-testid="processing-editor"] [role="alert"]')
        ?.textContent.includes(id),
    expiringId,
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="processing-asset"]').dataset
          .assetId,
    ),
    expiringId,
  );
  assert.equal((await settings()).watermarkAssetId, assetId);
  assert.equal(await value('watermarkWidth'), '12.25');
  await page.waitForFunction(
    (id) => {
      const asset = document.querySelector('[data-testid="processing-asset"]');
      return (
        asset?.dataset.assetId === id &&
        asset.dataset.state === 'unavailable' &&
        window.__processingBrowser.requests.some(
          (row) =>
            row.path === `/api/media/watermark-assets/${id}` &&
            row.method === 'GET' &&
            row.response?.available === false,
        )
      );
    },
    expiringId,
    { timeout: 35000 },
  );
  await evidence('asset-expired-save-rejected', 390, 'dark');
  await assetDetails('asset-expired-save-rejected');
  report.checks.push({
    check:
      'A real temporary asset expiry timestamp is advanced only in the disposable database. Actual metadata GET returns available=false, adoption PATCH returns 409, and the draft asset ID and decimal width remain entered while the adopted server ID stays unchanged.',
    temporaryAssetId: expiringId,
    retainedSavedAssetId: assetId,
  });
}
