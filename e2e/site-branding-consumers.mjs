import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import { expectThemeEntries, chooseTheme } from './theme-helpers.mjs';
import { control } from './site-branding-helpers.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';

export async function assertBrandConsumers(page, config, expected, report) {
  for (const path of ['/', '/login', expected.sharePath]) {
    await page.goto(`${config.origin}${path}`);
    await page.waitForSelector('main');
    await page.waitForFunction(
      ({ name, faviconUrl }) =>
        document.title.includes(name) &&
        [...document.querySelectorAll('link[rel="icon"]')].some(
          (node) => node.getAttribute('href') === faviconUrl,
        ),
      expected,
    );
    const document = await page.evaluate(() => ({
      title: window.document.title,
      description: window.document.querySelector('meta[name="description"]')
        ?.content,
      logos: [
        ...window.document.querySelectorAll('[data-testid="site-logo"] img'),
      ].map((node) => ({
        src: node.getAttribute('src'),
        decoded: node.complete && node.naturalWidth > 0,
      })),
      injected: !!window.document.querySelector('main b'),
    }));
    assert.equal(document.injected, false, 'Site text never becomes HTML');
    if (path === '/login')
      assert.deepEqual(
        document.logos,
        [],
        'Approved login has no Logo/name block',
      );
    else {
      await page.waitForFunction(
        (url) =>
          [
            ...window.document.querySelectorAll(
              '[data-testid="site-logo"] img',
            ),
          ].some(
            (node) =>
              node.getAttribute('src') === url &&
              node.complete &&
              node.naturalWidth > 0,
          ),
        expected.logoUrl,
      );
      if (path === '/') {
        // Next omits the meta tag for the explicitly empty description.
        assert.equal(document.description, expected.description || undefined);
        assert.equal(
          await page.evaluate(
            () => document.querySelector('.home-description').textContent,
          ),
          expected.description,
        );
      }
    }
    report.consumers ??= [];
    report.consumers.push({ path, ...document });
  }
}

async function verifyOwnerShellBranding(page, config, tools, expected, report) {
  const storages = await tools.api('/api/storages');
  const local = storages.find((storage) => storage.type === 'local');
  assert.ok(local, 'The independent app has its initialized local storage');
  const created = await page.fetch('/api/storages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 's3',
      name: 'Issue 196 brand route check',
      endpoint: 'http://127.0.0.1:1',
      region: 'test',
      bucket: 'issue196',
      enabled: false,
    }),
  });
  assert.equal(created.status, 201, created.body);
  const s3 = JSON.parse(created.body);
  // Match the implemented entries exercised by shell-navigation, plus branding.
  const routes = [
    ['/upload', '/upload'],
    ['/library?page=1', '/library'],
    ['/albums', '/albums'],
    [`/albums/${expected.albumId}?page=1`, '/albums'],
    ['/trash', '/trash'],
    ['/tags', '/tags'],
    ['/shares', '/shares'],
    [`/shares/${expected.albumId}`, '/shares'],
    ['/admin', '/dashboard'],
    ['/dashboard', '/dashboard'],
    ['/analytics', '/analytics'],
    ['/settings/storage', '/settings/storage'],
    ['/settings/storage/new', '/settings/storage'],
    ['/settings/general', '/settings/general'],
    ['/settings/general/branding', '/settings/general'],
    ['/settings/processing', '/settings/general'],
    ['/settings/account', '/settings/general'],
    ['/settings/api', '/settings/general'],
    ['/settings/api/usage', '/settings/general'],
    ['/settings/email', '/settings/general'],
    [`/settings/storage/${local.id}`, '/settings/storage'],
    [`/settings/storage/${s3.id}/cors`, '/settings/storage'],
  ];
  try {
    await setTheme(page, 'light');
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      for (const [path, current] of routes) {
        await page.goto(`${config.origin}${path}`);
        await page.waitForSelector('.shell-content');
        await page.waitForURL(
          `${config.origin}${path === '/admin' ? '/dashboard' : path}`,
        );
        await expectThemeEntries(page, true);
        if (width === 390) {
          await page.waitForFunction((url) => {
            const logo = document.querySelector(
              '.shell-mobile-header [data-testid="site-logo"] img',
            );
            return (
              logo?.getAttribute('src') === url &&
              logo.complete &&
              logo.naturalWidth > 0
            );
          }, expected.logoUrl);
          await page.click('button[aria-label="菜单"]');
          await page.waitForSelector('[role="dialog"][aria-label="导航菜单"]');
        } else {
          const collapsed = await page.evaluate(
            () =>
              document.querySelector('.shell-navigation').dataset.collapsed ===
              'true',
          );
          if (collapsed) await page.click('button[aria-label="展开侧栏"]');
        }
        await page.waitForFunction(
          ({ width, name, description, logoUrl, current }) => {
            const root = document.querySelector(
              width === 390
                ? '[role="dialog"][aria-label="导航菜单"]'
                : '.shell-navigation',
            );
            const logo = root?.querySelector('[data-testid="site-logo"] img');
            const link = document.querySelector(
              width === 390
                ? '.shell-mobile-header a.shell-brand'
                : '.shell-navigation a.shell-brand',
            );
            const active = [
              ...(root?.querySelectorAll('[aria-current="page"]') ?? []),
            ];
            return (
              logo?.getAttribute('src') === logoUrl &&
              logo.complete &&
              logo.naturalWidth > 0 &&
              link?.getAttribute('aria-label') === `${name} 首页` &&
              root.querySelector('.shell-description')?.textContent ===
                description &&
              active.length === 1 &&
              active[0].getAttribute('href') === current
            );
          },
          { width, current, ...expected },
        );
        report.shellConsumers ??= [];
        report.shellConsumers.push({
          path,
          current,
          width,
          logoUrl: expected.logoUrl,
        });
        if (path === '/upload') {
          if (width === 390) {
            await page.click('button[aria-label="关闭"]');
            await page.waitForSelector(
              '[role="dialog"][aria-label="导航菜单"]',
              {
                state: 'hidden',
              },
            );
          }
          await chooseTheme(page, 'dark', 'dark', true);
          await page.waitForFunction(
            ({ width, url }) => {
              const logo = document.querySelector(
                `${width === 390 ? '.shell-mobile-header' : '.shell-navigation'} [data-testid="site-logo"] img`,
              );
              return (
                logo?.getAttribute('src') === url &&
                logo.complete &&
                logo.naturalWidth > 0
              );
            },
            { width, url: expected.logoUrl },
          );
          const combined = `site-branding-theme-dark-${width}.png`;
          await page.screenshot({ path: join(config.output, combined) });
          report.layouts.push({
            name: 'brand-theme-combined',
            width,
            theme: 'dark',
            screenshot: combined,
          });
          await chooseTheme(page, 'light', 'light', true);
          if (width === 390) {
            await page.click('button[aria-label="菜单"]');
            await page.waitForSelector(
              '[role="dialog"][aria-label="导航菜单"]',
            );
          }
          const screenshot = `site-branding-shell-${width === 390 ? 'menu' : 'expanded'}-${width}.png`;
          await page.screenshot({ path: join(config.output, screenshot) });
          report.layouts.push({
            name: 'shell-brand',
            width,
            theme: 'light',
            screenshot,
          });
          if (width === 1440) {
            await page.click('button[aria-label="收起侧栏"]');
            await page.waitForFunction((url) => {
              const root = document.querySelector('.shell-navigation');
              const logo = root.querySelector('[data-testid="site-logo"] img');
              return (
                root.dataset.collapsed === 'true' &&
                logo?.getAttribute('src') === url &&
                logo.complete &&
                logo.naturalWidth > 0 &&
                root.querySelector('.shell-brand').getBoundingClientRect()
                  .width === 0 &&
                root
                  .querySelector('[aria-current="page"]')
                  .getBoundingClientRect().width > 0
              );
            }, expected.logoUrl);
            const screenshot = 'site-branding-shell-collapsed-1440.png';
            await page.screenshot({ path: join(config.output, screenshot) });
            report.layouts.push({
              name: 'shell-brand-collapsed',
              width,
              theme: 'light',
              screenshot,
            });
            await page.click('button[aria-label="展开侧栏"]');
            await page.waitForFunction((url) => {
              const root = document.querySelector('.shell-navigation');
              const logo = root.querySelector('[data-testid="site-logo"] img');
              return (
                root.dataset.collapsed === 'false' &&
                logo?.getAttribute('src') === url &&
                logo.complete &&
                logo.naturalWidth > 0 &&
                logo.getBoundingClientRect().width > 0
              );
            }, expected.logoUrl);
          }
        }
        if (width === 390) {
          await page.click('button[aria-label="关闭"]');
          await page.waitForSelector('[role="dialog"][aria-label="导航菜单"]', {
            state: 'hidden',
          });
        }
      }
    }
  } finally {
    // This unused fixture has no credentials or stored objects. Product DELETE
    // performs a real scan; disposable configuration cleanup stays offline.
    await identitySql(
      config,
      `DELETE FROM storage_configs WHERE id='${s3.id}'`,
    );
    assert.deepEqual(
      await identitySql(
        config,
        `SELECT id FROM storage_configs WHERE id='${s3.id}'`,
      ),
      [],
      'Only the newly created S3 route fixture is removed',
    );
  }
  report.checks.push(
    'All 22 implemented owner-shell entries decode the real custom Logo and retain current navigation, latest site name and description at 390/1440; mobile menu and desktop collapsed/expanded branding are exercised.',
  );
}

async function verifyShareGateBranding(page, config, tools, expected, report) {
  const shareApi = `/api/albums/${expected.albumId}/share`;
  await tools.api(shareApi, 'PATCH', {
    password: { action: 'set', value: 'issue196-independent-share-password' },
  });
  await page.fetch('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  try {
    for (const width of [390, 1440]) {
      await resizeViewport(page, width);
      for (const [path, title, name] of [
        [expected.sharePath, '访问受密码保护', 'password-gate'],
        ['/s/issue196-missing-token', '分享链接无效', 'missing-share'],
      ]) {
        await page.goto(`${config.origin}${path}`);
        await page.waitForSelector('[data-testid="share-state"]');
        await page.waitForFunction(
          ({ logoUrl, title, description }) => {
            const logo = document.querySelector(
              '[data-testid="site-logo"] img',
            );
            return (
              logo?.getAttribute('src') === logoUrl &&
              logo.complete &&
              logo.naturalWidth > 0 &&
              document.querySelector('#share-state-heading')?.textContent ===
                title &&
              [...document.querySelectorAll('main p')].some(
                (node) => node.textContent === description,
              )
            );
          },
          { ...expected, title },
        );
        const screenshot = `site-branding-${name}-${width}.png`;
        await page.screenshot({ path: join(config.output, screenshot) });
        report.layouts.push({ name, width, theme: 'light', screenshot });
      }
    }
  } finally {
    const login = await page.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config.credentials),
    });
    assert.equal(login.status, 200, login.body);
    await tools.api(shareApi, 'PATCH', { password: { action: 'clear' } });
  }
  report.checks.push(
    'Actual anonymous password-gated and invalid sharing pages decode the current custom Logo and site description at 390/1440; the independent share password is cleared afterwards.',
  );
}

export async function verifyBrandingConsumers(page, config, tools, report) {
  const now = Date.now();
  const albumId = 'issue196-brand-consumer';
  await identitySql(
    config,
    `INSERT INTO albums(id,name,description,created_at,updated_at) VALUES('${albumId}','品牌联动独立相册','',${now},${now})`,
  );
  report.fixtureAlbumId = albumId;
  const share = await tools.api(`/api/albums/${albumId}/share`, 'POST', {});
  assert.ok(share.share.token, 'Real share API returns a token');
  const sharePath = `/s/${share.share.token}`;
  const sites = [
    {
      name: '品牌一 <b>纯文本</b>',
      description: '独立描述一 <b>纯文本</b>',
      logo: 'source.png',
      favicon: 'source.png',
    },
    {
      name: '品牌二 <b>纯文本</b>',
      description: '',
      logo: 'second.png',
      favicon: 'static.svg',
    },
  ];
  let expected;
  for (const site of sites) {
    await tools.open();
    await tools.api('/api/settings/site', 'PATCH', {
      name: site.name,
      description: site.description,
    });
    // Another tab changes the other asset after this editor's initial GET.
    const faviconBytes = await readFile(
      join(
        config.projectDirectory,
        'tests/fixtures/media-formats',
        site.favicon,
      ),
    );
    const favicon = await page.evaluate(
      async ({ bytes, name }) => {
        const body = new FormData();
        body.append('file', new File([new Uint8Array(bytes)], name));
        const response = await fetch('/api/settings/site/branding/favicon', {
          method: 'PUT',
          body,
        });
        return { status: response.status, asset: await response.json() };
      },
      { bytes: [...faviconBytes], name: site.favicon },
    );
    assert.equal(favicon.status, 200);
    await tools.choose('logo', site.logo);
    await tools.save('logo');
    await page.waitForFunction(
      ({ name, description, faviconUrl }) =>
        [...document.querySelectorAll('a.shell-brand')].some(
          (node) => node.getAttribute('aria-label') === `${name} 首页`,
        ) &&
        (description
          ? [...document.querySelectorAll('.shell-description')].some(
              (node) => node.textContent === description,
            )
          : document.querySelectorAll('.shell-description').length === 0) &&
        document
          .querySelector('[data-testid="branding-favicon"] img')
          ?.getAttribute('src') === faviconUrl,
      {
        name: site.name,
        description: site.description,
        faviconUrl: favicon.asset.url,
      },
    );
    const afterLogo = await tools.api();
    assert.equal(afterLogo.faviconUrl, favicon.asset.url);
    await tools.choose('favicon', site.favicon);
    const settings = await tools.save('favicon');
    expected = { ...settings, sharePath, albumId };
    await page.fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    await assertBrandConsumers(page, config, expected, report);
    for (const width of [390, 1440]) {
      await resizeViewport(page, width);
      await setTheme(page, 'light');
      for (const path of ['/', '/login', sharePath]) {
        await page.goto(`${config.origin}${path}`);
        await page.waitForSelector('main');
        const label =
          path === '/' ? 'home' : path === '/login' ? 'login' : 'share';
        const screenshot = `site-branding-${label}-${site.logo === 'source.png' ? 'first' : 'updated'}-${width}.png`;
        await page.screenshot({ path: join(config.output, screenshot) });
        report.layouts.push({
          name: label,
          width,
          theme: 'light',
          screenshot,
        });
      }
    }
    const login = await page.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config.credentials),
    });
    assert.equal(login.status, 200, login.body);
    if (site === sites[0]) {
      await verifyOwnerShellBranding(page, config, tools, expected, report);
      await verifyShareGateBranding(page, config, tools, expected, report);
    }
  }
  await writeFile(
    join(config.output, 'site-branding-restart-input.json'),
    `${JSON.stringify(expected, null, 2)}\n`,
  );
  report.checks.push(
    'A successful Logo write refreshes current management name, description and the other asset changed after the initial GET; two successive real UI Logo/Favicon uploads reach newly requested home/login/share metadata and page content without stale values or HTML interpretation, approved login brand omission preserved.',
  );
  await tools.open();
  await page.click(control('logo', 'delete'));
  await page.waitForSelector('[role="alertdialog"]');
  await page.click(control('logo', 'cancel'));
}
