import * as fs from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { finished } from 'node:stream/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { createMediaResources } from '../../../src/server/media/resources.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { prepareLocalObjectPath } from '../../../src/server/storage/local.ts';
import {
  createPublicReceipt,
  receivePublicSession,
} from '../../../src/server/upload/public-receive.ts';
import { getSession } from '../../../src/server/upload/sessions.ts';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) };
});

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => {
  vi.restoreAllMocks();
  fixture.close();
});

it.each(['destination-open', 'disk-reservation'] as const)(
  'closes the already-open source before cleanup when %s fails before the copy pipeline takes ownership',
  async (failure) => {
    const resources = createMediaResources();
    const context = {
      ...fixture,
      temporaryRoot: join(fixture.storageRoot, 'tmp'),
      resources,
    };
    const id = createPublicReceipt(context);
    const temporaryPath = getSession(fixture.db, id).temporaryPath!;
    const target = prepareLocalObjectPath(
      fixture.storageRoot,
      fixture.storage,
      `uploads/${id}.partial`,
    );
    if (failure === 'destination-open')
      await writeFile(target, 'existing target');
    else {
      const reserve = resources.reserveWrite;
      vi.spyOn(resources, 'reserveWrite').mockImplementation(
        (writeId, path, bytes) => {
          if (writeId === target)
            throw Object.assign(
              new Error('controlled copy disk reservation failure'),
              {
                code: 'INSUFFICIENT_DISK_SPACE',
              },
            );
          reserve(writeId, path, bytes);
        },
      );
    }
    // Opening the source ourselves makes descriptor ownership deterministic;
    // the destination failure must close it even before pipeline is reached.
    const { createReadStream } =
      await vi.importActual<typeof import('node:fs')>('node:fs');
    let descriptor: number | undefined;
    let source: fs.ReadStream | undefined;
    vi.spyOn(fs, 'createReadStream').mockImplementation((path) => {
      descriptor = fs.openSync(path, 'r');
      source = createReadStream(path, { fd: descriptor, autoClose: true });
      return source;
    });
    const bytes = await readFile('tests/fixtures/runtime/images/sample.png');
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(bytes)]), 'source.png');
    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body,
    });
    try {
      await expect(
        receivePublicSession(
          context,
          id,
          request,
          new AbortController().signal,
          'non-secret-token-id',
        ),
      ).rejects.toMatchObject({
        code:
          failure === 'destination-open' ? 'EEXIST' : 'INSUFFICIENT_DISK_SPACE',
        stage: 'finalizing',
      });
      expect(descriptor).toEqual(expect.any(Number));
      expect(source?.closed).toBe(true);
      expect(() => fs.fstatSync(descriptor!)).toThrow(
        expect.objectContaining({ code: 'EBADF' }),
      );
      expect(getSession(fixture.db, id)).toMatchObject({
        state: 'failed',
        imageId: null,
        jobId: null,
        cleanupStatus: 'none',
        temporaryPath: null,
        temporaryKey: null,
        finalKey: null,
      });
      for (const table of [mediaImages, mediaJobs, mediaObjects, mediaVersions])
        expect(fixture.db.select().from(table).all()).toEqual([]);
      await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(dirname(temporaryPath))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      // Preserve fixture teardown if a future regression leaves this descriptor open.
      source?.destroy();
      if (source)
        await finished(source, { cleanup: true }).catch(() => undefined);
    }
  },
);
