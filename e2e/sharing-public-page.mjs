import assert from 'node:assert/strict';
import { identitySql } from './identity-session.mjs';
const forbiddenFields = [
  'originalName',
  'tags',
  'uploadedAt',
  'createdAt',
  'storageId',
  'storageName',
  'storageKey',
  'key',
  'exif',
  'gps',
  'metadata',
  'byteSize',
  'width',
  'height',
  'format',
  'mime',
];
export function assertCropped(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, field] of Object.entries(value)) {
    assert.equal(
      forbiddenFields.includes(key),
      false,
      `Anonymous DTO excludes ${key}`,
    );
    assertCropped(field);
  }
}
export function json(response) {
  return JSON.parse(response.body);
}
export async function waitForPaint(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

/** Operations on the disposable anonymous page and its visibility peer. */
export function createSharingPublicPage({ task, page, config }) {
  const sql = (statement) => identitySql(config, statement);
  const path = (key) => `/s/${config.albums[key].token}`;
  const publicPath = path('public');
  let backgroundPage;
  async function loaded(count) {
    await page.waitForFunction(
      (count) =>
        Number(
          document
            .querySelector('[data-testid="share-items"]')
            ?.getAttribute('data-share-loaded-count'),
        ) === count,
      count,
    );
  }
  async function open(key = 'public') {
    await page.goto(`${config.origin}${path(key)}`);
    await page.waitForSelector(
      '[data-testid="share-items"], [data-testid="share-state"], [data-testid="share-empty"]',
    );
  }
  async function ensureVisible() {
    await task.cdp('Target.activateTarget', { targetId: page.targetId });
    await page.waitForFunction(() => !document.hidden);
  }
  async function hidePage() {
    if (!backgroundPage) {
      backgroundPage = await task.newPage();
      await backgroundPage.goto(`${config.origin}/api/health`);
    }
    await page.evaluate(() => {
      if (!window.__shareVisibilityRecorder) {
        window.__shareVisibilityRecorder = () =>
          window.__shareVisibility.push({
            hidden: document.hidden,
            at: Date.now(),
          });
        document.addEventListener(
          'visibilitychange',
          window.__shareVisibilityRecorder,
          { capture: true },
        );
      }
      window.__shareVisibility = [];
    });
    await task.cdp('Target.activateTarget', {
      targetId: backgroundPage.targetId,
    });
    // Ego Page observation activates the observed tab. Keep all hidden-period
    // observation on the foreground page, then inspect native events on resume.
    await backgroundPage.waitForFunction(() => !document.hidden);
  }
  async function hiddenNames() {
    const state = await page.evaluate((names) => {
      const attributes = [
        ...document.querySelectorAll('[alt],[title],[aria-label]'),
      ].flatMap((node) =>
        ['alt', 'title', 'aria-label'].map(
          (name) => node.getAttribute(name) ?? '',
        ),
      );
      const text = document.querySelector('main').textContent;
      return {
        names: names.filter(
          (name) =>
            text.includes(name) ||
            attributes.some((value) => value.includes(name)),
        ),
        injected: window.__shareInjection === true,
      };
    }, config.names);
    assert.deepEqual(state, { names: [], injected: false });
  }
  async function traffic() {
    return page.evaluate(() => window.__shareTraffic ?? []);
  }
  async function instrument() {
    await page.evaluate(() => {
      const original = window.fetch;
      window.__shareTraffic = [];
      window.__shareInstrumentedAt = Date.now();
      window.fetch = async (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
        if (!url.includes('/items') && !url.includes('/refresh'))
          return original(...args);
        const entry = {
          url,
          body: args[1]?.body ? JSON.parse(args[1].body) : undefined,
          startedAt: Date.now(),
          hidden: document.hidden,
        };
        window.__shareTraffic.push(entry);
        try {
          const response = await original(...args);
          entry.status = response.status;
          entry.response = await response.clone().json();
          entry.finishedAt = Date.now();
          return response;
        } catch (error) {
          entry.error = String(error);
          entry.finishedAt = Date.now();
          throw error;
        }
      };
    });
  }
  async function awaitRefresh(after = 0) {
    await page.waitForFunction(
      (after) =>
        (window.__shareTraffic ?? []).filter(
          (entry) => entry.url.includes('/refresh') && entry.finishedAt,
        ).length > after,
      after,
      { timeout: 15000 },
    );
  }
  async function updateShare(values) {
    const assignments = Object.entries(values)
      .map(
        ([key, value]) =>
          `${key}=${typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : Number(value)}`,
      )
      .join(',');
    await sql(
      `UPDATE album_shares SET ${assignments} WHERE album_id='${config.albums.public.id}'`,
    );
  }

  return {
    sql,
    path,
    publicPath,
    loaded,
    open,
    ensureVisible,
    hidePage,
    hiddenNames,
    traffic,
    instrument,
    awaitRefresh,
    updateShare,
    async waitWhileHidden(until) {
      await backgroundPage.waitForFunction(
        (until) => Date.now() >= until,
        until,
        { timeout: 10000 },
      );
    },
    async close() {
      if (backgroundPage) await backgroundPage.close();
    },
  };
}
