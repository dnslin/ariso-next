import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { identitySql } from './identity-session.mjs';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const testId = (id) => `[data-testid="processing-${id}"]`;
export const field = (name) =>
  `[data-field="${name}"] :is(input:not([type="hidden"]):not([type="range"]), textarea)`;
export const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

export async function processingTools(page, config, report) {
  await page.goto(config.origin);
  const authenticate = async (path, init) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await page.fetch(path, init);
      if (response.status !== 429) {
        assert.equal(response.status, 200, response.body);
        return response;
      }
      const retryAfter = Number(
        response.headers['retry-after'] ?? response.headers['x-retry-after'],
      );
      assert.ok(
        retryAfter > 0 && retryAfter <= 60,
        'Actual auth limiter supplies its retry window',
      );
      const receivedAt = Date.now();
      report.loginRateLimits ??= [];
      report.loginRateLimits.push({
        path,
        status: 429,
        retryAfter,
        receivedAt,
      });
      if (attempt === 2) break;
      await page.waitForFunction(
        (deadline) => Date.now() >= deadline,
        receivedAt + retryAfter * 1000,
        { timeout: retryAfter * 1000 + 1000 },
      );
    }
    assert.fail(`Real ${path} did not recover after its server retry windows`);
  };
  const existing = await authenticate('/api/auth/get-session');
  report.ownerSessionReused =
    JSON.parse(existing.body)?.user?.email === config.credentials.email;
  if (!report.ownerSessionReused) {
    await authenticate('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config.credentials),
    });
  }
  let cookie;
  const refreshCookie = async () => {
    const { cookies } = await page.cdp('Network.getCookies', {
      urls: [config.origin],
    });
    cookie = cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  };
  await refreshCookie();
  const reauthenticate = async () => {
    await authenticate('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config.credentials),
    });
    const restored = await authenticate('/api/auth/get-session');
    assert.equal(
      JSON.parse(restored.body)?.user?.email,
      config.credentials.email,
    );
    await refreshCookie();
    report.sessionReauthentications =
      (report.sessionReauthentications ?? 0) + 1;
  };
  const sql = (statement) => identitySql(config, statement);
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`${config.origin}${path}`, {
      method,
      headers: {
        cookie,
        Origin: config.origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    const value = await response.json();
    assert.ok(
      response.ok,
      `${method} ${path}: ${response.status} ${JSON.stringify(value)}`,
    );
    return value;
  };
  const settings = () => request('/api/settings/media');
  const editable = ({ id, updatedAt, ...value }) => {
    void id;
    void updatedAt;
    return value;
  };
  const open = async () => {
    await page.goto(`${config.origin}/settings/processing`);
    await page.waitForSelector(`${testId('editor')}[data-state="ready"]`);
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="processing-save"]').disabled,
    );
  };
  const fill = async (name, value) => {
    if (typeof value !== 'number') return page.fill(field(name), String(value));
    // NumberField consumes wheel input while focused. Replace through the
    // keyboard without page.fill scrolling, retaining the caller's blur timing.
    await page.focus(field(name));
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      field(name),
    );
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(String(value));
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector).value,
        field(name),
      ),
      String(value),
      `${name} keyboard replacement reaches the requested input value`,
    );
  };
  const value = (name) =>
    page.evaluate(
      (selector) => document.querySelector(selector).value,
      field(name),
    );
  const select = async (name, value) => {
    await page.click(`[data-field="${name}"] [aria-haspopup="listbox"]`);
    await page.waitForSelector(`[role="option"][data-key="${value}"]`);
    await page.click(`[role="option"][data-key="${value}"]`);
  };
  const switchTo = async (label, selected) => {
    const selector = `loc=role:switch[name="${label}"]`;
    const value = await page.evaluate((label) => {
      const node = document.querySelector(
        `[role="switch"][aria-label="${label}"]`,
      );
      return node?.checked ?? node?.getAttribute('aria-checked') === 'true';
    }, label);
    if (value !== selected) {
      await page.focus(selector);
      await page.keyboard.press('Space');
    }
  };
  const monitor = async (fault = null) => {
    await page.evaluate((fault) => {
      const original = window.__processingOriginalFetch ?? window.fetch;
      window.__processingOriginalFetch = original;
      window.__processingBrowser = { requests: [], faultUsed: false, fault };
      let releaseReads;
      const readGate = new Promise((resolve) => {
        releaseReads = resolve;
      });
      let releaseCancel;
      const cancelGate = new Promise((resolve) => {
        releaseCancel = resolve;
      });
      window.__processingReleaseReads = () => {
        window.__processingBrowser.readsReleased = true;
        releaseReads();
      };
      window.__processingReleaseCancel = () => {
        window.__processingBrowser.cancelReleased = true;
        releaseCancel();
      };
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        const method = args[1]?.method ?? 'GET';
        const body = args[1]?.body;
        const record =
          path === '/api/settings/media' ||
          path.startsWith('/api/media/') ||
          path === '/upload/settings' ||
          path === '/api/auth/get-session'
            ? {
                path,
                method,
                ...(typeof body === 'string' ? { body: JSON.parse(body) } : {}),
                ...(body instanceof FormData && body.has('options')
                  ? {
                      options: JSON.parse(body.get('options')),
                      fileName: body.get('file')?.name,
                    }
                  : {}),
              }
            : null;
        if (record) window.__processingBrowser.requests.push(record);
        const response = await original(...args);
        if (record) {
          record.status = response.status;
          if (
            response.headers.get('content-type')?.includes('application/json')
          )
            if (path === '/api/auth/get-session')
              record.sessionNull = (await response.clone().json()) === null;
            else record.response = await response.clone().json();
        }
        if (
          (fault?.holdPreviewTerminalReads &&
            method === 'GET' &&
            /^\/api\/media\/previews\/[^/]+$/.test(path) &&
            ['succeeded', 'failed', 'cancelled', 'expired'].includes(
              record.response?.status,
            )) ||
          (fault?.holdSettingsSaveResponse &&
            method === 'PATCH' &&
            path === '/api/settings/media' &&
            response.status === 200) ||
          (fault?.holdWatermarkUploadResponse &&
            method === 'POST' &&
            path === '/api/media/watermark-assets' &&
            response.status === 201)
        ) {
          record.held = true;
          await readGate;
          record.released = true;
        }
        if (
          fault?.holdPreviewCancelResponse &&
          method === 'DELETE' &&
          /^\/api\/media\/previews\/[^/]+$/.test(path)
        ) {
          record.held = true;
          await cancelGate;
          record.released = true;
        }
        if (
          fault &&
          !window.__processingBrowser.faultUsed &&
          path === fault.path &&
          method === fault.method
        ) {
          window.__processingBrowser.faultUsed = true;
          record.responseLost = true;
          if (fault.concurrentSettings) {
            const concurrent = await original('/api/settings/media', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(fault.concurrentSettings),
            });
            if (!concurrent.ok)
              throw new Error('Real concurrent settings update failed');
          }
          throw new TypeError(
            'Verification: completed real processing response was lost',
          );
        }
        return response;
      };
    }, fault);
  };
  const browser = () => page.evaluate(() => window.__processingBrowser);
  const evidence = async (state, width = 1440, theme = 'light', height) => {
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    const geometry = await readGeometry(page);
    assertGeometry(geometry, state);
    const screenshot = `processing-${state}-${theme}-${width}${height ? `x${height}` : ''}.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({
      state,
      theme,
      height: height ?? (width >= 1200 ? 1080 : 844),
      ...geometry,
      screenshot,
    });
  };
  const scrollDetails = async (
    selectors,
    width = 390,
    theme = 'dark',
    height = 844,
  ) => {
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    const detail = await page.evaluate((selectors) => {
      const main = document.querySelector('.shell-content');
      const first = document.querySelector(selectors[0]);
      if (!first) throw new Error(`Missing screenshot detail: ${selectors[0]}`);
      const frame = main.getBoundingClientRect();
      main.scrollTo({
        top:
          main.scrollTop + first.getBoundingClientRect().top - frame.top - 16,
        behavior: 'instant',
      });
      return {
        scrollTop: main.scrollTop,
        detailFrame: {
          top: frame.top,
          bottom: Math.min(
            frame.bottom,
            document.querySelector('.shell-footer')?.getBoundingClientRect()
              .top ?? innerHeight,
          ),
        },
        visibleDetails: selectors.map((selector) => {
          const node = document.querySelector(selector);
          if (!node) throw new Error(`Missing screenshot detail: ${selector}`);
          const rect = node.getBoundingClientRect();
          return {
            selector,
            top: rect.top,
            bottom: rect.bottom,
            text: node.textContent,
          };
        }),
      };
    }, selectors);
    for (const target of detail.visibleDetails)
      assert.ok(
        target.top >= detail.detailFrame.top - 1 &&
          target.bottom <= detail.detailFrame.bottom + 1,
        `${target.selector} is entirely inside the actual screenshot viewport`,
      );
    return detail;
  };
  const previewState = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="processing-preview"]');
      return {
        status: root?.dataset.state,
        id: root?.dataset.previewId,
        target: root?.dataset.resultTarget,
        stale: root?.dataset.stale,
        text: root?.textContent,
      };
    });
  const previewControls = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="processing-preview"]');
      const footer = document.querySelector('.shell-footer');
      const describe = (node) => ({
        testId: node.dataset.testid ?? null,
        text: node.textContent.trim(),
        disabled: node.disabled,
      });
      return {
        fileDisabled: root.querySelector('input[type="file"]').disabled,
        picker: describe(
          [...root.querySelectorAll('button')].find((node) =>
            ['更换测试图', '选择测试图'].includes(node.textContent.trim()),
          ),
        ),
        targets: [...root.querySelectorAll('[data-preview-target]')].map(
          (node) => ({
            target: node.dataset.previewTarget,
            pressed: node.getAttribute('aria-pressed') === 'true',
            disabled: node.disabled,
          }),
        ),
        footer: [...footer.querySelectorAll('button')].map(describe),
        cancelCount: document.querySelectorAll(
          '[data-testid="processing-preview-cancel"]',
        ).length,
        cardCancelCount: root.querySelectorAll(
          '[data-testid="processing-preview-cancel"]',
        ).length,
      };
    });
  const chooseFile = (name = 'source.png') =>
    page.setInputFiles(testId('preview-file'), [
      join(config.projectDirectory, 'tests/fixtures/media-formats', name),
    ]);
  const create = async (target, source = 'source.png') => {
    await page.click(`[data-preview-target="${target}"]`);
    await chooseFile(source);
    await page.click(testId('preview-create'));
    await page.waitForFunction(
      () => {
        const root = document.querySelector(
          '[data-testid="processing-preview"]',
        );
        return (
          root?.dataset.previewId &&
          ['succeeded', 'failed', 'cancelled', 'expired'].includes(
            root.dataset.state,
          )
        );
      },
      undefined,
      { timeout: 60000 },
    );
    const current = await previewState();
    return request(`/api/media/previews/${current.id}`);
  };
  const result = async (row, source) => {
    assert.equal(row.status, 'succeeded');
    assert.ok(row.result && row.resultUrl);
    const response = await fetch(`${config.origin}${row.resultUrl}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), row.result.mime);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, row.result.byteSize);
    if (source) assert.deepEqual(bytes, await readFile(source));
    if (row.result.mime === 'image/svg+xml') {
      assert.match(response.headers.get('content-disposition'), /^attachment/);
      assert.equal(
        await page.evaluate(
          () =>
            !!document.querySelector(
              '[data-testid="processing-preview-result"] img',
            ),
        ),
        false,
      );
    } else {
      await page.waitForFunction(
        async ({ digest, mime }) => {
          const image = document.querySelector(
            '[data-testid="processing-preview-result"] img',
          );
          if (!image?.complete || !image.naturalWidth) return false;
          const displayed = await fetch(image.src);
          if (!displayed.ok) return false;
          const blob = await displayed.blob();
          if (blob.type !== mime) return false;
          const hash = new Uint8Array(
            await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
          );
          return (
            [...hash]
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join('') === digest
          );
        },
        {
          digest: createHash('sha256').update(bytes).digest('hex'),
          mime: row.result.mime,
        },
      );
      const image = await page.evaluate(() => {
        const node = document.querySelector(
          '[data-testid="processing-preview-result"] img',
        );
        return { width: node.naturalWidth, height: node.naturalHeight };
      });
      assert.deepEqual(image, {
        width: row.result.width,
        height: row.result.height,
      });
    }
    return {
      id: row.id,
      target: row.target,
      ...row.result,
      bytesRead: bytes.length,
    };
  };
  const businessState = async () =>
    Object.fromEntries(
      await Promise.all(
        [
          'media_images',
          'media_jobs',
          'media_objects',
          'media_versions',
          'media_metadata',
          'media_cleanup_jobs',
          'upload_submissions',
          'upload_sessions',
        ].map(async (table) => [
          table,
          await sql(`SELECT * FROM ${table} ORDER BY rowid`),
        ]),
      ),
    );
  return {
    sql,
    reauthenticate,
    request,
    settings,
    editable,
    open,
    fill,
    value,
    select,
    switchTo,
    monitor,
    browser,
    evidence,
    scrollDetails,
    previewState,
    previewControls,
    chooseFile,
    create,
    result,
    businessState,
  };
}
