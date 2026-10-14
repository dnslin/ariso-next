import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resizeViewport,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';
import { chooseTheme, visibleThemeTrigger } from './theme-helpers.mjs';

const input = 'input[aria-label="选择图片文件"]';
const draft = '[data-testid="upload-draft-summary"]';
const button = (name) => `loc=role:button[name=${JSON.stringify(name)}]`;

/**
 * Real F03 flow on an authenticated, disposable owner runtime with an enabled
 * Local storage and an empty browser queue. No runner or browser is started here.
 * options: { samplePath?, output?, albumId?, tagId? }
 */
export async function runUiuxP1Upload(page, origin, options = {}) {
  const report = {
    checks: [],
    layouts: [],
    imageIds: [],
    submissionId: null,
    limitations: [
      'Chromium viewport emulation; physical touch, keyboard and safe areas are not exercised.',
      'One real metadata response is held to check the pending boundary; native Local transfers and media processing still run normally.',
      'Persisted fixture images remain in the disposable runner database for its normal teardown; S3 is not exercised.',
    ],
  };
  const temporary = await mkdtemp(join(tmpdir(), 'ariso-uiux-p1-upload-'));
  const sample =
    options.samplePath ??
    fileURLToPath(
      new URL('../tests/fixtures/runtime/images/sample.png', import.meta.url),
    );
  const created = [];
  let originalPreference;
  let gateScript;
  let phase = 'initialization';
  function step(next, details = {}) {
    phase = next;
    console.log({ uiuxP1UploadStep: phase, ...details });
  }
  async function request(path, method = 'GET', body, expected = 200) {
    const response = await page.fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${response.body}`,
    );
    return JSON.parse(response.body);
  }
  async function queued(count) {
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll(
          '[data-testid="upload-item"][data-state="queued"]',
        ).length === count,
      count,
    );
  }
  async function top() {
    await page.evaluate(() =>
      document
        .querySelector('.shell-content')
        ?.scrollTo({ top: 0, behavior: 'instant' }),
    );
  }
  async function selectVisibility(value) {
    step('visibility-open', { value });
    await page.click(
      'loc=css:[data-testid="upload-settings"] [aria-haspopup="listbox"] >> nth=1',
    );
    await page.click(
      `loc=role:option[name="${value === 'public' ? '公开' : '私有'}"]`,
    );
    step('visibility-verify', {
      value,
      current: await page.evaluate(() => ({
        summary: document.querySelector('[data-testid="upload-draft-summary"]')
          ?.textContent,
        controls: [
          ...document.querySelectorAll(
            '[data-testid="upload-settings"] [aria-haspopup="listbox"]',
          ),
        ].map((node) => node.textContent),
      })),
    });
    await page.waitForFunction(
      (label) =>
        document
          .querySelector('[data-testid="upload-draft-summary"] p')
          ?.textContent.includes(label),
      value === 'public' ? '公开' : '私有',
    );
  }
  async function chooseRelation(kind, id) {
    step('choose-relation', { kind, id });
    const label = kind === 'albums' ? '相册' : '标签';
    await page.click(button(`选择${label}`));
    const option = `[role="option"][data-relation-id="${id}"]`;
    await page.waitForSelector(option);
    if (
      await page.evaluate(
        (selector) =>
          document.querySelector(selector).getAttribute('aria-selected') !==
          'true',
        option,
      )
    )
      await page.click(option);
    await page.waitForFunction(
      (selector) =>
        document.querySelector(selector)?.getAttribute('aria-selected') ===
        'true',
      option,
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      (label) =>
        !document.querySelector(`[role="dialog"][aria-label="选择${label}"]`),
      label,
    );
  }
  async function evidence(count, width, theme, name = 'queued') {
    await resizeViewport(page, width);
    await chooseTheme(page, theme, theme);
    await top();
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="upload-item"]')].every(
        (node) =>
          Number(
            getComputedStyle(node.closest('[data-component-entry]')).opacity,
          ) >= 0.999 &&
          [...node.querySelectorAll('img')].every(
            (image) => image.complete && image.naturalWidth > 0,
          ),
      ),
    );
    const geometry = await readGeometry(page);
    assertGeometry(geometry, `F03/${name}/${count}/${width}/${theme}`);
    const layout = await page.evaluate(() => {
      const summary = document.querySelector(
        '[data-testid="upload-draft-summary"]',
      );
      const edit = summary.querySelector('button');
      const queue = document.querySelector('[data-testid="upload-queue"]');
      const settings = document.querySelector(
        '[data-testid="upload-settings"]',
      );
      const footer = document.querySelector('.shell-footer');
      const rect = (node) => {
        const value = node.getBoundingClientRect();
        return {
          top: value.top,
          bottom: value.bottom,
          left: value.left,
          right: value.right,
          width: value.width,
          height: value.height,
        };
      };
      return {
        summary: rect(summary),
        edit: rect(edit),
        queue: rect(queue),
        settings: rect(settings),
        footer: rect(footer),
        visible: !!summary.getClientRects().length,
        text: summary.textContent.replace(/\s+/g, ' ').trim(),
        names: [
          ...document.querySelectorAll(
            '[data-testid="upload-file-row"] p:first-child',
          ),
        ].map((node) => node.textContent),
      };
    });
    if (width < 768) {
      assert.equal(layout.visible, true, 'Mobile draft summary is displayed');
      assert.ok(
        layout.summary.top >= 0 && layout.summary.bottom < layout.footer.top,
        'Current settings are visible before the fixed start action',
      );
      assert.ok(
        layout.summary.bottom <= layout.queue.top,
        'Current settings precede the long file queue',
      );
      assert.ok(
        layout.edit.width >= 44 && layout.edit.height >= 44,
        'Modify has a 44px touch target',
      );
      if (count >= 12)
        assert.ok(
          layout.settings.top > layout.footer.top,
          'Full settings stay after the queue while the compact summary remains visible',
        );
    } else {
      assert.equal(
        layout.visible,
        false,
        'Desktop and tablet do not duplicate the compact summary',
      );
      assert.ok(
        layout.queue.right < layout.settings.left,
        'Existing queue/settings columns remain side by side',
      );
      assert.ok(
        Math.abs(layout.settings.width - 360) < 1,
        'Existing settings column remains 360px',
      );
    }
    assert.equal(layout.names.length, count);
    assert.ok(
      layout.names.includes('秋日山野旅行照片'.repeat(5) + '.png'),
      'Long real filename is retained',
    );
    const screenshot = `uiux-p1-upload-${name}-${count}-${theme}-${width}.png`;
    if (options.output)
      await page.screenshot({ path: join(options.output, screenshot) });
    report.layouts.push({
      name,
      count,
      width,
      theme,
      ...(options.output ? { screenshot } : {}),
      ...geometry,
      ...layout,
    });
  }
  try {
    step('open-upload');
    if (options.output) await mkdir(options.output, { recursive: true });
    ({ identifier: gateScript } = await page.cdp(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `(() => {
          const original = window.fetch;
          let release;
          const gate = new Promise((resolve) => { release = resolve; });
          const state = { armed: false, count: 0, release, response: null };
          window.__uiuxP1Upload = state;
          window.__uiuxP1UploadRestore = () => {
            state.armed = false;
            window.fetch = original;
            release();
            delete window.__uiuxP1UploadRestore;
            delete window.__uiuxP1Upload;
          };
          window.fetch = async (...args) => {
            const input = args[0];
            const request = input instanceof Request ? input : null;
            const url = new URL(request ? request.url : String(input), location.href);
            const method = String(args[1]?.method ?? request?.method ?? 'GET').toUpperCase();
            const held = state.armed && url.pathname === '/api/uploads/submissions' && method === 'POST';
            if (held) state.armed = false;
            const response = await original(...args);
            if (held) {
              state.count++;
              state.status = response.status;
              state.response = response.status === 201
                ? await response.clone().json()
                : { error: await response.clone().text() };
              if (response.status === 201) await gate;
            }
            return response;
          };
        })();`,
      },
    ));
    await page.goto(`${origin}/upload`);
    assert.notEqual(
      new URL(await page.url()).pathname,
      '/login',
      'F03 requires the runner owner to be signed in',
    );
    await page.waitForSelector(input, { state: 'attached' });
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="upload-item"]').length,
      ),
      0,
      'F03 starts with its own empty browser queue',
    );
    originalPreference = await page.evaluate(
      (selector) => document.querySelector(selector)?.dataset.theme,
      await visibleThemeTrigger(page),
    );
    const settings = await request('/upload/settings');
    assert.ok(
      settings.queueLimit >= 20,
      'Runtime queue admits the 20-file scenario',
    );
    const storage = (await request('/api/storages')).find(
      (entry) => entry.type === 'local' && entry.enabled,
    );
    assert.ok(storage, 'F03 requires one enabled Local storage');
    await page.click(
      'loc=css:[data-testid="upload-settings"] [aria-haspopup="listbox"] >> nth=0',
    );
    await page.click(`loc=role:option[name=${JSON.stringify(storage.name)}]`);
    let albumId = options.albumId ?? settings.albums[0]?.id;
    let tagId = options.tagId ?? settings.tags[0]?.id;
    if (!albumId) {
      const result = await request(
        '/api/albums',
        'POST',
        { name: '山野旅行', description: '' },
        201,
      );
      albumId = result.album.id;
      created.push(`/api/albums/${albumId}`);
    }
    if (!tagId) {
      const result = await request('/api/tags', 'POST', { name: '旅行' }, 201);
      tagId = result.tag.id;
      if (!result.reused) created.push(`/api/tags/${tagId}`);
    }
    const files = [];
    for (let index = 0; index < 20; index++) {
      const file = join(
        temporary,
        index === 0
          ? '秋日山野旅行照片'.repeat(5) + '.png'
          : `山野旅行-${String(index + 1).padStart(2, '0')}.png`,
      );
      await copyFile(sample, file);
      files.push(file);
    }
    for (const [count, previous] of [
      [1, 0],
      [12, 1],
      [20, 12],
    ]) {
      step('queued-layouts', { count });
      await page.setInputFiles(input, files.slice(previous, count));
      await queued(count);
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelectorAll(
              '[data-testid="upload-frozen-submission"]',
            ).length,
        ),
        0,
        'Selecting and appending files does not submit them',
      );
      for (const theme of ['light', 'dark'])
        for (const width of [360, 390, 430, 768, 1440])
          await evidence(count, width, theme);
    }
    report.checks.push(
      'Native 1/12/20-file append, a long Chinese filename, 360/390/430/768/1440 in both themes, mobile summary before the queue, 44px Modify target and unchanged desktop 360px settings column.',
    );
    await resizeViewport(page, 390);
    await top();
    step('modify-settings-focus');
    await page.click(button('修改上传设置'));
    await page.waitForFunction(() => {
      const settings = document.querySelector('#upload-settings-fields');
      const selector = settings.querySelector(
        'button[aria-haspopup="listbox"]:not(:disabled)',
      );
      const rect = selector.getBoundingClientRect();
      return (
        document.activeElement === selector &&
        rect.top >= 0 &&
        rect.bottom <
          document.querySelector('.shell-footer').getBoundingClientRect().top
      );
    });
    const submittedVisibility =
      settings.defaultVisibility === 'private' ? 'public' : 'private';
    await selectVisibility(submittedVisibility);
    await chooseRelation('albums', albumId);
    await chooseRelation('tags', tagId);
    step('verify-draft-relations');
    await page.waitForFunction(() => {
      const text = document.querySelector(
        '[data-testid="upload-draft-summary"]',
      ).textContent;
      return text.includes('1 个相册') && text.includes('1 个标签');
    });
    await top();
    assert.ok(
      (
        await page.evaluate(
          (selector) => document.querySelector(selector).textContent,
          draft,
        )
      ).includes(storage.name),
      'Draft shows the explicitly selected Local storage',
    );
    report.checks.push(
      'Modify scrolls to and focuses the original settings selector; actual visibility, album and tag changes immediately update the unsubmitted summary.',
    );

    // The controller captured this wrapper when it mounted. Arm only the next
    // metadata POST; its real response and all native File transfers are retained.
    await page.evaluate(() => {
      window.__uiuxP1Upload.armed = true;
    });
    step('manual-start');
    await page.click(button('开始上传'));
    await page.waitForFunction(() => !!window.__uiuxP1Upload.response);
    const held = await page.evaluate(() => ({
      count: window.__uiuxP1Upload.count,
      status: window.__uiuxP1Upload.status,
      submission: window.__uiuxP1Upload.response,
      states: [...document.querySelectorAll('[data-testid="upload-item"]')].map(
        (node) => node.dataset.state,
      ),
    }));
    step('held-metadata', {
      count: held.count,
      status: held.status,
      visibility: held.submission.visibility,
    });
    assert.equal(held.count, 1);
    assert.equal(held.status, 201);
    assert.equal(held.submission.sessions.length, 20);
    assert.ok(
      held.states.every((state) => state === 'submitting'),
      'Pending metadata response remains submitting, not a false success',
    );
    const nextVisibility =
      submittedVisibility === 'public' ? 'private' : 'public';
    step('change-next-visibility', { submittedVisibility, nextVisibility });
    await selectVisibility(nextVisibility);
    assert.ok(
      (
        await page.evaluate(
          (selector) => document.querySelector(selector).textContent,
          draft,
        )
      ).includes('下一次设置'),
    );
    step('release-real-transfers');
    await page.evaluate(() => window.__uiuxP1Upload.release());
    step('await-ready-20');
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="upload-item"][data-state="ready"]',
        ).length === 20,
      undefined,
      { timeout: 60000 },
    );
    step('verify-frozen-submission');
    report.submissionId = held.submission.id;
    const frozenSelector = `[data-testid="upload-frozen-submission"][data-submission-id="${held.submission.id}"]`;
    const frozen = await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      return {
        text: node.textContent,
        albumIds: JSON.parse(node.dataset.albumIds),
        tagIds: JSON.parse(node.dataset.tagIds),
        groups: JSON.parse(node.dataset.groups),
      };
    }, frozenSelector);
    assert.ok(frozen.text.includes(storage.name));
    assert.ok(
      frozen.text.includes(submittedVisibility === 'public' ? '公开' : '私有'),
    );
    assert.deepEqual(frozen.albumIds, [albumId]);
    assert.deepEqual(frozen.tagIds, [tagId]);
    const persisted = await request(
      `/api/uploads/submissions/${held.submission.id}`,
    );
    const groups = [];
    for (const session of persisted.sessions)
      groups[session.groupIndex] = (groups[session.groupIndex] ?? 0) + 1;
    assert.deepEqual(frozen.groups, groups);
    assert.equal(persisted.visibility, submittedVisibility);
    assert.equal(persisted.storageId, storage.id);
    assert.deepEqual(persisted.albumIds, [albumId]);
    assert.deepEqual(persisted.tagIds, [tagId]);
    report.imageIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="upload-item"]')].map(
        (node) => node.dataset.imageId,
      ),
    );
    assert.equal(new Set(report.imageIds).size, 20);
    step('verify-ready-images', { count: report.imageIds.length });
    for (const id of report.imageIds) {
      const image = await request(`/api/images/${id}`);
      assert.equal(image.visibility, submittedVisibility);
      assert.equal(image.storage.id, storage.id);
      assert.equal(image.processingStatus, 'ready');
      assert.deepEqual(
        image.albums.map((entry) => entry.id),
        [albumId],
      );
      assert.deepEqual(
        image.tags.map((entry) => entry.id),
        [tagId],
      );
    }
    step('remove-next-tag');
    await page.click(
      `[data-testid="upload-tags"] button[aria-label^="移除标签"]`,
    );
    step('verify-next-tag-removal');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="upload-draft-summary"]')
        .textContent.includes('0 个标签'),
    );
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector).textContent,
        frozenSelector,
      ),
      frozen.text,
      'Later draft changes cannot rewrite the submitted summary',
    );
    await top();
    if (options.output)
      await page.screenshot({
        path: join(options.output, 'uiux-p1-upload-ready-dark-390.png'),
      });
    report.checks.push(
      'One actual POST is held after server commit; changing the next draft while pending leaves all 20 native Local uploads, ready images, persisted relations and frozen summary at the original submitted settings. A later tag removal updates only the next draft.',
    );
    step('clear-completed');
    await page.click(button('清空已完成'));
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="upload-item"]'),
    );
    return report;
  } catch (error) {
    console.error({ uiuxP1UploadFailedAt: phase, message: error.message });
    throw error;
  } finally {
    console.log({ uiuxP1UploadCleanupAfter: phase });
    await page.evaluate(() => window.__uiuxP1UploadRestore?.());
    if (gateScript)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: gateScript,
      });
    for (const path of created.reverse()) await request(path, 'DELETE');
    if (originalPreference) {
      const resolved =
        originalPreference === 'system'
          ? await page.evaluate(() =>
              matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light',
            )
          : originalPreference;
      await chooseTheme(page, originalPreference, resolved);
    }
    await rm(temporary, { recursive: true, force: true });
  }
}
