import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resizeViewport } from './browser-geometry.mjs';

/** Observe the real route/head lifecycle; no title repair or DOM rewriting. */
export async function runUiux20261015Metadata(page, config) {
  const report = { checks: [], routes: [], timings: [], traces: [] };
  async function api(method, body) {
    const response = await page.fetch('/api/settings/site', {
      method,
      ...(body
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });
    assert.ok(response.ok, response.body);
    return JSON.parse(response.body);
  }
  const original = await api('GET');
  const albumResponse = await page.fetch('/api/albums', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '标题与图标验收' }),
  });
  assert.equal(albumResponse.status, 201, albumResponse.body);
  const albumId = JSON.parse(albumResponse.body).album.id;
  const shareResponse = await page.fetch(`/api/albums/${albumId}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(shareResponse.status, 200, shareResponse.body);
  const sharePath = `/s/${JSON.parse(shareResponse.body).share.token}`;
  let addedFavicon = false;
  const navigation = [
    ['标签', '/tags'],
    ['回收站', '/trash'],
    ['站点设置', '/settings/general'],
    ['总览', '/dashboard'],
    ['上传', '/upload'],
    ['图库', '/library'],
    ['相册', '/albums'],
    ['分享', '/shares'],
    ['访问统计', '/analytics'],
    ['存储', '/settings/storage'],
  ];
  try {
    for (const favicon of original.faviconUrl
      ? ['configured']
      : ['none', 'configured']) {
      let expectedFavicon = original.faviconUrl;
      if (favicon === 'configured' && !expectedFavicon) {
        const bytes = [
          ...(await readFile(
            join(
              config.projectDirectory,
              'tests/fixtures/media-formats/source.png',
            ),
          )),
        ];
        const uploaded = await page.evaluate(async (bytes) => {
          const body = new FormData();
          body.append(
            'file',
            new File([new Uint8Array(bytes)], 'uiux-tab-icon.png', {
              type: 'image/png',
            }),
          );
          const response = await fetch('/api/settings/site/branding/favicon', {
            method: 'PUT',
            body,
          });
          return { status: response.status, body: await response.json() };
        }, bytes);
        assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
        expectedFavicon = uploaded.body.url;
        addedFavicon = true;
      }
      const expectedTitle =
        favicon === 'configured' ? 'Ariso · 标题验收' : original.name;
      await api('PATCH', { name: expectedTitle });
      for (const width of [1440, 390]) {
        await resizeViewport(page, width);
        await page.goto(`${config.origin}/library`);
        await page.waitForSelector('[data-testid="library-list"]');
        await page.waitForFunction(
          (title) => document.title === title,
          expectedTitle,
        );
        const marker = await page.evaluate((expectedFavicon) => {
          window.__uiuxMetadata = {
            marker: crypto.randomUUID(),
            empty: [],
            missingIcons: [],
            replacedTitles: [],
            duplicateTitles: [],
            timings: [],
            pending: null,
          };
          const state = window.__uiuxMetadata;
          const titleNode = document.querySelector('title');
          document.addEventListener(
            'click',
            (event) => {
              const anchor = event.target.closest?.('.shell-nav-link');
              if (anchor && anchor.pathname !== location.pathname)
                state.pending = {
                  path: anchor.pathname,
                  start: performance.now(),
                };
            },
            true,
          );
          const observer = new MutationObserver(() => {
            if (document.querySelector('title') !== titleNode)
              state.replacedTitles.push(location.pathname);
            if (document.head.querySelectorAll('title').length !== 1)
              state.duplicateTitles.push(location.pathname);
            if (!document.title)
              state.empty.push({
                path: location.pathname,
                time: performance.now(),
              });
            if (expectedFavicon && !document.querySelector('link[rel="icon"]'))
              state.missingIcons.push({
                path: location.pathname,
                time: performance.now(),
              });
            const pending = state.pending;
            if (
              pending &&
              location.pathname === pending.path &&
              document.title &&
              document.querySelector(
                `.shell-nav-link[href="${pending.path}"][aria-current="page"]`,
              )
            ) {
              state.timings.push({
                path: pending.path,
                ms: performance.now() - pending.start,
              });
              state.pending = null;
            }
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-current'],
          });
          window.__uiuxMetadataObserver = observer;
          return state.marker;
        }, expectedFavicon);
        for (const [label, path] of navigation) {
          if (width < 1200) await page.click('loc=role:button[name="菜单"]');
          await page.click(`.shell-nav-link[aria-label="${label}"]`);
          await page.waitForFunction(
            (path) =>
              location.pathname === path && !window.__uiuxMetadata.pending,
            path,
          );
          if (width < 1200)
            await page.waitForSelector('[aria-label="导航菜单"]', {
              state: 'hidden',
            });
          assert.equal(await page.title(), expectedTitle);
          assert.equal(
            await page.evaluate(() => window.__uiuxMetadata.marker),
            marker,
            'Sidebar navigation preserves the document',
          );
          if (expectedFavicon) {
            const icons = await page.evaluate(() =>
              [...document.querySelectorAll('link[rel="icon"]')].map(
                (node) => node.href,
              ),
            );
            assert.ok(
              icons.includes(new URL(expectedFavicon, config.origin).href),
              `Favicon stays current on ${path}`,
            );
          }
          report.routes.push({ width, favicon, path, title: expectedTitle });
        }
        // Settings categories share the same metadata owner and remain real client navigation.
        if (width < 1200) await page.click('loc=role:button[name="菜单"]');
        await page.click('.shell-nav-link[aria-label="站点设置"]');
        await page.waitForURL(`${config.origin}/settings/general`);
        if (width < 1200)
          await page.waitForSelector('[aria-label="导航菜单"]', {
            state: 'hidden',
          });
        for (const [label, path] of [
          ['图片处理', '/settings/processing'],
          ['账号与安全', '/settings/account'],
          ['上传 API', '/settings/api'],
          ['邮件服务', '/settings/email'],
          ['基本设置', '/settings/general'],
        ]) {
          if (width >= 1200) await page.click(`loc=role:tab[name="${label}"]`);
          else {
            await page.click('.settings-mobile button');
            await page.click(`loc=role:option[name="${label}"]`);
          }
          await page.waitForURL(`${config.origin}${path}`);
          assert.equal(await page.title(), expectedTitle);
          report.routes.push({ width, favicon, path, title: expectedTitle });
        }
        const trace = await page.evaluate(() => {
          window.__uiuxMetadataObserver.disconnect();
          return window.__uiuxMetadata;
        });
        assert.deepEqual(
          trace.empty,
          [],
          'Client routes never expose an empty title',
        );
        assert.deepEqual(
          trace.missingIcons,
          [],
          'Configured favicon is never removed between route heads',
        );
        assert.deepEqual(
          trace.replacedTitles,
          [],
          'The same title node survives navigation',
        );
        assert.deepEqual(
          trace.duplicateTitles,
          [],
          'There is exactly one title',
        );
        assert.equal(trace.marker, marker);
        report.timings.push(
          ...trace.timings.map((row) => ({ width, favicon, ...row })),
        );
        report.traces.push({
          width,
          favicon,
          empty: trace.empty,
          missingIcons: trace.missingIcons,
          replacedTitles: trace.replacedTitles,
          duplicateTitles: trace.duplicateTitles,
          sameDocument: trace.marker === marker,
        });
        report.checks.push({
          id: 'tab-flash',
          width,
          favicon,
          routes: 15,
          result:
            'Dynamic title and icon preserved across real sidebar/category navigation; no document reload.',
        });
      }
      for (const [path, title] of [
        ['/', expectedTitle],
        [sharePath, `${expectedTitle} · 相册分享`],
        ['/forgot-password', '找回密码 · Ariso'],
        ['/reset-password', '重置密码 · Ariso'],
      ]) {
        const response = await page.fetch(path);
        const head = response.body.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1];
        assert.ok(head, `${path}: server HTML includes a head`);
        const titles = [...head.matchAll(/<title>(.*?)<\/title>/g)].map(
          (match) => match[1],
        );
        assert.deepEqual(
          titles,
          [title],
          `${path}: initial HTML has one correct title`,
        );
        if (path.startsWith('/s/')) {
          assert.match(
            response.body,
            /name="robots" content="noindex, nofollow"/,
          );
          assert.match(response.body, /name="referrer" content="no-referrer"/);
        }
        report.checks.push({ id: 'metadata-ssr', favicon, path, title });
      }
      if (favicon === 'configured') {
        await page.goto(`${config.origin}/settings/general`);
        await page.waitForSelector('input[name="name"]');
        const documentMarker = await page.evaluate(() => {
          window.__uiuxBrandDocument = crypto.randomUUID();
          window.__uiuxBrandTitle = document.head.querySelector('title');
          window.__uiuxBrandIcon =
            document.head.querySelector('link[rel="icon"]');
          return window.__uiuxBrandDocument;
        });
        const savedTitle = `${expectedTitle} · 已保存`;
        await page.fill('input[name="name"]', savedTitle);
        await page.click('#site-save');
        await page.waitForFunction(
          (title) => document.title === title,
          savedTitle,
        );
        assert.equal((await api('GET')).name, savedTitle);
        const hasNotice = await page.evaluate(
          () =>
            !!document.querySelector(
              '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]',
            ),
        );
        if (hasNotice) {
          await page.click(
            '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]',
          );
          await page.waitForSelector('[data-slot="toast"]', {
            state: 'hidden',
          });
        }
        await page.click('main a[href="/settings/general/branding"]');
        await page.waitForSelector('[data-testid="branding-favicon-file"]', {
          state: 'attached',
        });
        await page.setInputFiles('[data-testid="branding-favicon-file"]', [
          join(
            config.projectDirectory,
            'tests/fixtures/media-formats/source.png',
          ),
        ]);
        await page.click('[data-testid="branding-favicon-save"]');
        await page.waitForFunction((previous) => {
          const icon = document.head.querySelector('link[rel="icon"]');
          return icon && new URL(icon.href).pathname !== previous;
        }, expectedFavicon);
        const refreshed = await page.evaluate(() => ({
          document: window.__uiuxBrandDocument,
          titleNode:
            document.head.querySelector('title') === window.__uiuxBrandTitle,
          iconNode:
            document.head.querySelector('link[rel="icon"]') ===
            window.__uiuxBrandIcon,
          title: document.title,
        }));
        assert.deepEqual(refreshed, {
          document: documentMarker,
          titleNode: true,
          iconNode: true,
          title: savedTitle,
        });
        report.checks.push({
          id: 'metadata-brand-save',
          result:
            'Real name save and favicon replacement refresh the same document/title/icon nodes.',
        });
      }
    }
    await writeFile(
      join(config.output, 'uiux-20261015-metadata.json'),
      JSON.stringify(report, null, 2),
    );
    return report;
  } finally {
    await page.evaluate(() => window.__uiuxMetadataObserver?.disconnect());
    await api('PATCH', { name: original.name });
    if (addedFavicon) {
      const response = await page.fetch('/api/settings/site/branding/favicon', {
        method: 'DELETE',
      });
      assert.ok(response.ok, response.body);
    }
    const removedAlbum = await page.fetch(`/api/albums/${albumId}`, {
      method: 'DELETE',
    });
    assert.equal(removedAlbum.status, 200, removedAlbum.body);
  }
}
