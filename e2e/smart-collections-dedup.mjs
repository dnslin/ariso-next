/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const load = (file) => import(new URL(file, config.libraryDetailScript).href);
const { createImageWorkflowFixture } = await load(
  './image-workflows-fixture.mjs',
);
const { signInToLibrary } = await load('./library-login.mjs');
const { resizeViewport, setTheme } = await load('./browser-geometry.mjs');
const { installBrowserErrors, assertNoBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  checks: [],
  layouts: [],
  modalLayouts: [],
  limitations: [
    'Disposable Local standalone, real uploads and media worker. External S3 providers and physical mobile devices are not covered by this browser suite.',
  ],
};
let fixture, collectionId, failure;
const button = (name) => `loc=role:button[name=${JSON.stringify(name)}]`;
const loaded = (expected) =>
  page.waitForFunction(
    (expected) =>
      document.querySelector('[data-testid="library-list"]')?.dataset
        .loadedCount === String(expected),
    expected,
  );
async function settleVisuals() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
    await new Promise(requestAnimationFrame);
  });
}
async function screenshot(name) {
  await settleVisuals();
  await page.screenshot({ path: join(config.output, name) });
}
async function verifyCollectionDialog(selector, actions, name) {
  for (const [width, height] of [
    [1440, 1080],
    [390, 844],
    [360, 480],
  ]) {
    await resizeViewport(page, width, height);
    await settleVisuals();
    const geometry = await page.evaluate((selector) => {
      const dialog = document.querySelector(selector);
      const rect = dialog.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        dialogWidth: rect.width,
        dialogHeight: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        dialogOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
        scrollable: dialog.scrollHeight > dialog.clientHeight + 1,
      };
    }, selector);
    assert.ok(
      Math.round(geometry.dialogWidth * 64) / 64 <= 480,
      `${name}: dialog is at most 480px wide`,
    );
    assert.ok(
      geometry.left >= 15 && geometry.right <= width - 15,
      `${name}: horizontal viewport padding`,
    );
    assert.ok(
      geometry.dialogHeight <= height - 31 &&
        geometry.top >= 15 &&
        geometry.bottom <= height - 15,
      `${name}: short dialog stays within the viewport`,
    );
    assert.equal(geometry.pageOverflow, false, `${name}: no document overflow`);
    assert.equal(geometry.dialogOverflow, false, `${name}: no dialog overflow`);
    await page.focus(
      `loc=css:${selector} button:text-is(${JSON.stringify(actions[0])})`,
    );
    const reached = new Map();
    for (let step = 0; step < actions.length + 3; step++) {
      const focused = await page.evaluate((selector) => {
        const dialog = document.querySelector(selector);
        const active = document.activeElement;
        if (!active || !dialog.contains(active) || active.tagName !== 'BUTTON')
          return null;
        const rect = active.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          name: active.textContent.trim(),
          width: rect.width,
          height: rect.height,
          inViewport:
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight,
          unobstructed: hit === active || active.contains(hit),
        };
      }, selector);
      if (focused && actions.includes(focused.name)) {
        assert.equal(
          focused.inViewport,
          true,
          `${name}: ${focused.name} is visible after keyboard focus`,
        );
        assert.equal(
          focused.unobstructed,
          true,
          `${name}: ${focused.name} is reachable`,
        );
        assert.ok(
          focused.width >= 43.99 && focused.height >= 43.99,
          `${name}: ${focused.name} has a 44px target`,
        );
        reached.set(focused.name, focused);
      }
      if (reached.size === actions.length) break;
      await page.keyboard.press('Tab');
    }
    assert.deepEqual(
      [...reached.keys()].sort(),
      [...actions].sort(),
      `${name}: all actions are keyboard reachable`,
    );
    await screenshot(`${name}-${width}.png`);
    report.modalLayouts.push({
      name,
      ...geometry,
      actions: [...reached.values()],
    });
  }
  await resizeViewport(page, 1440, 1080);
  await settleVisuals();
}
try {
  await page.goto(`${config.origin}/library`);
  await resizeViewport(page, 1440, 1080);
  await setTheme(page, 'light');
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  await installBrowserErrors(page);
  fixture = await createImageWorkflowFixture(page, config, report);
  const created = await fixture.json(
    '/api/library/collections',
    'POST',
    {
      name: '最近待整理的图片',
      rules: { q: fixture.prefix, tagState: 'none', recentDays: '7' },
    },
    201,
  );
  collectionId = created.collection.id;
  await page.goto(`${config.origin}/library/collections/${collectionId}`);
  await loaded(3);
  report.initialSnapshot = await page.snapshot();
  report.checks.push(
    'Saved query displays three actual untagged uploads, excluding the tagged original.',
  );
  await fixture.json(
    `/api/images/${fixture.publicImage.id}/collections`,
    'PATCH',
    { tagIds: [fixture.privateImage.tags[0].id] },
  );
  await page.click(button('刷新图库'));
  await loaded(2);
  report.checks.push(
    'Adding a tag removes an image from the saved untagged query after refresh.',
  );
  await page.reload();
  await loaded(2);
  report.checks.push(
    'Collection name and criteria survive a real page reload.',
  );
  await page.fill(
    'loc=role:searchbox[name="搜索图片名称"]',
    `${fixture.prefix}-no-matching-image`,
  );
  await page.click(button('搜索图库图片'));
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="library-empty"]')
        ?.textContent.includes('没有找到匹配图片') &&
      document.querySelector('[data-testid="library-list"]')?.dataset
        .loadedCount === '0' &&
      document.querySelectorAll(
        '[data-testid="library-list"] [data-testid="library-card"]',
      ).length === 0 &&
      !document.querySelector('[data-testid="library-error"]'),
  );
  await screenshot('smart-collection-empty.png');
  await page.fill('loc=role:searchbox[name="搜索图片名称"]', fixture.prefix);
  await page.click(button('搜索图库图片'));
  await loaded(2);
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="library-empty"]') &&
      !document
        .querySelector('[data-testid="smart-collection-toolbar"]')
        ?.textContent.includes('未保存更改'),
  );
  assert.equal(
    (await fixture.json(`/api/library/collections/${collectionId}`)).collection
      .rules.q,
    fixture.prefix,
    'An empty temporary search must not overwrite the saved collection rules',
  );
  report.checks.push(
    'A real unmatched search shows the empty state; restoring the original condition restores both images without changing the saved definition.',
  );
  await page.click(button('集合操作'));
  await page.snapshot();
  await page.click('text="重命名"');
  const renameDialog = '[role="dialog"][aria-label="重命名集合"]';
  await page.waitForSelector(renameDialog);
  await page.waitForFunction(() => {
    const input = document.querySelector(
      '[role="dialog"][aria-label="重命名集合"] input',
    );
    return input && document.activeElement === input;
  });
  const renameLabel = await page.evaluate(() => {
    const dialog = document.querySelector(
      '[role="dialog"][aria-label="重命名集合"]',
    );
    const input = dialog.querySelector('input');
    const labels = [
      ...input.labels,
      ...(input.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id))
        .filter(Boolean),
    ];
    const label = labels.find((node) => node.textContent.trim() === '集合名称');
    return {
      text: label?.textContent.trim(),
      visible: !!label?.getClientRects().length,
      aboveInput:
        !!label &&
        label.getBoundingClientRect().bottom <=
          input.getBoundingClientRect().top + 1,
      placeholder: input.placeholder,
      focused: document.activeElement === input,
    };
  });
  assert.equal(renameLabel.text, '集合名称');
  assert.equal(renameLabel.visible, true, 'The field label remains visible');
  assert.equal(renameLabel.aboveInput, true, 'The label is outside the input');
  assert.equal(renameLabel.focused, true);
  await verifyCollectionDialog(
    renameDialog,
    ['取消', '保存'],
    'smart-collection-rename-layout',
  );
  await page.fill('loc=role:textbox[name="集合名称"]', '不应保存的名称');
  await screenshot('smart-collection-rename-dialog.png');
  await page.keyboard.press('Escape');
  await page.waitForSelector(renameDialog, { state: 'hidden' });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '集合操作',
  );
  assert.equal(
    (await fixture.json(`/api/library/collections/${collectionId}`)).collection
      .name,
    '最近待整理的图片',
    'Escape must cancel renaming without persisting the draft',
  );
  report.checks.push({
    scenario: 'rename-dialog-label-escape-focus',
    label: renameLabel,
    returnedFocus: '集合操作',
    draftPersisted: false,
  });
  await page.click(button('集合操作'));
  await page.snapshot();
  await page.click('text="重命名"');
  await page.fill('loc=role:textbox[name="集合名称"]', '已整理的规则');
  await page.click(button('保存'));
  await page.waitForSelector(button('切换集合：已整理的规则'));
  assert.equal(
    (await fixture.json(`/api/library/collections/${collectionId}`)).collection
      .name,
    '已整理的规则',
  );
  await page.fill(
    'loc=role:searchbox[name="搜索图片名称"]',
    `${fixture.prefix}-small`,
  );
  await page.click(button('搜索图库图片'));
  await loaded(1);
  await page.click(button('刷新图库'));
  const refreshDialog = '[role="dialog"][aria-label="刷新已保存集合"]';
  await page.waitForSelector(refreshDialog);
  await verifyCollectionDialog(
    refreshDialog,
    ['保留当前修改', '放弃修改并刷新'],
    'smart-collection-refresh-layout',
  );
  await page.click(button('保留当前修改'));
  await page.waitForSelector(refreshDialog, { state: 'hidden' });
  await loaded(1);
  await page.click(button('切换集合：已整理的规则'));
  await page.click('text="全部图片"');
  const leaveDialog = '[role="dialog"][aria-label="放弃未保存的条件"]';
  await page.waitForSelector(leaveDialog);
  await verifyCollectionDialog(
    leaveDialog,
    ['继续编辑', '放弃并离开'],
    'smart-collection-leave-layout',
  );
  await page.click(button('继续编辑'));
  await page.waitForSelector(leaveDialog, { state: 'hidden' });
  assert.equal(
    new URL(await page.url()).searchParams.get('q'),
    `${fixture.prefix}-small`,
  );
  report.checks.push(
    'All three collection dialogs remain at most 480px wide and keep both actions keyboard reachable without overflow at desktop, 390px mobile and 360×480 short viewport sizes; keeping edits preserves the real query.',
  );
  await page.click(button('另存为'));
  const saveDialog = '[role="dialog"][aria-label="保存为智能集合"]';
  await page.waitForSelector(saveDialog);
  const beforeInvalidSave = await fixture.json('/api/library/collections');
  await page.fill('loc=role:textbox[name="集合名称"]', '');
  const emptySaveDisabled = await page.evaluate(() => {
    const submit = document.querySelector(
      '[role="dialog"][aria-label="保存为智能集合"] button[type="submit"]',
    );
    return submit.disabled || submit.getAttribute('aria-disabled') === 'true';
  });
  if (!emptySaveDisabled) {
    await page.click(button('保存'));
    await page.waitForFunction(() =>
      document
        .querySelector(
          '[role="dialog"][aria-label="保存为智能集合"] [role="alert"]',
        )
        ?.textContent.includes('集合名称'),
    );
  }
  assert.equal(
    await page.evaluate(() =>
      Boolean(
        document.querySelector(
          '[role="dialog"][aria-label="保存为智能集合"] input',
        )?.value === '',
      ),
    ),
    true,
    'Empty-name validation keeps the current dialog and input',
  );
  assert.deepEqual(
    (await fixture.json('/api/library/collections')).items
      .map((item) => item.id)
      .sort(),
    beforeInvalidSave.items.map((item) => item.id).sort(),
    'An invalid empty name must not create a collection',
  );
  await screenshot('smart-collection-empty-name.png');
  report.checks.push({
    scenario: 'collection-empty-name-validation',
    submitDisabled: emptySaveDisabled,
    inlineValidationShown: !emptySaveDisabled,
    collectionCreated: false,
  });
  await page.fill('loc=role:textbox[name="集合名称"]', '浏览器保存的集合');
  await page.click(button('保存'));
  await page.waitForFunction(
    (id) =>
      location.pathname.startsWith('/library/collections/') &&
      !location.pathname.endsWith(id),
    collectionId,
  );
  const copiedId = new URL(await page.url()).pathname.split('/').at(-1);
  const copied = await fixture.json(`/api/library/collections/${copiedId}`);
  assert.equal(copied.collection.rules.q, `${fixture.prefix}-small`);
  await page.click(button('集合操作'));
  await page.click('text="删除集合"');
  await page.click(button('删除集合'));
  await page.waitForURL(`${config.origin}/library`);
  assert.equal(
    (await fixture.response(`/api/library/collections/${copiedId}`)).status,
    404,
  );
  await page.goto(`${config.origin}/library/collections/${collectionId}`);
  await loaded(2);
  report.checks.push(
    'Real browser rename, save-as and delete persist through HTTP without deleting images.',
  );
  for (const [width, height] of [
    [1440, 1080],
    [390, 844],
    [360, 640],
    [430, 932],
    [768, 1024],
  ]) {
    for (const theme of ['light', 'dark']) {
      await resizeViewport(page, width, height);
      await setTheme(page, theme);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        mainOverflow:
          document.querySelector('main').scrollWidth >
          document.querySelector('main').clientWidth,
      }));
      assert.equal(geometry.overflow, false);
      assert.equal(geometry.mainOverflow, false);
      await screenshot(`smart-collections-${width}-${theme}.png`);
      report.layouts.push({ ...geometry, theme });
    }
  }
  await resizeViewport(page, 1440, 1080);
  await setTheme(page, 'light');
  const totalBeforeUpload = (await fixture.json('/api/images')).total;
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  report.uploadSnapshot = await page.snapshot();
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    fixture.paths.public,
  ]);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="upload-item"]').length === 1,
  );
  await page.click('loc=role:button[name*="开始上传"]');
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="duplicate"]',
    { state: 'visible', timeout: 120000 },
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-testid="upload-item"][data-state="ready"]',
        ).length,
    ),
    0,
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="upload-item"] button')].some(
        (node) => node.textContent.includes('重试上传'),
      ),
    ),
    false,
  );
  const after = await fixture.json('/api/images');
  assert.equal(
    after.total,
    totalBeforeUpload,
    'A real duplicate upload creates no new image',
  );
  const duplicateQueueId = await page.evaluate(
    () =>
      document.querySelector(
        '[data-testid="upload-item"][data-state="duplicate"]',
      )?.dataset.queueId,
  );
  assert.ok(duplicateQueueId, 'The duplicate row has a real queue identity');
  await page.click(button('查看已有图片'));
  await page.waitForSelector('[data-testid="library-detail"]');
  assert.ok((await page.snapshot()).includes(fixture.publicImage.displayName));
  report.checks.push(
    'Browser file upload recognizes identical bytes, creates no image, exposes existing detail, and offers no duplicate retry.',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-detail"]'),
  );
  await page.waitForFunction((queueId) => {
    const active = document.activeElement;
    return (
      active?.tagName === 'BUTTON' &&
      active.textContent.trim() === '查看已有图片' &&
      active.closest('[data-testid="upload-item"]')?.dataset.queueId === queueId
    );
  }, duplicateQueueId);
  report.checks.push(
    'Escape closes the existing-image detail and returns keyboard focus to the same duplicate row’s view-existing-image button.',
  );
  await resizeViewport(page, 390, 844);
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  for (const width of [360, 390]) {
    await resizeViewport(page, width, 844);
    const geometry = await page.evaluate(() => {
      const action = [
        ...document.querySelectorAll('[data-testid="upload-item"] button'),
      ].find((node) => node.textContent.trim() === '查看已有图片');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        actionHeight: action?.getBoundingClientRect().height,
        actionOverflow: action ? action.scrollWidth > action.clientWidth : true,
      };
    });
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.actionHeight, 44);
    assert.equal(geometry.actionOverflow, false);
  }
  await screenshot('duplicate-upload-mobile.png');
  await fixture.json(`/api/images/${fixture.publicImage.id}/trash`, 'POST');
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    fixture.paths.public,
  ]);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="upload-item"]').length === 2,
  );
  await page.click('loc=role:button[name*="开始上传"]');
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '[data-testid="upload-item"][data-state="duplicate"]',
      ).length === 2,
  );
  await page.snapshot();
  await page.click(
    'loc=css:[data-testid="upload-item"] button:text-is("查看回收记录") >> nth=0',
  );
  await page.waitForSelector('#trash-record-title');
  await page.click(button('恢复图片'));
  await page.snapshot();
  await page.click(button('确认恢复'));
  await page.waitForFunction(
    () => !document.querySelector('#trash-record-title'),
  );
  assert.equal((await fixture.detail(fixture.publicImage.id)).trashedAt, null);
  assert.equal((await fixture.json('/api/images')).total, totalBeforeUpload);
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-testid="upload-item"]').length,
    ),
    2,
  );
  report.checks.push(
    'A duplicate of a trashed image opens its real record, restores explicitly and returns to the retained queue without creating a copy.',
  );
  report.browserErrors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error)) {
    report.failureSnapshot = await page.snapshot();
    await screenshot('smart-collections-dedup-failure.png');
  }
} finally {
  if (!isBrowserControlStop(failure) && fixture) {
    try {
      if (collectionId)
        await fixture.json(
          `/api/library/collections/${collectionId}`,
          'DELETE',
        );
      await fixture.dispose();
    } catch (error) {
      report.cleanupError = error.stack ?? String(error);
      report.status = 'failed';
      failure ??= error;
    }
  }
  await writeFile(
    join(config.output, 'smart-collections-dedup.json'),
    JSON.stringify(report, null, 2),
  );
}
if (failure) throw failure;
console.log({
  status: report.status,
  checks: report.checks.length,
  layouts: report.layouts.length,
});
