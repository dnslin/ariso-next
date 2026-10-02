import assert from 'node:assert/strict';

/** Actual quick-create APIs: cancellation, unknown results, failure and success. */
export async function verifyUploadRelationCreation(
  { page, sql, report, step },
  { a2, t2, selected, open, closeChoices, remove, screenshot, representatives },
) {
  const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const button = (name) => `loc=role:button[name="${name}"]`;
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

  return { a2, t2, quickAlbum, quickTag, open, closeChoices, remove };
}
