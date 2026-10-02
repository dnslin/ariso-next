import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function verifyDetailControls(page, { tip, returnText, explanation }) {
  const returned = '[data-testid="detail-return"]';
  await page.focus(returned);
  await page.hover(returned);
  const returnState = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="detail-return"]');
    const rect = node.getBoundingClientRect();
    return {
      text: node.textContent.trim(),
      icon: !!node.querySelector('svg[aria-hidden="true"]'),
      focused: document.activeElement === node,
      background: getComputedStyle(node).backgroundColor,
      width: rect.width,
      height: rect.height,
    };
  });
  assert.equal(returnState.text, returnText);
  assert.equal(returnState.text.includes('←'), false);
  assert.equal(returnState.icon, true);
  assert.equal(
    returnState.focused,
    true,
    'Hover preserves return-control focus',
  );
  assert.equal(returnState.background, 'rgba(0, 0, 0, 0)');
  assert.ok(returnState.width >= 44 && returnState.height >= 44);
  if (!tip) return;

  const trigger = `loc=role:button[name="查看${tip}"]`;
  const dialog = `loc=role:dialog[name="${tip}"]`;
  const assertClosed = async () => {
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.waitForFunction(
      (text) => !document.body.innerText.includes(text),
      explanation,
    );
    assert.equal(
      await page.evaluate(
        (text) => document.body.innerText.includes(text),
        explanation,
      ),
      false,
      'Closed tip keeps its secondary explanation out of the visible page',
    );
  };
  await assertClosed();
  const triggerState = await page.evaluate((label) => {
    const node = document.querySelector(`button[aria-label="查看${label}"]`);
    const rect = node.getBoundingClientRect();
    return {
      popup: node.getAttribute('aria-haspopup'),
      width: rect.width,
      height: rect.height,
    };
  }, tip);
  assert.equal(triggerState.popup, 'dialog');
  assert.ok(triggerState.width >= 44 && triggerState.height >= 44);
  for (const method of ['pointer', 'keyboard']) {
    if (method === 'pointer') await page.click(trigger);
    else {
      await page.focus(trigger);
      await page.keyboard.press('Enter');
    }
    await page.waitForSelector(dialog);
    const popup = await page.evaluate(
      ({ label, text }) => {
        const node = document.querySelector(
          `[role="dialog"][aria-label="${label}"]`,
        );
        const rect = node.getBoundingClientRect();
        return {
          explanation: node.innerText.includes(text),
          insideViewport:
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight,
          overflow: node.scrollWidth > node.clientWidth,
        };
      },
      { label: tip, text: explanation },
    );
    assert.equal(popup.explanation, true);
    assert.equal(
      popup.insideViewport,
      true,
      `${method} tip stays inside viewport`,
    );
    assert.equal(popup.overflow, false);
    await page.keyboard.press('Escape');
    await assertClosed();
    await page.waitForFunction(
      (label) =>
        document.activeElement?.getAttribute('aria-label') === `查看${label}`,
      tip,
    );
  }
}

// These records belong to verify-browser's disposable DATA_DIR, never a preview account.
export async function verifyLibraryDetail171({ page, config, sql, report }) {
  const image = 'library-007';
  const endpoint = `/api/images/${image}`;
  const before = JSON.parse((await page.fetch(endpoint)).body);
  const objects = await sql(
    `SELECT id,key,status FROM media_objects WHERE image_id='${image}' ORDER BY id`,
  );
  const patch = (path, body) =>
    page.fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const modified = await patch(endpoint, {
    displayName: '  已修改的显示名称 🌅  ',
    visibility: 'private',
  });
  assert.equal(modified.status, 200);
  const after = JSON.parse(modified.body);
  assert.equal(after.displayName, '已修改的显示名称 🌅');
  assert.equal(after.visibility, 'private');
  assert.equal(after.originalName, before.originalName);
  assert.equal(after.id, before.id);
  assert.deepEqual(
    await sql(
      `SELECT id,key,status FROM media_objects WHERE image_id='${image}' ORDER BY id`,
    ),
    objects,
  );
  assert.equal((await patch(endpoint, {})).status, 400);
  assert.equal(
    (await patch(endpoint, { displayName: '错误\n名称' })).status,
    400,
  );
  assert.equal(
    JSON.parse((await page.fetch(endpoint)).body).displayName,
    after.displayName,
  );
  assert.equal(
    (
      await patch(endpoint, {
        displayName: before.displayName,
        visibility: before.visibility,
      })
    ).status,
    200,
  );
  report.checks.push(
    'Real owner-cookie PATCH trims Unicode displayName and changes visibility without rewriting originalName, ID, object Key or stored state; empty/control-character edits reject without changing data. Edit UI remains design-blocked.',
  );

  const now = Date.now();
  await sql(
    `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES ('detail-171-album','详情关系验证','',${now},${now})`,
  );
  await sql(
    `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ('detail-171-tag','详情关系验证','详情关系验证',${now},${now})`,
  );
  const relationships = await patch(`${endpoint}/collections`, {
    albumIds: ['detail-171-album'],
    tagIds: ['detail-171-tag'],
  });
  assert.equal(relationships.status, 200);
  assert.deepEqual(JSON.parse(relationships.body).albums, [
    { id: 'detail-171-album', name: '详情关系验证' },
  ]);
  assert.deepEqual(JSON.parse(relationships.body).tags, [
    { id: 'detail-171-tag', displayName: '详情关系验证' },
  ]);
  const joined = await sql(
    `SELECT joined_at FROM album_images WHERE image_id='${image}' AND album_id='detail-171-album'`,
  );
  assert.equal(
    (await patch(`${endpoint}/collections`, { tagIds: [] })).status,
    200,
  );
  assert.deepEqual(
    await sql(
      `SELECT joined_at FROM album_images WHERE image_id='${image}' AND album_id='detail-171-album'`,
    ),
    joined,
  );
  assert.equal(
    (
      await patch(`${endpoint}/collections`, {
        albumIds: before.albums.map((album) => album.id),
        tagIds: before.tags.map((tag) => tag.id),
      })
    ).status,
    200,
  );
  await sql("DELETE FROM albums WHERE id='detail-171-album'");
  await sql("DELETE FROM tags WHERE id='detail-171-tag'");
  report.checks.push(
    'Single-image final-set relations use real collection provider transactions; omitted album selection retains its join timestamp while an empty tag set clears tags.',
  );

  const unread = await page.fetch(`${endpoint}/metadata`);
  assert.equal(unread.status, 200);
  assert.equal(JSON.parse(unread.body), null);
  const read = await page.fetch(`${endpoint}/metadata/read`, {
    method: 'POST',
  });
  assert.equal(read.status, 202);
  await page.waitForFunction(
    async (path) => {
      const response = await fetch(path);
      if (!response.ok)
        throw new Error(`Metadata verification HTTP ${response.status}`);
      const value = await response.json();
      return value?.status === 'succeeded' || value?.status === 'failed';
    },
    `${endpoint}/metadata`,
    { timeout: 30000 },
  );
  const metadata = JSON.parse((await page.fetch(`${endpoint}/metadata`)).body);
  assert.equal(metadata.status, 'succeeded');
  assert.equal(metadata.historical, false);
  assert.ok(metadata.data && Object.keys(metadata.data).length > 0);
  assert.ok(metadata.readAt);
  assert.equal(
    JSON.parse((await page.fetch(endpoint)).body).processingStatus,
    before.processingStatus,
  );
  report.checks.push(
    'Metadata GET distinguishes unread null; existing POST queues real ExifTool read, returns complete grouped JSON and timestamps, and leaves process state unchanged. Tree/search UI remains design-blocked.',
  );

  await page.goto(`${config.origin}/library?image=${image}`);
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click('loc=role:tab[name="压缩图"]');
  await page.click('[data-testid="detail-version-entry"]');
  await page.waitForSelector('[data-testid="detail-versions"]');
  assert.equal(
    new URL(await page.url()).searchParams.get('detailView'),
    'versions',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-testid^="version-info-"]').length,
    ),
    4,
  );
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="detail-versions"]')
        .textContent.includes('当前预览压缩图'),
    ),
  );
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(
      (value) => document.documentElement.classList.contains(value),
      theme,
    );
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: width >= 1200 ? 1080 : 844,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await page.waitForFunction((value) => innerWidth === value, width);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        targets: [
          ...document.querySelectorAll(
            '[data-testid="detail-versions"] button,.shell-footer button',
          ),
        ]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({
            name: node.textContent,
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
      }));
      assert.equal(layout.overflow, false);
      for (const target of layout.targets)
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `Version action target ${target.name}`,
        );
      if ([390, 1440].includes(width))
        await verifyDetailControls(page, {
          tip: '版本说明',
          returnText: '返回图库',
          explanation: '这里展示当前已保存的版本，没有历史回滚功能。',
        });
      await page.screenshot({
        path: join(config.output, `detail-171-versions-${theme}-${width}.png`),
      });
    }
  }
  await page.focus('loc=role:button[name="返回详情"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="detail-body"]');
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="detail-preview"]')]
        .find((node) => node.getClientRects().length)
        ?.getAttribute('src')
        .includes('type=compressed'),
    ),
  );
  await page.click('[data-testid="detail-version-entry"]');
  await page.waitForSelector('[data-testid="detail-versions"]');
  await page.click('[data-testid="detail-return"]');
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has('image'),
  );
  report.checks.push(
    'Version workspace uses one owner shell, shows four actual states across five widths/light-dark, preserves the explicit compressed preview on keyboard return, and closes subview directly to the source list.',
    'Version explanation defaults closed; pointer and Enter open its real dialog, Escape restores trigger focus, popup fits desktop/phone viewport, and the icon return control keeps transparent hover and keyboard focus.',
  );
  await verifyReprocess({ page, config, sql, report, image });
  await verifyDetail171Consumers({ page, config, sql, report });
}

async function verifyReprocess({ page, config, sql, report, image }) {
  const endpoint = `/api/images/${image}`;
  const workspace = '[data-testid="detail-reprocess"]';
  const confirmation = '[data-testid="reprocess-confirmation"]';
  const versionNames = {
    original: '原图',
    compressed: '压缩图',
    thumbnail: '缩略图',
    watermark: '水印图',
  };
  const button = (name) => `loc=role:button[name="${name}"]`;
  const direct = async (id = image, view = 'reprocess') => {
    await page.goto(
      `${config.origin}/library?image=${id}${view ? `&detailView=${view}` : ''}`,
    );
    await page.waitForSelector(
      view ? workspace : '[data-testid="detail-body"]',
    );
  };
  const confirmationLayout = async () => {
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
    assert.equal(measured.shellFooter, false);
    return measured;
  };
  const layout = async (state, widths = [390, 1440]) => {
    for (const theme of ['light', 'dark']) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      });
      await page.waitForFunction(
        (theme) => document.documentElement.classList.contains(theme),
        theme,
      );
      for (const width of widths) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height: width >= 1200 ? 1080 : 844,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await page.waitForFunction((width) => innerWidth === width, width);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        if (state.startsWith('reprocess-confirm')) {
          const measured = await confirmationLayout();
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
            const updates = [
              ...group.parentElement.querySelectorAll('p'),
            ].filter((node) =>
              node.textContent.trim().startsWith('本次将更新：'),
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
      }
    }
  };
  const versions = () =>
    sql(
      `SELECT kind,object_id FROM media_versions WHERE image_id='${image}' ORDER BY kind`,
    );
  const [settings] = await sql(
    'SELECT compression_enabled,watermark_mode,watermark_text,watermark_font FROM media_settings WHERE id=1',
  );
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const [active] = await sql("SELECT * FROM media_jobs WHERE id='active-job'");
  const [activeImage] = await sql(
    "SELECT processing_status FROM media_images WHERE id='library-002'",
  );
  const [candidateStorage] = await sql(
    "SELECT s.id,s.local_path FROM media_images i JOIN storage_configs s ON s.id=i.storage_id WHERE i.id='library-002'",
  );
  const candidateId = 'detail-171-render-candidate';
  const candidateKey = `library-fixtures/${candidateId}.png`;
  const candidatePath = join(
    config.dataDirectory,
    'storage',
    candidateStorage.local_path,
    'ariso',
    candidateStorage.id,
    candidateKey,
  );
  try {
    await sql(
      "UPDATE media_settings SET compression_enabled=1,watermark_mode='text',watermark_text='Ariso',watermark_font='latin' WHERE id=1",
    );
    await direct();
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.testid),
      'detail-workspace-title',
    );
    await layout('reprocess-selection', [360, 390, 430, 768, 1440]);
    const selectionDetail = JSON.parse((await page.fetch(endpoint)).body);
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171ConfirmationFetch = original;
      window.__detail171ConfirmationPosts = 0;
      window.fetch = (...args) => {
        if (
          new URL(String(args[0]), location.href).pathname ===
            `/api/images/${image}/reprocess` &&
          args[1]?.method === 'POST'
        )
          window.__detail171ConfirmationPosts++;
        return original(...args);
      };
    }, image);
    const assertSelected = async (scope) => {
      await page.waitForSelector(confirmation, { state: 'hidden' });
      await page.waitForFunction(
        (scope) =>
          document.activeElement ===
          document.querySelector(
            `[data-testid="reprocess-scope-${scope}"] input`,
          ),
        scope,
      );
      assert.equal(
        await page.evaluate(
          (scope) =>
            document.querySelector(
              `[data-testid="reprocess-scope-${scope}"] input`,
            ).checked,
          scope,
        ),
        true,
      );
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('.shell-footer [data-testid="reprocess-submit"]')
            .textContent.trim(),
        ),
        `重新生成${versionNames[scope]}`,
      );
      assert.equal(
        await page.evaluate(() => window.__detail171ConfirmationPosts),
        0,
        'Choosing, canceling and reopening confirmation never submits a job',
      );
    };
    try {
      for (const scope of ['compressed', 'watermark', 'thumbnail']) {
        await page.focus(`[data-testid="reprocess-scope-${scope}"] input`);
        await page.keyboard.press('Space');
        await page.waitForSelector(confirmation);
        await page.waitForFunction(
          () =>
            document.activeElement?.textContent.trim() === '取消' &&
            !!document.activeElement.closest(
              '[data-testid="reprocess-confirmation"]',
            ),
        );
        const content = await page.evaluate(() => {
          const dialog = document.querySelector(
            '[data-testid="reprocess-confirmation"]',
          );
          const rows = [...dialog.querySelectorAll('dt')].map((node) => [
            node.textContent.trim(),
            node.nextElementSibling.textContent.trim(),
          ]);
          return {
            heading: dialog
              .querySelector('[data-slot="alert-dialog-heading"]')
              .textContent.trim(),
            rows,
            backgroundTitle: document
              .querySelector('[data-testid="detail-workspace-title"]')
              .textContent.trim(),
            fullPageConfirmation: document
              .querySelector('[data-testid="detail-reprocess"]')
              .innerText.includes('本次范围：'),
          };
        });
        assert.equal(content.heading, `重新生成${versionNames[scope]}`);
        assert.equal(content.backgroundTitle, '重新处理这张图片');
        assert.equal(content.fullPageConfirmation, false);
        assert.deepEqual(content.rows, [
          ['更新', versionNames[scope]],
          [
            '保留',
            selectionDetail.versions
              .filter((version) => version.saved && version.kind !== scope)
              .map((version) => versionNames[version.kind])
              .join('、') || '无其他已保存版本',
          ],
        ]);
        if (scope === 'thumbnail') {
          await layout('reprocess-confirm-thumbnail');
          for (const height of [400, 280]) {
            await page.cdp('Emulation.setDeviceMetricsOverride', {
              width: 390,
              height,
              deviceScaleFactor: 1,
              mobile: true,
            });
            await page.waitForFunction(
              (height) => innerHeight === height,
              height,
            );
            const measured = await confirmationLayout();
            const scroll = await page.evaluate(() => {
              const main = document.querySelector('main');
              const before = main.scrollTop;
              const body = document.querySelector(
                '[data-testid="reprocess-confirmation"] [data-slot="alert-dialog-body"]',
              );
              body.scrollTop = body.scrollHeight;
              return {
                overflowing: body.scrollHeight > body.clientHeight + 1,
                scrolled: body.scrollTop > 0,
                mainUnchanged: main.scrollTop === before,
              };
            });
            if (height === 280) assert.equal(scroll.overflowing, true);
            if (scroll.overflowing) assert.equal(scroll.scrolled, true);
            assert.equal(
              scroll.mainUnchanged,
              true,
              'Short confirmation scrolls its own body',
            );
            await page.screenshot({
              path: join(
                config.output,
                `detail-171-reprocess-confirm-short-dark-390-${height}.png`,
              ),
            });
            report.layouts.push({
              state: 'detail-171-reprocess-confirm-short',
              theme: 'dark',
              ...measured,
              scroll,
            });
          }
        }
        if (scope === 'compressed')
          await page.click(
            `${confirmation} [data-slot="alert-dialog-footer"] button:first-child`,
          );
        else await page.keyboard.press('Escape');
        await assertSelected(scope);
        // The retained single scope opens the same small dialog from the footer.
        await page.click('.shell-footer [data-testid="reprocess-submit"]');
        await page.waitForSelector(confirmation);
        await page.waitForFunction(
          () =>
            document.activeElement?.textContent.trim() === '取消' &&
            !!document.activeElement.closest(
              '[data-testid="reprocess-confirmation"]',
            ),
        );
        await page.keyboard.press('Escape');
        await assertSelected(scope);
      }
    } finally {
      await page.evaluate(() => {
        window.fetch = window.__detail171ConfirmationFetch;
      });
    }
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await page.click('[data-testid="reprocess-scope-all"]');
    await page.waitForSelector(confirmation, { state: 'hidden' });
    report.checks.push(
      'Single-version selection opens a small real AlertDialog with saved-version update/retain rows and cancel autofocus; cancel/Escape preserve scope, restore its input focus, make no POST, and the retained-scope footer reopens confirmation. Desktop/phone light-dark dialog fits its viewport, hides the shell footer, and short-view content scrolls inside the dialog while both 48px actions stay reachable.',
    );
    // Every successful response below is from the real worker and actual tools.
    const saved = await versions();
    await sql(
      `UPDATE media_images SET processing_status='failed' WHERE id='${image}'`,
    );
    // Open the real failed filter through a selected source card. The starting
    // failure is controlled; the following retry and its completion are real.
    await page.goto(`${config.origin}/library?status=failed`);
    await page.waitForSelector(`[data-image-id="${image}"]`);
    await page.hover(button('查看图片：中文下载样本.png'));
    await page.click(
      'label:has(input[aria-label="选择图片：中文下载样本.png"])',
    );
    await page.waitForSelector('[data-testid="library-selection"]');
    await page.click(button('查看图片：中文下载样本.png'));
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    await page.click(button('重新处理'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    // Navigation starts a new page runtime; observe the actual request again.
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171Posts = [];
      window.__detail171Statuses = [];
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === `/api/images/${image}/reprocess`)
          window.__detail171Posts.push(args[1]?.body);
        if (path === '/api/images/status')
          window.__detail171Statuses.push(JSON.parse(args[1].body).ids);
        return original(...args);
      };
    }, image);
    await page.click('[data-testid="reprocess-submit"]');
    await page.waitForSelector(`${workspace}[data-job-status="succeeded"]`, {
      timeout: 30000,
    });
    const completed = JSON.parse((await page.fetch(endpoint)).body);
    assert.equal(completed.processingJob.status, 'succeeded');
    assert.equal(completed.processingJob.scope, 'all');
    assert.deepEqual(completed.processingJob.expectedVersions, [
      'compressed',
      'thumbnail',
      'watermark',
    ]);
    const replaced = await versions();
    assert.equal(
      replaced.find((value) => value.kind === 'original').object_id,
      saved.find((value) => value.kind === 'original').object_id,
    );
    for (const kind of ['compressed', 'thumbnail', 'watermark'])
      assert.notEqual(
        replaced.find((value) => value.kind === kind).object_id,
        saved.find((value) => value.kind === kind)?.object_id,
      );
    assert.equal(await page.evaluate(() => window.__detail171Posts.length), 1);
    const polls = await page.evaluate(() => window.__detail171Statuses);
    for (const ids of polls) assert.ok(ids.length <= 80);
    // Two polling periods prove a terminal task stops requesting current-ID status.
    const currentPolls = polls.filter(
      (ids) => ids.length === 1 && ids[0] === image,
    ).length;
    await page.waitForTimeout(4200);
    assert.equal(
      await page.evaluate(
        (image) =>
          window.__detail171Statuses.filter(
            (ids) => ids.length === 1 && ids[0] === image,
          ).length,
        image,
      ),
      currentPolls,
    );
    await layout('reprocess-success');
    // Reopen the action on the same mounted image after its confirmed success.
    await page.click(button('查看图片详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    await page.click(button('重新处理'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    await page.click('[data-testid="reprocess-scope-thumbnail"]');
    await page.waitForSelector(confirmation);
    await page.click(`${confirmation} [data-testid="reprocess-submit"]`);
    await page.waitForSelector(`${workspace}[data-job-status="succeeded"]`, {
      timeout: 30000,
    });
    const repeated = JSON.parse((await page.fetch(endpoint)).body);
    assert.notEqual(repeated.processingJob.id, completed.processingJob.id);
    assert.equal(repeated.processingJob.scope, 'thumbnail');
    const repeatedVersions = await versions();
    for (const kind of ['original', 'compressed', 'watermark'])
      assert.equal(
        repeatedVersions.find((value) => value.kind === kind).object_id,
        replaced.find((value) => value.kind === kind).object_id,
      );
    assert.notEqual(
      repeatedVersions.find((value) => value.kind === 'thumbnail').object_id,
      replaced.find((value) => value.kind === 'thumbnail').object_id,
    );
    assert.equal(await page.evaluate(() => window.__detail171Posts.length), 2);
    report.checks.push(
      'Confirmed successful receipt resets when reopening the version-page reprocess action on the same image; a second real thumbnail-only job completes without closing/reloading and preserves all unselected versions.',
    );
    await page.evaluate(() => {
      window.fetch = window.__detail171Fetch;
    });
    await page.click(button('返回图库'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('image'),
    );
    assert.equal(
      new URL(await page.url()).searchParams.get('status'),
      'failed',
    );
    await page.waitForSelector('[data-testid="library-selection"]', {
      state: 'hidden',
    });
    await page.waitForSelector('button[data-refresh-available="true"]');
    await page.click(button('刷新图库'));
    await page.waitForFunction(
      (image) => !document.querySelector(`[data-image-id="${image}"]`),
      image,
    );
    report.checks.push(
      'Real all-scope retry from a selected failed-filter card runs ImageMagick, creates compressed/thumbnail/text-watermark versions and succeeds in UI; original stays fixed, derived object IDs change, submission occurs once, status batches remain ≤80 and current-ID polling stops. Completion marks list refresh available, reconciliation removes the no-longer-failed selection, and manual refresh excludes the image from the real failed query.',
    );

    // Lose a real accepted POST response; never replace it with fabricated API data.
    await direct();
    await page.click('[data-testid="reprocess-scope-thumbnail"]');
    await page.waitForSelector(confirmation);
    const [priorCount] = await sql(
      `SELECT COUNT(*) AS count FROM media_jobs WHERE image_id='${image}' AND kind='process'`,
    );
    const beforeSingle = await versions();
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171LostPosts = 0;
      window.__detail171LostReceipt = null;
      window.__detail171LostRelease = undefined;
      window.__detail171LostHoldUsed = false;
      window.__detail171LostReadFailure = true;
      window.__detail171LostReads = 0;
      window.__detail171LostDetails = 0;
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === `/api/images/${image}` && window.__detail171LostReceipt)
          window.__detail171LostDetails++;
        if (
          path === `/api/images/${image}` &&
          window.__detail171LostReceipt &&
          !window.__detail171LostHoldUsed
        ) {
          window.__detail171LostHoldUsed = true;
          await new Promise((resolve) => {
            window.__detail171LostRelease = resolve;
          });
        }
        if (
          path === `/api/images/${image}` &&
          window.__detail171LostReceipt &&
          window.__detail171LostReadFailure
        ) {
          window.__detail171LostReads++;
          throw new TypeError('Verification: detail read lost in transport');
        }
        const response = await original(...args);
        if (path === `/api/images/${image}/reprocess`) {
          window.__detail171LostPosts++;
          window.__detail171LostReceipt = await response.clone().json();
          if (response.status !== 202)
            throw new Error(
              `Real reprocess did not accept: ${response.status}`,
            );
          throw new TypeError(
            'Verification: accepted response lost in transport',
          );
        }
        return response;
      };
    }, image);
    await page.click(`${confirmation} [data-testid="reprocess-submit"]`);
    await page.waitForFunction(() => !!window.__detail171LostReceipt);
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="reprocess-confirmation"] [role="alert"]')
        ?.textContent.includes('提交结果待核对'),
    );
    await page.waitForFunction(
      () => typeof window.__detail171LostRelease === 'function',
    );
    assert.equal(
      await page.evaluate(() => {
        const dialog = document.querySelector(
          '[data-testid="reprocess-confirmation"]',
        );
        const cancel = dialog.querySelector(
          '[data-slot="alert-dialog-footer"] button:first-child',
        );
        return (
          dialog.getAttribute('aria-busy') === 'true' &&
          cancel.disabled &&
          dialog.querySelector('[data-testid="reprocess-submit"]').disabled
        );
      }),
      true,
      'Pending confirmation disables both actions',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(confirmation);
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="reprocess-confirmation"]')
          .getAttribute('aria-busy'),
      ),
      'true',
      'Escape cannot cancel an in-flight real submission',
    );
    const receipt = await page.evaluate(() => window.__detail171LostReceipt);
    assert.equal(receipt.scope, 'thumbnail');
    // The UI read is deliberately disconnected. Observe the actual worker
    // through the saved native fetch; no success response is invented.
    await page.waitForFunction(
      async ({ endpoint, job }) => {
        const response = await window.__detail171Fetch(endpoint);
        if (!response.ok) throw new Error(`Detail HTTP ${response.status}`);
        const detail = await response.json();
        return (
          detail.processingJob?.id === job &&
          ['succeeded', 'failed'].includes(detail.processingJob.status)
        );
      },
      { endpoint, job: receipt.jobId },
      { timeout: 30000 },
    );
    await page.evaluate(() => window.__detail171LostRelease());
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="reprocess-confirmation"]')
          ?.getAttribute('aria-busy') === 'false',
    );
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="reprocess-confirmation"]')
        ?.innerText.includes('详情核对失败：连接中断'),
    );
    assert.equal(
      await page.evaluate(() => {
        const dialog = document.querySelector(
          '[data-testid="reprocess-confirmation"]',
        );
        const cancel = dialog.querySelector(
          '[data-slot="alert-dialog-footer"] button:first-child',
        );
        const verify = [...dialog.querySelectorAll('button')].find(
          (node) => node.textContent.trim() === '核对详情',
        );
        return (
          !cancel.disabled &&
          dialog.querySelector('[data-testid="reprocess-submit"]').disabled &&
          !!verify &&
          !verify.disabled
        );
      }),
      true,
      'Lost detail read retains the popup, enables cancel/verification and disables resubmission',
    );
    await layout('reprocess-confirm-read-error');
    const failedReads = await page.evaluate(() => window.__detail171LostReads);
    await page.focus(`${confirmation} [data-slot="alert-dialog-body"] button`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (before) => window.__detail171LostReads > before,
      failedReads,
    );
    await page.waitForFunction(() => {
      const verify = document.querySelector(
        '[data-testid="reprocess-confirmation"] [data-slot="alert-dialog-body"] button',
      );
      return !!verify && !verify.disabled;
    });
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="reprocess-confirmation"]')
          .innerText.includes('详情核对失败：连接中断'),
      ),
    );
    assert.equal(await page.evaluate(() => window.__detail171LostPosts), 1);
    await page.click(
      `${confirmation} [data-slot="alert-dialog-footer"] button:first-child`,
    );
    await page.waitForSelector(confirmation, { state: 'hidden' });
    assert.equal(
      await page.evaluate(() => {
        const selected = document.querySelector(
          '[data-testid="reprocess-scope-thumbnail"] input',
        );
        return (
          selected.checked &&
          document.querySelector(
            '.shell-footer [data-testid="reprocess-submit"]',
          ).disabled &&
          document
            .querySelector('[data-testid="detail-reprocess"]')
            .innerText.includes('提交结果待核对') &&
          document
            .querySelector('main')
            .innerText.includes('图片详情读取失败') &&
          [
            ...document.querySelectorAll(
              '[data-slot="radio-content"][data-testid^="reprocess-scope-"] input',
            ),
          ].every((input) => input.disabled)
        );
      }),
      true,
      'Cancel after a lost GET preserves unknown/error/scope and exposes real detail-read retry while all scopes are disabled',
    );
    await page.waitForFunction(
      () => document.activeElement?.dataset.testid === 'detail-workspace-title',
    );
    await page.evaluate(() => {
      window.__detail171LostReadFailure = false;
    });
    await page.focus(button('刷新详情'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const input = document.querySelector(
        '[data-testid="reprocess-scope-thumbnail"] input',
      );
      return (
        !!input &&
        !input.disabled &&
        !document.querySelector('main').innerText.includes('图片详情读取失败')
      );
    });
    // A different scope must not clear the lost-response error or enable POST.
    await page.click('[data-testid="reprocess-scope-compressed"]');
    await page.waitForSelector(confirmation);
    assert.equal(
      await page.evaluate(() => {
        const dialog = document.querySelector(
          '[data-testid="reprocess-confirmation"]',
        );
        return (
          dialog.querySelector('[data-testid="reprocess-submit"]').disabled &&
          dialog
            .querySelector('[role="alert"]')
            .textContent.includes('提交结果待核对')
        );
      }),
      true,
    );
    await layout('reprocess-confirm-unknown');
    const realReads = await page.evaluate(() => window.__detail171LostDetails);
    await page.focus(`${confirmation} [data-slot="alert-dialog-body"] button`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (before) => window.__detail171LostDetails > before,
      realReads,
    );
    await page.waitForFunction(() => {
      const verify = document.querySelector(
        '[data-testid="reprocess-confirmation"] [data-slot="alert-dialog-body"] button',
      );
      return !!verify && !verify.disabled;
    });
    assert.equal(await page.evaluate(() => window.__detail171LostPosts), 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector(confirmation, { state: 'hidden' });
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector(
          '[data-testid="reprocess-scope-compressed"] input',
        ),
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="reprocess-scope-compressed"] input',
          ).checked &&
          document.querySelector(
            '.shell-footer [data-testid="reprocess-submit"]',
          ).disabled &&
          document
            .querySelector('[data-testid="detail-reprocess"]')
            .innerText.includes('提交结果待核对'),
      ),
      true,
    );
    const single = JSON.parse((await page.fetch(endpoint)).body);
    assert.equal(single.processingJob.status, 'succeeded');
    assert.deepEqual(single.processingJob.expectedVersions, ['thumbnail']);
    const afterSingle = await versions();
    for (const kind of ['original', 'compressed', 'watermark'])
      assert.equal(
        afterSingle.find((value) => value.kind === kind).object_id,
        beforeSingle.find((value) => value.kind === kind).object_id,
      );
    assert.notEqual(
      afterSingle.find((value) => value.kind === 'thumbnail').object_id,
      beforeSingle.find((value) => value.kind === 'thumbnail').object_id,
    );
    assert.equal(await page.evaluate(() => window.__detail171LostPosts), 1);
    const [afterCount] = await sql(
      `SELECT COUNT(*) AS count FROM media_jobs WHERE image_id='${image}' AND kind='process'`,
    );
    assert.equal(afterCount.count, priorCount.count + 1);
    await page.evaluate(() => {
      window.fetch = window.__detail171Fetch;
    });
    report.checks.push(
      'A real accepted thumbnail-only response and its follow-up detail read are disconnected at fetch transport; pending dialog actions and Escape cannot cancel, the retained popup shows the GET error with cancel/explicit keyboard verification, and cancel exposes cached scope plus parent retry with choices disabled. Restoring transport reads the actual terminal receipt; changing scope/reopening preserves unknown/error and disabled resubmission. The browser submits once and the DB gains one real job; actual worker success replaces only thumbnail while original/compressed/watermark object IDs remain unchanged.',
    );

    await direct(image, '');
    const labels = {
      original: '原图',
      compressed: '压缩图',
      thumbnail: '缩略图',
      watermark: '水印图',
    };
    for (const kind of Object.keys(labels)) {
      await page.click(`loc=role:tab[name="${labels[kind]}"]`);
      const detail = JSON.parse((await page.fetch(endpoint)).body);
      const version = detail.versions.find((version) => version.kind === kind);
      assert.equal(version.saved, true);
      const head = await page.fetch(version.downloadPath, { method: 'HEAD' });
      assert.equal(head.status, 200);
      const filename = decodeURIComponent(
        head.headers['content-disposition'].match(
          /filename\*=UTF-8''([^;]+)/i,
        )[1],
      );
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.click(button(`下载${labels[kind]}`));
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), filename);
      const path = join(
        config.output,
        `detail-171-download-${kind}-${filename}`,
      );
      await download.saveAs(path);
      const [object] = await sql(
        `SELECT o.key,s.id AS storage_id,s.local_path FROM media_versions v JOIN media_objects o ON o.id=v.object_id JOIN storage_configs s ON s.id=o.storage_id WHERE v.image_id='${image}' AND v.kind='${kind}'`,
      );
      assert.deepEqual(
        await readFile(path),
        await readFile(
          join(
            config.dataDirectory,
            'storage',
            object.local_path,
            'ariso',
            object.storage_id,
            object.key,
          ),
        ),
      );
      await page.waitForSelector('loc=role:alertdialog[name="已发起下载"]');
      if (kind === 'original')
        assert.ok(
          await page.evaluate(() =>
            document
              .querySelector('[role="alertdialog"]')
              .textContent.includes('公开原图可能包含 GPS 和拍摄信息'),
          ),
        );
      await page.hover('loc=role:alertdialog[name="已发起下载"]');
      await page.click(button('关闭通知'));
      await page.waitForSelector('loc=role:alertdialog[name="已发起下载"]', {
        state: 'hidden',
      });
    }
    report.checks.push(
      'All four version tabs download actual stored bytes and production Content-Disposition filenames; public original download toast explicitly discloses GPS/photography risk.',
    );

    await sql(
      "UPDATE media_settings SET compression_enabled=0,watermark_mode='off' WHERE id=1",
    );
    await direct();
    const disabled = await page.evaluate(() =>
      ['compressed', 'watermark'].map(
        (kind) =>
          document.querySelector(
            `[data-testid="reprocess-scope-${kind}"] input`,
          ).disabled,
      ),
    );
    assert.deepEqual(disabled, [true, true]);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="reprocess-submit"]').disabled,
      ),
      false,
    );
    const assertDisabledReasons = async () => {
      const result = await page.evaluate(() => {
        const contents = [
          ...document.querySelectorAll(
            '[data-slot="radio-content"][data-testid^="reprocess-scope-"]',
          ),
        ];
        const common = document.querySelector(
          '[data-testid="reprocess-scope-unavailable"]',
        );
        const disabled = contents.filter(
          (content) => content.querySelector('input').disabled,
        );
        return {
          total: contents.length,
          disabled: disabled.length,
          commonCount: document.querySelectorAll(
            '[data-testid="reprocess-scope-unavailable"]',
          ).length,
          styles: disabled.map((content) => {
            const local = content
              .closest('[data-slot="radio"]')
              .querySelector('[data-slot="description"]');
            const description = local ?? common;
            let opacity = 1;
            let visible = !!description?.getClientRects().length;
            for (
              let node = description;
              node && node.closest('[data-testid="detail-reprocess"]');
              node = node.parentElement
            ) {
              const style = getComputedStyle(node);
              opacity *= Number(style.opacity);
              visible &&=
                style.display !== 'none' && style.visibility === 'visible';
            }
            return {
              content: Number(getComputedStyle(content).opacity),
              reason: description?.textContent.trim(),
              local: !!local,
              visible,
              opacity,
            };
          }),
        };
      });
      assert.equal(result.total, 4);
      assert.ok(result.styles.length > 0);
      if (result.commonCount) {
        assert.equal(
          result.commonCount,
          1,
          'Shared unavailability reason appears once',
        );
        assert.equal(
          result.disabled,
          4,
          'Shared reason applies only when all choices are disabled',
        );
        assert.ok(result.styles.every((style) => !style.local));
      }
      for (const style of result.styles) {
        assert.equal(style.content, 0.42, 'Only disabled choice is faded');
        assert.ok(style.reason, 'Disabled choice explains why');
        assert.equal(style.visible, true, 'Disabled reason is visible');
        assert.equal(
          style.opacity,
          1,
          'Reason retains full muted-text opacity',
        );
      }
    };
    await assertDisabledReasons();
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('button')].some((node) =>
          node.textContent.includes('去设置开启压缩'),
        ),
      ),
      false,
    );
    await layout('reprocess-disabled-settings');
    await sql("UPDATE media_settings SET watermark_mode='text' WHERE id=1");
    await direct();
    await page.waitForSelector(button('去设置开启压缩'));
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find((node) =>
            node.textContent.includes('去设置开启压缩'),
          ).disabled,
      ),
      true,
    );
    await assertDisabledReasons();
    await layout('reprocess-disabled-compression');
    await sql("UPDATE media_settings SET watermark_mode='off' WHERE id=1");
    await direct();
    await page.click(button('返回详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    for (const name of ['压缩图', '水印图']) {
      await page.click(`loc=role:tab[name="${name}"]`);
      assert.equal(
        await page.evaluate(
          (label) =>
            [
              ...document.querySelectorAll(
                '[data-testid="detail-actions"] button',
              ),
            ].find((node) => node.textContent === `下载${label}`).disabled,
          name,
        ),
        false,
      );
    }
    await direct('library-006');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="reprocess-submit"]').disabled,
      ),
      true,
    );
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="detail-reprocess"]')
          .textContent.includes('存储已停用 · 内容不可读'),
      ),
    );
    await assertDisabledReasons();
    await layout('reprocess-disabled-storage');
    await direct('library-003');
    for (const scope of ['compressed', 'thumbnail', 'watermark'])
      assert.equal(
        await page.evaluate(
          (scope) =>
            document.querySelector(
              `[data-testid="reprocess-scope-${scope}"] input`,
            ).disabled,
          scope,
        ),
        true,
      );
    await assertDisabledReasons();
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="detail-reprocess"]')
          .innerText.includes('关闭处理开关不会删除或隐藏已有压缩图、水印图。'),
      ),
      false,
    );
    await layout('reprocess-first-failure');
    report.checks.push(
      'Saved compression/watermark remain downloadable after settings turn off; disabled scope reasons render, stopped storage forbids submit, and a persisted first-processing failure offers only all-scope retry.',
    );

    await direct('library-002');
    assert.ok(
      await page.evaluate(() => {
        const workspace = document.querySelector(
          '[data-testid="detail-reprocess"]',
        );
        return (
          !workspace.dataset.jobStatus &&
          !workspace.textContent.includes('正在重新处理') &&
          !workspace.textContent.includes('任务已受理') &&
          workspace.textContent.includes('处理中') &&
          document.querySelector('[data-testid="reprocess-submit"]').disabled
        );
      }),
      'An initial processing task is never adopted as a reprocess receipt',
    );
    // These explicit persisted fixtures verify rendering/polling, not real worker results.
    await sql(
      "UPDATE media_images SET processing_status='ready' WHERE id='library-002'",
    );
    await sql(
      `UPDATE media_jobs SET status='queued',next_attempt_at=${Date.now() + 3600000},error=NULL WHERE id='active-job'`,
    );
    await direct('library-002');
    await page.waitForSelector(`${workspace}[data-job-status="queued"]`);
    await layout('reprocess-fixture-queued');
    const published = await sql(
      "SELECT kind,object_id FROM media_versions WHERE image_id='library-002' ORDER BY kind",
    );
    const candidateBytes = await readFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    );
    await writeFile(candidatePath, candidateBytes);
    await sql(
      `INSERT INTO media_objects (id,image_id,job_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('${candidateId}','library-002','active-job',${quote(candidateStorage.id)},${quote(candidateKey)},'compressed','stored',${candidateBytes.length},'png','image/png',${Date.now()},${Date.now()})`,
    );
    await sql(
      `UPDATE media_jobs SET status='running',scope='all',expected_versions='["compressed","thumbnail","watermark"]' WHERE id='active-job'`,
    );
    await direct('library-002');
    await page.waitForSelector(`${workspace}[data-job-status="running"]`);
    await page.waitForFunction(() => {
      const rows = [
        ...document.querySelectorAll(
          '[data-testid="detail-reprocess"] dl > div',
        ),
      ];
      return (
        rows.length === 2 &&
        rows[0].textContent.includes('压缩图') &&
        rows[0].textContent.includes('候选已生成') &&
        rows[0].textContent.includes('尚未替换') &&
        rows[1].textContent.includes('缩略图 / 水印图') &&
        rows[1].textContent.includes('处理中') &&
        rows[1].textContent.includes('全部成功后一起替换')
      );
    });
    const rendered = JSON.parse(
      (await page.fetch('/api/images/library-002')).body,
    );
    assert.deepEqual(rendered.processingJob.generatedVersions, ['compressed']);
    assert.equal(
      rendered.versions.find((version) => version.kind === 'compressed').saved,
      false,
    );
    assert.deepEqual(
      await sql(
        "SELECT kind,object_id FROM media_versions WHERE image_id='library-002' ORDER BY kind",
      ),
      published,
      'Stored candidate does not change published version references',
    );
    await layout('reprocess-fixture-running');
    await sql(
      "UPDATE media_jobs SET status='failed',error='controlled render verification failure' WHERE id='active-job'",
    );
    await page.waitForSelector(`${workspace}[data-job-status="failed"]`);
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="reprocess-task-status"]')
          .textContent.includes('已有版本保留'),
      ),
    );
    await layout('reprocess-fixture-failed');
    await page.click(button('按最新设置重试'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    await sql(
      "UPDATE media_jobs SET status='running',error=NULL WHERE id='active-job'",
    );
    await direct('library-002', '');
    await page.evaluate(() => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171StatusFaultUsed = false;
      window.__detail171StatusRequests = [];
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        const response = await original(...args);
        if (path === '/api/images/status') {
          const ids = JSON.parse(args[1].body).ids;
          window.__detail171StatusRequests.push(ids);
          if (
            ids.length === 1 &&
            ids[0] === 'library-002' &&
            !window.__detail171StatusFaultUsed
          ) {
            window.__detail171StatusFaultUsed = true;
            throw new TypeError('Verification: real status response lost');
          }
        }
        return response;
      };
    });
    await page.waitForSelector(button('重试任务状态'), { timeout: 10000 });
    const failedPolls = await page.evaluate(
      () => window.__detail171StatusRequests.length,
    );
    await page.waitForTimeout(2200);
    assert.equal(
      await page.evaluate(() => window.__detail171StatusRequests.length),
      failedPolls,
      'Status transport error stops automatic polling',
    );
    await page.focus(button('重试任务状态'));
    await page.keyboard.press('Enter');
    await page.waitForSelector(button('重试任务状态'), { state: 'hidden' });
    assert.ok(
      (await page.evaluate(() => window.__detail171StatusRequests.length)) >
        failedPolls,
    );
    for (const ids of await page.evaluate(
      () => window.__detail171StatusRequests,
    ))
      assert.deepEqual(ids, ['library-002']);
    await page.evaluate(() => {
      window.fetch = window.__detail171Fetch;
    });
    report.checks.push(
      'Controlled persisted job (not queued to worker) renders single-thumbnail queued, then all-scope running with a real stored compressed fixture candidate: generated/not-yet-replaced and remaining thumbnail/watermark rows render separately while published object IDs stay fixed. This is rendering evidence, not real worker generation. Failed state keeps old versions, retry returns to current settings; losing a real current-ID status response stops polling and keyboard retry reads the real endpoint again.',
    );
  } finally {
    await sql(
      `UPDATE media_settings SET compression_enabled=${settings.compression_enabled},watermark_mode=${quote(settings.watermark_mode)},watermark_text=${quote(settings.watermark_text)},watermark_font=${quote(settings.watermark_font)} WHERE id=1`,
    );
    await sql(
      `UPDATE media_jobs SET status=${quote(active.status)},scope=${quote(active.scope)},expected_versions=${quote(active.expected_versions)},error=${active.error === null ? 'NULL' : quote(active.error)},next_attempt_at=${active.next_attempt_at ?? 'NULL'} WHERE id='active-job'`,
    );
    await sql(
      `UPDATE media_images SET processing_status=${quote(activeImage.processing_status)} WHERE id='library-002'`,
    );
    await sql(`DELETE FROM media_objects WHERE id='${candidateId}'`);
    await rm(candidatePath, { force: true });
  }
  await verifyDetail171ReturnContext({ page, config, report });
}

export async function verifyDetail171ReturnContext({ page, config, report }) {
  const button = (name) =>
    `loc=role:${['网格', '瀑布流'].includes(name) ? 'radio' : 'button'}[name="${name}"]`;
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 400,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.waitForFunction(() => innerHeight === 400);
  const sourceUrl = `${config.origin}/library?visibility=public&sort=uploaded_asc`;
  await page.goto(sourceUrl);
  await page.waitForSelector('[data-testid="library-gallery"]');
  const previousLayout = await page.evaluate(
    () => document.querySelector('[data-testid="library-list"]').dataset.layout,
  );
  await page.click(button('瀑布流'));
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="library-list"]').dataset.layout ===
      'masonry',
  );
  const ordered = [];
  let cursor = null;
  let total;
  do {
    const params = new URLSearchParams({
      scope: 'normal',
      visibility: 'public',
      sort: 'uploaded_asc',
      pageSize: '80',
    });
    if (cursor) params.set('cursor', cursor);
    const response = await page.fetch(`/api/images?${params}`);
    assert.equal(response.status, 200);
    const result = JSON.parse(response.body);
    ordered.push(...result.items.map((item) => item.id));
    total = result.total;
    cursor = result.nextCursor;
  } while (!ordered.includes('library-007') && cursor);
  const position = ordered.indexOf('library-007') + 1;
  assert.ok(
    position > 0,
    'Real public source query contains the download fixture',
  );
  const needed = Math.min(total, Math.max(80, position));
  let loaded = await page.evaluate(() =>
    Number(
      document.querySelector('[data-testid="library-list"]').dataset
        .loadedCount,
    ),
  );
  while (loaded < needed) {
    await page.click('[data-testid="library-load-more"]');
    await page.waitForFunction(
      (previous) =>
        Number(
          document.querySelector('[data-testid="library-list"]').dataset
            .loadedCount,
        ) > previous,
      loaded,
    );
    loaded = await page.evaluate(() =>
      Number(
        document.querySelector('[data-testid="library-list"]').dataset
          .loadedCount,
      ),
    );
  }
  assert.ok(loaded >= needed);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  // A loaded item can still be absent from the virtual DOM. Start at the end
  // and walk actual scroll windows until its real card is mounted.
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      end: main.scrollHeight - main.clientHeight,
      height: main.clientHeight,
    };
  });
  let mounted = false;
  const step = Math.max(100, geometry.height / 2);
  for (let top = geometry.end; top >= -step; top -= step) {
    await page.evaluate((top) => {
      document.querySelector('main').scrollTo(0, Math.max(0, top));
    }, top);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    mounted = await page.evaluate(
      () => !!document.querySelector('[data-image-id="library-007"]'),
    );
    if (mounted) break;
  }
  assert.equal(
    mounted,
    true,
    'Loaded source card becomes available in its virtual window',
  );
  const source = 'loc=role:button[name="查看图片：中文下载样本.png"]';
  await page.hover(source);
  await page.click('label:has(input[aria-label="选择图片：中文下载样本.png"])');
  await page.waitForSelector('[data-testid="library-selection"]');
  await page.focus(source);
  const scroll = await page.evaluate(
    () => document.querySelector('main').scrollTop,
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click('loc=role:tab[name="水印图"]');
  await page.click('[data-testid="detail-version-entry"]');
  await page.waitForSelector('[data-testid="detail-versions"]');
  await page.click(button('返回详情'));
  await page.waitForSelector('[data-testid="detail-body"]');
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="detail-preview"]')]
        .find((node) => node.getClientRects().length)
        ?.src.includes('type=watermark'),
    ),
  );
  await page.click(button('关闭图片详情'));
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has('image'),
  );
  assert.equal(await page.url(), new URL(sourceUrl).href);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('input[aria-label="选择图片：中文下载样本.png"]')
          .checked,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="library-list"]').dataset.layout,
    ),
    'masonry',
  );
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') ===
      '查看图片：中文下载样本.png',
  );
  assert.ok(
    Math.abs(
      (await page.evaluate(() => document.querySelector('main').scrollTop)) -
        scroll,
    ) <= 1,
  );
  report.checks.push(
    `Real public source order locates the card at ${position}; ${loaded} items are loaded and actual virtual windows are traversed. Card keyboard opening → version workspace → detail retains watermark preview; closing preserves visibility/sort URL, masonry layout, source scroll and exact trigger focus.`,
  );
  if (previousLayout === 'grid') await page.click(button('网格'));
}

export async function verifyDetail171Consumers({ page, config, sql, report }) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  const resize = async (width, theme) => {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height: width === 1440 ? 1080 : 844,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.waitForFunction(
      ({ width, theme }) =>
        innerWidth === width &&
        document.documentElement.classList.contains(theme),
      { width, theme },
    );
  };
  const expectedNavigation = [
    ['总览', null],
    ['上传', '/upload'],
    ['图库', '/library'],
    ['相册', '/albums'],
    ['标签', null],
    ['分享管理', null],
    ['回收站', '/trash'],
    ['访问统计', null],
    ['存储管理', null],
    ['站点设置', null],
  ];
  let branding;
  const screenshot = async (state, width, theme, current) => {
    const shell = await page.evaluate(() => ({
      shells: document.querySelectorAll('.admin-shell').length,
      mains: document.querySelectorAll('#main-content').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      brand: [...document.querySelectorAll('a.shell-brand')].map((node) =>
        node.textContent.trim(),
      ),
      account: document
        .querySelector('.shell-navigation button[aria-label="账号菜单"]')
        .textContent.trim(),
      navigation: [
        ...document.querySelectorAll('.shell-navigation nav .shell-nav-link'),
      ].map((node) => [
        node.querySelector('.shell-nav-label').textContent.trim(),
        node.getAttribute('href'),
      ]),
      current: [
        ...document.querySelectorAll(
          '.shell-navigation nav [aria-current="page"]',
        ),
      ].map((node) => node.getAttribute('href')),
      headerHeight: document
        .querySelector('.shell-mobile-header')
        .getBoundingClientRect().height,
    }));
    assert.equal(shell.shells, 1);
    assert.equal(shell.mains, 1);
    assert.equal(shell.overflow, false);
    assert.deepEqual(shell.navigation, expectedNavigation);
    assert.deepEqual(shell.current, [current]);
    const identity = { brand: shell.brand, account: shell.account };
    branding ??= identity;
    assert.deepEqual(identity, branding);
    if (width === 390) assert.equal(shell.headerHeight, 64);
    await page.screenshot({
      path: join(
        config.output,
        `detail-171-consumer-${state}-${theme}-${width}.png`,
      ),
    });
    report.layouts.push({
      state: `detail-171-consumer-${state}`,
      width,
      theme,
      ...shell,
    });
  };

  await resize(1440, 'light');
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  ]);
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  await page.click(button('开始上传'));
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="ready"]',
    {
      timeout: 30000,
    },
  );
  const queue = await page.evaluate(() => {
    const item = document.querySelector('[data-testid="upload-item"]');
    window.__detail171ConsumerDocument = crypto.randomUUID();
    return {
      queueId: item.dataset.queueId,
      imageId: item.dataset.imageId,
      document: window.__detail171ConsumerDocument,
    };
  });
  assert.ok(queue.imageId);
  const [uploaded] = await sql(
    `SELECT display_name,processing_status FROM media_images WHERE id='${queue.imageId}'`,
  );
  assert.equal(uploaded.processing_status, 'ready');
  const uploadRow = `[data-testid="upload-item"][data-queue-id="${queue.queueId}"]`;
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      await resize(width, theme);
      await screenshot('upload-ready', width, theme, '/upload');
      await page.click(`${uploadRow} button:text-is("查看详情")`);
      await page.waitForSelector('[data-testid="detail-body"]');
      await page.click('loc=role:tab[name="缩略图"]');
      await page.click('[data-testid="detail-version-entry"]');
      await page.waitForSelector('[data-testid="detail-versions"]');
      const location = new URL(await page.url());
      assert.equal(location.pathname, '/library');
      assert.equal(location.searchParams.get('image'), queue.imageId);
      assert.equal(location.searchParams.get('detailView'), 'versions');
      assert.equal(location.searchParams.get('preview'), 'thumbnail');
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="detail-versions"]')
            .textContent.includes('当前预览缩略图'),
        ),
      );
      await screenshot('upload-versions', width, theme, '/library');
      await page.evaluate(() => history.back());
      await page.waitForURL(`${config.origin}/upload`);
      await page.waitForSelector(`${uploadRow}[data-state="ready"]`);
      assert.deepEqual(
        await page.evaluate(
          (selector) => ({
            imageId: document.querySelector(selector).dataset.imageId,
            document: window.__detail171ConsumerDocument,
          }),
          uploadRow,
        ),
        { imageId: queue.imageId, document: queue.document },
        'Client version navigation and browser Back preserve the actual ready queue',
      );
      if (
        await page.evaluate(
          () => !!document.querySelector('[data-testid="library-detail"]'),
        )
      ) {
        await page.click(button('关闭图片详情'));
        await page.waitForSelector('[data-testid="library-detail"]', {
          state: 'hidden',
        });
      }
    }
  }
  report.checks.push(
    `Manual File upload runs the real receiver and worker to ready (${queue.imageId}); upload detail selects thumbnail and routes to version information with that selection. Browser Back at desktop/phone in both themes preserves the same document, queue ID, image ID and ready state.`,
  );

  const created = await page.fetch('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '详情公共消费验证',
      description: 'Issue 171 disposable browser fixture',
    }),
  });
  assert.equal(created.status, 201);
  const album = JSON.parse(created.body).album;
  const albumPath = `/albums/${encodeURIComponent(album.id)}`;
  try {
    const membership = await page.fetch(
      `/api/images/${queue.imageId}/collections`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumIds: [album.id] }),
      },
    );
    assert.equal(membership.status, 200);
    assert.deepEqual(JSON.parse(membership.body).albums, [
      { id: album.id, name: album.name },
    ]);
    const source = button(`查看图片：${uploaded.display_name}`);
    const card = `[data-image-id="${queue.imageId}"]`;
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 390]) {
        await resize(width, theme);
        await page.goto(`${config.origin}${albumPath}`);
        await page.waitForSelector(card);
        await page.hover(source);
        await page.click(
          `label:has(input[aria-label="选择图片：${uploaded.display_name}"])`,
        );
        await page.waitForSelector(`${card}[data-selected="true"]`);
        await screenshot('album-selected', width, theme, '/albums');
        await page.focus(source);
        const scroll = await page.evaluate(
          () => document.querySelector('main').scrollTop,
        );
        await page.keyboard.press('Enter');
        await page.waitForSelector('[data-testid="detail-body"]');
        await page.click('loc=role:tab[name="缩略图"]');
        await page.click('[data-testid="detail-version-entry"]');
        await page.waitForSelector('[data-testid="detail-versions"]');
        const location = new URL(await page.url());
        assert.equal(location.pathname, albumPath);
        assert.equal(location.searchParams.get('image'), queue.imageId);
        assert.equal(location.searchParams.get('preview'), 'thumbnail');
        await screenshot('album-versions', width, theme, '/albums');
        await page.click(button('返回详情'));
        await page.waitForSelector('[data-testid="detail-body"]');
        assert.ok(
          await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid="detail-preview"]')]
              .find((node) => node.getClientRects().length)
              ?.src.includes('type=thumbnail'),
          ),
        );
        await page.click(button('关闭图片详情'));
        await page.waitForFunction(
          () => !new URL(location.href).searchParams.has('image'),
        );
        assert.equal(await page.url(), `${config.origin}${albumPath}`);
        await page.waitForSelector(`${card}[data-selected="true"]`);
        await page.waitForFunction(
          (name) =>
            document.activeElement?.getAttribute('aria-label') ===
            `查看图片：${name}`,
          uploaded.display_name,
        );
        assert.ok(
          Math.abs(
            (await page.evaluate(
              () => document.querySelector('main').scrollTop,
            )) - scroll,
          ) <= 1,
        );
        assert.equal(
          await page.evaluate(() =>
            document
              .querySelector('[data-testid="library-selection"] button')
              .getAttribute('aria-label'),
          ),
          '操作已选 1 张图片',
        );
      }
    }
    report.checks.push(
      `Real album POST and final-set collections PATCH place the uploaded image in ${album.id}; keyboard card → detail → versions → detail → close preserves album route, selected thumbnail, one selected image, source scroll and trigger focus on desktop/phone in both themes. Shared shell brand, account, ten navigation entries and current route remain consistent.`,
    );
  } finally {
    const removed = await page.fetch(`/api/albums/${album.id}`, {
      method: 'DELETE',
    });
    assert.equal(
      removed.status,
      200,
      'Only this newly created disposable album is removed',
    );
  }
  // Accepted upload media remains in the runner's disposable DATA_DIR.
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('[data-testid="library-list"]');
}
