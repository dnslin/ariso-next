import { once } from 'node:events';
import { open, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { responseStream } from '../../../src/server/delivery/stream.ts';

it('opening, Node prefetch and constructing Response do not count before a consumer reads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'delivery-stream-'));
  try {
    const path = join(directory, 'image');
    await writeFile(path, 'actual file bytes');
    const handle = await open(path);
    const source = handle.createReadStream();
    const readable = once(source, 'readable');
    source.read(0);
    await readable;
    expect(source.readableLength).toBeGreaterThan(0);
    const count = vi.fn();
    const errors = vi.fn();
    const response = new Response(
      responseStream(source, new AbortController().signal, count, errors),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(count).not.toHaveBeenCalled();
    expect(await response.text()).toBe('actual file bytes');
    expect(count).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
    await expect(handle.stat()).rejects.toMatchObject({ code: 'EBADF' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
