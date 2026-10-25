import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { emptyImageEditRecipe } from '../src/shared/image-editing.ts';
import { mediaObjects, mediaVersions } from '../src/server/media/schema.ts';
import { patchMediaSettings } from '../src/server/media/settings.ts';
import { stageError } from '../src/server/storage/probes.ts';
import { uploadSessions } from '../src/server/upload/schema.ts';
import {
  launchS3Delivery,
  type DeliveryTarget,
} from '../tests/integration/delivery/s3-fixture.ts';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  options: {
    config: { type: 'string', multiple: true },
    output: { type: 'string', default: 'docs/verification/image-editor/s3' },
  },
});
assert.ok(values.config?.length, 'Supply private target config files');
const targetSchema = z.strictObject({
  service: z.enum(['r2', 'seaweedfs']),
  serviceVersion: z.string().optional(),
  endpoint: z.string().url(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  forcePathStyle: z.boolean(),
  credentials: z.strictObject({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }),
});
const targets: DeliveryTarget[] = [];
for (const file of values.config)
  targets.push(
    ...z.array(targetSchema).parse(JSON.parse(await readFile(file, 'utf8'))),
  );
assert.deepEqual(targets.map((target) => target.service).sort(), [
  'r2',
  'seaweedfs',
]);
await mkdir(resolve(values.output), { recursive: true });
const directory = await mkdtemp(join(resolve(values.output), 'run-'));
const run = promisify(execFile);
const originalPath = join(directory, 'source.png');
const logoPath = join(directory, 'logo.png');
await run('magick', [
  '-size',
  '1600x1000',
  'gradient:#164e63-#bef264',
  '-set',
  'comment',
  'editor-live-source-metadata',
  originalPath,
]);
await run('magick', [
  '-size',
  '80x40',
  'xc:none',
  '-fill',
  '#0f766e',
  '-draw',
  'roundrectangle 0,0 79,39 8,8',
  logoPath,
]);
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const originalBytes = await readFile(originalPath);
const reports = [];

for (const target of targets) {
  const output = join(directory, target.service);
  await mkdir(output);
  const checks: string[] = [];
  const report = {
    service: target.service,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    target: { endpoint: target.endpoint, bucket: target.bucket },
    status: 'failed',
    checks,
    cleanup: 'pending' as string | ReturnType<typeof stageError>[],
    error: null as ReturnType<typeof stageError> | null,
  };
  reports.push(report);
  let app: Awaited<ReturnType<typeof launchS3Delivery>> | undefined;
  try {
    app = await launchS3Delivery(target, join(output, 'keys.json'));
    const fixture = app;
    const headers = {
      cookie: fixture.cookie,
      origin: fixture.origin,
      'content-type': 'application/json',
    };
    async function json(
      path: string,
      body?: unknown,
      method = body === undefined ? 'GET' : 'POST',
    ) {
      const response = await fetch(fixture.origin + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      const value = await response.json();
      assert.ok(
        response.ok,
        `${path}: HTTP ${response.status}: ${JSON.stringify(value)}`,
      );
      return value;
    }
    async function bytes(
      path: string,
      method = 'GET',
      body?: unknown,
      direct = false,
    ) {
      const response = await fetch(new URL(path, fixture.origin), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: direct ? 'manual' : 'follow',
        signal: AbortSignal.timeout(60000),
      });
      assert.equal(
        response.status,
        200,
        `${path}: HTTP ${response.status}: ${response.ok ? '' : await response.text()}`,
      );
      if (direct) assert.equal(response.headers.get('location'), null);
      return Buffer.from(await response.arrayBuffer());
    }
    async function waitEdit(requestId: string) {
      const deadline = Date.now() + 90000;
      while (true) {
        const value = await json(`/api/media/edits/${requestId}`);
        assert.ok(
          !['failed', 'cancelled'].includes(value.status),
          JSON.stringify(value),
        );
        if (value.status === 'succeeded') return value;
        assert.ok(
          Date.now() < deadline,
          `Timed out waiting for edit ${requestId}`,
        );
        await delay(100);
      }
    }
    const imageCount = () =>
      (
        fixture.db.$client
          .prepare('SELECT COUNT(*) AS n FROM media_images')
          .get() as { n: number }
      ).n;
    const originalHash = (imageId: string) =>
      fixture.db
        .select({ hash: mediaObjects.contentSha256 })
        .from(mediaVersions)
        .innerJoin(mediaObjects, eq(mediaObjects.id, mediaVersions.objectId))
        .where(
          and(
            eq(mediaVersions.imageId, imageId),
            eq(mediaVersions.kind, 'original'),
          ),
        )
        .get()?.hash;
    const versionIds = (imageId: string) =>
      fixture.db
        .select({ kind: mediaVersions.kind, id: mediaVersions.objectId })
        .from(mediaVersions)
        .where(eq(mediaVersions.imageId, imageId))
        .all();
    async function inspect(
      bytes: Buffer,
      name: string,
      expected: [number, number],
      rgb: [number, number, number],
    ) {
      const path = join(output, name);
      await writeFile(path, bytes);
      const dimensions = (
        await run('magick', ['identify', '-format', '%w %h', path])
      ).stdout
        .trim()
        .split(' ')
        .map(Number);
      assert.deepEqual(dimensions, expected);
      const pixel = (
        await run('magick', [
          path,
          '-crop',
          '1x1+400+300',
          '+repage',
          '-format',
          '%[fx:r] %[fx:g] %[fx:b] %[fx:a]',
          'info:',
        ])
      ).stdout
        .trim()
        .split(' ')
        .map(Number);
      assert.deepEqual(pixel, [...rgb, 1]);
      return path;
    }

    patchMediaSettings(fixture.db, {
      watermarkMode: 'text',
      watermarkText: 'Site watermark',
      watermarkFont: 'latin',
    });
    const token = await json('/api/upload-tokens', {
      name: 'Image editor live',
      expiresIn: 3600,
    });
    const form = new FormData();
    form.set('storageId', fixture.storageId);
    form.set('visibility', 'private');
    form.set('file', new File([originalBytes], 'editor-source.png'));
    const uploaded = await fetch(fixture.origin + '/api/upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${token.key}` },
      body: form,
      signal: AbortSignal.timeout(90000),
    });
    const accepted = await uploaded.json();
    assert.equal(uploaded.status, 201, JSON.stringify(accepted));
    assert.equal(accepted.status, 'ready');
    const id = accepted.imageId as string;
    assert.equal(imageCount(), 1);
    checks.push(
      'formal authenticated multipart upload into fixture-owned S3 namespace',
    );

    const context = await json(`/api/images/${id}/edit`);
    assert.equal(context.unavailableReason, null);
    assert.deepEqual(context.watermarkPreview, { copy: true, overwrite: true });
    assert.deepEqual(
      await bytes(context.sourceUrl, 'GET', undefined, true),
      originalBytes,
    );
    const sourceMetadata = await json(`/api/images/${id}/metadata`);
    assert.equal(sourceMetadata.status, 'succeeded');
    assert.ok(
      JSON.stringify(sourceMetadata.data).includes(
        'editor-live-source-metadata',
      ),
    );
    checks.push(
      'owner source endpoint streams exact original bytes without redirect',
    );

    const logoForm = new FormData();
    logoForm.set('file', new File([await readFile(logoPath)], 'logo.png'));
    const logoUploaded = await fetch(
      fixture.origin + '/api/media/watermark-assets',
      {
        method: 'POST',
        headers: { cookie: fixture.cookie, origin: fixture.origin },
        body: logoForm,
        signal: AbortSignal.timeout(30000),
      },
    );
    const logo = await logoUploaded.json();
    assert.equal(logoUploaded.status, 201, JSON.stringify(logo));
    assert.deepEqual(
      await bytes(
        `/api/media/watermark-assets/${logo.id}/image`,
        'GET',
        undefined,
        true,
      ),
      await readFile(logoPath),
    );
    const recipe = emptyImageEditRecipe();
    recipe.regions = [
      {
        id: 'redaction',
        x: 0.2,
        y: 0.2,
        width: 0.3,
        height: 0.25,
        mode: 'solid',
        strength: 20,
        color: '#ff0000',
      },
    ];
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      kind: 'image',
      assetId: logo.id,
      x: 0.8,
      y: 0.85,
      width: 0.15,
      opacity: 0.8,
    };
    const template = await json('/api/media/edit-templates', {
      name: 'Live redaction and logo',
      recipe,
    });
    assert.deepEqual(template.recipe, recipe);
    const renamed = await json(
      `/api/media/edit-templates/${template.id}`,
      { name: 'Live renamed template' },
      'PATCH',
    );
    assert.equal(renamed.name, 'Live renamed template');
    assert.ok(
      (await json('/api/media/edit-templates')).templates.some(
        (value: { id: string }) => value.id === template.id,
      ),
    );
    checks.push(
      'Logo upload and authenticated pixels; template create/read/rename preserve full recipe',
    );

    const preview = await bytes(
      `/api/images/${id}/edit/preview`,
      'POST',
      {
        sourceObjectId: context.sourceObjectId,
        recipe,
        mode: 'copy',
        target: 'original',
      },
      true,
    );
    await inspect(preview, 'preview-original.png', [1280, 800], [1, 0, 0]);
    const watermarkPreview = await bytes(
      `/api/images/${id}/edit/preview`,
      'POST',
      {
        sourceObjectId: context.sourceObjectId,
        recipe,
        mode: 'copy',
        target: 'watermark',
      },
      true,
    );
    assert.notEqual(digest(preview), digest(watermarkPreview));
    await writeFile(join(output, 'preview-watermark.png'), watermarkPreview);
    assert.equal(imageCount(), 1);
    checks.push(
      'native PNG original/site-watermark previews preserve proportions and create no library images',
    );

    const sizes = new Map<string, { url: string; hash: string }>();
    for (const preset of ['small', 'medium', 'large']) {
      await json(`/api/images/${id}/sizes`, { version: 'compressed', preset });
      const deadline = Date.now() + 60000;
      while (true) {
        const size = await json(
          `/api/images/${id}/sizes?version=compressed&preset=${preset}`,
        );
        assert.ok(
          !['failed', 'cancelled'].includes(size.status),
          JSON.stringify(size),
        );
        if (size.status === 'ready') {
          sizes.set(preset, {
            url: size.links.url,
            hash: digest(await bytes(size.links.url)),
          });
          break;
        }
        assert.ok(Date.now() < deadline, `Timed out generating size ${preset}`);
        await delay(100);
      }
    }
    const copyInput = {
      requestId: randomUUID(),
      sourceObjectId: context.sourceObjectId,
      recipe,
    };
    const copied = await json(`/api/images/${id}/edit`, copyInput);
    const replayed = await json(`/api/images/${id}/edit`, copyInput);
    assert.equal(copied.jobId, replayed.jobId);
    assert.equal(copied.resultImageId, replayed.resultImageId);
    assert.equal(copied.mode, 'copy');
    assert.notEqual(copied.resultImageId, id);
    const finishedCopy = await waitEdit(copyInput.requestId);
    assert.equal(finishedCopy.resultImageId, copied.resultImageId);
    assert.equal(imageCount(), 2);
    const copiedBytes = await bytes(`/i/${copied.resultImageId}?type=original`);
    await inspect(copiedBytes, 'copy-original.png', [1600, 1000], [1, 0, 0]);
    assert.equal(originalHash(copied.resultImageId), digest(copiedBytes));
    assert.deepEqual(await bytes(`/i/${id}?type=original`), originalBytes);
    const copiedMetadata = await json(
      `/api/images/${copied.resultImageId}/metadata`,
    );
    assert.equal(copiedMetadata.status, 'succeeded');
    assert.ok(
      !JSON.stringify(copiedMetadata.data).includes(
        'editor-live-source-metadata',
      ),
    );
    checks.push(
      'default copy, exact-request idempotency, real mask pixels/full dimensions/SHA, source bytes preserved',
    );

    const before = await json(`/api/images/${id}`);
    const beforeVersions = versionIds(id);
    patchMediaSettings(fixture.db, { watermarkMode: 'off' });
    const overwriteContext = await json(`/api/images/${id}/edit`);
    assert.deepEqual(overwriteContext.watermarkPreview, {
      copy: false,
      overwrite: true,
    });
    const overwriteRecipe = {
      ...recipe,
      regions: recipe.regions.map((region) => ({
        ...region,
        color: '#0000ff',
      })),
    };
    await bytes(
      `/api/images/${id}/edit/preview`,
      'POST',
      {
        sourceObjectId: overwriteContext.sourceObjectId,
        recipe: overwriteRecipe,
        mode: 'overwrite',
        target: 'watermark',
      },
      true,
    );
    const overwriteInput = {
      requestId: randomUUID(),
      sourceObjectId: overwriteContext.sourceObjectId,
      mode: 'overwrite',
      recipe: overwriteRecipe,
    };
    const overwriting = await json(`/api/images/${id}/edit`, overwriteInput);
    assert.equal(overwriting.resultImageId, id);
    await waitEdit(overwriteInput.requestId);
    const after = await json(`/api/images/${id}`);
    assert.equal(after.id, before.id);
    assert.equal(after.displayName, before.displayName);
    assert.equal(after.createdAt, before.createdAt);
    assert.deepEqual(after.albums, before.albums);
    assert.deepEqual(after.tags, before.tags);
    for (const previous of beforeVersions)
      assert.notEqual(
        versionIds(id).find((value) => value.kind === previous.kind)!.id,
        previous.id,
      );
    const overwrittenBytes = await bytes(`/i/${id}?type=original`);
    await inspect(
      overwrittenBytes,
      'overwrite-original.png',
      [1600, 1000],
      [0, 0, 1],
    );
    assert.equal(originalHash(id), digest(overwrittenBytes));
    for (const [preset, previous] of sizes) {
      const current = await json(
        `/api/images/${id}/sizes?version=compressed&preset=${preset}`,
      );
      assert.equal(current.links.url, previous.url);
      assert.notEqual(digest(await bytes(previous.url)), previous.hash);
    }
    const overwrittenMetadata = await json(`/api/images/${id}/metadata`);
    assert.equal(overwrittenMetadata.status, 'succeeded');
    assert.ok(
      !JSON.stringify(overwrittenMetadata.data).includes(
        'editor-live-source-metadata',
      ),
    );
    assert.deepEqual(
      await bytes(`/i/${copied.resultImageId}?type=original`),
      copiedBytes,
    );
    assert.equal(imageCount(), 2);
    await json(`/api/media/edit-templates/${template.id}`, undefined, 'DELETE');
    assert.ok(
      !(await json('/api/media/edit-templates')).templates.some(
        (value: { id: string }) => value.id === template.id,
      ),
    );
    assert.deepEqual(
      await bytes(`/i/${copied.resultImageId}?type=original`),
      copiedBytes,
    );
    checks.push(
      'overwrite preserves ID/associations and rebuilds saved roles/sizes after settings change; metadata/SHA refresh; copy remains independent',
    );
    checks.push(
      'template deletion leaves previously saved flat image pixels unchanged',
    );
    report.status = 'passed';
  } catch (error) {
    report.error = stageError(error, Object.values(target.credentials));
  } finally {
    if (app) {
      const cleanupErrors: ReturnType<typeof stageError>[] = [];
      try {
        await app.shutdown();
        for (const object of app.db
          .select({ key: mediaObjects.key })
          .from(mediaObjects)
          .where(eq(mediaObjects.storageId, app.storageId))
          .all())
          if (!app.keys.includes(object.key)) app.keys.push(object.key);
        for (const session of app.db
          .select({
            temporaryKey: uploadSessions.temporaryKey,
            finalKey: uploadSessions.finalKey,
          })
          .from(uploadSessions)
          .where(eq(uploadSessions.storageId, app.storageId))
          .all()) {
          for (const key of [session.temporaryKey, session.finalKey])
            if (key && !app.keys.includes(key)) app.keys.push(key);
        }
        await writeFile(
          join(output, 'keys.json'),
          JSON.stringify(
            { storageId: app.storageId, keys: app.keys },
            null,
            2,
          ) + '\n',
        );
      } catch (error) {
        cleanupErrors.push(
          stageError(error, Object.values(target.credentials)),
        );
      } finally {
        try {
          await app.close();
        } catch (error) {
          cleanupErrors.push(
            stageError(error, Object.values(target.credentials)),
          );
        }
      }
      report.cleanup = cleanupErrors.length
        ? cleanupErrors
        : 'passed: only fixture-owned exact keys removed and confirmed absent';
      if (cleanupErrors.length) report.status = 'failed';
    }
    report.finishedAt = new Date().toISOString();
    await writeFile(
      join(output, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(`${target.service}: ${report.status}; ${output}/report.json`);
  }
}
assert.ok(
  reports.every((report) => report.status === 'passed'),
  `One or more real image edit service checks failed: ${directory}`,
);
