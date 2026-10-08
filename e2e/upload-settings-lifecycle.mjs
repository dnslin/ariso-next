import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { limitsField, limitsId } from './upload-settings-helpers.mjs';

// Keep the genuine first response in this document. Navigation must not destroy
// the fetch closure: the old editor's continuation runs only after release.
function lifecycleBoundary(mode) {
  const original = window.__limitsOriginalFetch ?? window.fetch;
  window.__limitsOriginalFetch = original;
  const state = (window.__limitsLifecycle = {
    marker: crypto.randomUUID(),
    timeOrigin: performance.timeOrigin,
    document,
    window,
    requests: [],
    order: 0,
    patches: 0,
    mode,
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  state.release = () => {
    if (state.releaseOrder !== undefined) return;
    state.releaseOrder = ++state.order;
    release();
  };
  window.fetch = async (...args) => {
    const path = new URL(
      typeof args[0] === 'string' ? args[0] : args[0].url,
      location.href,
    ).pathname;
    const method = args[1]?.method ?? 'GET';
    if (!['/api/settings/upload', '/upload/settings'].includes(path))
      return original(...args);
    const record = { path, method, order: ++state.order };
    if (typeof args[1]?.body === 'string')
      record.body = JSON.parse(args[1].body);
    state.requests.push(record);
    const firstPatch =
      path === '/api/settings/upload' &&
      method === 'PATCH' &&
      ++state.patches === 1;
    const heldRead =
      mode === 'read' &&
      path === '/api/settings/upload' &&
      method === 'GET' &&
      state.waitingForRead &&
      !state.readClaimed;
    if (heldRead) state.readClaimed = true;
    const response = await original(...args);
    record.status = response.status;
    const value = await response.clone().json();
    record.response = Object.fromEntries(
      ['maxFileMiB', 'maxFileBytes', 'batchSize', 'queueLimit']
        .filter((field) => value[field] !== undefined)
        .map((field) => [field, value[field]]),
    );
    if ((firstPatch && mode === 'patch') || heldRead) {
      record.held = true;
      await gate;
      record.released = true;
    }
    if (firstPatch && mode === 'read') {
      state.waitingForRead = true;
      record.responseLost = true;
      throw new TypeError('Verification: committed first PATCH response lost');
    }
    record.delivered = true;
    return response;
  };
}

function lifecycleState() {
  const state = window.__limitsLifecycle;
  return {
    marker: state.marker,
    timeOrigin: performance.timeOrigin,
    sameDocument: state.document === document,
    sameWindow: state.window === window,
    requests: state.requests,
    releaseOrder: state.releaseOrder,
    focusPreserved: state.focus === document.activeElement,
    noticePreserved: state.notice?.isConnected ?? false,
    addedNotices: state.addedNotices?.size ?? 0,
  };
}

async function shellNavigate(page, width, label, path) {
  if (width < 1200) {
    await page.click('button[aria-label="菜单"]');
    await page.waitForSelector('[role="dialog"][aria-label="导航菜单"]');
    await page.click(
      `[role="dialog"][aria-label="导航菜单"] a[aria-label="${label}"]`,
    );
  } else {
    await page.click(`.shell-navigation a[aria-label="${label}"]`);
  }
  await page.waitForFunction((path) => location.pathname === path, path);
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"][aria-label="导航菜单"]'),
  );
}

async function categoryNavigate(page, width, label, path) {
  if (width < 1200) {
    await page.click('.settings-mobile [data-slot="select-trigger"]');
    await page.waitForSelector('[role="listbox"]');
    await page.click(`[role="listbox"] [role="option"][data-key="${path}"]`);
  } else {
    await page.click(`.settings-desktop [role="tab"]:text-is("${label}")`);
  }
  await page.waitForFunction((path) => location.pathname === path, path);
  await page.waitForSelector('.shell-content');
}

const queueIds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="upload-item"]')].map(
      (node) => node.dataset.queueId,
    ),
  );

export async function uploadSettingsLifecycle(page, config, tools, report) {
  const temporary = await mkdtemp(join(tmpdir(), 'ariso-upload-limits-late-'));
  const source = join(
    config.projectDirectory,
    'tests/fixtures/media-formats/source.png',
  );
  const large = join(temporary, 'current-limit-55MiB.png');
  const empty = join(temporary, 'empty.png');
  const png = Buffer.alloc(55 * 1048576);
  (await readFile(source)).copy(png);
  await writeFile(large, png);
  await writeFile(empty, '');
  report.lifecycle ??= [];
  try {
    for (const [width, theme] of [
      [1440, 'light'],
      [390, 'dark'],
    ]) {
      for (const mode of ['patch', 'read']) {
        const entry = { width, theme, held: mode, status: 'failed' };
        report.lifecycle.push(entry);
        try {
          await tools.request('/api/settings/upload', 'PATCH', {
            maxFileMiB: 40,
            batchSize: 20,
            queueLimit: 500,
          });
          // A new document is allowed only for setup, before any response gate.
          await page.goto(`${config.origin}/upload`);
          await resizeViewport(page, width);
          await setTheme(page, theme);
          await page.waitForSelector('[data-testid="upload-picker"]');
          await page.setInputFiles('input[aria-label="选择图片文件"]', [
            source,
          ]);
          await page.waitForSelector(
            '[data-testid="upload-item"][data-state="queued"]',
          );
          entry.queueBefore = await queueIds(page);
          assert.equal(entry.queueBefore.length, 1);
          assert.ok(
            entry.queueBefore.every(
              (id) => typeof id === 'string' && id.length > 0,
            ),
            'Queued items have independent nonempty identities',
          );
          await shellNavigate(page, width, '站点设置', '/settings/general');
          await page.waitForSelector(
            `${limitsId('editor')}[data-state="ready"]`,
          );
          await page.evaluate(lifecycleBoundary, mode);
          const identity = await page.evaluate(lifecycleState);
          await tools.fill({ maxFileMiB: 50, batchSize: 20, queueLimit: 500 });
          await page.click(limitsId('save'));
          await page.waitForFunction(() =>
            window.__limitsLifecycle.requests.some((request) => request.held),
          );
          const first = (await page.evaluate(lifecycleState)).requests;
          const held = first.find((request) => request.held);
          assert.equal(held.status, 200);
          assert.equal(held.response.maxFileMiB, 50);
          assert.equal(held.method, mode === 'patch' ? 'PATCH' : 'GET');
          assert.equal(
            (await tools.request('/api/settings/upload')).maxFileMiB,
            50,
            'The held response follows an actual committed server value',
          );

          await categoryNavigate(
            page,
            width,
            '图片处理',
            '/settings/processing',
          );
          await page.waitForFunction(
            () =>
              !document.querySelector('[data-testid="upload-limits-editor"]'),
          );
          await categoryNavigate(page, width, '基本设置', '/settings/general');
          await page.waitForSelector(
            `${limitsId('editor')}[data-state="ready"]`,
          );
          await page.waitForFunction(
            () =>
              document.querySelector(
                '[data-field="maxFileMiB"] input:not([type="hidden"])',
              )?.value === '50',
          );
          await tools.fill({ maxFileMiB: 60 });
          await page.click(limitsId('save'));
          await page.waitForFunction(() => {
            const patches = window.__limitsLifecycle.requests.filter(
              (request) => request.method === 'PATCH',
            );
            return (
              patches.length === 2 &&
              patches[1].delivered &&
              !document.querySelector('[data-testid="upload-limits-save"]')
                .disabled &&
              [...document.querySelectorAll('[data-slot="toast"]')].some(
                (node) => node.textContent.includes('上传限制已保存'),
              )
            );
          });
          // The current editor restores its save opener on the next frame.
          // Finish that confirmed interaction before choosing the focus whose
          // identity the obsolete response must preserve.
          await page.waitForFunction(
            () =>
              document.activeElement ===
              document.querySelector('[data-testid="upload-limits-save"]'),
          );
          await page.focus(limitsField('queueLimit'));
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          await page.waitForFunction(
            (selector) =>
              document.activeElement === document.querySelector(selector),
            limitsField('queueLimit'),
          );
          await page.evaluate(() => {
            const state = window.__limitsLifecycle;
            state.focus = document.activeElement;
            state.notice = [
              ...document.querySelectorAll('[data-slot="toast"]'),
            ].find((node) => node.textContent.includes('上传限制已保存'));
            state.addedNotices = new Set();
            state.observer = new MutationObserver((records) => {
              for (const record of records)
                for (const node of record.addedNodes) {
                  if (!(node instanceof Element)) continue;
                  if (node.matches('[data-slot="toast"]'))
                    state.addedNotices.add(node);
                  for (const toast of node.querySelectorAll(
                    '[data-slot="toast"]',
                  ))
                    state.addedNotices.add(toast);
                }
            });
            state.observer.observe(document.body, {
              subtree: true,
              childList: true,
            });
            state.release();
          });
          await page.waitForFunction(() => {
            const state = window.__limitsLifecycle;
            return state.requests.some(
              (request) =>
                request.path === '/upload/settings' &&
                request.method === 'GET' &&
                request.order > state.releaseOrder &&
                request.status === 200 &&
                request.response?.maxFileBytes === 60 * 1048576,
            );
          });
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          entry.afterRelease = await page.evaluate(lifecycleState);
          assert.equal(entry.afterRelease.marker, identity.marker);
          assert.equal(entry.afterRelease.timeOrigin, identity.timeOrigin);
          assert.equal(entry.afterRelease.sameDocument, true);
          assert.equal(entry.afterRelease.sameWindow, true);
          assert.equal(entry.afterRelease.focusPreserved, true);
          assert.equal(entry.afterRelease.noticePreserved, true);
          assert.equal(
            entry.afterRelease.addedNotices,
            0,
            'No obsolete success notice',
          );
          assert.deepEqual(await tools.inputs(), {
            maxFileMiB: '60',
            batchSize: '20',
            queueLimit: '500',
          });
          entry.serverAfterRelease = await tools.request(
            '/api/settings/upload',
          );
          assert.equal(entry.serverAfterRelease.maxFileMiB, 60);
          assert.equal(entry.serverAfterRelease.maxFileBytes, 60 * 1048576);
          assert.equal(entry.serverAfterRelease.batchSize, 20);
          assert.equal(entry.serverAfterRelease.queueLimit, 500);
          const patches = entry.afterRelease.requests.filter(
            (request) => request.method === 'PATCH',
          );
          assert.equal(patches.length, 2, 'No automatic repeated mutation');
          assert.deepEqual(
            patches.map((request) => request.body.maxFileMiB),
            [50, 60],
          );
          assert.deepEqual(
            patches.map((request) => request.response.maxFileMiB),
            [50, 60],
          );
          assert.ok(
            held.held &&
              entry.afterRelease.requests.find((request) => request.held)
                ?.released,
          );
          if (mode === 'read') {
            assert.equal(patches[0].responseLost, true);
            await tools.evidence('lifecycle-ready', width, theme);
            entry.design = {
              node: width === 1440 ? '470:10085' : '470:10377',
              screenshot: `upload-settings-lifecycle-ready-${theme}-${width}.png`,
              note: 'Existing normal state only; lifecycle evidence is not an additional design review.',
            };
          }
          await shellNavigate(page, width, '上传', '/upload');
          await page.waitForSelector('[data-testid="upload-queue"]');
          assert.deepEqual(await queueIds(page), entry.queueBefore);
          // The empty input exposes the real current-limit explanation. The
          // accompanying 55 MiB PNG must still join this same live queue.
          await page.setInputFiles('input[aria-label="选择图片文件"]', [
            large,
            empty,
          ]);
          await page.waitForSelector('[data-testid="upload-input-dialog"]');
          const dialog = await page.evaluate(
            () =>
              document.querySelector('[data-testid="upload-input-dialog"]')
                .textContent,
          );
          assert.ok(dialog.includes('允许文件大小等于 60.0 MiB'), dialog);
          assert.ok(dialog.includes('文件为空 1 项'), dialog);
          assert.equal(dialog.includes('文件大小超过上传上限'), false, dialog);
          await page.click('loc=role:button[name="查看待上传图片"]');
          entry.queueAfter = await queueIds(page);
          assert.equal(entry.queueAfter.length, 2);
          assert.equal(entry.queueAfter[0], entry.queueBefore[0]);
          assert.ok(
            entry.queueAfter.every(
              (id) => typeof id === 'string' && id.length > 0,
            ),
          );
          assert.equal(new Set(entry.queueAfter).size, 2);
          const largeItem = await page.evaluate(() => {
            const node = [
              ...document.querySelectorAll('[data-testid="upload-item"]'),
            ].find((node) =>
              node.textContent.includes('current-limit-55MiB.png'),
            );
            return { text: node?.textContent, state: node?.dataset.state };
          });
          assert.ok(largeItem.text?.includes('55.0 MiB'), largeItem.text);
          assert.equal(largeItem.state, 'queued');
          const afterUpload = await page.evaluate(lifecycleState);
          assert.equal(afterUpload.marker, identity.marker);
          assert.equal(afterUpload.timeOrigin, identity.timeOrigin);
          assert.equal(afterUpload.sameDocument, true);
          assert.equal(afterUpload.sameWindow, true);
          assert.equal(
            afterUpload.requests.filter((request) => request.method === 'PATCH')
              .length,
            2,
          );
          entry.uploadLimitText = dialog;
          entry.acceptedFileBytes = 55 * 1048576;
          for (const id of entry.queueAfter)
            await page.click(`[data-queue-id="${id}"] button:text-is("移除")`);
          await page.waitForSelector('[data-testid="upload-picker"]');
          entry.status = 'passed';
        } finally {
          entry.final = await page.evaluate(() => {
            const state = window.__limitsLifecycle;
            if (!state) return null;
            state.release();
            state.observer?.disconnect();
            window.fetch = window.__limitsOriginalFetch;
            return { marker: state.marker, requests: state.requests };
          });
        }
      }
    }
    report.checks.push(
      'Same-document late PATCH and confirmation GET after real 50→60 saves on desktop light/mobile dark: two mutations, current form/focus/notice retained, active upload query rereads 60 after invalidation, independent owner HTTP read verifies saved 60, queue IDs retained and actual 55 MiB File accepted under displayed 60 MiB limit; inactive editor-cache invalidation does not imply an automatic GET',
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
