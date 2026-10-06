import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';
import { verifyShortEmpty } from './sharing-public-feedback.mjs';
import { assertCropped, json } from './sharing-public-page.mjs';

export async function verifySharingPublicRepresentatives({
  page,
  config,
  report,
  session,
  layouts,
}) {
  const { open, path, publicPath, loaded, hiddenNames, sql, updateShare } =
    session;
  const { capture, passwordHelp } = layouts;
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });
  report.stage = 'gate-and-representatives';
  await open('password');
  const protectedAlbum = config.albums.password;
  for (const headers of [{}, { RSC: '1' }]) {
    const html = await page.fetch(path('password'), { headers });
    assert.match(html.headers['cache-control'], /private.*no-store/);
    assert.equal(html.headers['referrer-policy'], 'no-referrer');
    for (const secret of [
      protectedAlbum.name,
      protectedAlbum.description,
      config.publicIds[6],
    ])
      assert.equal(
        html.body.includes(secret),
        false,
        'Locked HTML and RSC contain no album identity or members',
      );
  }
  assert.equal((await page.fetch(`${path('password')}/items`)).status, 401);
  const documentState = await page.evaluate(() => ({
    noindex: document.querySelector('meta[name="robots"]')?.content,
    referrer: document.querySelector('meta[name="referrer"]')?.content,
    text: document.querySelector('main').textContent,
  }));
  assert.match(documentState.noindex, /noindex/);
  assert.equal(documentState.text.includes(protectedAlbum.name), false);
  const owner = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config.credentials),
  });
  assert.equal(owner.status, 200);
  assert.equal(
    json(await page.fetch('/api/auth/get-session')).user.email,
    config.credentials.email,
  );
  assert.equal(
    (await page.fetch(`${path('password')}/items`)).status,
    401,
    'Owner session cannot bypass share password',
  );
  const ownerPublic = json(await page.fetch(`${publicPath}/items`));
  assert.equal(ownerPublic.total, 124);
  assert.deepEqual(
    ownerPublic.items.map((item) => item.imageId),
    config.publicIds.slice(0, 40),
  );
  assertCropped(ownerPublic);
  assert.equal(
    (
      await page.fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
    200,
  );
  assert.equal(json(await page.fetch('/api/auth/get-session')), null);
  record(
    'Anonymous HTML/RSC gate, noindex and owner session preserving anonymous scope',
  );
  await capture('password', [360, 390, 430, 768, 1440]);
  await passwordHelp('password');
  await page.focus('[data-testid="share-password-input"]');
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    ),
    'share-password-submit',
  );
  const focusStyle = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return {
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
    };
  });
  assert.ok(
    (parseFloat(focusStyle.outlineWidth) > 0 &&
      focusStyle.outlineStyle !== 'none') ||
      focusStyle.boxShadow !== 'none',
    'Keyboard focus has a visible indicator',
  );
  record('Password submit has a visible keyboard focus indicator', focusStyle);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => !!document.querySelector('[aria-invalid="true"], [role="alert"]'),
  );
  record('Empty password and keyboard submit provide field feedback');
  await page.fill('[data-testid="share-password-input"]', 'x'.repeat(129));
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="field-error"]')
      ?.textContent.includes('128'),
  );
  record('Overlong password is rejected by the real form');
  await page.fill('[data-testid="share-password-input"]', 'wrong-password');
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="field-error"]')
      ?.textContent.includes('密码'),
  );
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('[data-slot="field-error"]').textContent.trim(),
    ),
    '密码错误，请重试',
  );
  await capture('wrong-password');
  const long = await page.fetch(`${path('password')}/unlock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'x'.repeat(129) }),
  });
  assert.equal(long.status, 400);
  record('Wrong password UI and overlong password HTTP validation');
  await page.fill('[data-testid="share-password-input"]', config.password);
  await page.evaluate(() => {
    const original = window.fetch;
    window.__shareUnlockCalls = 0;
    window.fetch = async (...args) => {
      if (String(args[0]).endsWith('/unlock')) {
        window.__shareUnlockCalls++;
        const response = await original(...args);
        await new Promise((resolve) => {
          window.__releaseShareUnlock = resolve;
        });
        window.fetch = original;
        return response;
      }
      return original(...args);
    };
  });
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() => !!window.__releaseShareUnlock);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="share-password-submit"]')
          .disabled,
    ),
    true,
  );
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__shareUnlockCalls), 1);
  await capture('unlocking', [390], ['light']);
  await page.evaluate(() => window.__releaseShareUnlock());
  await page.waitForSelector('[data-testid="share-items"]');
  assert.equal(new URL(await page.url()).pathname, path('password'));
  await page.reload();
  await page.waitForSelector('[data-testid="share-items"]');
  record('Real unlock persists grant and prevents duplicate submission');
  for (const key of ['disabled', 'expired']) {
    await open(key);
    const state = await page.evaluate(() => ({
      text: document.querySelector('main').textContent,
      cards: document.querySelectorAll('[data-share-item]').length,
    }));
    assert.equal(state.cards, 0);
    assert.equal(state.text.includes(config.albums[key].name), false);
    await capture(key);
  }
  await page.goto(`${config.origin}/s/nonexistent-share`);
  await page.waitForSelector('[data-testid="share-state"]');
  await capture('invalid');
  await open('empty');
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="share-empty"] p')
        ?.textContent.trim(),
    ),
    '暂无可展示的图片',
  );
  await capture('empty', [360, 390, 430, 768, 1440]);
  await verifyShortEmpty({ page, config, report });
  await open();
  await loaded(40);
  await hiddenNames();
  const response = await page.fetch(`${publicPath}/items`);
  const publicPage = json(response);
  assert.match(response.headers['cache-control'], /private.*no-store/);
  assert.equal(publicPage.total, 124);
  assert.deepEqual(
    publicPage.items.map((item) => item.imageId),
    config.publicIds.slice(0, 40),
  );
  assertCropped(publicPage);
  assert.equal(
    config.excludedIds.some((id) => response.body.includes(id)),
    false,
  );
  assert.equal(
    publicPage.items.some((item) => 'displayName' in item),
    false,
  );
  assert.equal(publicPage.cover.imageId, config.statusIds.pending);
  assert.equal(
    publicPage.cover.thumbnailUrl,
    null,
    'Fixed unreadable cover stays placeholder',
  );
  for (const [key, status] of [
    ['pending', 'processing'],
    ['processing', 'processing'],
    ['failed', 'failed'],
    ['disabled', 'disabled'],
  ])
    assert.equal(
      publicPage.items.find((item) => item.imageId === config.statusIds[key])
        .status,
      status,
    );
  assert.equal(
    publicPage.items.find(
      (item) => item.imageId === config.statusIds.reprocessFailed,
    ).status,
    'ready',
  );
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-share-item="${id}"]`)
        ?.textContent.includes('加载失败'),
    config.statusIds.missing,
  );
  record(
    'Cropped public DTO, pure text, fixed cover and processing/failed/disabled/thumbnail error placeholders',
  );
  await sql(
    `UPDATE albums SET preferred_cover_image_id='${config.statusIds.missing}' WHERE id='${config.albums.public.id}'`,
  );
  await open();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-share-cover]')
      .textContent.includes('图片加载失败'),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-share-cover]').querySelectorAll('img')
          .length,
    ),
    0,
    'Eager cover errors use the same placeholder after hydration',
  );
  record(
    'A fixed cover with a missing published file recovers from an eager/pre-hydration error without another version',
  );
  await sql(
    `UPDATE albums SET preferred_cover_image_id='${config.statusIds.pending}' WHERE id='${config.albums.public.id}'`,
  );
  await open();
  await capture(
    'grid',
    config.sharingPublicPhase === 'representative'
      ? [1440, 390]
      : [360, 390, 430, 768, 1440],
  );
  await resizeViewport(page, 390, 420);
  const shortGeometry = await readGeometry(page);
  assertGeometry(shortGeometry, 'short mobile viewport');
  await page.click('[data-testid="share-load-more"]');
  await loaded(80);
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    const geometry = await readGeometry(page);
    assertGeometry(geometry, `short viewport ${theme}`);
    const screenshot = `sharing-public-short-${theme}-390.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({
      state: 'short',
      width: 390,
      height: 420,
      theme,
      screenshot,
      geometry,
    });
  }
  record('Short viewport scroll reaches the real load-more target', {
    geometry: shortGeometry,
  });
  await updateShare({ layout: 'masonry', show_name: 1 });
  await open();
  await page.waitForFunction(
    (name) => document.querySelector('main').textContent.includes(name),
    config.names[6],
  );
  await capture('masonry-names');
  await updateShare({ layout: 'grid', show_name: 0 });
}
