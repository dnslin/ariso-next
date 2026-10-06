import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';
import { viewer } from './sharing-viewer-page.mjs';

export async function verifySharingViewerRevocations({
  task,
  page,
  config,
  report,
  session,
  viewing,
}) {
  report.stage = 'viewer-revocations';
  const owner = await task.newPage();
  const imageId = config.publicIds[6];
  await resizeViewport(page, 1440);
  try {
    await owner.goto(`${config.origin}/api/health`);
    const login = await owner.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config.credentials),
    });
    assert.equal(
      login.status,
      200,
      'The peer tab signs in through the real owner endpoint',
    );
    const write = async (path, method, body) => {
      await task.cdp('Target.activateTarget', { targetId: owner.targetId });
      const response = await owner.fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body && JSON.stringify(body),
      });
      assert.ok(
        response.status >= 200 && response.status < 300,
        `${method} ${path.replace(/\/[^/]+\/share/, '/[album]/share')} succeeds`,
      );
      return JSON.parse(response.body);
    };
    for (const condition of [
      'closed',
      'password',
      'expired',
      'rotated',
      'deleted',
    ]) {
      const { album } = await write('/api/albums', 'POST', {
        name: `浏览器撤权-${condition}`,
        description: '撤权后不可出现的描述',
      });
      await session.sql(
        `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${album.id}','${imageId}',${Date.now()})`,
      );
      const { share } = await write(`/api/albums/${album.id}/share`, 'POST', {
        password: { action: 'set', value: config.password },
      });
      config.albums[`viewer-${condition}`] = {
        id: album.id,
        token: share.token,
        name: album.name,
      };
      const base = `/s/${share.token}`;
      await page.goto(`${config.origin}${base}`);
      await page.waitForSelector('[data-testid="share-password-input"]');
      assert.equal(
        await page.evaluate(
          (name) => document.querySelector('main').textContent.includes(name),
          album.name,
        ),
        false,
        'Owner session does not bypass the anonymous password gate',
      );
      await page.fill('[data-testid="share-password-input"]', config.password);
      await page.click('[data-testid="share-password-submit"]');
      await session.loaded(1);
      await viewing.open(imageId);
      await viewing.imageLoaded();
      const path = `/api/albums/${album.id}/share`;
      let status = 410;
      if (condition === 'closed')
        await write(path, 'PATCH', { enabled: false });
      if (condition === 'password') {
        await write(path, 'PATCH', {
          password: { action: 'set', value: 'updated-viewer-password' },
        });
        status = 401;
      }
      if (condition === 'expired') {
        await task.cdp('Target.activateTarget', { targetId: owner.targetId });
        await session.sql(
          `UPDATE album_shares SET expires_at=${Date.now() - 1} WHERE id='${share.id}'`,
        );
      }
      if (condition === 'rotated') {
        await write(`${path}/rotate`, 'POST');
        status = 404;
      }
      if (condition === 'deleted') {
        await write(`/api/albums/${album.id}`, 'DELETE');
        status = 404;
      }
      await session.ensureVisible();
      await page.waitForSelector(
        status === 401
          ? '[data-testid="share-password-form"]'
          : '[data-testid="share-state"]',
      );
      await page.waitForSelector(viewer, { state: 'hidden' });
      const denied = await page.fetch(`${base}/items?imageId=${imageId}`);
      assert.equal(denied.status, status);
      assert.equal(
        await page
          .evaluate(
            (name) => ({
              items: document.querySelectorAll('[data-share-item]').length,
              leaked: document.querySelector('main').textContent.includes(name),
            }),
            album.name,
          )
          .then((state) => state.items === 0 && !state.leaked),
        true,
      );
      viewing.record(
        `${condition} in a real owner peer tab clears an already-open anonymous viewer and all album data`,
        { status },
      );
    }

    for (const condition of ['private', 'trashed', 'removed', 'disabled']) {
      await session.updateShare({ enabled: 1, show_name: 0, layout: 'grid' });
      await session.open();
      await session.loaded(40);
      await viewing.open(imageId);
      await viewing.imageLoaded();
      await task.cdp('Target.activateTarget', { targetId: owner.targetId });
      const [storage] = await session.sql(
        `SELECT storage_id FROM media_images WHERE id='${imageId}'`,
      );
      const [membership] = await session.sql(
        `SELECT joined_at FROM album_images WHERE album_id='${config.albums.public.id}' AND image_id='${imageId}'`,
      );
      try {
        if (condition === 'private')
          await session.sql(
            `UPDATE media_images SET visibility='private' WHERE id='${imageId}'`,
          );
        if (condition === 'trashed')
          await session.sql(
            `UPDATE media_images SET trashed_at=${Date.now()} WHERE id='${imageId}'`,
          );
        if (condition === 'removed')
          await session.sql(
            `DELETE FROM album_images WHERE album_id='${config.albums.public.id}' AND image_id='${imageId}'`,
          );
        if (condition === 'disabled')
          await session.sql(
            `UPDATE storage_configs SET enabled=0 WHERE id='${storage.storage_id}'`,
          );
        await session.ensureVisible();
        if (condition === 'disabled') {
          await page.waitForFunction(
            () =>
              document
                .querySelector('[data-testid="share-viewer-stage"]')
                ?.textContent.includes('存储已停用'),
            undefined,
            { timeout: 15000 },
          );
          assert.equal(
            await page.evaluate(
              () =>
                document.querySelector('[data-testid="share-viewer-zoom"]')
                  .disabled,
            ),
            true,
          );
          await viewing.capture(
            'disabled-placeholder',
            [390, 1440],
            ['light', 'dark'],
          );
          await viewing.close();
        } else {
          await page.waitForSelector(viewer, { state: 'hidden' });
          assert.equal(
            await page.evaluate(
              (id) => !!document.querySelector(`[data-share-item="${id}"]`),
              imageId,
            ),
            false,
          );
        }
        viewing.record(
          `${condition} of the current public member ${condition === 'disabled' ? 'keeps its unavailable position without content URL' : 'closes the viewer and removes that member'}`,
        );
      } finally {
        await session.sql(
          `UPDATE media_images SET visibility='public',trashed_at=NULL WHERE id='${imageId}'`,
        );
        await session.sql(
          `UPDATE storage_configs SET enabled=1 WHERE id='${storage.storage_id}'`,
        );
        if (condition === 'removed')
          await session.sql(
            `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${config.albums.public.id}','${imageId}',${membership.joined_at})`,
          );
      }
    }
    report.browserContexts =
      'Two real tabs share one Ego profile; production HTTP integration separately uses owner and share-only Cookie requests.';
  } finally {
    await owner.close();
  }
}
