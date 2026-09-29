import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  access,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execa } from 'execa';
import { afterEach, describe, expect, it } from 'vitest';
import { startSvgPreview } from '../../../src/server/media/svg.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
  readObject,
} from '../../../src/server/storage/local.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import { processMediaJob } from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture(body: string, width = 32, height = 32, prefix = '') {
  const workspace = await mkdtemp(join(tmpdir(), 'ariso-svg-'));
  directories.push(workspace);
  const source = join(workspace, 'source.svg');
  const output = join(workspace, 'preview.png');
  const text = `${prefix}<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
  await writeFile(source, text);
  return { workspace, source, output, text };
}

describe('isolated static SVG preview', () => {
  it('renders SVG text using trusted installed fonts', async () => {
    const f = await fixture(
      '<text x="0" y="25" font-family="sans-serif" font-size="20">SVG</text>',
      80,
      32,
    );
    const { settled } = startSvgPreview(
      f.source,
      f.output,
      f.workspace,
      new AbortController().signal,
    );
    expect(await settled).toBeUndefined();
    const { stdout } = await execa('magick', [
      f.output,
      '-alpha',
      'extract',
      '-format',
      '%[fx:mean]',
      'info:',
    ]);
    expect(Number(stdout)).toBeGreaterThan(0.01);
    expect(Number(stdout)).toBeLessThan(0.5);
  });

  it('persists failed preview state while retaining the accepted dangerous original', async () => {
    const f = await fixture('<image href="file:///etc/passwd"/>');
    const storageRoot = join(f.workspace, 'storage');
    const temporaryRoot = join(f.workspace, 'tmp');
    await mkdir(storageRoot);
    await mkdir(temporaryRoot);
    const connection = openRuntimeDatabase(join(f.workspace, 'ariso.db'));
    try {
      const { db } = connection;
      migrateRuntimeDatabase(db, resolve('drizzle'));
      prepareInitialStorage(db, { storage: storageRoot });
      db.transaction(prepareInitialMedia);
      const storage = resolveUploadStorage(db);
      const plan = planLocalWrite('uploads');
      const bytes = Buffer.from(f.text);
      await writeObject(storageRoot, storage, plan, Readable.from(bytes));
      const accepted = db.transaction((tx) =>
        acceptOriginal(tx, {
          imageId: randomUUID(),
          storageId: storage.id,
          key: plan.key,
          originalName: 'unsafe.svg',
          visibility: 'public',
          format: 'SVG',
          mime: 'image/svg+xml',
          byteSize: bytes.length,
          classification: null,
          width: 32,
          height: 32,
          animated: false,
          pageCount: 1,
          snapshot: createProcessingSnapshot(tx),
          expectedVersions: ['thumbnail'],
        }),
      );
      const job = claimNextMediaJob(db)!;
      expect(job).not.toBeNull();
      await processMediaJob(
        {
          db,
          storageRoot,
          temporaryRoot,
          logger: createRuntimeLogger('svg.test', 'fatal'),
        },
        job.id,
      );
      const state = getImageAccessState(db, accepted.imageId)!;
      expect(state.image).toMatchObject({
        classification: 'preview_only',
        processingStatus: 'failed',
      });
      expect(state.latestJob?.error).toContain('SVG external resource');
      expect(
        state.versions
          .filter((version) => version.saved)
          .map((version) => version.kind),
      ).toEqual(['original']);
      expect(
        state.versions.find((version) => version.kind === 'compressed')
          ?.applicable,
      ).toBe(false);
      const original = await readObject(
        storageRoot,
        storage,
        plan.key,
        'image/svg+xml',
      );
      const chunks: Buffer[] = [];
      for await (const chunk of original.stream)
        chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(bytes);
    } finally {
      connection.close();
    }
  });

  it.each([
    ['solid', '<rect width="32" height="32" fill="blue"/>', [0, 0, 255]],
    [
      'internal use',
      '<defs><rect id="shape" width="32" height="32" fill="lime"/></defs><use href="#shape"/>',
      [0, 255, 0],
    ],
    [
      'internal gradient',
      '<defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="32" height="32" fill="url(#g)"/>',
      null,
    ],
  ])(
    'renders %s and preserves original bytes',
    async (_name, body, expected) => {
      const f = await fixture(body as string);
      const { child, settled } = startSvgPreview(
        f.source,
        f.output,
        f.workspace,
        new AbortController().signal,
      );
      expect(await settled).toBeUndefined();
      expect(JSON.parse((await child).stdout)).toEqual({
        width: 32,
        height: 32,
      });
      const { stdout } = await execa(
        'magick',
        [f.output, '-crop', '1x1+16+16', '+repage', '-depth', '8', 'rgb:-'],
        { encoding: 'buffer' },
      );
      if (expected) expect([...stdout]).toEqual(expected);
      else {
        expect(stdout[0]).toBeGreaterThan(90);
        expect(stdout[0]).toBeLessThan(160);
        expect(stdout[1]).toBe(0);
        expect(stdout[2]).toBeGreaterThan(90);
        expect(stdout[2]).toBeLessThan(160);
      }
      expect(await readFile(f.source, 'utf8')).toBe(f.text);
    },
  );

  it('scales a large canvas before raster allocation and retains original dimensions', async () => {
    const f = await fixture(
      '<rect width="1000000" height="500000" fill="blue"/>',
      1000000,
      500000,
    );
    const { child, settled } = startSvgPreview(
      f.source,
      f.output,
      f.workspace,
      new AbortController().signal,
    );
    expect(await settled).toBeUndefined();
    expect(JSON.parse((await child).stdout)).toEqual({
      width: 1000000,
      height: 500000,
    });
    const { stdout } = await execa('magick', [
      'identify',
      '-format',
      '%wx%h',
      f.output,
    ]);
    expect(stdout).toBe('640x320');
  });

  it('rejects network, local, entity and active resources without producing preview or fetching', async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url!);
      response.end('canary');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/canary`;
    try {
      for (const [body, prefix] of [
        [`<image href="${url}"/>`, ''],
        ['<image href="file:///etc/passwd"/>', ''],
        [`<style>@import url('${url}');</style>`, ''],
        [`<rect style="fill:u\\72l('${url}')"/>`, ''],
        [`<script>fetch('${url}')</script>`, ''],
        ['<rect onload="alert(1)"/>', ''],
        ['<animate attributeName="fill" values="red;blue"/>', ''],
        ['', `<!DOCTYPE svg [<!ENTITY payload SYSTEM "${url}">]>`],
        ['', '<!DOCTYPE svg [<!ENTITY payload SYSTEM "file:///etc/passwd">]>'],
      ]) {
        const f = await fixture(body, 32, 32, prefix);
        const { settled } = startSvgPreview(
          f.source,
          f.output,
          f.workspace,
          new AbortController().signal,
        );
        expect(await settled).toBeInstanceOf(Error);
        await expect(access(f.output)).rejects.toMatchObject({
          code: 'ENOENT',
        });
        expect(await readFile(f.source, 'utf8')).toBe(f.text);
      }
      expect(requests).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('terminates a running runner when cancelled before rendering', async () => {
    const f = await fixture('<rect width="32" height="32" fill="blue"/>');
    const controller = new AbortController();
    const { child, settled } = startSvgPreview(
      f.source,
      f.output,
      f.workspace,
      controller.signal,
    );
    child.nodeChildProcess.once('spawn', () => controller.abort());
    expect(await settled).toBeInstanceOf(Error);
    expect(child.pid).toBeTypeOf('number');
    expect(() => process.kill(child.pid!, 0)).toThrow();
    await expect(access(f.output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
