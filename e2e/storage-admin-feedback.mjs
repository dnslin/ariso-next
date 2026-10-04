/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  config.geometryScript
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  tips: [],
  mutations: [],
  limitations: [
    'Existing isolated preview is reused; only two deliberately invalid creates are submitted. No valid save, connection test, scan or delete is performed.',
    'Browser mobile emulation does not certify physical touch, soft keyboard or nonzero safe areas.',
    'Device modes start after blurring the prior tip and moving the pointer away; switching CDP device modes while a desktop tooltip remains open is not covered.',
  ],
};
const button = (name) => `loc=role:button[name="${name}"]`;
const field = (name) => `input[name="${name}"]`;
async function read(path) {
  const response = await page.fetch(path);
  assert.equal(response.status, 200, `${path}: ${response.status}`);
  return JSON.parse(response.body);
}
async function collectMutations() {
  report.mutations.push(
    ...(await page.evaluate(() => {
      const requests = window.__storageFeedbackRequests ?? [];
      window.__storageFeedbackRequests = [];
      return requests;
    })),
  );
}
async function open(path) {
  await collectMutations();
  await page.goto(`${config.origin}${path}`);
  await page.waitForSelector('[data-testid="storage-editor"]');
  await page.waitForSelector(field('name'));
}
async function measure(state) {
  const geometry = await readGeometry(page);
  const fields = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '#storage-form [data-slot="input-group-input"]',
      ),
    ].map((input) => {
      const group = input.closest('[data-slot="input-group"]');
      const label = input
        .closest('[data-slot="textfield"]')
        .querySelector('label');
      const icon = group.querySelector('[data-slot="input-group-prefix"] svg');
      const inputRect = input.getBoundingClientRect();
      const iconRect = icon?.getBoundingClientRect();
      return {
        name: input.name || 'storageType',
        label: label?.textContent.trim(),
        labelFor: label?.htmlFor,
        inputId: input.id,
        externalLabel:
          !!label &&
          label.getBoundingClientRect().bottom <=
            group.getBoundingClientRect().top,
        prefix: !!icon,
        decorative: icon?.getAttribute('aria-hidden') === 'true',
        iconWidth: iconRect?.width,
        iconHeight: iconRect?.height,
        prefixBeforeInput: !!iconRect && iconRect.right <= inputRect.left,
        readOnly: input.readOnly,
        disabled: input.disabled,
        height: group.getBoundingClientRect().height,
        width: group.getBoundingClientRect().width,
        inputWidth: inputRect.width,
        inputHeight: inputRect.height,
        borderColor: getComputedStyle(group).borderColor,
        fontSize: getComputedStyle(input).fontSize,
      };
    }),
  );
  assertGeometry(geometry, state);
  assert.ok(fields.length >= 2, `${state}: real labeled fields exist`);
  for (const input of fields) {
    assert.ok(
      input.prefix && input.decorative && input.prefixBeforeInput,
      `${state}/${input.name}: decorative leading icon`,
    );
    assert.equal(input.iconWidth, 16);
    assert.equal(input.iconHeight, 16);
    assert.ok(
      input.externalLabel && input.labelFor === input.inputId,
      `${state}/${input.name}: external associated label`,
    );
    assert.equal(
      input.height,
      geometry.width >= 1200 && state === 'local-referenced' ? 40 : 44,
    );
    if (geometry.width < 1200) assert.equal(input.fontSize, '16px');
  }
  let actions;
  if (state === 'local-referenced') {
    assert.equal(fields.find((input) => input.name === 'name').readOnly, false);
    for (const name of ['localPath', 'storageType'])
      assert.equal(fields.find((input) => input.name === name).readOnly, true);
    actions = await page.evaluate(() => {
      const group = document.querySelector(
        '[data-testid="storage-editor-actions"]',
      );
      const select = document.querySelector(
        '#storage-form [data-slot="select-trigger"]',
      );
      const power = select.querySelector('svg.lucide-power');
      const value = select.querySelector('[data-slot="select-value"]');
      return {
        wrap: getComputedStyle(group).flexWrap,
        buttons: [...group.querySelectorAll('button')].map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.dataset.testid,
            name: node.textContent.trim(),
            top: rect.top,
            width: rect.width,
            height: rect.height,
            radius: getComputedStyle(node).borderRadius,
            disabled: node.disabled,
          };
        }),
        selectPrefix: !!document.querySelector(
          '#storage-form [data-slot="select-trigger"] > svg.lucide-power',
        ),
        selectGap:
          value.getBoundingClientRect().left -
          power.getBoundingClientRect().right,
        visibleGuideParagraphs: [
          ...document.querySelectorAll('#storage-form p'),
        ].filter((node) => node.getClientRects().length).length,
        referenceEntrances: document.querySelectorAll(
          '[data-testid="storage-open-cleanup"]',
        ).length,
      };
    });
    assert.equal(actions.buttons.length, 3);
    assert.deepEqual(
      actions.buttons.map((node) => node.id),
      ['storage-open-default', 'storage-open-cleanup', 'storage-delete'],
    );
    assert.equal(actions.wrap, 'wrap');
    assert.equal(actions.referenceEntrances, 1);
    assert.equal(
      actions.visibleGuideParagraphs,
      0,
      'Secondary explanations are available through tips',
    );
    assert.equal(actions.selectPrefix, true);
    assert.equal(
      actions.selectGap,
      8,
      'Enabled-state icon and value retain an 8px gap',
    );
    for (const action of actions.buttons) {
      assert.equal(action.radius, '8px');
      assert.ok(action.height >= 44 && action.width >= 44);
    }
    assert.equal(actions.buttons[2].disabled, true);
    const rows = new Set(
      actions.buttons.map((action) => Math.round(action.top)),
    );
    if (geometry.width >= 768)
      assert.equal(
        rows.size,
        1,
        'Available desktop/tablet width keeps the three actions in one row',
      );
    if (geometry.width <= 390)
      assert.ok(
        rows.size > 1 && rows.size < 3,
        'Narrow screens wrap the action group naturally',
      );
  }
  return { ...geometry, fields, actions };
}
async function capture(state, theme, width, height) {
  await resizeViewport(page, width, height);
  await setTheme(page, theme);
  await page.evaluate(() => {
    document
      .querySelector('.shell-content')
      ?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  const geometry = await measure(state);
  const screenshot = `storage-feedback-${state}-${theme}-${width}${height ? `x${height}` : ''}.png`;
  await page.screenshot({ path: join(config.output, screenshot) });
  report.layouts.push({ state, theme, ...geometry, screenshot });
}
async function layouts(state, widths = [360, 390, 430, 768, 1440]) {
  for (const theme of ['light', 'dark'])
    for (const width of widths) await capture(state, theme, width);
}
async function tip(label, mode, screenshotName) {
  const name = `${label}说明`;
  report.pendingTip = { name, mode, stage: 'opening' };
  const trigger = button(name);
  const dialog = `[role="dialog"][aria-label="${name}"]`;
  let enabledState;
  if (label === '启用状态') {
    enabledState = await page.evaluate((name) => {
      const tip = document.querySelector(`button[aria-label="${name}"]`);
      const select = document.querySelector(
        '#storage-form [data-slot="select-trigger"]',
      );
      return {
        popup: tip.getAttribute('aria-haspopup'),
        value: select.textContent.trim(),
      };
    }, name);
    assert.notEqual(
      enabledState.popup,
      'listbox',
      'Enabled explanation is independent of Select trigger context',
    );
  }
  if (mode === 'keyboard') {
    await page.focus(trigger);
    await page.keyboard.press('Enter');
  } else await page.click(trigger);
  report.pendingTip.stage = 'waiting-for-dialog';
  await page.waitForSelector(dialog);
  report.pendingTip.stage = 'waiting-for-tooltip-exit';
  await page.waitForSelector('[role="tooltip"]', { state: 'hidden' });
  if (enabledState) {
    const after = await page.evaluate(() => ({
      value: document
        .querySelector('#storage-form [data-slot="select-trigger"]')
        .textContent.trim(),
      optionsVisible: [...document.querySelectorAll('[role="listbox"]')].some(
        (node) => node.getClientRects().length,
      ),
    }));
    assert.equal(
      after.value,
      enabledState.value,
      'Opening enabled-state help preserves the selected value',
    );
    assert.equal(
      after.optionsVisible,
      false,
      'Opening enabled-state help shows explanation without Select options',
    );
  }
  const info = await page.evaluate((name) => {
    const dialog = document.querySelector(
      `[role="dialog"][aria-label="${name}"]`,
    );
    const rect = dialog.getBoundingClientRect();
    const trigger = document.querySelector(`button[aria-label="${name}"]`);
    const target = trigger.getBoundingClientRect();
    return {
      name,
      text: dialog.textContent.trim(),
      viewport: { width: innerWidth, height: innerHeight },
      dialogBounds: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      insideViewport:
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight,
      target: { width: target.width, height: target.height },
      expanded: trigger.getAttribute('aria-expanded'),
      pressed: trigger.getAttribute('data-pressed'),
      transform: getComputedStyle(trigger).transform,
      focusInDialog: dialog.contains(document.activeElement),
    };
  }, name);
  assert.ok(info.text.length > label.length);
  assert.ok(info.insideViewport, `${name}: tip fits viewport`);
  assert.ok(info.target.width >= 44 && info.target.height >= 44);
  if (mode === 'keyboard')
    assert.ok(info.focusInDialog, `${name}: keyboard focus enters explanation`);
  if (screenshotName)
    await page.screenshot({ path: join(config.output, screenshotName) });
  report.pendingTip.stage = 'closing';
  if (mode === 'click-outside') {
    // Modal help makes underlying content inert; click its visible backdrop.
    const point = { x: info.viewport.width - 8, y: 24 };
    const bounds = info.dialogBounds;
    assert.ok(
      point.x < bounds.left ||
        point.x > bounds.right ||
        point.y < bounds.top ||
        point.y > bounds.bottom,
      'Background dismissal targets the area outside the explanation',
    );
    await page.mouse.click(point.x, point.y, {
      label: '关闭存储说明浮层',
    });
    info.closePoint = point;
  } else await page.keyboard.press('Escape');
  report.pendingTip.stage = 'waiting-for-hidden-dialog';
  await page.waitForSelector(dialog, { state: 'hidden' });
  report.pendingTip.stage = 'waiting-for-detached-dialog';
  await page.waitForFunction(
    (selector) => document.querySelector(selector) === null,
    dialog,
  );
  report.pendingTip.stage = 'waiting-for-original-trigger-focus';
  await page.waitForFunction(
    (name) => document.activeElement?.getAttribute('aria-label') === name,
    name,
  );
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    ),
    name,
    `${name}: closing restores the trigger focus`,
  );
  report.tips.push({ ...info, mode, screenshot: screenshotName });
  delete report.pendingTip;
}
async function tooltip(label, mode) {
  const name = `${label}说明`;
  if (mode === 'hover') await page.hover(button(name));
  else {
    await page.focus(button(name));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute('aria-label'),
      ),
      name,
    );
  }
  await page.waitForSelector('[role="tooltip"]');
  const text = await page.evaluate(() =>
    document.querySelector('[role="tooltip"]')?.textContent.trim(),
  );
  assert.ok(
    text?.length > label.length,
    `${name}: desktop ${mode} reads the real explanation`,
  );
  const screenshot = `storage-feedback-tooltip-${mode}-light-1440.png`;
  await page.screenshot({ path: join(config.output, screenshot) });
  if (mode === 'hover') await page.hover('h1');
  else await page.focus(field('name'));
  await page.waitForSelector('[role="tooltip"]', { state: 'hidden' });
  report.tips.push({ name, mode, text, screenshot });
}
async function leaveTipBeforeResize() {
  await page.focus(field('name'));
  await page.hover('h1');
  await page.waitForSelector('[role="tooltip"]', { state: 'detached' });
}
async function invalidCreate(type, name, value) {
  await open('/settings/storage/new');
  await page.click(`[data-testid="storage-type-${type}"]`);
  await page.fill(field('name'), `Issue 198 invalid ${type} feedback`);
  await page.fill(field(name), value);
  if (type === 's3')
    await page.fill(field('bucket'), 'feedback-invalid-endpoint');
  const normalBoundary = await page.evaluate((name) => {
    const style = getComputedStyle(
      document
        .querySelector(`input[name="${name}"]`)
        .closest('[data-slot="input-group"]'),
    );
    return {
      borderColor: style.borderColor,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
    };
  }, name);
  await page.click('[data-testid="storage-save"]');
  await page.waitForSelector(`${field(name)}[aria-invalid="true"]`);
  await page.waitForFunction(
    (name) => document.activeElement?.name === name,
    name,
  );
  const error = await page.evaluate((name) => {
    const input = document.querySelector(`input[name="${name}"]`);
    const description = input.getAttribute('aria-describedby');
    const color = document.createElement('span');
    color.style.color = 'var(--danger)';
    document.body.appendChild(color);
    const dangerColor = getComputedStyle(color).color;
    color.remove();
    const style = getComputedStyle(input.closest('[data-slot="input-group"]'));
    return {
      value: input.value,
      invalid: input.getAttribute('aria-invalid'),
      groupInvalid: input
        .closest('[data-slot="input-group"]')
        .getAttribute('data-invalid'),
      borderColor: getComputedStyle(input.closest('[data-slot="input-group"]'))
        .borderColor,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
      dangerRingSpread: Math.max(
        0,
        ...style.boxShadow
          .split(/,(?![^()]*\))/)
          .filter((shadow) => shadow.includes(dangerColor))
          .map((shadow) =>
            Number(shadow.match(/0px\s+0px\s+0px\s+([\d.]+)px\s*$/)?.[1] ?? 0),
          ),
      ),
      dangerColor,
      description: description
        ?.split(' ')
        .map((id) => document.getElementById(id)?.textContent.trim())
        .join(' '),
      focused: document.activeElement === input,
      responses: window.__storageFeedbackRequests,
    };
  }, name);
  assert.equal(error.value, value);
  assert.equal(error.invalid, 'true');
  assert.equal(error.groupInvalid, 'true');
  assert.ok(
    (error.borderColor === error.dangerColor &&
      error.borderColor !== normalBoundary.borderColor) ||
      (error.outlineColor === error.dangerColor &&
        parseFloat(error.outlineWidth) >= 1 &&
        error.outlineStyle !== 'none' &&
        error.outlineColor !== normalBoundary.outlineColor) ||
      (error.dangerRingSpread >= 1 &&
        error.boxShadow !== normalBoundary.boxShadow),
    `${type}: invalid input adds a visible danger boundary to the ordinary field: ${JSON.stringify({ normalBoundary, error })}`,
  );
  assert.ok(
    error.description?.length && error.focused,
    `${type}: actual field error is associated and receives focus`,
  );
  const response = error.responses.find(
    (request) => request.path === '/api/storages' && request.method === 'POST',
  );
  assert.equal(response?.status, 400);
  assert.equal(response.code, 'STORAGE_INVALID_INPUT');
  assert.ok(response.fields.some((issue) => issue.field === name));
  await page.focus(field('name'));
  await page.waitForFunction(
    (name) =>
      document
        .querySelector(`input[name="${name}"]`)
        .closest('[data-slot="input-group"]')
        .getAttribute('data-focus-within') !== 'true',
    name,
  );
  const unfocused = await page.evaluate((name) => {
    const input = document.querySelector(`input[name="${name}"]`);
    const style = getComputedStyle(input.closest('[data-slot="input-group"]'));
    return {
      invalid: input.getAttribute('aria-invalid'),
      borderColor: style.borderColor,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
    };
  }, name);
  assert.equal(unfocused.invalid, 'true');
  assert.ok(
    unfocused.borderColor === error.dangerColor ||
      (unfocused.outlineColor === error.dangerColor &&
        parseFloat(unfocused.outlineWidth) >= 1 &&
        unfocused.outlineStyle !== 'none'),
    `${type}: moving focus preserves the visible invalid field boundary`,
  );
  await page.focus(field(name));
  report.checks.push({
    check: `${type}-actual-invalid-create`,
    field: name,
    normalBoundary,
    ...error,
    unfocused,
    responses: undefined,
  });
  await layouts(`${type}-field-error`, [1440, 390]);
}
let observer;
let finalPath;
try {
  await page.goto(config.origin);
  const login = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config.credentials),
  });
  assert.equal(login.status, 200, login.statusText);
  const before = (await read('/api/storages')).map((row) => row.id).sort();
  const defaultStorage = (await read('/api/settings/storage')).defaultStorageId;
  finalPath = `/settings/storage/${defaultStorage}`;
  const detail = await read(`/api/storages/${defaultStorage}`);
  assert.equal(detail.type, 'local');
  assert.ok(
    Object.values(detail.references.counts).some((count) => count > 0),
    'Preview has real existing references',
  );
  const source = `(${(() => {
    const fetch = window.fetch;
    window.__storageFeedbackOriginalFetch = fetch;
    window.__storageFeedbackRequests = [];
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const method = args[1]?.method?.toUpperCase() ?? 'GET';
      const storageMutation =
        path.startsWith('/api/storages') || path === '/api/settings/storage';
      if (storageMutation && method !== 'GET' && method !== 'HEAD') {
        if (method !== 'POST' || path !== '/api/storages') {
          window.__storageFeedbackRequests.push({
            path,
            method,
            forbidden: true,
          });
          throw new Error(
            'Feedback verification cannot modify existing preview storage or run remote operations',
          );
        }
        const response = await fetch(...args);
        const value = await response.clone().json();
        window.__storageFeedbackRequests.push({
          path,
          method,
          status: response.status,
          code: value.code,
          fields: value.fields,
        });
        return response;
      }
      return fetch(...args);
    };
  }).toString()})();`;
  observer = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source,
  });
  await open(`/settings/storage/${defaultStorage}`);
  await layouts('local-referenced');
  await resizeViewport(page, 1440);
  await setTheme(page, 'light');
  await tooltip('存储名称', 'hover');
  await tooltip('相对路径', 'focus');
  await resizeViewport(page, 768);
  await page.click(
    '#storage-form [data-slot="textfield"]:first-child [data-slot="input-group-prefix"]',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.name),
    'name',
    'InputGroup prefix belongs to the actual 44px input target',
  );
  await resizeViewport(page, 1440);
  for (const name of [
    '存储名称',
    '存储类型',
    '相对路径',
    '启用状态',
    '删除限制',
  ])
    await tip(
      name,
      'keyboard',
      name === '相对路径' ? 'storage-feedback-tip-light-1440.png' : undefined,
    );
  await leaveTipBeforeResize();
  await resizeViewport(page, 390);
  await tip('删除限制', 'click-outside', 'storage-feedback-tip-light-390.png');
  await setTheme(page, 'dark');
  await tip('相对路径', 'click', 'storage-feedback-tip-dark-390.png');
  await leaveTipBeforeResize();
  await resizeViewport(page, 1440);
  await tip('删除限制', 'keyboard', 'storage-feedback-tip-dark-1440.png');
  for (const theme of ['light', 'dark']) {
    await leaveTipBeforeResize();
    await capture('local-referenced', theme, 390, 480);
    await page.focus('[data-testid="storage-save"]');
    const focus = await page.evaluate(() => {
      const rect = document.activeElement.getBoundingClientRect();
      return {
        id: document.activeElement.dataset.testid,
        visible: rect.top >= 0 && rect.bottom <= innerHeight,
      };
    });
    assert.deepEqual(focus, { id: 'storage-save', visible: true });
    await tip(
      '删除限制',
      'keyboard',
      `storage-feedback-tip-${theme}-390x480.png`,
    );
  }
  report.checks.push(
    'Editable name and read-only type/path fields retain associated labels and prefix icons; tips open with keyboard/click, close with Escape or outside click, and restore focus at desktop/mobile/short viewports.',
  );
  await page.click('[data-testid="storage-open-cleanup"]');
  await page.waitForSelector('[data-testid="storage-reference-view"]');
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="storage-reference-view"]')
        .textContent.includes('图片与版本'),
    ),
  );
  await page.click(button('查看清理状态'));
  await page.waitForSelector('[data-testid="storage-cleanup-view"]');
  report.checks.push(
    'Single reference-and-cleanup action reaches actual reference counts and the existing cleanup view without running maintenance.',
  );
  for (const type of ['local', 's3']) {
    await open('/settings/storage/new');
    await page.click(`[data-testid="storage-type-${type}"]`);
    await page.fill(field('name'), `Issue 198 ${type} unsaved input`);
    await layouts(`${type}-new`, [1440, 390]);
    if (type === 's3') {
      assert.equal(
        await page.evaluate(
          () => document.querySelector('input[name="accessKey"]').type,
        ),
        'password',
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector('input[name="secretKey"]').type,
        ),
        'password',
      );
    }
  }
  await invalidCreate('local', 'localPath', '../outside');
  await invalidCreate('s3', 'endpoint', 'invalid-endpoint');
  await collectMutations();
  assert.deepEqual(
    (await read('/api/storages')).map((row) => row.id).sort(),
    before,
    'Invalid creates leave the existing preview configurations unchanged',
  );
  assert.equal(report.mutations.length, 2);
  assert.ok(
    report.mutations.every(
      (request) =>
        request.path === '/api/storages' &&
        request.method === 'POST' &&
        request.status === 400,
    ),
  );
  assert.equal(
    (await read('/api/settings/storage')).defaultStorageId,
    defaultStorage,
  );
  report.checks.push(
    'Both invalid creates return actual HTTP 400 field errors, preserve inputs/focus, create no rows and leave the default unchanged. No test, scan or delete request is issued.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  report.failureState = await page.evaluate(() => ({
    visibility: document.visibilityState,
    documentFocused: document.hasFocus(),
    activeElement: {
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute('aria-label'),
      name: document.activeElement?.getAttribute('name'),
    },
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map((node) => ({
      label: node.getAttribute('aria-label'),
      visible: !!node.getClientRects().length,
    })),
    tooltips: [...document.querySelectorAll('[role="tooltip"]')].map((node) =>
      node.textContent.trim(),
    ),
  }));
  await page.screenshot({
    path: join(config.output, 'storage-admin-feedback-failure.png'),
  });
  throw error;
} finally {
  if (observer)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', observer);
  await page.evaluate(() => {
    if (window.__storageFeedbackOriginalFetch) {
      window.fetch = window.__storageFeedbackOriginalFetch;
      delete window.__storageFeedbackOriginalFetch;
    }
    delete window.__storageFeedbackRequests;
  });
  if (report.status === 'passed') {
    await page.goto(`${config.origin}${finalPath}`);
    await page.waitForSelector('[data-testid="storage-form"]');
    await resizeViewport(page, 1440);
    await setTheme(page, 'light');
    await page.evaluate(() =>
      document
        .querySelector('.shell-content')
        ?.scrollTo({ top: 0, behavior: 'instant' }),
    );
  }
  await writeFile(
    join(config.output, 'storage-admin-feedback.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  storageAdminFeedback: report.status,
  layouts: report.layouts.length,
  tips: report.tips.length,
  report: join(config.output, 'storage-admin-feedback.json'),
});
