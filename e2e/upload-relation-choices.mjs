import assert from 'node:assert/strict';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { captureRelationLayout } from './upload-relation-layouts.mjs';
import { waitForOwnerRoute } from './owner-shell.mjs';

/** Actual relation lists: loading, search, selection, focus and read recovery. */
export async function verifyUploadRelationChoices({
  page,
  config,
  sql,
  report,
  api,
  step,
}) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  const input = 'input[aria-label="选择图片文件"]';
  const relationSelector = (kind) => `[data-testid="upload-${kind}"]`;
  async function selected(kind) {
    return page.evaluate(
      (selector) =>
        [...document.querySelectorAll(`${selector} [data-relation-id]`)]
          .map((node) => node.dataset.relationId)
          .sort(),
      relationSelector(kind),
    );
  }
  async function open(kind, keyboard = false) {
    step('open choices', { kind, keyboard });
    const name = kind === 'albums' ? '相册' : '标签';
    if (keyboard) {
      await page.focus(button(`选择${name}`));
      const position = await page.evaluate((label) => {
        const trigger = document.querySelector(
          `button[aria-label="选择${label}"]`,
        );
        const rect = trigger.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: innerWidth,
          height: innerHeight,
        };
      }, name);
      step('position keyboard selector before Enter', { kind, ...position });
      if (
        position.top < 0 ||
        position.bottom > position.height ||
        position.left < 0 ||
        position.right > position.width
      ) {
        // Ego's native hover scrolls the actual control into view without activating it.
        await page.hover(button(`选择${name}`));
        await page.focus(button(`选择${name}`));
      }
      await page.waitForFunction((label) => {
        const trigger = document.querySelector(
          `button[aria-label="选择${label}"]`,
        );
        const rect = trigger.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          document.activeElement === trigger
        );
      }, name);
      await page.keyboard.press('Enter');
    } else await page.click(button(`选择${name}`));
    await page.waitForSelector(`[role="dialog"][aria-label="选择${name}"]`);
    await page.waitForFunction((label) => {
      const dialog = document.querySelector(
        `[role="dialog"][aria-label="选择${label}"]`,
      );
      return (
        dialog &&
        dialog.getClientRects().length > 0 &&
        getComputedStyle(dialog).visibility !== 'hidden' &&
        !dialog.textContent.includes('正在更新') &&
        !dialog.textContent.includes('列表更新失败')
      );
    }, name);
  }
  async function option(id, keyboard = false) {
    step('select option', { id, keyboard });
    const selector = `[role="option"][data-relation-id="${id}"]`;
    if (keyboard) {
      await page.focus(selector);
      await page.keyboard.press('Space');
    } else await page.click(selector);
    step('wait selected option', {
      id,
      keyboard,
      options: await page.evaluate(() =>
        [...document.querySelectorAll('[role="option"][data-relation-id]')].map(
          (node) => ({
            id: node.dataset.relationId,
            selected: node.getAttribute('aria-selected'),
          }),
        ),
      ),
    });
    await page.waitForFunction(
      (value) =>
        document
          .querySelector(`[role="option"][data-relation-id="${value}"]`)
          ?.getAttribute('aria-selected') === 'true',
      id,
    );
  }
  async function closeChoices(kind) {
    const name = kind === 'albums' ? '相册' : '标签';
    const query = await page.evaluate(
      (label) =>
        document.querySelector(
          `[role="dialog"][aria-label="选择${label}"] input`,
        )?.value ?? '',
      name,
    );
    if (query) {
      await page.focus(`loc=role:searchbox[name="搜索${name}"]`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        (label) =>
          document.querySelector(
            `[role="dialog"][aria-label="选择${label}"] input`,
          )?.value === '',
        name,
      );
    }
    await page.keyboard.press('Escape');
    step('wait choices overlay exit and restored focus', { kind });
    await page.waitForFunction((label) => {
      const trigger = document.querySelector(
        `button[aria-label="选择${label}"]`,
      );
      return (
        !document.querySelector(`[role="dialog"][aria-label="选择${label}"]`) &&
        !document.querySelector('.popover[data-exiting]') &&
        trigger?.getAttribute('aria-expanded') === 'false' &&
        !trigger.closest('[inert], [aria-hidden="true"]') &&
        document.activeElement === trigger
      );
    }, name);
  }
  async function escapeFocusedOption(kind, id) {
    const before = await selected(kind);
    const label = kind === 'albums' ? '相册' : '标签';
    await open(kind);
    assert.equal(
      await page.evaluate(
        (name) =>
          document.querySelector(
            `[role="dialog"][aria-label="选择${name}"] input`,
          )?.value,
        label,
      ),
      '',
      'Focused-option Escape starts without a search query',
    );
    const selector = `[role="option"][data-relation-id="${id}"]`;
    await page.waitForFunction(
      (target) =>
        document.querySelector(target)?.getAttribute('aria-selected') ===
        'true',
      selector,
    );
    step('focus selected option before Escape', { kind, id, selected: before });
    await page.focus(selector);
    await page.waitForFunction(
      (target) => document.activeElement === document.querySelector(target),
      selector,
    );
    step('Escape directly from selected option', {
      kind,
      id,
      selected: before,
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction((name) => {
      const trigger = document.querySelector(
        `button[aria-label="选择${name}"]`,
      );
      return (
        !document.querySelector(`[role="dialog"][aria-label="选择${name}"]`) &&
        !document.querySelector('.popover[data-exiting]') &&
        trigger?.getAttribute('aria-expanded') === 'false' &&
        !trigger.closest('[inert], [aria-hidden="true"]') &&
        document.activeElement === trigger
      );
    }, label);
    assert.deepEqual(
      await selected(kind),
      before,
      'Escape from a selected list option closes once, preserves every selected ID, and restores trigger focus',
    );
    report.checks.push(
      `${kind}: With no search query and actual focus on the selected list option, one native Escape closes the popover, preserves all selected IDs and restores selector focus.`,
    );
  }
  async function remove(kind, id) {
    step('remove selected relation', { kind, id });
    const selector = `${relationSelector(kind)} [data-relation-id="${id}"] button`;
    await page.waitForFunction((target) => {
      const control = document.querySelector(target);
      return (
        control &&
        !control.disabled &&
        !control.closest('[inert], [aria-hidden="true"]') &&
        !document.querySelector('.popover[data-exiting]') &&
        control.getClientRects().length > 0 &&
        getComputedStyle(control).visibility !== 'hidden'
      );
    }, selector);
    // React Aria restores the prior row on keyboard entry into a TagGroup.
    // Native pointer positioning lets the child focus update the actual row first.
    await page.hover(selector, { label: 'position relation remove control' });
    step('focus positioned remove control', {
      kind,
      id,
      position: await page.evaluate((target) => {
        const rect = document.querySelector(target).getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        };
      }, selector),
    });
    await page.focus(selector);
    await page.waitForFunction((target) => {
      const control = document.querySelector(target);
      const rect = control.getBoundingClientRect();
      return (
        document.activeElement === control &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        rect.left >= 0 &&
        rect.right <= innerWidth
      );
    }, selector);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      ({ root, id: value }) =>
        !document.querySelector(`${root} [data-relation-id="${value}"]`),
      { root: relationSelector(kind), id },
    );
  }
  async function screenshot(
    name,
    width,
    theme,
    height = width >= 1200 ? 1080 : 844,
    reopenKind,
  ) {
    step('capture representative state', { state: name, width, theme, height });
    const savedSearch = reopenKind
      ? await page.evaluate((kind) => {
          const label = kind === 'albums' ? '相册' : '标签';
          return (
            document.querySelector(
              `[role="dialog"][aria-label="选择${label}"] input`,
            )?.value ?? ''
          );
        }, reopenKind)
      : '';
    if (reopenKind) {
      const label = reopenKind === 'albums' ? '相册' : '标签';
      if (
        await page.evaluate(
          (value) =>
            !!document.querySelector(
              `[role="dialog"][aria-label="选择${value}"]`,
            ),
          label,
        )
      ) {
        step('close choices before changing viewport', { kind: reopenKind });
        await closeChoices(reopenKind);
      }
    }
    step('set representative theme', { state: name, theme });
    await setTheme(page, theme);
    step('resize representative viewport', { state: name, width, height });
    await resizeViewport(page, width, height);
    if (reopenKind) {
      const label = reopenKind === 'albums' ? '相册' : '标签';
      await open(reopenKind);
      await page.waitForSelector(`loc=role:searchbox[name="搜索${label}"]`);
      if (savedSearch) {
        await page.fill(`loc=role:searchbox[name="搜索${label}"]`, savedSearch);
        await page.waitForFunction(
          ({ label: value, query }) =>
            document.querySelector(
              `[role="dialog"][aria-label="选择${value}"] input`,
            )?.value === query,
          { label, query: savedSearch },
        );
      }
      if (name === 'albums-search-no-match') {
        await page.waitForFunction(
          () =>
            !document.querySelector('[role="option"][data-relation-id]') &&
            document
              .querySelector('[role="dialog"][aria-label="选择相册"]')
              ?.textContent.includes('没有匹配结果'),
        );
      }
    }
    step('inspect representative geometry', { state: name, width, theme });
    await captureRelationLayout(
      { page, config, report },
      name,
      width,
      theme,
      height,
    );
  }
  async function representatives(name, reopenKind) {
    for (const theme of ['light', 'dark'])
      for (const width of [1440, 390])
        await screenshot(
          name,
          width,
          theme,
          width === 1440 ? 1080 : 844,
          reopenKind,
        );
  }
  async function loadingStates() {
    for (const [width, theme] of [
      [1440, 'light'],
      [390, 'dark'],
    ]) {
      const height = width === 1440 ? 1080 : 844;
      await resizeViewport(page, width, height);
      await page.evaluate(() => {
        const nativeFetch = window.fetch;
        const gate = new Promise((resolve) => {
          window.__releaseRelationRead = resolve;
        });
        window.__relationReadAccepted = null;
        window.__restoreRelationReadFetch = () => {
          window.fetch = nativeFetch;
        };
        window.fetch = async (...args) => {
          const response = await nativeFetch(...args);
          if (String(args[0]) === '/upload/settings') {
            window.__relationReadAccepted = response.status;
            await gate;
          }
          return response;
        };
      });
      try {
        await page.click(button('选择相册'));
        await page.waitForFunction(
          () =>
            window.__relationReadAccepted === 200 &&
            document
              .querySelector('[role="dialog"][aria-label="选择相册"]')
              ?.textContent.includes('正在更新相册列表'),
        );
        assert.equal(
          await page.evaluate(() => window.__relationReadAccepted),
          200,
          'Loading state holds a real successful settings response',
        );
        await screenshot('albums-list-loading', width, theme, height);
        await page.evaluate(() => window.__releaseRelationRead());
        await page.waitForFunction(() => {
          const dialog = document.querySelector(
            '[role="dialog"][aria-label="选择相册"]',
          );
          return (
            dialog &&
            !dialog.textContent.includes('正在更新') &&
            !dialog.textContent.includes('列表更新失败')
          );
        });
        await closeChoices('albums');
      } finally {
        await page.evaluate(() => {
          window.__releaseRelationRead();
          window.__restoreRelationReadFetch();
        });
      }
    }
    report.checks.push(
      'Holding the real successful relation-settings response displays loading on desktop and mobile; releasing it settles to the actual list without a fixed delay.',
    );
  }
  async function verifyReadRecovery() {
    const beforeAlbums = await selected('albums');
    const beforeTags = await selected('tags');
    assert.ok(
      beforeAlbums.length && beforeTags.length,
      'Recovery starts with real selected album and tag IDs',
    );
    const responsesBefore = await page.evaluate(
      () => window.__relationResponses.length,
    );
    // Only this runner's disposable database is changed, before any uploads exist.
    // A missing settings table makes the actual GET fail; restoring it enables retry.
    await sql(
      'ALTER TABLE upload_settings RENAME TO upload_relation_read_failure',
    );
    let restored = false;
    try {
      await page.click(button('选择相册'));
      await page.waitForFunction(
        () =>
          document
            .querySelector(
              '[role="dialog"][aria-label="选择相册"] [role="alert"]',
            )
            ?.textContent.includes('列表更新失败') &&
          window.__relationResponses.some(
            (row) =>
              row.path === '/upload/settings' &&
              row.method === 'GET' &&
              row.status === 500,
          ),
      );
      const reads = await page.evaluate(
        (start) =>
          window.__relationResponses
            .slice(start)
            .filter(
              (row) => row.path === '/upload/settings' && row.method === 'GET',
            ),
        responsesBefore,
      );
      assert.deepEqual(
        reads.map((row) => row.status),
        [500],
        'The real relation refetch fails once without automatic retries',
      );
      assert.deepEqual(await selected('albums'), beforeAlbums);
      assert.deepEqual(await selected('tags'), beforeTags);
      await screenshot('albums-list-read-failed', 1440, 'light');
      await sql(
        'ALTER TABLE upload_relation_read_failure RENAME TO upload_settings',
      );
      restored = true;
      await page.click(button('重试读取列表'));
      await page.waitForFunction((ids) => {
        const dialog = document.querySelector(
          '[role="dialog"][aria-label="选择相册"]',
        );
        return (
          dialog &&
          !dialog.querySelector('[role="alert"]') &&
          !dialog.textContent.includes('正在更新') &&
          ids.every(
            (id) =>
              dialog
                .querySelector(`[role="option"][data-relation-id="${id}"]`)
                ?.getAttribute('aria-selected') === 'true',
          )
        );
      }, beforeAlbums);
      const recoveredReads = await page.evaluate(
        (start) =>
          window.__relationResponses
            .slice(start)
            .filter(
              (row) => row.path === '/upload/settings' && row.method === 'GET',
            ),
        responsesBefore,
      );
      assert.deepEqual(
        recoveredReads.map((row) => row.status),
        [500, 200],
        'Retry receives the restored real server list',
      );
      assert.deepEqual(await selected('albums'), beforeAlbums);
      assert.deepEqual(await selected('tags'), beforeTags);
      await screenshot('albums-list-read-recovered', 1440, 'light');
      await closeChoices('albums');
      report.relationReadRecovery = {
        responses: recoveredReads,
        albumIds: beforeAlbums,
        tagIds: beforeTags,
      };
      report.checks.push(
        'A real GET /upload/settings database failure displays retry and preserves both selected ID sets; restoring the table and retrying returns the actual 200 list, clears the error and preserves selection.',
      );
    } finally {
      if (!restored)
        await sql(
          'ALTER TABLE upload_relation_read_failure RENAME TO upload_settings',
        );
    }
  }
  // The full runner reuses its disposable database after collection checks.
  // Remove its prior organization fixtures through real mutations, never user data.
  const oldAlbums = await sql('SELECT id FROM albums');
  const oldTags = await sql('SELECT id FROM tags');
  for (const album of oldAlbums) await api(`/api/albums/${album.id}`, 'DELETE');
  await sql('DELETE FROM tags');
  report.fixtureReset = {
    albums: oldAlbums.map((row) => row.id),
    tags: oldTags.map((row) => row.id),
  };
  await page.reload();
  await page.waitForSelector(input, { state: 'attached' });
  await loadingStates();
  for (const kind of ['albums', 'tags']) {
    await open(kind);
    await page.waitForFunction(
      (label) =>
        document
          .querySelector(`[role="dialog"][aria-label="选择${label}"]`)
          ?.textContent.includes(`暂无${label}`),
      kind === 'albums' ? '相册' : '标签',
    );
    for (const width of [1440, 390])
      await screenshot(
        `${kind}-empty`,
        width,
        'light',
        width === 1440 ? 1080 : 844,
        kind,
      );
    await closeChoices(kind);
    assert.deepEqual(await selected(kind), []);
  }
  report.checks.push(
    'Both initially empty relation lists display the real empty state and leave selection empty.',
  );
  const a1 = (await api('/api/albums', 'POST', { name: '同名旅行' }, 201))
    .album;
  const a2 = (await api('/api/albums', 'POST', { name: '同名旅行' }, 201))
    .album;
  const t1 = (await api('/api/tags', 'POST', { name: '搜索夏天甲' }, 201)).tag;
  const t2 = (await api('/api/tags', 'POST', { name: '搜索夏天乙' }, 201)).tag;
  await api('/api/settings/upload', 'PATCH', { batchSize: 2 });
  await page.reload();
  await page.waitForSelector(input, { state: 'attached' });
  await page.evaluate(() => {
    const nativeFetch = window.fetch;
    window.__relationResponses = [];
    window.__restoreRelationFetch = () => {
      window.fetch = nativeFetch;
    };
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      window.__relationResponses.push({
        path: String(args[0]),
        method: args[1]?.method ?? 'GET',
        status: response.status,
      });
      return response;
    };
  });
  await open('albums', true);
  await page.fill('loc=role:searchbox[name="搜索相册"]', '同名旅行');
  const duplicateLabels = await page.evaluate(() =>
    [...document.querySelectorAll('[role="option"][data-relation-id]')].map(
      (node) => node.textContent,
    ),
  );
  assert.equal(duplicateLabels.length, 2);
  assert.ok(duplicateLabels.some((label) => label.includes(a1.id)));
  assert.ok(duplicateLabels.some((label) => label.includes(a2.id)));
  await screenshot('albums-search-match', 1440, 'light', 1080, 'albums');
  await page.fill('loc=role:searchbox[name="搜索相册"]', '没有这样的相册');
  await page.waitForFunction(
    () =>
      !document.querySelector('[role="option"][data-relation-id]') &&
      document
        .querySelector('[role="dialog"]')
        ?.textContent.includes('没有匹配结果'),
  );
  await screenshot('albums-search-no-match', 390, 'light', 844, 'albums');
  await page.fill('loc=role:searchbox[name="搜索相册"]', '同名旅行');
  await option(a1.id, true);
  await option(a2.id);
  await representatives('albums-dropdown-selected', 'albums');
  await closeChoices('albums');
  assert.deepEqual(await selected('albums'), [a1.id, a2.id].sort());
  await escapeFocusedOption('albums', a2.id);
  await remove('albums', a1.id);
  assert.deepEqual(await selected('albums'), [a2.id]);
  await open('tags');
  await page.fill('loc=role:searchbox[name="搜索标签"]', '搜索夏天');
  await option(t1.id);
  await option(t2.id);
  await page.fill('loc=role:searchbox[name="搜索标签"]', t1.id);
  await page.waitForFunction(
    (id) =>
      document.querySelectorAll('[role="option"][data-relation-id]').length ===
        1 &&
      document
        .querySelector(`[role="option"][data-relation-id="${id}"]`)
        ?.getAttribute('aria-selected') === 'true',
    t1.id,
  );
  await page.click(`[role="option"][data-relation-id="${t1.id}"]`);
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[role="option"][data-relation-id="${id}"]`)
        ?.getAttribute('aria-selected') === 'false',
    t1.id,
  );
  assert.deepEqual(
    await selected('tags'),
    [t2.id],
    'Toggling a filtered visible option retains the hidden selected tag ID',
  );
  await page.fill('loc=role:searchbox[name="搜索标签"]', '搜索夏天');
  await option(t1.id);
  assert.deepEqual(await selected('tags'), [t1.id, t2.id].sort());
  await page.click(`[role="option"][data-relation-id="${t1.id}"]`);
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[role="option"][data-relation-id="${id}"]`)
        ?.getAttribute('aria-selected') === 'false',
    t1.id,
  );
  assert.deepEqual(
    await selected('tags'),
    [t2.id],
    'Select-all shortcut starts from a genuinely partial selection',
  );
  await page.focus('[role="listbox"][aria-label="标签列表"]');
  assert.equal(
    await page.evaluate(
      () =>
        !!document.activeElement?.closest(
          '[role="listbox"][aria-label="标签列表"]',
        ),
    ),
    true,
  );
  await page.keyboard.press('ControlOrMeta+A');
  await page.waitForFunction(() => {
    const options = [
      ...document.querySelectorAll('[role="option"][data-relation-id]'),
    ];
    return (
      options.length === 2 &&
      options.every((node) => node.getAttribute('aria-selected') === 'true')
    );
  });
  assert.deepEqual(
    await selected('tags'),
    [t1.id, t2.id].sort(),
    'Ctrl/Cmd+A changes a partial tag selection into all actual visible IDs',
  );
  await representatives('tags-dropdown-selected', 'tags');
  await closeChoices('tags');
  await escapeFocusedOption('tags', t2.id);
  await remove('tags', t1.id);
  assert.deepEqual(await selected('tags'), [t2.id]);
  await resizeViewport(page, 1440, 1080);
  await page.evaluate(() => {
    window.__relationSPAMarker = 'same document';
  });
  await page.click('a.shell-nav-link[href="/library"]');
  await waitForOwnerRoute(page, config, '/library');
  await page.click('a.shell-nav-link[href="/upload"]');
  await page.waitForURL(`${config.origin}/upload`);
  await page.waitForSelector('[data-testid="upload-tags"]');
  assert.equal(
    await page.evaluate(() => window.__relationSPAMarker),
    'same document',
    'Owner links use SPA navigation without reloading the browser document',
  );
  assert.deepEqual(await selected('albums'), [a2.id]);
  assert.deepEqual(await selected('tags'), [t2.id]);
  report.checks.push(
    'Same-name album options expose distinct real IDs; searchable multiple selection preserves hidden selected IDs, keyboard chip removal preserves other IDs, and real owner-link SPA navigation retains both selections.',
  );

  await verifyReadRecovery();

  return {
    a2,
    t2,
    selected,
    open,
    closeChoices,
    remove,
    screenshot,
    representatives,
  };
}
