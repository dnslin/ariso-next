import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import {
  launchS3Delivery,
  type DeliveryTarget,
} from '../tests/integration/delivery/s3-fixture.ts';
import { mediaObjects } from '../src/server/media/schema.ts';
import { uploadSessions } from '../src/server/upload/schema.ts';
import { patchMediaSettings } from '../src/server/media/settings.ts';
import { stageError } from '../src/server/storage/probes.ts';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  options: {
    config: { type: 'string', multiple: true },
    output: { type: 'string', default: 'test-results/image-workflows-s3' },
  },
});
assert.ok(values.config?.length, 'Supply private target config files');
const targets: DeliveryTarget[] = [];
for (const file of values.config)
  targets.push(...JSON.parse(await readFile(file, 'utf8')));
assert.deepEqual(targets.map((target) => target.service).sort(), [
  'r2',
  'seaweedfs',
]);
await mkdir(resolve(values.output), { recursive: true });
const directory = await mkdtemp(join(resolve(values.output), 'run-'));
const run = promisify(execFile);
const original = join(directory, 'before.png');
const replacement = join(directory, 'after.png');
await run('magick', [
  '-size',
  '1600x1000',
  'gradient:#164e63-#bef264',
  original,
]);
await run('magick', [
  '-size',
  '1400x900',
  'gradient:#831843-#fde68a',
  replacement,
]);
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
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
      cookie: app.cookie,
      origin: app.origin,
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
      const result = await response.json();
      assert.ok(
        response.ok,
        `${path}: HTTP ${response.status}: ${JSON.stringify(result)}`,
      );
      return result;
    }
    async function wait(
      path: string,
      done: (value: Awaited<ReturnType<typeof json>>) => boolean,
    ) {
      const deadline = Date.now() + 60000;
      while (true) {
        const result = await json(path);
        if (done(result)) return result;
        assert.ok(
          Date.now() < deadline,
          `Timed out: ${path}: ${JSON.stringify(result)}`,
        );
        await delay(100);
      }
    }
    async function bytes(path: string) {
      const response = await fetch(new URL(path, fixture.origin), {
        headers: { cookie: fixture.cookie },
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200);
      return Buffer.from(await response.arrayBuffer());
    }
    patchMediaSettings(app.db, {
      watermarkMode: 'text',
      watermarkText: 'Ariso',
      watermarkFont: 'latin',
    });
    const token = await json('/api/upload-tokens', {
      name: 'Image workflows live',
      expiresIn: 3600,
    });
    const form = new FormData();
    form.set('storageId', app.storageId);
    form.set('visibility', 'private');
    form.set('file', new File([await readFile(original)], '替换前.png'));
    const upload = await fetch(app.origin + '/api/upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${token.key}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    const accepted = await upload.json();
    assert.equal(upload.status, 201, JSON.stringify(accepted));
    assert.equal(accepted.status, 'ready');
    const id = accepted.imageId;
    checks.push('formal multipart upload and real S3 processing');
    const shareSettings = await json(`/api/images/${id}/share`);
    const { share } = await json(`/api/images/${id}/share`, {
      hours: 1,
      sourceVersion: shareSettings.sourceVersion,
    });
    const shared = await fetch(`${app.origin}/s/image/${share.token}/media`, {
      redirect: 'manual',
    });
    assert.equal(shared.status, 200);
    assert.equal(shared.headers.get('location'), null);
    await shared.arrayBuffer();
    assert.equal(
      (
        await fetch(`${app.origin}/i/${id}?type=original`, {
          redirect: 'manual',
        })
      ).status,
      401,
    );
    checks.push(
      'anonymous private stream without signed redirect or ordinary link access',
    );
    const sizePath = `/api/images/${id}/sizes`;
    const saved = new Map<string, { url: string; hash: string }>();
    for (const [preset, edge] of [
      ['small', 640],
      ['medium', 1280],
      ['large', 1600],
    ] as const) {
      await json(sizePath, { version: 'compressed', preset });
      const size = await wait(
        `${sizePath}?version=compressed&preset=${preset}`,
        (value) => {
          assert.ok(
            !['failed', 'cancelled'].includes(value.status),
            JSON.stringify(value),
          );
          return value.status === 'ready';
        },
      );
      assert.equal(Math.max(size.width, size.height), edge);
      const content = await bytes(size.links.url);
      const path = join(output, `${preset}.webp`);
      await writeFile(path, content);
      const actual = (
        await run('magick', ['identify', '-format', '%w %h', path])
      ).stdout
        .trim()
        .split(' ')
        .map(Number);
      assert.equal(Math.max(...actual), edge);
      saved.set(preset, { url: size.links.url, hash: digest(content) });
    }
    checks.push('three real size outputs including no upscale');
    const prepared = await json('/api/images/archives', {
      ids: [id],
      query: '',
      version: 'original',
    });
    assert.match(prepared.downloadUrl, /^\/api\/images\/archives\//);
    const zipPath = join(output, 'download.zip');
    await writeFile(zipPath, await bytes(prepared.downloadUrl));
    const zip = JSON.parse(
      (
        await run('/usr/bin/python3', [
          '-c',
          'import json,sys,zipfile,hashlib; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()]))',
          zipPath,
        ])
      ).stdout,
    );
    assert.deepEqual(zip, [digest(await readFile(original))]);
    checks.push('real S3 ZIP download and unpacked original bytes');
    const before = await json(`/api/images/${id}`);
    const form2 = new FormData();
    form2.set('file', new File([await readFile(replacement)], '替换后.png'));
    const submitted = await fetch(`${app.origin}/api/images/${id}/replace`, {
      method: 'POST',
      headers: { cookie: app.cookie, origin: app.origin },
      body: form2,
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(submitted.status, 202, await submitted.text());
    await wait(`/api/images/${id}/replace`, (value) => {
      assert.ok(
        !['failed', 'cancelled'].includes(value.job?.status),
        JSON.stringify(value),
      );
      return value.job?.status === 'succeeded';
    });
    const after = await json(`/api/images/${id}`);
    assert.equal(after.id, before.id);
    assert.equal(after.displayName, before.displayName);
    assert.equal(after.createdAt, before.createdAt);
    assert.deepEqual(after.albums, before.albums);
    assert.deepEqual(after.tags, before.tags);
    assert.deepEqual(
      await bytes(`/i/${id}?type=original`),
      await readFile(replacement),
    );
    for (const [preset, previous] of saved) {
      const size = await json(
        `${sizePath}?version=compressed&preset=${preset}`,
      );
      assert.equal(size.links.url, previous.url);
      assert.notEqual(digest(await bytes(previous.url)), previous.hash);
    }
    assert.equal(
      (await fetch(`${app.origin}/s/image/${share.token}/media`)).status,
      410,
    );
    checks.push(
      'atomic replacement retains identity and preset URLs, updates bytes and revokes sharing',
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
          .all())
          for (const key of [session.temporaryKey, session.finalKey])
            if (key && !app.keys.includes(key)) app.keys.push(key);
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
        : 'passed: only owned exact keys removed and confirmed absent';
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
  `One or more real service checks failed: ${directory}`,
);
