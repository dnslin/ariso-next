import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { albumImages, albums } from '../src/server/collections/schema.ts';
import { createShare } from '../src/server/sharing/configuration.ts';
import { createImageShare } from '../src/server/sharing/image-configuration.ts';
import { email, password } from '../tests/integration/identity/auth-fixture.ts';
import { launchAccessProtectionFixture } from '../tests/integration/delivery/access-protection-fixture.ts';

/** Disposable published assets: validates delivery/UI, not upload or image processing. */
export async function launchAccessProtectionBrowserFixture() {
  const app = await launchAccessProtectionFixture();
  let embeds: ReturnType<typeof createServer> | undefined;
  try {
    const local: Awaited<ReturnType<typeof app.seedLocal>>[] = [];
    const remote: Awaited<ReturnType<typeof app.seed>>[] = [];
    for (let index = 0; index < 200; index++) {
      local.push(await app.seedLocal(index, true));
      remote.push(await app.seed({ fourVersions: true }));
    }
    const albumId = randomUUID();
    app.db.transaction(
      (tx) => {
        const now = new Date();
        tx.insert(albums)
          .values({
            id: albumId,
            name: '访问防护浏览验收',
            description: '',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        tx.insert(albumImages)
          .values(
            remote.map((asset, index) => ({
              albumId,
              imageId: asset.imageId,
              joinedAt: new Date(now.getTime() - index),
            })),
          )
          .run();
      },
      { behavior: 'immediate' },
    );
    const share = await createShare(app.db, albumId, {
      layout: 'grid',
      showName: true,
    });
    const imageShare = createImageShare(app.db, local[1].imageId, {
      sourceVersion: 'original',
      hours: 1,
    });
    // Share refresh POSTs must use the configured site origin. The browser
    // explicitly signs out before visitor checks; the Node controller keeps its
    // own independently issued owner session.
    const anonymousOrigin = app.origin;
    const embedIds = [
      ...local.filter((_, index) => index % 2 === 0).slice(0, 40),
      ...remote.slice(0, 40),
    ].map((asset) => asset.imageId);
    embeds = createServer((request, response) => {
      const url = new URL(request.url!, 'http://fixture.test');
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        ...(url.searchParams.has('no-referrer')
          ? { 'referrer-policy': 'no-referrer' }
          : {}),
      });
      response.end(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>外站嵌图验收</title><h1>外站嵌图验收 · 80 张</h1><main style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px">${embedIds.map((id, index) => `<img alt="验收图片 ${index + 1}" width="120" height="90" src="${anonymousOrigin}/i/${id}?type=original&embed=${url.searchParams.get('tab') ?? '1'}-${index}" loading="eager">`).join('')}</main>`,
      );
    });
    embeds.listen(0, '127.0.0.1');
    await once(embeds, 'listening');
    const address = embeds.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing embed port');
    const embedServer = embeds;
    return {
      browserInput: {
        origin: app.origin,
        anonymousOrigin,
        embedOrigin: `http://external-access-${address.port}.localhost:${address.port}`,
        ownerCookie: app.cookie,
        credentials: { email, password },
        albumId,
        shareToken: share.token,
        imageShareToken: imageShare.token,
        privateImageId: local[1].imageId,
        localImageId: local[0].imageId,
        remoteImageId: remote[0].imageId,
        archiveIds: [...local.slice(0, 100), ...remote.slice(0, 100)].map(
          (asset) => asset.imageId,
        ),
      },
      async close() {
        try {
          const closed = once(embedServer, 'close');
          embedServer.closeAllConnections();
          embedServer.close();
          await closed;
        } finally {
          await app.close();
        }
      },
    };
  } catch (error) {
    if (embeds?.listening) {
      embeds.closeAllConnections();
      await new Promise<void>((resolve) => embeds!.close(() => resolve()));
    }
    await app.close();
    throw error;
  }
}
