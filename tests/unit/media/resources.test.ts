import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaResources } from '../../../src/server/media/resources.ts';

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    statfsSync: vi.fn(fs.statfsSync),
    statSync: vi.fn(fs.statSync),
  };
});

const MiB = 1024 * 1024;
let root: string;
let free: number;
const steps: Array<{ close(): void }> = [];
beforeEach(async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(statSync).mockImplementation(fs.statSync);
  root = mkdtempSync(join(tmpdir(), 'media-resources-'));
  free = 384 * MiB;
  vi.mocked(statfsSync).mockImplementation(
    () =>
      ({
        bavail: free,
        bsize: 1,
      }) as ReturnType<typeof statfsSync>,
  );
});
afterEach(() => {
  for (const step of steps.splice(0)) step.close();
  rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});
function begin(resources = createMediaResources(), name = 'job-1') {
  const temporaryDirectory = join(root, name);
  mkdirSync(temporaryDirectory);
  const step = resources.beginStep({
    temporaryDirectory,
    storageDirectory: root,
  });
  steps.push(step);
  return step;
}

it('allows a small output with only hundreds of MiB free and no task quota', async () => {
  const step = begin();
  expect(step.diskLimitBytes).toBe(128 * MiB);
  const parts = [];
  for await (const part of step.countOutput(
    Readable.from([Buffer.from('small output')]),
  ))
    parts.push(part);
  expect(Buffer.concat(parts).toString()).toBe('small output');
  expect(step.outputBytes).toBe(12);
});

it('does not promise the same cache space to concurrent steps on one filesystem', () => {
  const resources = createMediaResources();
  const first = begin(resources);
  const second = begin(resources, 'job-2');
  expect(first.diskLimitBytes + second.diskLimitBytes).toBeLessThanOrEqual(
    128 * MiB,
  );
  first.close();
  const third = begin(resources, 'job-3');
  expect(third.diskLimitBytes).toBe(128 * MiB);
});

it('rejects known writes that cannot fit and releases cancelled demand', () => {
  const resources = createMediaResources();
  expect(() => resources.reserveWrite('large', root, 129 * MiB)).toThrow(
    expect.objectContaining({ code: 'INSUFFICIENT_DISK_SPACE' }),
  );
  resources.reserveWrite('small', root, 64 * MiB);
  resources.releaseWrite('small');
  expect(begin(resources).diskLimitBytes).toBe(128 * MiB);
});

it('restores remaining demand once and decreases it as actual disk usage grows', () => {
  const resources = createMediaResources();
  resources.restoreWrites([
    { id: 'upload-1', path: root, remainingBytes: 64 * MiB },
  ]);
  resources.restoreWrites([
    { id: 'upload-1', path: root, remainingBytes: 64 * MiB },
  ]);
  free -= 32 * MiB;
  resources.consumeWrite('upload-1', 32 * MiB);
  expect(begin(resources).diskLimitBytes).toBe(64 * MiB);
});

it('checks every output chunk and aborts before consuming the low-water reserve', async () => {
  const step = begin();
  const source = new PassThrough();
  const output = step.countOutput(source);
  const iterator = output[Symbol.asyncIterator]();
  source.write(Buffer.from('first'));
  expect((await iterator.next()).value.toString()).toBe('first');
  free = 256 * MiB + 2;
  source.end(Buffer.from('too large'));
  await expect(iterator.next()).rejects.toMatchObject({
    code: 'INSUFFICIENT_DISK_SPACE',
  });
  expect(step.signal.aborted).toBe(true);
  expect(step.outputBytes).toBe(5);
});

it('monitors space while the image tool is running even without output', () => {
  vi.useFakeTimers();
  const step = begin();
  free = 255 * MiB;
  vi.advanceTimersByTime(100);
  expect(step.signal.aborted).toBe(true);
  expect(step.signal.reason).toMatchObject({ code: 'INSUFFICIENT_DISK_SPACE' });
});

it('checks an external storage filesystem independently from the temporary disk', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const external = join(root, 'external');
  const temporaryDirectory = join(root, 'job');
  mkdirSync(external);
  mkdirSync(temporaryDirectory);
  vi.mocked(statSync).mockImplementation(((path: string) => {
    const info = fs.statSync(path);
    if (path === external) info.dev += 1;
    return info;
  }) as typeof statSync);
  vi.mocked(statfsSync).mockImplementation(((path: string) => ({
    bavail: path === external ? 255 * MiB : free,
    bsize: 1,
  })) as typeof statfsSync);
  expect(() =>
    createMediaResources().beginStep({
      temporaryDirectory,
      storageDirectory: external,
    }),
  ).toThrow(
    expect.objectContaining({
      code: 'INSUFFICIENT_DISK_SPACE',
      path: external,
    }),
  );
});

it('subtracts only unused cache commitments because statfs already includes written cache', () => {
  free = 1024 * MiB;
  const resources = createMediaResources();
  const first = begin(resources);
  expect(first.diskLimitBytes).toBe(512 * MiB);
  const cachePath = join(root, 'job-1', 'magick-cache');
  writeFileSync(cachePath, Buffer.alloc(1024 * 1024));
  free -= statSync(cachePath).blocks * 512;
  const second = begin(resources, 'job-2');
  expect(second.diskLimitBytes).toBe(256 * MiB);
});

it('aborts if observed tool cache exceeds its step budget', () => {
  const temporaryDirectory = join(root, 'job-1');
  free = 256 * MiB;
  const step = begin();
  writeFileSync(join(temporaryDirectory, 'magick-cache'), Buffer.alloc(4096));
  expect(() => step.check()).toThrow(
    expect.objectContaining({ code: 'MEDIA_RESOURCE_LIMIT' }),
  );
  expect(step.signal.aborted).toBe(true);
});

it('propagates source failures without leaving the upstream stream alive', async () => {
  const step = begin();
  const source = new PassThrough();
  const output = step.countOutput(source);
  const result = (async () => {
    for await (const chunk of output) void chunk;
  })();
  const failure = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  source.destroy(failure);
  await expect(result).rejects.toMatchObject({ code: 'ENOSPC' });
  expect(source.destroyed).toBe(true);
});

it('destroys an idle upstream when the resource monitor cancels the output', async () => {
  const step = begin();
  const source = new PassThrough();
  const output = step.countOutput(source);
  const result = (async () => {
    for await (const chunk of output) void chunk;
  })();
  free = 255 * MiB;
  expect(() => step.check()).toThrow(
    expect.objectContaining({ code: 'INSUFFICIENT_DISK_SPACE' }),
  );
  await expect(result).rejects.toMatchObject({
    code: 'INSUFFICIENT_DISK_SPACE',
  });
  expect(source.destroyed).toBe(true);
});

it('allows four small concurrent outputs at 300 MiB without reserving unused cache as task quotas', async () => {
  free = 300 * MiB;
  const resources = createMediaResources();
  const active = Array.from({ length: 4 }, (_, index) =>
    begin(resources, `job-${index}`),
  );
  expect(
    active.reduce((total, step) => total + step.diskLimitBytes, 0),
  ).toBeLessThanOrEqual(44 * MiB);
  await Promise.all(
    active.map(async (step) => {
      const chunks = [];
      for await (const chunk of step.countOutput(
        Readable.from([Buffer.from('small')]),
      ))
        chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe('small');
    }),
  );
});

it('destroys an idle source when downstream stops before any output arrives', async () => {
  const step = begin();
  const source = new PassThrough();
  const output = step.countOutput(source);
  const closed = new Promise<void>((resolve) => output.once('close', resolve));
  output.destroy();
  await closed;
  expect(source.destroyed).toBe(true);
});

it('fails downstream when a tool closes its output without end or an error event', async () => {
  const step = begin();
  const source = new PassThrough();
  const output = step.countOutput(source);
  const result = (async () => {
    for await (const chunk of output) void chunk;
  })();
  source.destroy();
  await expect(result).rejects.toMatchObject({
    code: 'ERR_STREAM_PREMATURE_CLOSE',
  });
  expect(output.destroyed).toBe(true);
});
