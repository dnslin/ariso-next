/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { readFile, mkdir, rm, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { seedLibraryBatch, cleanLibraryBatch } = await import(
  new URL('./library-batch-fixture.mjs', config.libraryDetailScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  new URL('./browser-geometry.mjs', config.libraryDetailScript).href
);
const { installBrowserErrors, assertNoBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  screenshots: [],
  limitations: [
    'Browser responsive, keyboard and focus evidence; physical devices and Release containers not run. The queue-wait scenario uses a persisted active-job fixture and ends that fixture before observing real filesystem cleanup.',
  ],
};
let fixture;
let errors;
let savedTheme;

async function shot(state, width, theme, height) {
  const filename = `trash-cleanup-${state}-${width}-${theme}${height ? '-short' : ''}.png`;
  await page.screenshot({ path: join(config.output, filename) });
  report.screenshots.push(filename);
}
async function layouts(state, widths = [390, 1440], height) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width, height);
      const geometry = await readGeometry(page);
      assertGeometry(geometry, `${state}/${width}/${theme}`);
      const actions = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-testid="cleanup-modal"] button,[data-testid="cleanup-workspace"] button,[data-testid="cleanup-check"]',
          ),
        ].map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            name: node.textContent,
            width: rect.width,
            height: rect.height,
          };
        }),
      );
      for (const action of actions)
        assert.ok(
          action.width >= 44 && action.height >= 44,
          `${state}: ${action.name} >=44px`,
        );
      report.layouts.push({
        state,
        theme,
        width,
        height: height ?? (width >= 1200 ? 1080 : 844),
        geometry,
        actions,
        modalTypography: await page.evaluate(() => {
          const modal = document.querySelector('[data-testid="cleanup-modal"]');
          const title = modal?.querySelector('.text-xl');
          const identity = modal?.querySelector('p.text-sm');
          return title && identity
            ? {
                titleFont: getComputedStyle(title).fontSize,
                titleLineHeight: getComputedStyle(title).lineHeight,
                identityFont: getComputedStyle(identity).fontSize,
                identityLineHeight: getComputedStyle(identity).lineHeight,
              }
            : null;
        }),
      });
      await shot(state, width, theme, height);
    }
  }
  await resizeViewport(page, 1440);
}
async function openRecord(id) {
  await page.goto(`${config.origin}/trash?image=${id}`);
  await page.waitForSelector('[data-testid="trash-detail"]');
}
async function waitCleanup(id, status) {
  await page.waitForFunction(
    async ({ id, status }) => {
      const response = await fetch(`/api/images/${id}/cleanup`);
      return response.ok && (await response.json()).status === status;
    },
    { id, status },
    { timeout: 30000 },
  );
}
async function installLostResponse(id) {
  await page.evaluate((id) => {
    const original = window.fetch;
    window.__cleanupTraffic = [];
    window.__cleanupLoseRead = true;
    window.__cleanupRestoreFetch = () => {
      window.fetch = original;
    };
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const method = args[1]?.method ?? 'GET';
      const cleanup =
        (path === `/api/images/${id}` && method === 'DELETE') ||
        path.startsWith(`/api/images/${id}/cleanup`);
      const response = await original(...args);
      if (cleanup) {
        window.__cleanupTraffic.push({ path, method, status: response.status });
        if (
          method === 'DELETE' ||
          (method === 'GET' && window.__cleanupLoseRead)
        )
          throw new TypeError(
            'Verification: real committed cleanup response discarded',
          );
      }
      return response;
    };
  }, id);
}

try {
  await page.goto(`${config.origin}/library?q=issue177-&pageSize=80`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  savedTheme = await page.evaluate(() => localStorage.getItem('theme'));
  await page.evaluate(() => localStorage.setItem('theme', 'system'));
  await page.reload();
  await page.waitForSelector('[data-testid="library-list"]');
  errors = await installBrowserErrors(page);
  fixture = await seedLibraryBatch(config, sql);
  const [failedId, queuedId] = fixture.ids;
  await sql(
    `UPDATE media_images SET trashed_at=${Date.now()} WHERE id LIKE 'issue177-%'`,
  );

  report.activeCheck = 'confirm-cancel-focus';
  await openRecord(failedId);
  await page.focus(button('永久删除'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="cleanup-modal"]');
  await layouts('confirm');
  await layouts('confirm', [360, 430, 768], 420);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="cleanup-modal"]', {
    state: 'hidden',
  });
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '永久删除',
  );
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS count FROM media_cleanup_jobs WHERE image_id='${failedId}'`,
      )
    )[0].count,
    0,
  );
  report.checks.push(
    'Escape cancels confirmation, restores focus to the exact permanent-delete trigger and creates no cleanup task. Desktop/mobile light/dark and short viewports retain 44px targets.',
  );

  report.activeCheck = 'real-failure-lost-response';
  const originalPath = join(fixture.directory, `${failedId}-original.png`);
  const original = await readFile(originalPath);
  await rm(originalPath);
  await mkdir(originalPath);
  await page.click(button('永久删除'));
  await page.waitForSelector('[data-testid="cleanup-modal"]');
  await installLostResponse(failedId);
  await page.click('[data-testid="cleanup-submit"]');
  await page.waitForFunction(() => {
    const modal = document.querySelector('[data-testid="cleanup-modal"]');
    const submit = modal?.querySelector('[data-testid="cleanup-submit"]');
    return (
      modal?.textContent.includes('操作结果待核对') &&
      submit &&
      !submit.disabled &&
      submit.getAttribute('aria-disabled') !== 'true'
    );
  });
  assert.deepEqual(
    (await page.evaluate(() => window.__cleanupTraffic)).map(
      (entry) => entry.method,
    ),
    ['DELETE', 'GET'],
  );
  await layouts('unknown');
  await page.evaluate(() => {
    window.__cleanupLoseRead = false;
  });
  await page.click('[data-testid="cleanup-submit"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-workspace"]')
      ?.textContent.includes('部分文件清理失败'),
  );
  await waitCleanup(failedId, 'failed');
  const failedTask = JSON.parse(
    (await page.fetch(`/api/images/${failedId}/cleanup`)).body,
  );
  assert.equal(failedTask.status, 'failed');
  assert.equal(failedTask.remaining.length, 1);
  assert.ok(failedTask.remaining[0].error);
  assert.equal(
    (
      await sql(
        `SELECT deletion_status FROM media_images WHERE id='${failedId}'`,
      )
    )[0].deletion_status,
    'cleanup_failed',
  );
  assert.equal(
    (await page.fetch(`/api/images/${failedId}/restore`, { method: 'POST' }))
      .status,
    409,
  );
  assert.equal(
    (await page.fetch(`/api/trash/${failedId}/preview?type=original`)).status,
    404,
  );
  await layouts('failed');
  await layouts('failed', [360, 430, 768], 420);
  assert.equal(
    await page.evaluate(
      () =>
        window.__cleanupTraffic.filter((entry) => entry.method === 'DELETE')
          .length,
    ),
    1,
  );
  report.checks.push(
    'A directory at the exact Local original-object key causes a real filesystem cleanup failure. The other stored object clears, the failed object/key/error and image record remain, restore/preview refuse access. Discarded real DELETE and GET responses remain unknown until an explicit GET, without replaying DELETE.',
  );

  report.activeCheck = 'remaining-only-retry';
  await page.evaluate(() => window.__cleanupRestoreFetch());
  await page.click('[data-testid="cleanup-check"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-workspace"]')
      ?.textContent.includes('剩余清理再次失败'),
  );
  const repeatedTask = JSON.parse(
    (await page.fetch(`/api/images/${failedId}/cleanup`)).body,
  );
  assert.equal(repeatedTask.status, 'failed');
  assert.equal(repeatedTask.cycle, failedTask.cycle + 1);
  assert.equal(repeatedTask.remaining.length, 1);
  assert.equal(
    repeatedTask.remaining[0].objectId,
    failedTask.remaining[0].objectId,
  );
  assert.equal(repeatedTask.remaining[0].key, failedTask.remaining[0].key);
  assert.ok(repeatedTask.remaining[0].error);
  assert.equal(repeatedTask.deletedObjects, failedTask.deletedObjects);
  await layouts('repeated-failure');
  await layouts('repeated-failure', [360, 430, 768], 420);
  report.checks.push(
    'Keeping the actual Local directory fault and explicitly retrying opens cycle 2, which fails again on the same remaining object without re-deleting the cleared object. The repeated-failure page and its distinct footer are checked at desktop/mobile light/dark and short viewports.',
  );
  await rm(originalPath, { recursive: true });
  await writeFile(originalPath, original);
  await page.click('[data-testid="cleanup-check"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-modal"]')
      ?.textContent.includes('永久删除完成'),
  );
  const succeeded = JSON.parse(
    (await page.fetch(`/api/images/${failedId}/cleanup`)).body,
  );
  assert.equal(succeeded.status, 'succeeded');
  assert.equal(succeeded.cycle, failedTask.cycle + 2);
  assert.equal(succeeded.remaining.length, 0);
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS count FROM media_images WHERE id='${failedId}'`,
      )
    )[0].count,
    0,
  );
  await layouts('succeeded');
  await page.click('[data-testid="cleanup-submit"]');
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has('image'),
  );
  report.checks.push(
    'After replacing the failing directory with its original real file, the next explicit retry opens cycle 3 and actual Local cleanup completes; the image disappears only after the persisted succeeded task, whose read endpoint remains available.',
  );

  report.activeCheck = 'queue-continues-after-leaving-page';
  const now = Date.now();
  await sql(
    `INSERT INTO media_jobs (id,image_id,kind,scope,snapshot,expected_versions,status,created_at,updated_at) VALUES ('issue178-hold-job','${queuedId}','process','all','{}','[]','running',${now},${now})`,
  );
  await openRecord(queuedId);
  await page.click(button('永久删除'));
  await page.waitForSelector('[data-testid="cleanup-modal"]');
  await page.evaluate(() => {
    const original = window.fetch;
    let discard = true;
    window.__cleanupListReads = [];
    window.__cleanupRestoreListFetch = () => {
      window.fetch = original;
    };
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      const response = await original(...args);
      if (
        url.pathname === '/api/images' &&
        url.searchParams.get('scope') === 'trash' &&
        (args[1]?.method ?? 'GET') === 'GET'
      ) {
        window.__cleanupListReads.push({
          status: response.status,
          discarded: discard,
        });
        if (discard) {
          discard = false;
          throw new TypeError(
            'Verification: real trash-list refresh response discarded',
          );
        }
      }
      return response;
    };
  });
  await page.click('[data-testid="cleanup-submit"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-modal"]')
      ?.textContent.includes('等待当前处理结束'),
  );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-modal"]')
      ?.textContent.includes('回收站刷新失败：'),
  );
  assert.equal(
    JSON.parse((await page.fetch(`/api/images/${queuedId}/cleanup`)).body)
      .status,
    'queued',
  );
  await layouts('refresh-failed');
  await page.click(button('重新刷新回收站'));
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[data-testid="cleanup-modal"]')
        ?.textContent.includes('回收站刷新失败：'),
  );
  const refreshReads = await page.evaluate(() => window.__cleanupListReads);
  assert.equal(refreshReads[0].status, 200);
  assert.equal(refreshReads[0].discarded, true);
  assert.equal(refreshReads.at(-1).status, 200);
  assert.equal(refreshReads.at(-1).discarded, false);
  await page.evaluate(() => window.__cleanupRestoreListFetch());
  report.checks.push(
    'Discarding one real successful trash-list GET after cleanup acceptance exposes the refresh failure while retaining the accepted queued task. Explicit list refresh succeeds through another actual GET and clears the error without replaying DELETE.',
  );
  await layouts('waiting-for-writes');
  const queued = JSON.parse(
    (await page.fetch(`/api/images/${queuedId}/cleanup`)).body,
  );
  assert.equal(queued.status, 'queued');
  assert.equal(queued.waitingForWrites, true);
  assert.equal(
    (await page.fetch(`/api/images/${queuedId}/restore`, { method: 'POST' }))
      .status,
    409,
  );
  assert.equal(
    (await page.fetch(`/api/trash/${queuedId}/preview?type=original`)).status,
    404,
  );
  await page.click('[data-testid="cleanup-submit"]');
  await page.waitForSelector('[data-testid="cleanup-workspace"]');
  await layouts('progress');
  await page.click('[data-testid="cleanup-workspace"] button');
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has('image'),
  );
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS count FROM media_images WHERE id='${queuedId}'`,
      )
    )[0].count,
    1,
  );
  await sql(
    "UPDATE media_jobs SET status='cancelled' WHERE id='issue178-hold-job'",
  );
  await waitCleanup(queuedId, 'succeeded');
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS count FROM media_images WHERE id='${queuedId}'`,
      )
    )[0].count,
    0,
  );
  report.checks.push(
    'A persisted active-job fixture keeps actual permanent deletion queued and the record retained. Closing the cleanup view does not cancel server work; ending the active-job fixture allows the real worker to remove files/image and persist succeeded without reopening the page.',
  );
  report.activeCheck = 'real-running-progress';
  const runningId = fixture.ids[3];
  await sql(
    `INSERT INTO media_jobs (id,image_id,kind,scope,snapshot,expected_versions,status,created_at,updated_at) VALUES ('issue178-running-hold-job','${runningId}','process','all','{}','[]','running',${Date.now()},${Date.now()})`,
  );
  await openRecord(runningId);
  await page.click(button('永久删除'));
  await page.waitForSelector('[data-testid="cleanup-modal"]');
  await page.click('[data-testid="cleanup-submit"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-modal"]')
      ?.textContent.includes('等待当前处理结束'),
  );
  // Retain one real cleanup_pending object until its scheduled retry is due.
  // The production worker alone transitions the task into running.
  await sql(
    `UPDATE media_objects SET next_cleanup_at=${Date.now() + 60000} WHERE image_id='${runningId}' AND purpose='original'`,
  );
  await page.click('[data-testid="cleanup-submit"]');
  await page.waitForSelector('[data-testid="cleanup-workspace"]');
  await sql(
    "UPDATE media_jobs SET status='cancelled' WHERE id='issue178-running-hold-job'",
  );
  await waitCleanup(runningId, 'running');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-workspace"]')
      ?.textContent.includes('正在清理文件'),
  );
  const running = JSON.parse(
    (await page.fetch(`/api/images/${runningId}/cleanup`)).body,
  );
  assert.equal(running.status, 'running');
  assert.equal(running.waitingForWrites, false);
  assert.equal(running.deletedObjects, 1);
  assert.equal(running.totalObjects, 2);
  assert.equal(running.remaining.length, 1);
  await layouts('running');
  await layouts('running', [360, 430, 768], 420);
  await sql(
    `UPDATE media_objects SET next_cleanup_at=NULL WHERE image_id='${runningId}'`,
  );
  await waitCleanup(runningId, 'succeeded');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-modal"]')
      ?.textContent.includes('永久删除完成'),
  );
  await page.click('[data-testid="cleanup-submit"]');
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has('image'),
  );
  report.checks.push(
    'A real cleanup_pending object with a future next_cleanup_at keeps the production task running after the writer fixture ends. Actual counts are 1/2 with one retained object; making it due lets the real worker complete. The scheduled-time fixture does not simulate remote DELETE latency.',
  );
  report.activeCheck = 'disabled-storage-two-step-confirmation';
  const stoppedId = fixture.ids[2];
  const [{ storage_id: storageId }] = await sql(
    `SELECT storage_id FROM media_images WHERE id='${stoppedId}'`,
  );
  // Leave the list and finish its successor preview before disabling this
  // fixture storage; in-flight list thumbnails otherwise legitimately get 404.
  await openRecord(stoppedId);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="trash-detail"] img')].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await sql(`UPDATE storage_configs SET enabled=0 WHERE id='${storageId}'`);
  try {
    await openRecord(stoppedId);
    await page.click(button('永久删除'));
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="cleanup-modal"]')
        ?.textContent.includes('存储停用，仍可永久删除'),
    );
    await layouts('disabled-storage');
    await page.click('[data-testid="cleanup-submit"]');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="cleanup-modal"]')
        ?.textContent.includes('永久删除停用存储中的图片？'),
    );
    assert.equal(
      (
        await sql(
          `SELECT count(*) AS count FROM media_cleanup_jobs WHERE image_id='${stoppedId}'`,
        )
      )[0].count,
      0,
    );
    await layouts('disabled-storage-confirm');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="cleanup-modal"]', {
      state: 'hidden',
    });
    report.checks.push(
      'Disabled Local storage opens its dedicated warning before a separate permanent-delete confirmation; continuing the warning does not send DELETE, and Escape cancels the second step.',
    );
  } finally {
    await sql(`UPDATE storage_configs SET enabled=1 WHERE id='${storageId}'`);
  }
  report.errors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  try {
    report.failureSnapshot = await page.snapshot();
    report.failureModal = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="cleanup-modal"]');
      if (!modal) return null;
      return {
        text: modal.textContent,
        attributes: Object.fromEntries(
          [...modal.attributes].map(({ name, value }) => [name, value]),
        ),
        buttons: [...modal.querySelectorAll('button')].map((node) => ({
          text: node.textContent,
          disabled: node.disabled,
          ariaDisabled: node.getAttribute('aria-disabled'),
        })),
      };
    });
  } catch (failure) {
    report.snapshotError = String(failure);
  }
  try {
    await page.screenshot({
      path: join(config.output, 'trash-cleanup-failure.png'),
    });
  } catch (failure) {
    report.screenshotError = String(failure);
  }
  throw error;
} finally {
  await page.evaluate(() => window.__cleanupRestoreFetch?.()).catch(() => {});
  await page
    .evaluate(() => window.__cleanupRestoreListFetch?.())
    .catch(() => {});
  if (fixture) {
    await sql(
      "DELETE FROM media_jobs WHERE id IN ('issue178-hold-job','issue178-running-hold-job')",
    );
    await sql(
      "DELETE FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%'",
    );
    await cleanLibraryBatch(sql, fixture);
  }
  if (errors)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errors,
    });
  if (savedTheme !== undefined)
    await page.evaluate((saved) => {
      if (saved === null) localStorage.removeItem('theme');
      else localStorage.setItem('theme', saved);
    }, savedTheme);
  await writeFile(
    join(config.output, 'trash-cleanup.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
