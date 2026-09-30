import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadController } from '../../../src/components/upload/controller.ts';
import type { CreateUploadTransport } from '../../../src/components/upload/types.ts';
import {
  captureUploadClipboard,
  captureUploadDrop,
  scanUploadInput,
} from '../../../src/components/upload/input.ts';

const controllers: UploadController[] = [];
afterEach(() => {
  controllers.forEach((controller) => controller.destroy());
  controllers.length = 0;
  vi.restoreAllMocks();
});
function setup(queueLimit = 500) {
  const request = vi.fn<typeof fetch>();
  const transports: {
    destroy: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
  }[] = [];
  const createTransport = vi.fn<CreateUploadTransport>(() => {
    const transport = { destroy: vi.fn(), upload: vi.fn() };
    transports.push(transport);
    return transport;
  });
  const controller = new UploadController({
    maxFileBytes: 10,
    queueLimit,
    request,
    createTransport,
  });
  controllers.push(controller);
  return { controller, request, createTransport, transports };
}
const image = (name = 'photo.png', type = 'image/png', size = 1) =>
  new File(['x'.repeat(size)], name, { type });
function fileEntry(file: File) {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    fullPath: `/folder/${file.name}`,
    file: (done: FileCallback) => done(file),
  } as FileSystemFileEntry;
}
function directory(
  name: string,
  batches: FileSystemEntry[][],
  failure?: string,
) {
  const readEntries = vi.fn(
    (done: FileSystemEntriesCallback, fail: ErrorCallback) => {
      if (failure) fail(new DOMException(failure, 'NotReadableError'));
      else done(batches.shift() ?? []);
    },
  );
  return {
    isDirectory: true,
    isFile: false,
    name,
    fullPath: `/${name}`,
    createReader: () => ({ readEntries }),
  } as unknown as FileSystemDirectoryEntry;
}
function transferItem(file: File | null, entry?: FileSystemEntry) {
  return {
    kind: 'file',
    type: file?.type ?? '',
    getAsFile: vi.fn(() => file),
    webkitGetAsEntry: vi.fn(() => entry ?? null),
  } as unknown as DataTransferItem;
}

describe('upload input adapters', () => {
  it('reads every directory batch recursively without retaining paths or creating empty rows', async () => {
    const c = setup();
    const child = directory('nested', [[fileEntry(image('same.png'))]]);
    const empty = directory('empty', []);
    const root = directory('root', [
      [child, empty],
      [fileEntry(image('.photo'))],
    ]);
    const report = await scanUploadInput(
      { kind: 'drop', entries: [root] },
      c.controller,
    );
    expect(report).toMatchObject({ discovered: 2, added: 2, cancelled: false });
    expect(Object.values(report.rejected).every((count) => count === 0)).toBe(
      true,
    );
    expect(c.controller.snapshot.map((item) => item.name)).toEqual([
      'same.png',
      '.photo',
    ]);
    expect(
      c.createTransport.mock.calls.every(([file]) => !file.webkitRelativePath),
    ).toBe(true);
    expect(c.request).not.toHaveBeenCalled();
    c.transports.forEach((transport) =>
      expect(transport.upload).not.toHaveBeenCalled(),
    );
  });
  it('summarizes mixed failures separately, preserves valid files and continues after a failed directory', async () => {
    const c = setup(2);
    const report = await scanUploadInput(
      {
        kind: 'drop',
        entries: [
          image('first.png'),
          directory('locked', [], '没有目录读取权限'),
          image('bad.pdf', 'application/pdf'),
          image('empty.png', 'image/png', 0),
          image('large.png', 'image/png', 11),
          image('bad\u0000.png'),
          image('second.heic', 'image/heic'),
          image('extra.png'),
          image('also-bad.pdf', 'application/pdf'),
        ],
      },
      c.controller,
    );
    expect(report).toMatchObject({
      discovered: 8,
      added: 2,
      rejected: {
        format: 2,
        empty: 1,
        size: 1,
        capacity: 1,
        permission: 1,
        name: 1,
      },
      cancelled: false,
      permissionError: '/locked：没有目录读取权限',
    });
    expect(c.controller.snapshot.map((item) => item.name)).toEqual([
      'first.png',
      'second.heic',
    ]);
  });
  it('can cancel while a native directory read is pending and ignores late callbacks', async () => {
    const c = setup();
    const abort = new AbortController();
    let done!: FileCallback;
    const waiting = {
      ...fileEntry(image()),
      file: (callback: FileCallback) => {
        done = callback;
      },
    };
    const pending = scanUploadInput(
      { kind: 'drop', entries: [waiting] },
      c.controller,
      { signal: abort.signal },
    );
    abort.abort();
    expect(await pending).toMatchObject({
      cancelled: true,
      discovered: 0,
      added: 0,
      rejected: { permission: 0 },
    });
    done(image('late.png'));
    await Promise.resolve();
    expect(c.controller.snapshot).toEqual([]);
  });
  it('yields between segments so cancellation retains earlier rows and later selection still works', async () => {
    const c = setup();
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 0);
    const report = await scanUploadInput(
      { kind: 'files', files: Array.from({ length: 100 }, () => image()) },
      c.controller,
      { signal: abort.signal },
    );
    expect(report).toMatchObject({ cancelled: true, added: 20 });
    expect(c.controller.snapshot).toHaveLength(20);
    const resumed = await scanUploadInput(
      { kind: 'files', files: [image()] },
      c.controller,
    );
    expect(resumed).toMatchObject({ cancelled: false, added: 1 });
    expect(new Set(c.controller.snapshot.map((item) => item.id)).size).toBe(21);
  });
  it('does not enqueue after the queue owner is destroyed', async () => {
    const c = setup();
    const report = await scanUploadInput(
      { kind: 'files', files: [image(), image()] },
      c.controller,
      {
        onProgress: (progress) => {
          if (progress.added === 1) c.controller.destroy();
        },
      },
    );
    expect(report.cancelled).toBe(true);
    expect(c.controller.snapshot).toEqual([]);
    expect(c.createTransport).toHaveBeenCalledOnce();
  });
  it('captures drag data synchronously and keeps a plain-file fallback without directory support', async () => {
    const c = setup();
    const entry = directory('empty', []);
    const item = transferItem(null, entry);
    const source = captureUploadDrop({
      items: [item] as unknown as DataTransferItemList,
      files: [] as unknown as FileList,
    });
    expect(item.webkitGetAsEntry).toHaveBeenCalledOnce();
    expect(item.getAsFile).not.toHaveBeenCalled();
    expect(await scanUploadInput(source, c.controller)).toMatchObject({
      added: 0,
    });
    const plain = transferItem(image());
    Object.defineProperty(plain, 'webkitGetAsEntry', { value: undefined });
    const fallback = captureUploadDrop({
      items: [plain] as unknown as DataTransferItemList,
      files: [] as unknown as FileList,
    });
    expect(plain.getAsFile).toHaveBeenCalledOnce();
    expect(await scanUploadInput(fallback, c.controller)).toMatchObject({
      added: 1,
    });
    const filesOnly = captureUploadDrop({
      items: [] as unknown as DataTransferItemList,
      files: [image()] as unknown as FileList,
    });
    expect(await scanUploadInput(filesOnly, c.controller)).toMatchObject({
      added: 1,
    });
  });
  it('only reads clipboard image files and names unnamed screenshots by declared format', async () => {
    const c = setup();
    vi.spyOn(Date, 'now').mockReturnValue(123456);
    const text = { kind: 'string', type: 'text/plain', getAsFile: vi.fn() };
    const pdf = transferItem(image('doc.pdf', 'application/pdf'));
    const items = [
      text,
      pdf,
      transferItem(image('', 'image/png')),
      transferItem(image('', 'image/jpeg')),
      transferItem(image('image.png', 'image/png')),
      transferItem(image('named.png')),
    ];
    const source = captureUploadClipboard({
      items: items as unknown as DataTransferItemList,
    });
    expect(text.getAsFile).not.toHaveBeenCalled();
    expect(pdf.getAsFile).not.toHaveBeenCalled();
    expect(await scanUploadInput(source, c.controller)).toMatchObject({
      added: 4,
    });
    expect(c.controller.snapshot.map((item) => item.name)).toEqual([
      '粘贴图片-123456-1.png',
      '粘贴图片-123456-2.jpg',
      '粘贴图片-123456-3.png',
      'named.png',
    ]);
  });
  it('reports actual file read errors while keeping successful siblings', async () => {
    const c = setup();
    const unreadable = {
      ...fileEntry(image('locked.png')),
      file: (_done: FileCallback, fail: ErrorCallback) =>
        fail(new DOMException('文件无法读取', 'NotReadableError')),
    };
    const report = await scanUploadInput(
      { kind: 'drop', entries: [unreadable, image()] },
      c.controller,
    );
    expect(report).toMatchObject({
      added: 1,
      rejected: { permission: 1 },
      permissionError: '/folder/locked.png：文件无法读取',
    });
  });
  it('does not disguise internal queue failures as directory permission failures', async () => {
    const add = vi.fn(() => {
      throw new Error('transport creation failed');
    });
    await expect(
      scanUploadInput({ kind: 'drop', entries: [fileEntry(image())] }, { add }),
    ).rejects.toThrow('transport creation failed');
  });
});

describe('shared admission and resource ownership', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', true],
    ['photo.png', 'image/png', true],
    ['photo.webp', 'image/webp', true],
    ['photo.avif', 'image/avif', true],
    ['photo.bmp', 'image/bmp', true],
    ['photo.tiff', 'image/tiff', false],
    ['photo.heic', 'image/heic', false],
    ['photo.heif', 'image/heif', false],
    ['photo.gif', 'image/gif', true],
    ['photo.ico', 'image/x-icon', true],
    ['photo.svg', 'image/svg+xml', false],
    ['spoofed.png', 'image/svg+xml', false],
    ['unknown.heic', '', false],
    ['.photo', '', false],
    ['photo', '', false],
    ['photo', 'application/octet-stream', false],
  ])('admits %s without requiring browser decode', (name, type, preview) => {
    const c = setup();
    const objectUrl = vi.spyOn(URL, 'createObjectURL');
    expect(c.controller.add(image(name, type))).toBeNull();
    expect(!!c.controller.snapshot[0].previewUrl).toBe(preview);
    expect(objectUrl).toHaveBeenCalledTimes(preview ? 1 : 0);
  });
  it('normalizes names exactly as the API before giving a file to Uppy', () => {
    const c = setup();
    for (const [input, expected] of [
      ['C:\\photos\\旅行.final.JPG', '旅行.final.JPG'],
      ['/a/.photo', '.photo'],
      ['', 'image'],
      ['.', 'image'],
      ['..', 'image'],
      ['photo.', 'photo.'],
    ]) {
      expect(c.controller.add(image(input))).toBeNull();
      expect(c.controller.snapshot.at(-1)?.name).toBe(expected);
      expect(c.createTransport.mock.calls.at(-1)?.[0].name).toBe(expected);
    }
    expect(c.controller.add(image('😀'.repeat(255)))).toBeNull();
    expect(c.controller.add(image('😀'.repeat(256)))).toMatchObject({
      reason: 'name',
    });
    expect(c.controller.add(image('a\u0000.png'))).toMatchObject({
      reason: 'name',
    });
  });
  it('accepts a file at the exact byte limit, keeps duplicate IDs independent and releases a full queue', async () => {
    const c = setup();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const same = image('same.png', 'image/png', 10);
    const report = await scanUploadInput(
      { kind: 'files', files: Array.from({ length: 501 }, () => same) },
      c.controller,
    );
    expect(report).toMatchObject({ added: 500, rejected: { capacity: 1 } });
    expect(new Set(c.controller.snapshot.map((item) => item.id)).size).toBe(
      500,
    );
    expect(c.request).not.toHaveBeenCalled();
    const first = c.controller.snapshot[0];
    c.controller.remove(first.id);
    expect(revoke).toHaveBeenCalledWith(first.previewUrl);
    c.controller.destroy();
    expect(c.controller.snapshot).toEqual([]);
    expect(revoke).toHaveBeenCalledTimes(500);
    c.transports.forEach((transport) =>
      expect(transport.destroy).toHaveBeenCalledOnce(),
    );
  });
});
