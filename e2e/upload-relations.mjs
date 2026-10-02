/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { copyFile, mkdir, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const sql = (statement) => identitySql(config, statement);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const button = (name) => `loc=role:button[name="${name}"]`;
const input = 'input[aria-label="选择图片文件"]';
const report = { status: 'failed', checks: [], layouts: [], steps: [] };
function step(name, details = {}) {
  report.step = { name, ...details };
  report.steps.push({ ...report.step, time: new Date().toISOString() });
  console.log({ relationStep: report.step });
}
const relationSelector = (kind) => `[data-testid="upload-${kind}"]`;
const summarySelector = (id) =>
  `[data-testid="upload-frozen-submission"][data-submission-id="${id}"]`;
async function api(path, method = 'GET', body, expected = 200) {
  const response = await page.fetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  assert.equal(response.status, expected, `${path}: ${response.body}`);
  return JSON.parse(response.body);
}
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
      document.querySelector(`[role="dialog"][aria-label="选择${label}"] input`)
        ?.value ?? '',
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
    const trigger = document.querySelector(`button[aria-label="选择${label}"]`);
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
      document.querySelector(target)?.getAttribute('aria-selected') === 'true',
    selector,
  );
  step('focus selected option before Escape', { kind, id, selected: before });
  await page.focus(selector);
  await page.waitForFunction(
    (target) => document.activeElement === document.querySelector(target),
    selector,
  );
  step('Escape directly from selected option', { kind, id, selected: before });
  await page.keyboard.press('Escape');
  await page.waitForFunction((name) => {
    const trigger = document.querySelector(`button[aria-label="选择${name}"]`);
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
async function createDialog(kind) {
  step('open quick creation', { kind });
  step('wait prior modal backdrop exit', {
    kind,
    backdrops: await page.evaluate(
      () => document.querySelectorAll('[data-slot="modal-backdrop"]').length,
    ),
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-slot="modal-backdrop"]'),
  );
  await open(kind, true);
  await page.waitForSelector(
    button(kind === 'albums' ? '新建相册' : '新建标签'),
    { state: 'visible' },
  );
  assert.equal(
    await page.evaluate(
      (label) =>
        !!document
          .querySelector(`[role="dialog"][aria-label="选择${label}"]`)
          ?.getClientRects().length,
      kind === 'albums' ? '相册' : '标签',
    ),
    true,
    'The real choices popover remains visible before opening quick creation',
  );
  await page.click(button(kind === 'albums' ? '新建相册' : '新建标签'));
  await page.waitForSelector('[role="dialog"] form input');
}
async function restoredFocus(kind) {
  await page.waitForFunction(
    (label) =>
      document.activeElement?.getAttribute('aria-label') === `选择${label}`,
    kind === 'albums' ? '相册' : '标签',
  );
}
async function createOnce(kind, name) {
  step('create once despite repeated presses', { kind, name });
  await createDialog(kind);
  await page.fill('[role="dialog"] form input', name);
  const beforeRows = (await sql(`SELECT count(*) AS n FROM ${kind}`))[0].n;
  const beforePosts = await page.evaluate(
    (path) =>
      window.__relationResponses.filter(
        (row) => row.path === path && row.method === 'POST',
      ).length,
    `/api/${kind}`,
  );
  await page.evaluate((path) => {
    const nativeFetch = window.fetch;
    const gate = new Promise((resolve) => {
      window.__releaseRelationCreation = resolve;
    });
    window.__relationCreationAccepted = null;
    window.__restoreRelationCreationFetch = () => {
      window.fetch = nativeFetch;
    };
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      if (String(args[0]) === path && args[1]?.method === 'POST') {
        window.__relationCreationAccepted = {
          status: response.status,
          body: await response.clone().json(),
        };
        await gate;
      }
      return response;
    };
  }, `/api/${kind}`);
  try {
    await page.focus('[role="dialog"] button[type="submit"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!window.__relationCreationAccepted);
    assert.equal(
      await page.evaluate(() => window.__relationCreationAccepted.status),
      201,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[role="dialog"] button[type="submit"]')
            .disabled,
      ),
      true,
    );
    const target = await page.evaluate(() => {
      const rect = document
        .querySelector('[role="dialog"] button[type="submit"]')
        .getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(target.x, target.y, {
      label: 'repeat pending create press',
    });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    assert.equal(
      await page.evaluate(
        (path) =>
          window.__relationResponses.filter(
            (row) => row.path === path && row.method === 'POST',
          ).length,
        `/api/${kind}`,
      ),
      beforePosts + 1,
    );
    assert.equal(
      (await sql(`SELECT count(*) AS n FROM ${kind}`))[0].n,
      beforeRows + 1,
    );
    await page.evaluate(() => window.__releaseRelationCreation());
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"]'),
    );
    await restoredFocus(kind);
    const accepted = await page.evaluate(
      (value) =>
        window.__relationCreationAccepted.body[
          value === 'albums' ? 'album' : 'tag'
        ],
      kind,
    );
    assert.ok((await selected(kind)).includes(accepted.id));
    return accepted;
  } finally {
    await page.evaluate(() => {
      window.__releaseRelationCreation();
      window.__restoreRelationCreationFetch();
    });
  }
}
async function summary(id) {
  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return node
      ? {
          albums: JSON.parse(node.dataset.albumIds),
          tags: JSON.parse(node.dataset.tagIds),
          groups: JSON.parse(node.dataset.groups),
          text: node.textContent,
        }
      : null;
  }, summarySelector(id));
}
async function screenshot(
  name,
  width,
  theme,
  height = width >= 1200 ? 1080 : 844,
  reopenKind,
) {
  step('capture representative state', { name, width, theme, height });
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
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
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
    )
      await closeChoices(reopenKind);
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
  if (width >= 768) {
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="upload-create-tag"] [data-slot="modal-footer"] button[data-slot="button"]',
        ),
      ].every((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width === 116 && rect.height === 40;
      }),
    );
  }
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    targets: [...document.querySelectorAll('button,a')]
      .filter((node) => {
        if (
          !node.getClientRects().length ||
          node.closest('[inert],[aria-hidden="true"]')
        )
          return false;
        for (let parent = node; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (
            style.clipPath === 'inset(50%)' ||
            style.clip === 'rect(0px, 0px, 0px, 0px)'
          )
            return false;
        }
        return true;
      })
      .map((node) => ({
        label: node.getAttribute('aria-label') || node.textContent,
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        navigation: node.classList.contains('shell-nav-link'),
        tagFooter:
          node.matches('button[data-slot="button"]') &&
          !!node.closest('[data-slot="modal-footer"]') &&
          !!node.closest('[data-testid="upload-create-tag"]'),
      })),
  }));
  assert.ok(geometry.scrollWidth <= width, `${name}: no horizontal overflow`);
  for (const target of geometry.targets) {
    assert.ok(
      target.width >= 44 &&
        target.height >=
          ((width >= 768 && target.tagFooter) ||
          (width >= 1200 && target.navigation)
            ? 40
            : 44),
      `${target.label}: click target`,
    );
    if (width >= 768 && target.tagFooter) {
      assert.equal(
        target.width,
        116,
        `${target.label}: Figma desktop tag footer width`,
      );
      assert.equal(
        target.height,
        40,
        `${target.label}: Figma desktop tag footer height`,
      );
    }
  }
  const path = join(
    config.output,
    `relations-${name}-${theme}-${width}${height === 400 ? '-short' : ''}.png`,
  );
  await page.screenshot({ path });
  report.layouts.push({ name, theme, path, ...geometry });
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
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
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
async function keyboardModal() {
  await page.focus('[role="dialog"] button >> nth=0');
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
      true,
      'Modal contains keyboard focus',
    );
  }
  await page.focus(
    '[role="dialog"] [data-slot="modal-footer"] button >> nth=-1',
  );
  const rect = await page.evaluate(() => {
    const target = document.activeElement.getBoundingClientRect();
    return { top: target.top, bottom: target.bottom, height: innerHeight };
  });
  assert.ok(
    rect.top >= 0 && rect.bottom <= rect.height,
    'Submit action remains reachable in a short viewport',
  );
}
async function start(files, previousIds = []) {
  step('start real submission', { files: files.length, previousIds });
  await page.setInputFiles(input, files);
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-state="queued"]').length === count,
    files.length,
  );
  await page.click(button('开始上传'));
  await page.waitForFunction(
    ({ previous, count }) =>
      document.querySelectorAll('[data-state="queued"]').length === 0 &&
      [
        ...document.querySelectorAll(
          '[data-testid="upload-frozen-submission"][data-submission-id]',
        ),
      ].some((node) => !previous.includes(node.dataset.submissionId)) &&
      document.querySelectorAll('[data-testid="upload-item"]').length === count,
    {
      previous: previousIds,
      count: files.length + (previousIds.length ? 3 : 0),
    },
  );
  const id = await page.evaluate(
    (previous) =>
      [
        ...document.querySelectorAll(
          '[data-testid="upload-frozen-submission"][data-submission-id]',
        ),
      ].find((node) => !previous.includes(node.dataset.submissionId)).dataset
        .submissionId,
    previousIds,
  );
  const [submission] = await sql(
    `SELECT * FROM upload_submissions WHERE id=${literal(id)}`,
  );
  await page.waitForSelector(summarySelector(submission.id));
  return submission;
}
let installed = false;
let observingFetch = false;
try {
  await page.goto(`${config.origin}/upload`);
  if (await page.evaluate(() => !!document.querySelector('#email'))) {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
  }
  await page.waitForSelector(input, { state: 'attached' });
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
  observingFetch = true;
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
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.evaluate(() => {
    window.__relationSPAMarker = 'same document';
  });
  await page.click('a.shell-nav-link[href="/library"]');
  await page.waitForURL(`${config.origin}/library`);
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

  for (const [kind, table] of [
    ['albums', 'albums'],
    ['tags', 'tags'],
  ]) {
    const before = await selected(kind);
    await createDialog(kind);
    assert.equal(
      await page.evaluate(
        () => document.querySelector('[role="dialog"] form input').value,
      ),
      '',
      'Quick-create opens with empty name',
    );
    await representatives(`${kind}-create-initial`);
    await page.fill(
      '[role="dialog"] form input',
      kind === 'albums' ? '取消相册' : '取消标签',
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"]'),
    );
    await restoredFocus(kind);
    assert.deepEqual(await selected(kind), before);
    assert.equal(
      (
        await sql(
          `SELECT count(*) AS n FROM ${table} WHERE ${kind === 'albums' ? 'name' : 'display_name'}=${literal(kind === 'albums' ? '取消相册' : '取消标签')}`,
        )
      )[0].n,
      0,
    );
  }
  report.checks.push(
    'Cancelling both quick-create dialogs preserves the previous selections and creates no database record.',
  );

  for (const [kind, table, name] of [
    ['albums', 'albums', '失败相册输入'],
    ['tags', 'tags', '失败标签输入'],
  ]) {
    const before = await selected(kind);
    const trigger = `upload_relations_${kind}_failure`;
    await sql(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'Issue160 ${kind} quick-create failure'); END`,
    );
    try {
      await createDialog(kind);
      await page.fill('[role="dialog"] form input', name);
      await page.focus('[role="dialog"] button[type="submit"]');
      await page.keyboard.press('Enter');
      await page.waitForFunction((value) => {
        const dialog = document.querySelector('[role="dialog"]');
        if (value === 'albums') {
          const check = [...(dialog?.querySelectorAll('button') ?? [])].find(
            (node) => node.textContent === '重新核对',
          );
          return (
            dialog?.textContent.includes('列表已重新读取') &&
            check &&
            !check.disabled
          );
        }
        const submit = dialog?.querySelector('button[type="submit"]');
        return (
          dialog?.textContent.includes('HTTP 500') &&
          dialog.textContent.includes('保留') &&
          submit &&
          !submit.disabled
        );
      }, kind);
      assert.equal(
        await page.evaluate(
          () => document.querySelector('[role="dialog"] form input').value,
        ),
        name,
      );
      assert.equal(
        await page.evaluate(
          (path) =>
            window.__relationResponses
              .filter((row) => row.path === path && row.method === 'POST')
              .at(-1)?.status,
          `/api/${kind}`,
        ),
        500,
        'Quick-create failure must come from the actual server request',
      );
      assert.deepEqual(await selected(kind), before);
      assert.equal(
        (
          await sql(
            `SELECT count(*) AS n FROM ${table} WHERE ${kind === 'albums' ? 'name' : 'display_name'}=${literal(name)}`,
          )
        )[0].n,
        0,
      );
      await representatives(`${kind}-create-failed`);
      for (const theme of ['light', 'dark'])
        await screenshot(`${kind}-create-failed`, 390, theme, 400);
      await keyboardModal();
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
      );
      assert.deepEqual(await selected(kind), before);
      await restoredFocus(kind);
      if (kind === 'albums') {
        const posts = await page.evaluate(
          () =>
            window.__relationResponses.filter(
              (row) => row.path === '/api/albums' && row.method === 'POST',
            ).length,
        );
        await createDialog(kind);
        await page.waitForFunction(() =>
          document
            .querySelector('[role="dialog"]')
            ?.textContent.includes('列表已重新读取'),
        );
        assert.equal(
          await page.evaluate(
            () => document.querySelector('[role="dialog"] form input').value,
          ),
          name,
        );
        assert.equal(
          await page.evaluate(
            () => document.querySelector('[role="dialog"] form input').disabled,
          ),
          true,
        );
        assert.equal(
          await page.evaluate(
            () =>
              !!document.querySelector('[role="dialog"] button[type="submit"]'),
          ),
          false,
        );
        assert.equal(
          await page.evaluate(
            () =>
              window.__relationResponses.filter(
                (row) => row.path === '/api/albums' && row.method === 'POST',
              ).length,
          ),
          posts,
          'Reopening the unknown operation cannot repeat its POST',
        );
        await page.click(button('结束本次操作'));
        await page.waitForFunction(
          () => !document.querySelector('[role="dialog"]'),
        );
        await restoredFocus(kind);
        await createDialog(kind);
        assert.equal(
          await page.evaluate(
            () => document.querySelector('[role="dialog"] form input').value,
          ),
          '',
          'Explicitly ending the unknown operation creates a fresh empty instance',
        );
        assert.equal(
          await page.evaluate(
            () => document.querySelector('[role="dialog"] form input').disabled,
          ),
          false,
        );
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () => !document.querySelector('[role="dialog"]'),
        );
        await restoredFocus(kind);
      }
    } finally {
      await sql(`DROP TRIGGER ${trigger}`);
    }
  }
  report.checks.push(
    'Real SQLite insert triggers cause both quick-create APIs to fail; names and previous IDs remain unchanged, no record is created, and short-viewport modal keyboard focus stays reachable.',
  );
  report.checks.push(
    'Escaping and reopening an unknown album creation preserves its disabled original input and cannot issue another POST; explicitly ending that operation opens a fresh editable instance.',
  );

  await createOnce('albums', '快速相册');
  const [quickAlbum] = await sql(
    `SELECT id,name FROM albums WHERE name=${literal('快速相册')}`,
  );
  assert.ok(quickAlbum);
  assert.deepEqual(await selected('albums'), [a2.id, quickAlbum.id].sort());
  await createOnce('tags', '快速标签');
  const [quickTag] = await sql(
    `SELECT id,display_name FROM tags WHERE display_name=${literal('快速标签')}`,
  );
  assert.ok(quickTag);
  assert.deepEqual(await selected('tags'), [t2.id, quickTag.id].sort());
  report.checks.push(
    'Real successful quick creation persists each record once despite repeated pending pointer/keyboard presses, sends only one POST, automatically appends its returned ID, and restores focus to the corresponding selector.',
  );

  const filesDirectory = join(config.output, 'relation-files');
  await mkdir(filesDirectory, { recursive: true });
  const files = [];
  for (let index = 0; index < 3; index++) {
    const path = join(filesDirectory, `relation-${index}.png`);
    await copyFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
      path,
    );
    files.push(path);
  }
  // Hold actual native sends; releasing a slot still performs the real HTTP upload.
  await page.evaluate(() => {
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    window.__relationPending = [];
    window.__restoreRelationXHR = () => {
      XMLHttpRequest.prototype.open = nativeOpen;
      XMLHttpRequest.prototype.send = nativeSend;
    };
    XMLHttpRequest.prototype.open = function (method, path, ...rest) {
      this.__relationPath = String(path);
      return nativeOpen.call(this, method, path, ...rest);
    };
    XMLHttpRequest.prototype.send = function (body) {
      if (!this.__relationPath?.includes('/api/uploads/sessions/'))
        return nativeSend.call(this, body);
      window.__relationPending.push({
        path: this.__relationPath,
        send: () => nativeSend.call(this, body),
      });
    };
  });
  installed = true;
  await page.click('loc=role:button[name*="可见性"]');
  await page.click('loc=role:option[name="公开"]');
  const first = await start(files);
  assert.equal(first.visibility, 'public');
  const frozen = await summary(first.id);
  assert.deepEqual([...frozen.albums].sort(), [a2.id, quickAlbum.id].sort());
  assert.deepEqual([...frozen.tags].sort(), [t2.id, quickTag.id].sort());
  assert.deepEqual(frozen.groups, [2, 1]);
  assert.ok(
    frozen.text.includes('快速相册') && frozen.text.includes('快速标签'),
  );
  assert.deepEqual(
    JSON.parse(first.album_ids).sort(),
    [...frozen.albums].sort(),
  );
  assert.deepEqual(JSON.parse(first.tag_ids).sort(), [...frozen.tags].sort());
  const [{ id: acceptedSession }] = await sql(
    `SELECT id FROM upload_sessions WHERE submission_id=${literal(first.id)} AND group_index=0 LIMIT 1`,
  );
  await page.waitForFunction(
    (id) => window.__relationPending.some((item) => item.path.includes(id)),
    acceptedSession,
  );
  await page.evaluate((id) => {
    const index = window.__relationPending.findIndex((item) =>
      item.path.includes(id),
    );
    window.__relationPending.splice(index, 1)[0].send();
  }, acceptedSession);
  await page.waitForSelector('[data-state="ready"]', { timeout: 60000 });
  const [accepted] = await sql(
    `SELECT image_id FROM upload_sessions WHERE id=${literal(acceptedSession)}`,
  );
  assert.ok(accepted.image_id);
  assert.deepEqual(
    (
      await sql(
        `SELECT album_id FROM album_images WHERE image_id=${literal(accepted.image_id)} ORDER BY album_id`,
      )
    ).map((row) => row.album_id),
    [a2.id, quickAlbum.id].sort(),
  );
  assert.deepEqual(
    (
      await sql(
        `SELECT tag_id FROM image_tags WHERE image_id=${literal(accepted.image_id)} ORDER BY tag_id`,
      )
    ).map((row) => row.tag_id),
    [t2.id, quickTag.id].sort(),
  );

  await api(`/api/albums/${quickAlbum.id}`, 'PATCH', { name: '相册后来更名' });
  await sql(
    `UPDATE tags SET display_name='标签后来更名', normalized_key='标签后来更名' WHERE id=${literal(quickTag.id)}`,
  );
  await open('albums');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="upload-albums"]')
      ?.textContent.includes('相册后来更名'),
  );
  await closeChoices('albums');
  await open('tags');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="upload-tags"]')
      ?.textContent.includes('标签后来更名'),
  );
  await closeChoices('tags');
  assert.deepEqual(
    await summary(first.id),
    frozen,
    'Collection refresh cannot rewrite names or IDs frozen at the first start',
  );
  await remove('albums', a2.id);
  await remove('tags', t2.id);
  await api('/api/settings/upload', 'PATCH', { batchSize: 1 });
  await page.click('loc=role:button[name*="可见性"]');
  await page.click('loc=role:option[name="私有"]');
  const second = await start(files.slice(0, 2), [first.id]);
  const nextFrozen = await summary(second.id);
  assert.deepEqual(nextFrozen.albums, [quickAlbum.id]);
  assert.deepEqual(nextFrozen.tags, [quickTag.id]);
  assert.deepEqual(nextFrozen.groups, [1, 1]);
  assert.ok(
    nextFrozen.text.includes('相册后来更名') &&
      nextFrozen.text.includes('标签后来更名') &&
      nextFrozen.text.includes('私有'),
  );
  assert.equal(second.visibility, 'private');
  assert.equal(second.batch_size, 1);
  assert.equal(
    (
      await sql(
        `SELECT batch_size FROM upload_submissions WHERE id=${literal(first.id)}`,
      )
    )[0].batch_size,
    2,
  );
  assert.deepEqual(await summary(first.id), frozen);
  for (const theme of ['light', 'dark'])
    for (const width of [360, 390, 430, 768, 1440])
      await screenshot('two-frozen', width, theme);
  report.checks.push(
    'Three real files freeze groups 2/1 and both selected relations. Later names, visibility and batch-size changes only enter a second real submission with groups 1/1; refreshing choices leaves the original summary identical.',
  );

  await api(`/api/albums/${a2.id}`, 'DELETE');
  const replacementAlbum = (
    await api('/api/albums', 'POST', { name: a2.name }, 201)
  ).album;
  await sql(`DELETE FROM tags WHERE id=${literal(t2.id)}`);
  const replacementTag = (
    await api('/api/tags', 'POST', { name: t2.displayName }, 201)
  ).tag;
  assert.notEqual(replacementAlbum.id, a2.id);
  assert.notEqual(replacementTag.id, t2.id);
  // Four remaining sends may become available in later groups; wait on actual
  // terminal states, not a guessed fixed number of scheduling ticks.
  const deadline = Date.now() + 60000;
  while (true) {
    const [{ n }] = await sql(
      `SELECT count(*) AS n FROM upload_sessions WHERE submission_id IN (${literal(first.id)},${literal(second.id)}) AND state NOT IN ('accepted','failed','cancelled','expired')`,
    );
    if (!n) break;
    assert.ok(
      Date.now() < deadline,
      'All real upload sessions settle after native sends are released',
    );
    await page.waitForFunction(
      () =>
        window.__relationPending.length > 0 ||
        [...document.querySelectorAll('[data-testid="upload-item"]')].every(
          (node) =>
            ['ready', 'upload-failed', 'processing-failed'].includes(
              node.dataset.state,
            ),
        ),
      undefined,
      { timeout: 15000 },
    );
    await page.evaluate(() =>
      window.__relationPending.splice(0).forEach((item) => item.send()),
    );
  }
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-state="ready"]').length === 3 &&
      document.querySelectorAll('[data-state="upload-failed"]').length === 2,
    undefined,
    { timeout: 60000 },
  );
  assert.deepEqual(
    await sql(
      `SELECT state, count(*) AS n FROM upload_sessions WHERE submission_id=${literal(first.id)} GROUP BY state ORDER BY state`,
    ),
    [
      { state: 'accepted', n: 1 },
      { state: 'failed', n: 2 },
    ],
  );
  assert.deepEqual(
    await sql(
      `SELECT error_code FROM upload_sessions WHERE submission_id=${literal(first.id)} AND state='failed'`,
    ),
    [
      { error_code: 'COLLECTION_TARGET_REMOVED' },
      { error_code: 'COLLECTION_TARGET_REMOVED' },
    ],
  );
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS n FROM album_images WHERE album_id=${literal(replacementAlbum.id)}`,
      )
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS n FROM image_tags WHERE tag_id=${literal(replacementTag.id)}`,
      )
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS n FROM upload_sessions WHERE submission_id=${literal(second.id)} AND state='accepted'`,
      )
    )[0].n,
    2,
  );
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS n FROM media_images WHERE id=${literal(accepted.image_id)}`,
      )
    )[0].n,
    1,
  );
  assert.deepEqual(await summary(first.id), frozen);
  await screenshot('deleted-target-results', 390, 'dark');
  report.checks.push(
    'Deleting old album/tag IDs and recreating their names leaves the accepted original image intact, fails the other two old files with COLLECTION_TARGET_REMOVED, attaches no image to replacements, and allows both unrelated second-submission files to reach ready.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  report.page = await page.snapshot();
  await page.screenshot({ path: join(config.output, 'relations-failure.png') });
  throw error;
} finally {
  if (installed) await page.evaluate(() => window.__restoreRelationXHR());
  if (observingFetch)
    await page.evaluate(() => window.__restoreRelationFetch());
  await writeFile(
    join(config.output, 'upload-relations.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  status: report.status,
  checks: report.checks,
  layouts: report.layouts.length,
});
