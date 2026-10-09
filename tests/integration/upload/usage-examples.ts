import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
  createAlbum,
  getOrCreateTags,
} from '../../../src/server/collections/records.ts';
import {
  albumImages,
  imageTags,
  tags,
} from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import {
  buildUploadCurl,
  type UploadCurlExample,
} from '../../../src/shared/upload-usage.ts';
import type { publicUploadFixture } from './api-fixture.ts';

type Fixture = Awaited<ReturnType<typeof publicUploadFixture>>;
export type UsageCheck = { name: string; detail: object };

/** Execute the generated shell command; authentication travels through stdin only. */
async function executeExample(
  fixture: Fixture,
  example: UploadCurlExample,
  key: string,
  values: Parameters<typeof buildUploadCurl>[2],
) {
  const generated = buildUploadCurl(fixture.origin, example, values);
  const command = generated.replace(
    '--header "Authorization: Bearer ${ARISO_UPLOAD_TOKEN}"',
    '--config -',
  );
  assert.ok(!command.includes('ARISO_UPLOAD_TOKEN'));
  assert.ok(!command.includes(key));
  const child = spawn(
    '/bin/sh',
    [
      '-c',
      `${command} --silent --show-error --max-time 60 --write-out '\\n%{http_code}'`,
    ],
    {
      env: {
        NODE_ENV: 'test',
        PATH: process.env.PATH,
        NO_PROXY: [process.env.NO_PROXY, 'localhost,127.0.0.1,::1,.localhost']
          .filter(Boolean)
          .join(','),
        no_proxy: [process.env.no_proxy, 'localhost,127.0.0.1,::1,.localhost']
          .filter(Boolean)
          .join(','),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
  // JSON quoting uses the same escapes as curl's quoted config values.
  child.stdin.end(
    example === 'unauthorized'
      ? ''
      : `header = ${JSON.stringify(`Authorization: Bearer ${key}`)}\n`,
  );
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
    child.stdin.once('error', reject);
  });
  const stderr = Buffer.concat(errors).toString();
  assert.equal(code, 0, stderr);
  const stdout = Buffer.concat(output).toString();
  assert.ok(!stdout.includes(key));
  assert.ok(!stderr.includes(key));
  assert.ok(!fixture.server.logs().includes(key));
  const split = stdout.lastIndexOf('\n');
  assert.ok(split > 0, 'curl did not return a JSON body and HTTP status');
  return {
    status: Number(stdout.slice(split + 1)),
    body: JSON.parse(stdout.slice(0, split)),
  };
}

/** Same generated examples and assertions are used for Local, R2 and SeaweedFS. */
export async function verifyUploadCurlExamples(
  fixture: Fixture,
  storageId: string,
  inspect: (key: string) => Promise<{ size: number | undefined } | null>,
  onCheck: (check: UsageCheck) => Promise<void> = async () => {},
) {
  const { db } = fixture.connection;
  const key = (await fixture.createToken({ name: 'Issue 199 curl fixture' }))
    .key;
  const file = join(fixture.directory, "curl 旅行's.png");
  await writeFile(file, fixture.bytes);
  const checks: UsageCheck[] = [];
  async function check(name: string, operation: () => Promise<object>) {
    const item = { name, detail: await operation() };
    checks.push(item);
    await onCheck(item);
  }
  async function successful(
    result: Awaited<ReturnType<typeof executeExample>>,
    visibility: 'public' | 'private',
  ) {
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const body = result.body;
    assert.equal(body.status, 'ready');
    assert.equal(body.processing.status, 'succeeded');
    assert.equal(body.url, `${fixture.origin}/i/${body.imageId}`);
    const image = db
      .select()
      .from(mediaImages)
      .where(eq(mediaImages.id, body.imageId))
      .get()!;
    assert.equal(image.storageId, storageId);
    assert.equal(image.visibility, visibility);
    assert.equal(image.processingStatus, 'ready');
    const job = db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.imageId, image.id))
      .get()!;
    assert.equal(job.status, 'succeeded');
    const versions = db
      .select()
      .from(mediaVersions)
      .where(eq(mediaVersions.imageId, image.id))
      .all();
    assert.deepEqual(Object.keys(body.versions).sort(), [
      'compressed',
      'original',
      'thumbnail',
    ]);
    assert.deepEqual(
      Object.keys(body.versions).sort(),
      versions.map((row) => row.kind).sort(),
    );
    for (const row of versions)
      assert.equal(
        body.versions[row.kind].url,
        `${fixture.origin}/i/${image.id}?type=${row.kind}`,
      );
    const objects = db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.imageId, image.id))
      .all();
    assert.equal(
      objects.filter((row) => row.status === 'stored').length,
      versions.length,
    );
    for (const object of objects.filter((row) => row.status === 'stored'))
      assert.equal((await inspect(object.key))?.size, object.byteSize);
    const original = await fixture.owner(`/i/${image.id}?type=original`);
    let delivered = original;
    if (original.status === 302) {
      const location = original.headers.get('location');
      assert.ok(location);
      delivered = await fetch(location, { signal: AbortSignal.timeout(30000) });
    }
    assert.equal(delivered.status, 200);
    assert.deepEqual(Buffer.from(await delivered.arrayBuffer()), fixture.bytes);
    const tokenRead = await fixture.request(`/i/${image.id}?type=original`, {
      headers: { authorization: `Bearer ${key}` },
    });
    assert.equal(
      tokenRead.status,
      visibility === 'private' ? 401 : original.status,
    );
    return {
      imageId: image.id,
      storageId,
      visibility,
      status: result.status,
      jobId: job.id,
      versions: Object.keys(body.versions).sort(),
    };
  }

  for (const [example, status, code, stage] of [
    ['unauthorized', 401, 'UPLOAD_TOKEN_INVALID', 'authentication'],
    ['invalid', 400, 'UPLOAD_INVALID_INPUT', 'preparing'],
  ] as const) {
    await check(`${example}-generated-curl-creates-no-assets`, async () => {
      const result = await executeExample(fixture, example, key, { file });
      assert.equal(result.status, status);
      assert.equal(result.body.imageId, null);
      assert.equal(result.body.status, 'not_created');
      assert.equal(result.body.error.code, code);
      assert.equal(result.body.error.stage, stage);
      assert.equal(typeof result.body.requestId, 'string');
      assert.deepEqual(db.select().from(mediaImages).all(), []);
      assert.deepEqual(db.select().from(mediaJobs).all(), []);
      assert.deepEqual(db.select().from(mediaObjects).all(), []);
      assert.deepEqual(db.select().from(tags).all(), []);
      for (const directory of ['storage', 'tmp'])
        assert.deepEqual(
          (
            await readdir(join(fixture.dataDir, directory), {
              recursive: true,
              withFileTypes: true,
            })
          ).filter((entry) => entry.isFile()),
          [],
        );
      return { status: result.status, code, stage };
    });
  }
  assert.equal(
    (
      await fixture.ownerJson('/api/settings/storage', 'PATCH', {
        defaultStorageId: storageId,
      })
    ).status,
    200,
  );
  for (const visibility of ['public', 'private'] as const) {
    assert.equal(
      (
        await fixture.ownerJson('/api/settings/media', 'PATCH', {
          defaultVisibility: visibility,
        })
      ).status,
      200,
    );
    await check(
      `minimal-generated-curl-uses-current-default-${visibility}`,
      async () => {
        const result = await executeExample(fixture, 'minimal', key, { file });
        const detail = await successful(result, visibility);
        assert.deepEqual(
          db
            .select()
            .from(albumImages)
            .where(eq(albumImages.imageId, result.body.imageId))
            .all(),
          [],
        );
        assert.deepEqual(
          db
            .select()
            .from(imageTags)
            .where(eq(imageTags.imageId, result.body.imageId))
            .all(),
          [],
        );
        return detail;
      },
    );
  }
  assert.equal(
    (
      await fixture.ownerJson('/api/settings/media', 'PATCH', {
        defaultVisibility: 'public',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fixture.ownerJson('/api/settings/storage', 'PATCH', {
        defaultStorageId: null,
      })
    ).status,
    200,
  );
  const albums = db.transaction((tx) => [
    createAlbum(tx, { name: 'curl 一' }),
    createAlbum(tx, { name: 'curl 二' }),
  ]);
  const existingTag = db.transaction((tx) => getOrCreateTags(tx, ['go']))[0];
  await check(
    'full-generated-curl-repeated-album-and-tag-fields-private',
    async () => {
      const result = await executeExample(fixture, 'full', key, {
        file,
        storageId,
        albumIds: [albums[0].id, albums[1].id, albums[0].id],
      });
      const detail = await successful(result, 'private');
      assert.deepEqual(
        db
          .select()
          .from(albumImages)
          .where(eq(albumImages.imageId, result.body.imageId))
          .all()
          .map((row) => row.albumId)
          .sort(),
        albums.map((album) => album.id).sort(),
      );
      const assigned = db
        .select()
        .from(imageTags)
        .where(eq(imageTags.imageId, result.body.imageId))
        .all();
      assert.equal(assigned.length, 2);
      assert.ok(assigned.some((row) => row.tagId === existingTag.id));
      assert.deepEqual(
        db
          .select()
          .from(tags)
          .all()
          .map((row) => row.displayName)
          .sort(),
        ['go', '旅行'],
      );
      return {
        ...detail,
        albumCount: 2,
        tagCount: 2,
        matchedExistingTag: true,
      };
    },
  );
  return checks;
}
