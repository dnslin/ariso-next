import assert from 'node:assert/strict';
import { verifyLibraryTrashRace } from './library-trash-race.mjs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Faults affect only delivery of real responses, never fabricate application data.
async function transport(
  page,
  { hold = false, loseWrite = false, loseRead = false } = {},
) {
  await page.evaluate(
    (options) => {
      const original = window.fetch;
      window.__trashTransport = {
        writes: [],
        reads: [],
        startedReads: [],
        release: null,
        completedWrites: 0,
      };
      window.__restoreTrashTransport = () => {
        window.fetch = original;
      };
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        const method = args[1]?.method ?? 'GET';
        const state = window.__trashTransport;
        const write =
          method === 'POST' &&
          /\/api\/images\/[^/]+\/(trash|restore)$/.test(path);
        const read = method === 'GET' && path.startsWith('/api/images/');
        if (read) state.startedReads.push(path);
        const response = await original(...args);
        if (write) {
          state.writes.push({ path, status: response.status });
          if (options.hold)
            await new Promise((resolve) => {
              state.release = resolve;
            });
          if (options.loseWrite)
            throw new TypeError('Verification: real mutation response lost');
        }
        if (read) {
          state.reads.push({ path, status: response.status });
          if (options.loseRead)
            throw new TypeError(
              'Verification: real reconciliation response lost',
            );
        }
        if (write) state.completedWrites++;
        return response;
      };
    },
    { hold, loseWrite, loseRead },
  );
}

export async function verifyLibraryTrash({ page, config, sql, report }) {
  await verifyLibraryTrashRace({ page, config, sql, report });
  const button = (name) => `loc=role:button[name="${name}"]`;
  const detail = async (id, area = 'library') => {
    await page.goto(`${config.origin}/${area}?image=${id}`);
    await page.waitForSelector(
      area === 'library'
        ? '[data-testid="detail-body"]'
        : '[data-testid="trash-detail"]',
    );
    await page.waitForSelector(
      button(area === 'library' ? '回收图片' : '恢复图片'),
    );
  };
  const confirm = async (action) => {
    await page.click(button(`${action}图片`));
    await page.waitForSelector('[data-testid="trash-confirm"]');
  };
  const submitted = async () => {
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="trash-confirm"]'),
    );
  };
  const layouts = async (state) => {
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
          height: 844,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await page.waitForFunction((value) => innerWidth === value, width);
        const layout = await page.evaluate(() => {
          const root =
            document.querySelector('[data-testid="trash-confirm"]') ??
            document.querySelector('main');
          return {
            width: innerWidth,
            overflow:
              document.documentElement.scrollWidth > innerWidth ||
              root.scrollWidth > root.clientWidth,
            targets: [...root.querySelectorAll('button,a')]
              .filter((node) => node.getBoundingClientRect().width > 0)
              .map((node) => ({
                name: node.textContent,
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height,
              })),
          };
        });
        assert.equal(
          layout.overflow,
          false,
          `${state}/${theme}/${width}: no horizontal overflow`,
        );
        for (const target of layout.targets)
          assert.ok(
            target.width >= 44 && target.height >= 44,
            `${target.name}: 44px target`,
          );
        if ([390, 1440].includes(width))
          await page.screenshot({
            path: join(config.output, `trash-${state}-${theme}-${width}.png`),
          });
        report.layouts.push({ state: `trash-${state}`, theme, ...layout });
      }
    }
  };
  const originalUrl = `${config.origin}/i/library-007?type=original`;
  const before = await fetch(originalUrl);
  assert.equal(before.status, 200);
  const bytes = Buffer.from(await before.arrayBuffer());
  await detail('library-007');
  await transport(page);
  await confirm('回收');
  await layouts('trash-confirm');
  await page.click(button('取消'));
  await submitted();
  await page.waitForFunction(() =>
    document.activeElement?.textContent.includes('回收图片'),
  );
  assert.deepEqual(
    await page.evaluate(() => window.__trashTransport.writes),
    [],
  );
  await confirm('回收');
  await page.keyboard.press('Escape');
  await submitted();
  await page.waitForFunction(() =>
    document.activeElement?.textContent.includes('回收图片'),
  );
  await page.evaluate(() => window.__restoreTrashTransport());
  await transport(page, { hold: true });
  await confirm('回收');
  await page.click(button('确认回收'));
  await page.waitForFunction(
    () => typeof window.__trashTransport.release === 'function',
  );
  assert.equal(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll('[data-testid="trash-confirm"] button'),
      ].every(
        (node) =>
          node.disabled || node.getAttribute('aria-disabled') === 'true',
      ),
    ),
    true,
  );
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => window.__trashTransport.writes.length),
    1,
  );
  await page.evaluate(() => window.__trashTransport.release());
  await submitted();
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="library-detail"]') &&
      !document.querySelector('[data-image-id="library-007"]'),
  );
  assert.equal((await fetch(originalUrl)).status, 404);
  for (const kind of ['original', 'compressed', 'thumbnail'])
    assert.equal((await page.fetch(`/i/library-007?type=${kind}`)).status, 404);
  report.checks.push(
    'Trash cancellation and Escape restore trigger focus without writes; held real POST disables duplicate submission; successful trash removes detail/card and every saved version rejects owner and anonymous reads.',
  );

  const initialRead = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        if (new URL(String(args[0]), location.href).pathname !== '/api/trash') return original(...args);
        window.fetch = original;
        const response = await original(...args);
        await new Promise((resolve) => { window.__releaseInitialTrashRead = resolve; });
        return response;
      };
    })();`,
  });
  await page.goto(`${config.origin}/trash`);
  await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: initialRead.identifier,
  });
  await page.waitForFunction(
    () => typeof window.__releaseInitialTrashRead === 'function',
  );
  await page.waitForFunction(() =>
    document.body.textContent.includes('正在读取回收记录'),
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="trash-empty"]'),
    ),
    false,
  );
  await layouts('loading');
  await page.evaluate(() => window.__releaseInitialTrashRead());
  await page.waitForSelector('[data-testid="trash-record-library-007"]');
  await layouts('list');
  await page.click('[data-testid="trash-record-library-007"]');
  await page.waitForSelector('[data-testid="trash-detail"]');
  await layouts('record');
  assert.equal(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .some((entry) => new URL(entry.name).pathname.startsWith('/i/')),
    ),
    false,
    'Trash list and record request no image content',
  );
  await confirm('恢复');
  await layouts('restore-confirm');
  await page.click(button('取消'));
  await submitted();
  await page.waitForFunction(() =>
    document.activeElement?.textContent.includes('恢复图片'),
  );
  await confirm('恢复');
  await page.click(button('确认恢复'));
  await submitted();
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="trash-record-library-007"]') &&
      !document.querySelector('[data-testid="trash-detail"]'),
  );
  await page.waitForFunction(
    () => document.activeElement?.id === 'trash-title',
  );
  const after = await fetch(originalUrl);
  assert.equal(after.status, 200);
  assert.deepEqual(Buffer.from(await after.arrayBuffer()), bytes);
  report.checks.push(
    'Real trash records render without any /i content request; restore cancellation restores focus; restoration removes the record and the identical anonymous URL returns identical original bytes.',
  );

  await sql(
    "UPDATE media_images SET display_name = '停用存储中的很长文件名称用于验证手机回收记录与恢复反馈不会横向溢出且能够完整换行显示原始名称.png' WHERE id = 'library-006'",
  );
  await detail('library-006');
  await confirm('回收');
  await page.click(button('确认回收'));
  await submitted();
  await detail('library-006', 'trash');
  await confirm('恢复');
  await page.click(button('确认恢复'));
  await submitted();
  await page.waitForFunction(() =>
    document.body.textContent.includes('记录已恢复，存储仍停用'),
  );
  assert.equal((await page.fetch('/i/library-006?type=thumbnail')).status, 409);
  assert.equal(
    (
      await sql(
        "SELECT enabled FROM storage_configs WHERE id = 'library-disabled'",
      )
    )[0].enabled,
    0,
  );
  await layouts('disabled-restored');
  report.checks.push(
    'Disabled storage permits record trash/restore; success explicitly says the storage remains disabled; real content remains unreadable and storage is not enabled.',
  );

  await sql(
    "UPDATE media_images SET trashed_at = 1700000000001 WHERE id = 'library-007'",
  );
  await detail('library-007', 'trash');
  await confirm('恢复');
  await sql(
    "UPDATE media_images SET deletion_status = 'deleting' WHERE id = 'library-007'",
  );
  await transport(page);
  await page.click(button('确认恢复'));
  await page.waitForFunction(() => window.__trashTransport.reads.length > 0);
  assert.deepEqual(
    await page.evaluate(() =>
      window.__trashTransport.writes.map((item) => item.status),
    ),
    [409],
  );
  await page.waitForFunction(() =>
    document.body.textContent.includes('永久删除'),
  );
  assert.notEqual(
    (
      await sql("SELECT trashed_at FROM media_images WHERE id = 'library-007'")
    )[0].trashed_at,
    null,
  );
  await page.goto(`${config.origin}/trash?image=library-007`);
  await page.waitForSelector('[data-testid="trash-detail"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (node) => node.textContent.includes('恢复图片') && node.disabled,
    ),
  );
  await layouts('deleting');
  await sql(
    "UPDATE media_images SET deletion_status = NULL WHERE id = 'library-007'",
  );
  report.checks.push(
    'A real concurrent deleting transition returns HTTP 409 and triggers a current-record read; the trashed record remains and reopening disables restore.',
  );

  await detail('library-007', 'trash');
  await transport(page, { loseWrite: true, loseRead: true });
  await confirm('恢复');
  await page.click(button('确认恢复'));
  await page.waitForSelector(button('重新核对'));
  assert.equal(
    (
      await sql("SELECT trashed_at FROM media_images WHERE id = 'library-007'")
    )[0].trashed_at,
    null,
  );
  assert.equal(
    await page.evaluate(() => window.__trashTransport.writes.length),
    1,
  );
  await layouts('unknown');
  await page.evaluate(() => window.__restoreTrashTransport());
  await page.click(button('重新核对'));
  await submitted();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="trash-detail"]'),
  );
  assert.equal(
    await page.evaluate(() => window.__trashTransport.writes.length),
    1,
  );
  assert.equal((await fetch(originalUrl)).status, 200);
  report.checks.push(
    'Losing the real successful restore response and its real reconciliation read preserves an unknown-result state; manual reconciliation discovers the committed result without repeating the write.',
  );

  await sql(
    "UPDATE media_images SET trashed_at = 1700000000001 WHERE id = 'library-007'",
  );
  await detail('library-007', 'trash');
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 400,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.waitForFunction(() => innerHeight === 400);
  await page.evaluate(() => {
    const content = document.querySelector('.shell-content');
    content.scrollTop = content.scrollHeight;
  });
  assert.equal(
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.textContent.includes('恢复图片'),
      );
      const rect = button.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    }),
    true,
    'Record action stays accessible in shortened viewport',
  );
  await page.screenshot({
    path: join(config.output, 'trash-short-viewport.png'),
  });
  const touch = await page.evaluate(() => {
    const rect = [...document.querySelectorAll('button')]
      .find((node) => node.textContent.includes('恢复图片'))
      .getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touch],
  });
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForSelector('[data-testid="trash-confirm"]');
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await page.click(button('确认恢复'));
  await submitted();
  await sql(
    "UPDATE media_images SET trashed_at = 1700000000001 WHERE id IN ('library-007', 'library-006')",
  );
  await page.goto(`${config.origin}/trash`);
  await page.waitForSelector('[data-testid="trash-record-library-007"]');
  await page.click('[data-testid="trash-record-library-007"]');
  await page.waitForSelector(button('恢复图片'));
  await transport(page, { hold: true });
  await confirm('恢复');
  await page.click(button('确认恢复'));
  await page.waitForFunction(
    () => typeof window.__trashTransport.release === 'function',
  );
  await page.evaluate(() => history.back());
  await page.waitForSelector('[data-testid="trash-record-library-006"]');
  await page.click('[data-testid="trash-record-library-006"]');
  await page.waitForSelector('[data-testid="trash-detail"]');
  const oldReads = await page.evaluate(
    () =>
      window.__trashTransport.startedReads.filter(
        (path) => path === '/api/images/library-007',
      ).length,
  );
  await page.evaluate(() => window.__trashTransport.release());
  await page.waitForFunction(
    () => window.__trashTransport.completedWrites === 1,
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__trashTransport.startedReads.filter(
          (path) => path === '/api/images/library-007',
        ).length,
    ),
    oldReads,
    'Unmounted mutation must not start a late reconciliation request',
  );
  assert.equal(
    new URL(await page.url()).searchParams.get('image'),
    'library-006',
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="trash-detail"]'),
    ),
    true,
  );
  await page.click(button('返回回收站'));
  await page.waitForSelector('[data-testid="trash-record-library-007"]');
  await page.click('[data-testid="trash-record-library-007"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="trash-detail"]')
      ?.textContent.includes('记录已在图库'),
  );
  assert.ok(
    await page.evaluate(
      (baseline) =>
        window.__trashTransport.startedReads.filter(
          (path) => path === '/api/images/library-007',
        ).length > baseline,
      oldReads,
    ),
    'Returning to the original record must resume a real current-detail query',
  );
  assert.equal(
    await page.evaluate(
      () =>
        [...document.querySelectorAll('button')].find(
          (node) => node.textContent === '恢复图片',
        )?.disabled,
    ),
    true,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window.__trashTransport.writes.map((item) => item.status),
    ),
    [200],
  );
  await page.evaluate(() => window.__restoreTrashTransport());
  report.checks.push(
    'Leaving a held real restore through browser Back and opening another record prevents the late response from closing or changing the new record; reopening the original record resumes a real read and shows its already-restored state without another write.',
  );

  await detail('library-trashed', 'trash');
  await confirm('恢复');
  await sql("DELETE FROM media_images WHERE id = 'library-trashed'");
  await page.click(button('确认恢复'));
  await page.waitForFunction(() =>
    document.body.textContent.includes('图片记录已不存在'),
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((node) =>
        node.textContent.includes('重新核对'),
      ),
    ),
    false,
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="trash-detail"]'),
    ),
    false,
  );
  report.checks.push(
    'A record really deleted after confirmation opens produces HTTP 404 and a definite missing-record result, not an indefinitely unknown mutation.',
  );

  await detail('library-006', 'trash');
  await confirm('恢复');
  await sql(`UPDATE session SET expires_at = ${Date.now() - 1}`);
  await page.click(button('确认恢复'));
  await page.waitForSelector('#email');
  assert.equal(new URL(await page.url()).searchParams.get('reason'), 'expired');
  assert.equal(
    new URL(await page.url()).searchParams.get('returnTo'),
    '/trash?image=library-006',
  );
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.click(button('登录'));
  await page.waitForFunction(
    () =>
      location.pathname !== '/login' ||
      document
        .querySelector('[role="alert"]')
        ?.textContent.includes('HTTP 429'),
  );
  if (new URL(await page.url()).pathname === '/login') {
    // The complete suite shares a real rate-limit window. Honor its server
    // deadline rather than clearing limits or weakening the login assertion.
    let session = await page.fetch('/api/auth/get-session');
    for (let attempt = 0; session.status === 429 && attempt < 6; attempt++) {
      const seconds = Number(
        session.headers['x-retry-after'] ?? session.headers['retry-after'],
      );
      assert.ok(
        Number.isFinite(seconds) && seconds > 0,
        'Rate-limited session provides a retry deadline',
      );
      await delay(Math.min(seconds * 1000, 30000));
      session = await page.fetch('/api/auth/get-session');
    }
    assert.equal(session.status, 200);
    await page.waitForFunction(
      () => !document.querySelector('button[type="submit"]').disabled,
    );
    await page.click(button('登录'));
  }
  await page.waitForSelector('[data-testid="trash-detail"]');
  report.checks.push(
    'A real expired owner session during restore/reconciliation redirects to login with the exact trash record return target; signing in returns to that record.',
  );

  await sql('UPDATE media_images SET trashed_at = NULL');
  await page.goto(`${config.origin}/trash`);
  await page.waitForSelector('[data-testid="trash-empty"]');
  await layouts('empty');
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (new URL(String(args[0]), location.href).pathname === '/api/trash') {
        window.fetch = original;
        throw new TypeError('Verification: real trash list response lost');
      }
      return response;
    };
  });
  await page.click(button('刷新回收站'));
  await page.waitForSelector('[data-testid="trash-error"]');
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="trash-empty"]'),
    ),
    false,
    'Read failure is not an empty result',
  );
  await layouts('read-error');
  await page.click(button('重试加载'));
  await page.waitForSelector('[data-testid="trash-empty"]');
  report.checks.push(
    'A real zero-record query renders empty; losing the real refresh response renders an error rather than an empty state; retry reads the real endpoint.',
  );
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('[data-testid="library-card"]');
  report.checks.push(
    'The 390×400 shortened viewport keeps the real record restore action reachable; this is not a physical keyboard or safe-area device test.',
  );
}
