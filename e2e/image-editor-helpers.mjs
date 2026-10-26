import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, realpath, rename, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';
import { readBrowserErrors } from './browser-errors.mjs';
import { waitForImageWorkflow } from './image-workflows-fixture.mjs';

const run = promisify(execFile);
export const editor = '[data-testid="image-editor-workspace"]';
export const button = (name) => `loc=role:button[name=${JSON.stringify(name)}]`;
export const saveButton = `${editor}[data-view="edit"] [data-editor] footer button.button--primary`;
export const finalPreview = '[data-testid="image-editor-final-preview"]';

export async function visualSettled(page) {
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
export async function field(page, text, root = editor) {
  const result = await page.evaluate(
    ({ text, root }) => {
      const container = [...document.querySelectorAll(root)].find(
        (node) =>
          node.getClientRects().length &&
          !node.closest('[inert],[aria-hidden="true"]'),
      );
      if (!container) return { count: 0 };
      const labels = [...container.querySelectorAll('label')].filter(
        (label) =>
          label.getClientRects().length &&
          !label.closest('[inert],[aria-hidden="true"]') &&
          label.textContent.trim().replace(/\s*\*$/, '') === text,
      );
      const fields = labels.flatMap((label) => [
        ...new Set(
          [
            label.control,
            ...container.querySelectorAll('input,textarea'),
          ].filter(
            (input) =>
              input &&
              (input === label.control ||
                input
                  .getAttribute('aria-labelledby')
                  ?.split(/\s+/)
                  .includes(label.id)),
          ),
        ),
      ]);
      return { count: fields.length, id: fields[0]?.id };
    },
    { text, root },
  );
  assert.equal(result.count, 1, `${text} has one actual associated input`);
  assert.ok(result.id, `${text} input has an accessible identity`);
  return `[id=${JSON.stringify(result.id)}]`;
}
export async function readyEditor(page, view = 'edit') {
  await page.waitForSelector(`${editor}[data-view="${view}"]`);
  if (view === 'edit')
    await page.waitForSelector(`${editor} [data-editor-canvas] canvas`);
  await visualSettled(page);
}
export async function directEditor(page, config, ids) {
  const query = new URLSearchParams();
  ids.forEach((id) => query.append('image', id));
  await page.goto(`${config.origin}/library/edit?${query}`);
  await readyEditor(page, ids.length > 1 ? 'batch' : 'edit');
}
export async function drawMask(page, start = [0.1, 0.2], end = [0.35, 0.4]) {
  await page.click(button('打码'));
  const bounds = await page.evaluate(() => {
    const canvas = document.querySelector(
      '[data-testid="image-editor-workspace"] [data-editor-canvas] canvas',
    );
    const r = canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  assert.ok(
    bounds.width > 20 && bounds.height > 20,
    'The real canvas has drawable dimensions',
  );
  await page.mouse.move(
    bounds.x + bounds.width * start[0],
    bounds.y + bounds.height * start[1],
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * end[0],
    bounds.y + bounds.height * end[1],
  );
  await page.mouse.up();
  await page.waitForFunction(() =>
    document
      .querySelector(
        '[data-testid="image-editor-workspace"] [aria-label="编辑参数"]',
      )
      ?.textContent.includes('已添加 1 处'),
  );
  return bounds;
}
export async function chooseColor(page, value, report) {
  await page.click(button('打开颜色调色盘'));
  await page.waitForSelector('[data-slot="color-picker-popover"]');
  const input = await field(page, '色值', '[data-slot="color-picker-popover"]');
  await page.fill(input, value);
  await page.press(input, 'Tab');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-slot="color-picker-popover"]', {
    state: 'hidden',
  });
  await page.waitForFunction(() => {
    const trigger = document.querySelector(
      '[data-testid="image-editor-workspace"] [data-slot="color-picker-trigger"]',
    );
    return !!trigger && document.activeElement === trigger;
  });
  const state = await page.evaluate(() => {
    const trigger = document.querySelector(
      '[data-testid="image-editor-workspace"] [data-slot="color-picker-trigger"]',
    );
    return {
      value: trigger?.textContent.trim(),
      focused: document.activeElement === trigger,
    };
  });
  assert.equal(state.value?.toUpperCase(), value.toUpperCase());
  assert.equal(
    state.focused,
    true,
    'Esc returns native focus to the color trigger',
  );
  report.checks.push({ scenario: 'color-picker-keyboard-and-value', ...state });
}
export async function readRows(page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-testid="image-editor-workspace"] article[data-request-id]',
      ),
    ].map((row) => ({
      requestId: row.dataset.requestId,
      status: row.dataset.status,
      resultImageId: row.dataset.resultImageId,
      text: row.textContent.trim(),
    })),
  );
}
export async function settleRows(page, count, allowed = ['succeeded']) {
  await page.waitForFunction(
    ({ count, allowed }) => {
      const rows = [
        ...document.querySelectorAll(
          '[data-testid="image-editor-workspace"][data-view="results"] article[data-request-id]',
        ),
      ];
      return (
        rows.length === count &&
        rows.every((row) => allowed.includes(row.dataset.status))
      );
    },
    { count, allowed },
    { timeout: 180000 },
  );
  return readRows(page);
}
export async function observeEditFetch(
  page,
  ids,
  dropResponse = false,
  holdFirst = false,
) {
  await page.evaluate(
    ({ ids, dropResponse, holdFirst }) => {
      window.__arisoImageEditorFetch?.restore();
      const original = window.fetch;
      const allowed = new Set(ids);
      const state = {
        posts: [],
        reads: [],
        previews: [],
        dropped: false,
        heldRequestId: null,
        heldOnce: false,
        release: null,
        restore() {
          state.release?.();
          window.fetch = original;
        },
      };
      window.__arisoImageEditorFetch = state;
      window.fetch = async (...args) => {
        const input = args[0],
          init = args[1] ?? {};
        const url = new URL(
          typeof input === 'string' ? input : input.url,
          location.href,
        );
        const method = (
          init.method ??
          (typeof input === 'object' ? input.method : 'GET') ??
          'GET'
        ).toUpperCase();
        const match = /^\/api\/images\/([^/]+)\/edit$/.exec(url.pathname);
        const submission =
          method === 'POST' &&
          match &&
          allowed.has(decodeURIComponent(match[1]));
        const record = submission
          ? {
              sourceImageId: decodeURIComponent(match[1]),
              input: JSON.parse(init.body),
              startedAt: Date.now(),
            }
          : null;
        if (record) state.posts.push(record);
        const response = await original(...args);
        const preview = /^\/api\/images\/([^/]+)\/edit\/preview$/.exec(
          url.pathname,
        );
        if (
          method === 'POST' &&
          preview &&
          allowed.has(decodeURIComponent(preview[1]))
        ) {
          const bytes = new Uint8Array(await response.clone().arrayBuffer());
          const digest = new Uint8Array(
            await crypto.subtle.digest('SHA-256', bytes),
          );
          state.previews.push({
            sourceImageId: decodeURIComponent(preview[1]),
            input: JSON.parse(init.body),
            status: response.status,
            mime: response.headers.get('content-type'),
            bytes: bytes.length,
            hash: [...digest]
              .map((part) => part.toString(16).padStart(2, '0'))
              .join(''),
            signature: [...bytes.slice(0, 8)],
          });
        }
        if (record) {
          record.status = response.status;
          record.result = await response.clone().json();
          record.acceptedAt = Date.now();
          if (holdFirst && !state.heldOnce && response.status === 202) {
            state.heldOnce = true;
            state.heldRequestId = record.input.requestId;
            await new Promise((resolve) => {
              state.release = resolve;
            });
            state.heldRequestId = null;
            state.release = null;
          }
          if (dropResponse && !state.dropped && response.status === 202) {
            state.dropped = true;
            record.responseDropped = true;
            throw new TypeError(
              'Controlled acceptance test: first edit response lost after real server acceptance',
            );
          }
        }
        if (
          method === 'GET' &&
          /^\/api\/media\/edits\/[^/]+$/.test(url.pathname)
        )
          state.reads.push({
            requestId: decodeURIComponent(url.pathname.split('/').at(-1)),
            status: response.status,
            at: Date.now(),
          });
        return response;
      };
    },
    { ids, dropResponse, holdFirst },
  );
}
export async function readTraffic(page) {
  return page.evaluate(() => {
    const state = window.__arisoImageEditorFetch;
    return state
      ? {
          posts: state.posts,
          reads: state.reads,
          previews: state.previews,
          dropped: state.dropped,
          heldRequestId: state.heldRequestId,
          heldOnce: state.heldOnce,
        }
      : null;
  });
}
export async function restoreFetch(page) {
  await page.evaluate(() => {
    window.__arisoImageEditorFetch?.restore();
    delete window.__arisoImageEditorFetch;
  });
}
export async function releaseEditResponse(page) {
  await page.evaluate(() => window.__arisoImageEditorFetch?.release?.());
}
export async function capture(
  page,
  config,
  report,
  scene,
  primary = saveButton,
) {
  for (const [width, height, themes] of [
    [1440, 1000, ['light', 'dark']],
    [390, 844, ['light', 'dark']],
    [360, 844, ['light']],
    [430, 844, ['light']],
    [768, 1000, ['light']],
    [390, 480, ['light']],
  ]) {
    await resizeViewport(page, width, height);
    for (const theme of themes) {
      report.stage = `${scene}-${width}x${height}-${theme}`;
      await setTheme(page, theme);
      let scrollBody;
      if (height < 600 && ['single-edit', 'batch-reviewed'].includes(scene)) {
        scrollBody = await page.evaluate(() => {
          const body = document.querySelector(
            '[data-testid="image-editor-scroll-body"]',
          );
          return body
            ? {
                clientHeight: body.clientHeight,
                scrollHeight: body.scrollHeight,
                clientWidth: body.clientWidth,
              }
            : null;
        });
        assert.ok(
          scrollBody && scrollBody.clientHeight >= 80,
          `${scene} short viewport keeps an operable scrolling editor body: ${JSON.stringify(scrollBody)}`,
        );
      }
      if (primary && height < 600) {
        await page.focus(primary);
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const target = await page.evaluate(() => {
          const element = document.activeElement,
            r = element.getBoundingClientRect();
          return {
            name: element.textContent.trim(),
            top: r.top,
            bottom: r.bottom,
            height: r.height,
            width: r.width,
            inViewport: r.top >= 0 && r.bottom <= innerHeight + 1,
          };
        });
        assert.ok(
          target.inViewport && target.height >= 43.99 && target.width >= 43.99,
          `${scene} short viewport has a reachable primary action`,
        );
      }
      await visualSettled(page);
      const geometry = await readGeometry(page);
      assertGeometry(geometry, `${scene} ${width} ${theme}`);
      const screenshot = `image-editor-${scene}-${theme}-${width}x${height}.png`;
      await page.screenshot({ path: join(config.output, screenshot) });
      report.layouts.push({
        scene,
        width,
        height,
        theme,
        screenshot,
        geometry,
        ...(scrollBody ? { scrollBody } : {}),
      });
    }
  }
  await resizeViewport(page, 1440, 1000);
  await setTheme(page, 'light');
}
export async function verifyEditedPixels(
  fixture,
  source,
  resultId,
  intent,
  label,
) {
  const sourceVersion = source.versions.find(
    (version) => version.kind === 'original',
  );
  const result = await fixture.detail(resultId);
  const outputVersion = result.versions.find(
    (version) => version.kind === 'original',
  );
  const input = await fixture.bytes(sourceVersion.links.url),
    output = await fixture.bytes(outputVersion.links.url);
  const paths = {
    input: join(fixture.directory, `${label}-source.png`),
    output: join(fixture.directory, `${label}-result.png`),
  };
  await writeFile(paths.input, input.value);
  await writeFile(paths.output, output.value);
  const raw = async (path) =>
    (
      await run('magick', [path, '-depth', '8', 'rgba:-'], {
        encoding: 'buffer',
        maxBuffer: 32 * 1024 * 1024,
      })
    ).stdout;
  const [before, after] = await Promise.all([
    raw(paths.input),
    raw(paths.output),
  ]);
  assert.equal(
    after.length,
    source.width * source.height * 4,
    'Saved original keeps full source pixel dimensions',
  );
  const region = intent.recipe.regions[0];
  assert.equal(
    region.mode,
    'solid',
    'The actual UI request includes the selected solid mask',
  );
  const x = Math.floor((region.x + region.width / 2) * source.width),
    y = Math.floor((region.y + region.height / 2) * source.height);
  const index = (y * source.width + x) * 4;
  const color = region.color
    .slice(1)
    .match(/../g)
    .map((part) => parseInt(part, 16));
  assert.deepEqual(
    [...after.subarray(index, index + 4)],
    [...color, 255],
    'Saved pixels contain the opaque chosen color',
  );
  assert.notDeepEqual([...before.subarray(index, index + 4)], [...color, 255]);
  assert.deepEqual(
    [...after.subarray(0, 4)],
    [...before.subarray(0, 4)],
    'Unedited corner is preserved',
  );
  assert.notEqual(input.hash, output.hash);
  return {
    imageId: resultId,
    width: result.width,
    height: result.height,
    sourceHash: input.hash,
    resultHash: output.hash,
    selectedPixel: { x, y, rgba: [...after.subarray(index, index + 4)] },
  };
}
export async function holdFixtureOriginal(
  config,
  fixture,
  imageId,
  sourceObjectId,
) {
  assert.ok(
    [
      fixture.publicImage.id,
      fixture.privateImage.id,
      fixture.smallImage.id,
    ].includes(imageId),
    "Only this suite's uploaded Local original may be held",
  );
  const database = join(config.dataDirectory, 'ariso.db');
  const script = `import json,sqlite3,sys,urllib.parse\nconnection=sqlite3.connect('file:'+urllib.parse.quote(sys.argv[1])+'?mode=ro',uri=True)\nrow=connection.execute("SELECT o.key,s.local_path,s.id,o.mime FROM media_versions v JOIN media_objects o ON o.id=v.object_id JOIN media_images i ON i.id=v.image_id JOIN storage_configs s ON s.id=i.storage_id WHERE i.id=? AND o.id=? AND v.kind='original' AND s.type='local'",(sys.argv[2],sys.argv[3])).fetchone()\nassert row is not None\nprint(json.dumps({'key':row[0],'localPath':row[1],'storageId':row[2],'mime':row[3]}))\nconnection.close()`;
  const result = await run(
    '/usr/bin/python3',
    ['-c', script, database, imageId, sourceObjectId],
    { timeout: 10000, maxBuffer: 64 * 1024 },
  );
  const object = JSON.parse(result.stdout);
  const root = await realpath(join(config.dataDirectory, 'storage'));
  assert.ok(
    config.nodeExecutable,
    'The runner supplies its actual Node executable',
  );
  const provider = new URL(
    '../dist/server/storage/local.js',
    config.libraryDetailScript,
  ).href;
  const locate = `import { once } from 'node:events';
const [moduleUrl, root, value] = process.argv.slice(1);
const { readObjectForMaintenance } = await import(moduleUrl);
const object = JSON.parse(value);
const source = await readObjectForMaintenance(root, { id: object.storageId, localPath: object.localPath, enabled: true }, object.key, object.mime);
const closed = once(source.stream, 'close');
source.stream.destroy();
await closed;
console.log(JSON.stringify({ path: source.path }));`;
  const located = await run(
    config.nodeExecutable,
    [
      '--input-type=module',
      '-e',
      locate,
      provider,
      root,
      JSON.stringify(object),
    ],
    { timeout: 10000, maxBuffer: 64 * 1024 },
  );
  const path = await realpath(JSON.parse(located.stdout).path);
  const within = relative(root, path);
  assert.ok(
    within && !within.startsWith('..') && !within.startsWith('/'),
    'The exact original belongs to the disposable fixture storage',
  );
  const held = `${path}.held-${randomUUID()}`;
  await rename(path, held);
  let restored = false;
  return {
    imageId,
    sourceObjectId,
    path,
    held,
    async restore() {
      if (restored) return;
      await access(held);
      await rename(held, path);
      restored = true;
    },
  };
}
export async function assertFaultErrors(page, sourceUrl, report) {
  const errors = await readBrowserErrors(page);
  const expected = [],
    unexpected = [];
  for (const error of errors) {
    if (
      error.kind === 'error' &&
      error.message === `Resource failed: ${sourceUrl}`
    )
      expected.push(error);
    else unexpected.push(error);
  }
  report.expectedSourceFaultErrors = {
    sourceUrl,
    errors: expected,
    stage: 'fixture-original-held-through-terminal-failure',
  };
  assert.deepEqual(
    unexpected,
    [],
    'Only the exact held-source URL may fail during the controlled fault window',
  );
  return expected;
}
export async function removeCopy(fixture, id) {
  const current = await fixture.response(`/api/images/${id}`);
  if (current.status === 404) return;
  assert.equal(current.status, 200, `Read copied asset ${id} for cleanup`);
  if (!(await current.json()).trashedAt)
    await fixture.json(`/api/images/${id}/trash`, 'POST');
  const removal = await fixture.response(`/api/images/${id}`, {
    method: 'DELETE',
  });
  assert.ok([200, 202].includes(removal.status), await removal.text());
  await waitForImageWorkflow(
    () => fixture.json(`/api/images/${id}/cleanup`),
    (state) => {
      assert.notEqual(state.status, 'failed', JSON.stringify(state));
      return state.status === 'succeeded';
    },
    'Copied image permanent cleanup',
  );
}

export async function verifyEditorReturn({ page, report, fixture, ui }) {
  await ui.visit();
  await ui.select(fixture.publicImage);
  await ui.select(fixture.privateImage);
  await ui.selected(2);
  await resizeViewport(page, 390, 600);
  await page.mouse.move(195, 350);
  await page.mouse.wheel(0, 240);
  await page.click(button('更多图片操作'));
  await page.waitForSelector('loc=role:menuitem[name="编辑所选图片"]');
  await page.focus('loc=role:menuitem[name="编辑所选图片"]');
  const returnedBefore = await libraryState(page);
  await page.keyboard.press('Enter');
  await readyEditor(page, 'batch');
  await page.click(`${editor} > div:first-child button:text-is("退出编辑")`);
  await page.waitForSelector(editor, { state: 'hidden' });
  await page.waitForFunction(
    (scroll) =>
      Math.abs(
        (document.getElementById('main-content')?.scrollTop ?? 0) - scroll,
      ) < 1,
    returnedBefore.scroll,
  );
  const returnedAfter = await libraryState(page);
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '更多图片操作',
  );
  assert.deepEqual(
    returnedAfter,
    returnedBefore,
    'Return preserves query, loaded records, selection and scroll',
  );
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    ),
    '更多图片操作',
  );
  report.checks.push({
    scenario: 'library-workspace-retains-source-state',
    before: returnedBefore,
    after: returnedAfter,
  });
}

async function libraryState(page) {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="library-list"]');
    const url = new URL(location.href);
    url.searchParams.delete('imageEdit');
    return {
      url: url.href,
      loaded: list?.dataset.loadedCount,
      selected: [...(list?.querySelectorAll('[data-image-id]') ?? [])]
        .filter((card) => card.querySelector('input[type="checkbox"]')?.checked)
        .map((card) => card.dataset.imageId)
        .sort(),
      scroll: document.getElementById('main-content')?.scrollTop ?? 0,
    };
  });
}

export async function verifyServerPreviews({ page, report, canvas }) {
  await page.click(button('最终效果'));
  await page.waitForSelector(finalPreview);
  await page.waitForFunction(() => {
    const image = document.querySelector(
      '[data-testid="image-editor-final-preview"] img[alt="服务器生成的编辑后原图"]',
    );
    return image?.complete && image.naturalWidth > 0;
  });
  await page.click(button('水印版本'));
  await page.waitForFunction(() => {
    const image = document.querySelector(
      '[data-testid="image-editor-final-preview"] img[alt="服务器生成的水印版本最终效果"]',
    );
    return image?.complete && image.naturalWidth > 0;
  });
  const previewTraffic = (await readTraffic(page)).previews;
  for (const target of ['original', 'watermark']) {
    const preview = previewTraffic.find((item) => item.input.target === target);
    assert.ok(
      preview &&
        preview.status === 200 &&
        preview.mime === 'image/png' &&
        preview.bytes > 32,
    );
    assert.deepEqual(preview.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  assert.notEqual(
    previewTraffic.find((item) => item.input.target === 'original').hash,
    previewTraffic.find((item) => item.input.target === 'watermark').hash,
  );
  report.checks.push({
    scenario: 'native-canvas-and-authoritative-version-previews',
    canvas,
    previews: previewTraffic,
  });
  await page.click(`${finalPreview} button:text-is("返回编辑")`);
  await page.waitForSelector(finalPreview, { state: 'hidden' });
}

export async function verifyCopyAcceptance({
  fixture,
  report,
  privateBefore,
  sourceBefore,
  copyTraffic,
  copyJob,
}) {
  assert.equal(
    copyTraffic.posts.length,
    1,
    'A lost response does not cause a second copy POST',
  );
  assert.equal(copyTraffic.dropped, true);
  assert.ok(
    copyTraffic.reads.some(
      (entry) => entry.requestId === copyJob.requestId && entry.status === 200,
    ),
  );
  const intent = copyTraffic.posts[0].input;
  assert.equal(intent.mode, 'copy', 'The real UI defaults to copy');
  assert.notEqual(copyJob.resultImageId, privateBefore.id);
  const copy = await fixture.detail(copyJob.resultImageId);
  assert.equal(copy.visibility, privateBefore.visibility);
  assert.equal(copy.storage.id, privateBefore.storage.id);
  assert.deepEqual(
    copy.albums.map((item) => item.id).sort(),
    privateBefore.albums.map((item) => item.id).sort(),
  );
  assert.deepEqual(
    copy.tags.map((item) => item.id).sort(),
    privateBefore.tags.map((item) => item.id).sort(),
  );
  assert.equal(
    (
      await fixture.bytes(
        privateBefore.versions.find((version) => version.kind === 'original')
          .links.url,
      )
    ).hash,
    sourceBefore.hash,
  );
  const pixelProof = await verifyEditedPixels(
    fixture,
    privateBefore,
    copy.id,
    intent,
    'single-copy',
  );
  const replay = await fixture.json(
    `/api/images/${privateBefore.id}/edit`,
    'POST',
    intent,
    202,
  );
  assert.equal(replay.jobId, copyJob.jobId);
  assert.equal(replay.resultImageId, copy.id);
  report.checks.push({
    scenario: 'default-copy-lost-response-same-request-id',
    job: copyJob,
    traffic: copyTraffic,
    pixelProof,
    inheritedRelations: { albums: copy.albums, tags: copy.tags },
  });
}

export async function verifyOverwriteVersions({
  page,
  config,
  report,
  fixture,
  templateName,
}) {
  const overwriteBefore = await fixture.detail(fixture.publicImage.id);
  await fixture.json(
    `/api/images/${overwriteBefore.id}/sizes`,
    'POST',
    { version: 'compressed', preset: 'small' },
    202,
  );
  const sizeBefore = await waitForImageWorkflow(
    () =>
      fixture.json(
        `/api/images/${overwriteBefore.id}/sizes?version=compressed&preset=small`,
      ),
    (value) => value.status === 'ready',
    'Source size preset is real',
  );
  const oldSize = await fixture.bytes(sizeBefore.links.url);
  await directEditor(page, config, [overwriteBefore.id]);
  await observeEditFetch(page, [overwriteBefore.id]);
  await page.click(button('套用模板'));
  await page.focus(
    `loc=css:[role="menu"][aria-label="选择编辑模板"] [role="menuitem"]:has-text(${JSON.stringify(templateName)})`,
  );
  await page.keyboard.press('Enter');
  await page.click(button('覆盖原图'));
  await page.click(saveButton);
  const [row] = await settleRows(page, 1);
  const overwriteJob = await fixture.json(`/api/media/edits/${row.requestId}`);
  assert.equal(overwriteJob.resultImageId, overwriteBefore.id);
  const overwritten = await fixture.detail(overwriteBefore.id);
  for (const version of overwriteBefore.versions.filter((item) => item.saved))
    assert.notEqual(
      overwritten.versions.find((item) => item.kind === version.kind).contentId,
      version.contentId,
      `${version.kind} uses the newly published content`,
    );
  assert.equal(overwritten.createdAt, overwriteBefore.createdAt);
  assert.equal(overwritten.displayName, overwriteBefore.displayName);
  const sizeAfter = await fixture.json(
    `/api/images/${overwriteBefore.id}/sizes?version=compressed&preset=small`,
  );
  assert.equal(sizeAfter.links.url, sizeBefore.links.url);
  assert.notEqual(
    (await fixture.bytes(sizeAfter.links.url)).hash,
    oldSize.hash,
  );
  report.checks.push({
    scenario: 'overwrite-same-id-all-published-roles-and-size',
    job: overwriteJob,
    unchangedSizeUrl: sizeAfter.links.url,
  });
  await restoreFetch(page);
}

export async function verifyBatchStopAndResume({ page, report, fixture }) {
  await observeEditFetch(
    page,
    [fixture.publicImage.id, fixture.privateImage.id],
    false,
    true,
  );
  await page.click(saveButton);
  await page.waitForFunction(
    () => !!window.__arisoImageEditorFetch?.heldRequestId,
  );
  await page.click(button('停止尚未提交的图片'));
  await releaseEditResponse(page);
  const stopped = await settleRows(page, 2, ['succeeded', 'ready']);
  assert.equal(stopped.filter((row) => row.status === 'ready').length, 1);
  const [firstRow] = stopped.filter((row) => row.status === 'succeeded');
  const firstSaved = await fixture.json(
    `/api/media/edits/${firstRow.requestId}`,
  );
  assert.equal(
    (await readTraffic(page)).posts.length,
    1,
    'Stopping does not send the second edit POST',
  );
  await page.click(button('继续提交 1 张'));
  const resumed = await Promise.all(
    (await settleRows(page, 2)).map((row) =>
      fixture.json(`/api/media/edits/${row.requestId}`),
    ),
  );
  assert.deepEqual(
    resumed.map((job) => job.requestId).sort(),
    stopped.map((row) => row.requestId).sort(),
  );
  assert.equal(
    resumed.find((job) => job.requestId === firstSaved.requestId).resultImageId,
    firstSaved.resultImageId,
  );
  const traffic = await readTraffic(page);
  assert.equal(
    traffic.posts.find((post) => post.sourceImageId === fixture.privateImage.id)
      .input.recipe.regions[0].x,
    0.12,
    'The real submitted intent contains the per-image adjustment',
  );
  report.checks.push({
    scenario: 'stop-only-not-submitted-and-resume-frozen-intents',
    stopped,
    resumed,
    traffic,
  });
  await restoreFetch(page);
  await page.click(button('批量设置'));
  await readyEditor(page, 'batch');
  await page.click(button('应用模板并预览 2 张'));
  await readyEditor(page);
  await page.click(button('确认并下一张'));
  await page.click(button('确认这张'));
  return resumed;
}

export async function verifyTemplateLifecycle({
  page,
  report,
  fixture,
  template,
  templateName,
}) {
  await page.click(button('编辑模板'));
  await readyEditor(page, 'templates');
  await page.click(button(`重命名模板：${templateName}`));
  const renamed = `${fixture.prefix} 已改名`;
  await page.fill(await field(page, '模板名称', '[role="dialog"]'), renamed);
  await page.click(button('保存名称'));
  await page.waitForSelector(
    `loc=role:heading[name=${JSON.stringify(renamed)}]`,
  );
  assert.equal(
    (await fixture.json('/api/media/edit-templates')).templates.find(
      (item) => item.id === template.id,
    ).name,
    renamed,
  );
  await page.click(button(`删除模板：${renamed}`));
  await page.click(button('删除模板'));
  await page.waitForFunction(
    (name) =>
      ![
        ...document.querySelectorAll(
          '[data-testid="image-editor-workspace"] h2',
        ),
      ].some((heading) => heading.textContent === name),
    renamed,
  );
  assert.ok(
    !(await fixture.json('/api/media/edit-templates')).templates.some(
      (item) => item.id === template.id,
    ),
  );
  report.checks.push({
    scenario: 'template-real-create-rename-delete',
    id: template.id,
  });
}

export async function verifyBatchReview({
  page,
  config,
  report,
  fixture,
  template,
  templateName,
}) {
  await directEditor(page, config, [
    fixture.publicImage.id,
    fixture.privateImage.id,
  ]);
  await page.click(
    `${editor}[data-view="batch"] button:has-text(${JSON.stringify(templateName)})`,
  );
  await capture(
    page,
    config,
    report,
    'batch-settings',
    button('应用模板并预览 2 张'),
  );
  await page.click(button('应用模板并预览 2 张'));
  await readyEditor(page);
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).disabled,
      saveButton,
    ),
    true,
    'Masks require review before batch save',
  );
  await page.click(
    `${editor} [aria-label="编辑参数"] button:has-text("区域 1")`,
  );
  const firstPosition = await page.evaluate(
    (selector) => document.querySelector(selector).value,
    await field(page, '左侧位置'),
  );
  await page.click(button('确认并下一张'));
  await page.click(
    `${editor} [aria-label="编辑参数"] button:has-text("区域 1")`,
  );
  const left = await field(page, '左侧位置');
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).value,
      left,
    ),
    firstPosition,
    'Different portrait/landscape sizes retain the same normalized position',
  );
  await page.fill(left, '12');
  await page.press(left, 'Tab');
  await page.click(button('确认这张'));
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).disabled,
      saveButton,
    ),
    false,
  );
  const stillTemplate = (
    await fixture.json('/api/media/edit-templates')
  ).templates.find((item) => item.id === template.id);
  assert.deepEqual(
    stillTemplate.recipe,
    template.recipe,
    'Per-image adjustment does not mutate the saved template',
  );
  await capture(page, config, report, 'batch-reviewed', saveButton);
  report.checks.push({
    scenario: 'batch-proportional-review-and-independent-adjustment',
    firstPosition,
    adjustedPosition: 12,
    templateUnchanged: true,
  });
}
