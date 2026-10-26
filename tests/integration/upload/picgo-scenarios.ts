import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
  albumImages,
  imageTags,
  tags,
} from '../../../src/server/collections/schema.ts';
import { mediaImages } from '../../../src/server/media/schema.ts';
import { unusedPort } from '../runtime/process-helpers.ts';
import { scenarioPng } from './scenario-png.ts';
import type { publicUploadFixture } from './api-fixture.ts';
import type { packagedPicgo } from './picgo-fixture.ts';

type Fixture = Awaited<ReturnType<typeof publicUploadFixture>>;
type Package = Awaited<ReturnType<typeof packagedPicgo>>;
export type PicgoCheck = { name: string; detail: object };

/** Local and real S3 exercise the same installed plugin and Core lifecycle. */
export async function verifyPicgoUploads(
  fixture: Fixture,
  packageFixture: Package,
  storageId: string,
  onCheck: (check: PicgoCheck) => Promise<void> = async () => {},
) {
  const checks: PicgoCheck[] = [];
  async function check(name: string, operation: () => Promise<object>) {
    const result = { name, detail: await operation() };
    checks.push(result);
    await onCheck(result);
  }
  const { db } = fixture.connection;
  const token = await fixture.createToken({ name: 'Issue 292 real PicGo' });
  const albumResponse = await fixture.ownerJson('/api/albums', 'POST', {
    name: 'PicGo 292 验收',
  });
  assert.equal(albumResponse.status, 201);
  const { album } = await albumResponse.json();
  const config = {
    siteUrl: fixture.origin,
    token: token.key,
    storageId,
    albumId: album.id as string,
    tag: '旅行,夏天',
    timeoutSeconds: 120,
  };
  const path = join(fixture.directory, "PicGo 旅行's.png");
  const second = join(fixture.directory, 'second.png');
  const third = join(fixture.directory, 'must-not-upload-third.png');
  const invalid = join(fixture.directory, 'unsupported.png');
  await writeFile(path, fixture.bytes);
  await writeFile(second, fixture.bytes);
  await writeFile(third, fixture.bytes);
  await writeFile(invalid, Buffer.from('not an image'));
  const images = () => db.select().from(mediaImages).all();
  async function assertPublicUrl(
    url: string,
    version: string,
    expectedBytes = fixture.bytes,
  ) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, fixture.origin);
    assert.equal(parsed.search, `?type=${version}`);
    const imageId = parsed.pathname.split('/').at(-1)!;
    const image = db
      .select()
      .from(mediaImages)
      .where(eq(mediaImages.id, imageId))
      .get();
    assert.ok(image);
    assert.equal(image.visibility, 'public');
    assert.equal(image.storageId, storageId);
    assert.equal(image.processingStatus, 'ready');
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length > 0);
    if (version === 'original') assert.deepEqual(bytes, expectedBytes);
    return image;
  }

  await check(
    'single-path-public-fixed-default-link-and-owner-targets',
    async () => {
      assert.equal(
        (
          await fixture.ownerJson('/api/settings/media', 'PATCH', {
            defaultVisibility: 'private',
            defaultLinkVersion: 'compressed',
          })
        ).status,
        200,
      );
      const { client, errors } = packageFixture.createClient(config);
      const output = await client.upload([path]);
      assert.ok(Array.isArray(output));
      assert.equal(output.length, 1);
      assert.deepEqual(errors, []);
      assert.ok(output[0].imgUrl);
      const image = await assertPublicUrl(output[0].imgUrl, 'compressed');
      assert.equal(image.originalName, "PicGo 旅行's.png");
      assert.deepEqual(
        db
          .select()
          .from(albumImages)
          .where(eq(albumImages.imageId, image.id))
          .all()
          .map((row) => row.albumId),
        [album.id],
      );
      const assigned = db
        .select()
        .from(imageTags)
        .where(eq(imageTags.imageId, image.id))
        .all();
      assert.equal(assigned.length, 1);
      assert.equal(
        db.select().from(tags).where(eq(tags.id, assigned[0].tagId)).get()!
          .displayName,
        config.tag,
      );
      assert.equal(
        (
          await fixture.ownerJson('/api/settings/media', 'PATCH', {
            defaultLinkVersion: 'original',
          })
        ).status,
        200,
      );
      await assertPublicUrl(output[0].imgUrl, 'compressed');
      return {
        imageId: image.id,
        version: 'compressed',
        public: true,
        albumCount: 1,
        tagCount: 1,
      };
    },
  );

  await check(
    'duplicate-renamed-file-errors-without-existing-link-or-new-image',
    async () => {
      const before = images();
      const { client, errors, finished } = packageFixture.createClient(config);
      const output = await client.upload([second]);
      assert.deepEqual(output, []);
      assert.equal(errors.length, 1);
      assert.equal(finished.length, 0);
      assert.match(
        String(errors[0]),
        /HTTP 409.*UPLOAD_DUPLICATE.*deduplication/,
      );
      assert.match(String(errors[0]), /已存在，未新增/);
      assert.ok(!String(errors[0]).includes(before[0].id));
      assert.deepEqual(images(), before);
      return { outputCount: 0, createdImages: 0, code: 'UPLOAD_DUPLICATE' };
    },
  );

  await check(
    'base64-through-real-core-transformer-and-original-bytes',
    async () => {
      const { client, errors } = packageFixture.createClient({
        ...config,
        linkVersion: 'original',
      });
      const expectedBytes = await scenarioPng('#118877');
      client.setConfig({ 'picBed.transformer': 'base64' });
      const output = await client.upload([
        {
          fileName: 'base64.png',
          extname: '.png',
          base64Image: expectedBytes.toString('base64'),
        },
      ]);
      assert.ok(Array.isArray(output));
      assert.equal(output.length, 1);
      assert.deepEqual(errors, []);
      assert.ok(output[0].imgUrl);
      const image = await assertPublicUrl(
        output[0].imgUrl,
        'original',
        expectedBytes,
      );
      return { imageId: image.id, originalBytes: expectedBytes.length };
    },
  );

  await check('multi-image-order-and-complete-output', async () => {
    const firstBytes = await scenarioPng('#995544');
    const secondBytes = await scenarioPng('#445599');
    await writeFile(path, firstBytes);
    await writeFile(second, secondBytes);
    const { client, errors } = packageFixture.createClient({
      ...config,
      linkVersion: 'original',
    });
    const output = await client.upload([path, second]);
    assert.ok(Array.isArray(output));
    assert.equal(output.length, 2);
    assert.deepEqual(errors, []);
    const saved = [];
    for (const [index, item] of output.entries()) {
      assert.ok(item.imgUrl);
      saved.push(
        await assertPublicUrl(
          item.imgUrl,
          'original',
          index === 0 ? firstBytes : secondBytes,
        ),
      );
    }
    assert.deepEqual(
      saved.map((image) => image.originalName),
      ["PicGo 旅行's.png", 'second.png'],
    );
    return {
      imageIds: saved.map((image) => image.id),
      order: saved.map((image) => image.originalName),
    };
  });

  await check(
    'second-image-duplicate-stops-batch-with-no-short-url-list',
    async () => {
      const before = new Set(images().map((image) => image.id));
      const expectedBytes = await scenarioPng('#aa7722');
      await writeFile(path, expectedBytes);
      const { client, errors, finished } = packageFixture.createClient(config);
      // second is already stored by the successful multi-image scenario.
      const output = await client.upload([path, second, third]);
      assert.deepEqual(output, []);
      assert.equal(errors.length, 1);
      assert.equal(finished.length, 0);
      assert.match(
        String(errors[0]),
        /HTTP 409.*UPLOAD_DUPLICATE.*已存在，未新增/,
      );
      const created = images().filter((image) => !before.has(image.id));
      assert.equal(created.length, 1);
      assert.equal(created[0].originalName, "PicGo 旅行's.png");
      await assertPublicUrl(
        `${fixture.origin}/i/${created[0].id}?type=original`,
        'original',
        expectedBytes,
      );
      return {
        outputCount: 0,
        savedImageId: created[0].id,
        code: 'UPLOAD_DUPLICATE',
        laterImageCreated: false,
      };
    },
  );

  await check(
    'second-image-failure-retains-first-and-stops-with-no-output',
    async () => {
      const expectedBytes = await scenarioPng('#883399');
      await writeFile(path, expectedBytes);
      const before = new Set(images().map((image) => image.id));
      const { client, errors, finished } = packageFixture.createClient(config);
      const output = await client.upload([path, invalid, third]);
      assert.ok(Array.isArray(output));
      assert.deepEqual(output, []);
      assert.equal(errors.length, 1);
      assert.equal(finished.length, 0);
      const created = images().filter((image) => !before.has(image.id));
      assert.equal(created.length, 1);
      assert.equal(created[0].originalName, "PicGo 旅行's.png");
      const log = await readFile(
        join(packageFixture.directory, 'picgo.log'),
        'utf8',
      );
      assert.ok(
        log.includes(created[0].id),
        'Log must identify the already saved image',
      );
      await assertPublicUrl(
        `${fixture.origin}/i/${created[0].id}?type=original`,
        'original',
        expectedBytes,
      );
      return {
        savedImageId: created[0].id,
        outputCount: 0,
        failedEvents: errors.length,
        laterImageCreated: false,
      };
    },
  );

  await check(
    'missing-selected-version-retains-image-and-does-not-fallback',
    async () => {
      const expectedBytes = await scenarioPng('#668822');
      await writeFile(path, expectedBytes);
      const before = new Set(images().map((image) => image.id));
      const { client, errors, finished } = packageFixture.createClient({
        ...config,
        linkVersion: 'watermark',
      });
      const output = await client.upload([path]);
      assert.ok(Array.isArray(output));
      assert.deepEqual(output, []);
      assert.equal(errors.length, 1);
      assert.equal(finished.length, 0);
      const created = images().filter((image) => !before.has(image.id));
      assert.equal(created.length, 1);
      assert.ok(String(errors[0]).includes(created[0].id));
      return { savedImageId: created[0].id, outputCount: 0, fallback: false };
    },
  );

  await check(
    'core-http-server-returns-failure-with-no-short-url-list',
    async () => {
      const expectedBytes = await scenarioPng('#cc4466');
      await writeFile(path, expectedBytes);
      const before = new Set(images().map((image) => image.id));
      const { client, errors } = packageFixture.createClient(config);
      const port = await unusedPort();
      await client.server.listen(port, '127.0.0.1');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/upload`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ list: [path, invalid, third] }),
          signal: AbortSignal.timeout(120000),
        });
        assert.equal(response.status, 500);
        const body = await response.json();
        assert.equal(body.success, false);
        assert.deepEqual(body.result, []);
        assert.equal(errors.length, 1);
        const created = images().filter((image) => !before.has(image.id));
        assert.equal(created.length, 1);
        assert.equal(created[0].originalName, "PicGo 旅行's.png");
        return {
          httpStatus: response.status,
          success: body.success,
          resultCount: body.result.length,
          savedImageId: created[0].id,
        };
      } finally {
        client.server.shutdown();
      }
    },
  );

  await check(
    'invalid-token-creates-no-image-and-keeps-token-out-of-diagnostics',
    async () => {
      const before = images().length;
      const invalidToken = 'issue-292-invalid-token-do-not-log';
      const { client, errors } = packageFixture.createClient({
        ...config,
        token: invalidToken,
      });
      const output = await client.upload([path]);
      assert.ok(Array.isArray(output));
      assert.deepEqual(output, []);
      assert.equal(errors.length, 1);
      assert.equal(images().length, before);
      assert.ok(!String(errors[0]).includes(invalidToken));
      assert.ok(!fixture.server.logs().includes(token.key));
      return { outputCount: 0, imageCountUnchanged: true, tokenLeaked: false };
    },
  );
  await check('size-limit-rejection-creates-no-image', async () => {
    const before = images().length;
    const current = await (await fixture.owner('/api/settings/upload')).json();
    assert.equal(
      (
        await fixture.ownerJson('/api/settings/upload', 'PATCH', {
          maxFileMiB: 1,
        })
      ).status,
      200,
    );
    try {
      const oversized = join(fixture.directory, 'over-limit.png');
      const bytes = Buffer.alloc(1024 * 1024 + 1);
      fixture.bytes.copy(bytes);
      await writeFile(oversized, bytes);
      const { client, errors } = packageFixture.createClient(config);
      const output = await client.upload([oversized]);
      assert.ok(Array.isArray(output));
      assert.deepEqual(output, []);
      assert.equal(errors.length, 1);
      assert.ok(String(errors[0]).includes('UPLOAD_FILE_TOO_LARGE'));
      assert.equal(images().length, before);
      return {
        outputCount: 0,
        imageCountUnchanged: true,
        errorCode: 'UPLOAD_FILE_TOO_LARGE',
      };
    } finally {
      assert.equal(
        (
          await fixture.ownerJson('/api/settings/upload', 'PATCH', {
            maxFileMiB: current.maxFileMiB,
          })
        ).status,
        200,
      );
    }
  });
  await check('lost-response-after-server-accepts-does-not-retry', async () => {
    const expectedBytes = await scenarioPng('#3366aa');
    await writeFile(path, expectedBytes);
    const before = new Set(images().map((image) => image.id));
    let requests = 0;
    let upstreamError: unknown;
    // Drop the response only after the real API has fully processed this upload.
    const proxy = createServer(async (request, response) => {
      requests++;
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const upstream = await fetch(`${fixture.origin}/api/upload`, {
          method: 'POST',
          headers: {
            authorization: request.headers.authorization!,
            'content-type': request.headers['content-type']!,
          },
          body: Buffer.concat(chunks),
          signal: AbortSignal.timeout(120000),
        });
        assert.equal(upstream.status, 201, await upstream.clone().text());
        await upstream.arrayBuffer();
      } catch (error) {
        upstreamError = error;
      } finally {
        response.destroy();
      }
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    const address = proxy.address();
    assert.ok(address && typeof address !== 'string');
    try {
      const { client, errors, finished } = packageFixture.createClient({
        ...config,
        siteUrl: `http://127.0.0.1:${address.port}`,
      });
      const output = await client.upload([path, third]);
      assert.ifError(upstreamError);
      assert.ok(Array.isArray(output));
      assert.deepEqual(output, []);
      assert.equal(errors.length, 1);
      assert.equal(finished.length, 0);
      assert.ok(String(errors[0]).includes('未确认'));
      assert.equal(requests, 1);
      const created = images().filter((image) => !before.has(image.id));
      assert.equal(created.length, 1);
      assert.equal(created[0].originalName, "PicGo 旅行's.png");
      assert.equal(created[0].processingStatus, 'ready');
      await assertPublicUrl(
        `${fixture.origin}/i/${created[0].id}?type=original`,
        'original',
        expectedBytes,
      );
      return {
        savedImageId: created[0].id,
        requestCount: requests,
        outputCount: 0,
        retried: false,
      };
    } finally {
      proxy.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        proxy.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  const log = await readFile(
    join(packageFixture.directory, 'picgo.log'),
    'utf8',
  );
  assert.ok(!log.includes(token.key));
  return checks;
}
