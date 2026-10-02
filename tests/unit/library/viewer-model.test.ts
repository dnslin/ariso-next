import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initialViewerVersion,
  isViewerPreview,
  readViewerPreview,
  viewerVersionReason,
} from '../../../src/components/library/viewer-model';
import type { LibraryDetail } from '../../../src/server/library/detail-types';

function detail(available = ['original', 'compressed', 'thumbnail']) {
  return {
    id: 'image',
    format: 'png',
    animated: false,
    classification: 'static',
    storage: { id: 'local', name: '本地', enabled: true },
    trashedAt: null,
    deletionStatus: null,
    defaultVersion: 'watermark',
    versions: (
      ['original', 'compressed', 'thumbnail', 'watermark'] as const
    ).map((kind) => ({
      kind,
      saved: available.includes(kind),
      mime: 'image/png',
      previewPath: available.includes(kind) ? `/i/image?type=${kind}` : null,
      unavailableReason: null,
    })),
  } as LibraryDetail;
}
const version = (record: LibraryDetail, kind = 'original') =>
  record.versions.find((item) => item.kind === kind)!;
afterEach(() => vi.unstubAllGlobals());

describe('viewer version selection', () => {
  it('uses saved browser previews independently of the default delivery link', () => {
    expect(initialViewerVersion(detail())).toBe('compressed');
    expect(initialViewerVersion(detail(['original', 'thumbnail']))).toBe(
      'original',
    );
    expect(initialViewerVersion(detail(['thumbnail']))).toBe('thumbnail');
    expect(initialViewerVersion(detail([]))).toBe('original');
  });
  it('preserves animation and identifies a manually chosen static preview', () => {
    const animated = { ...detail(), animated: true };
    expect(initialViewerVersion(animated)).toBe('original');
    expect(isViewerPreview(animated, 'original')).toBe(false);
    expect(isViewerPreview(animated, 'compressed')).toBe(true);
    expect(
      isViewerPreview(
        { ...detail(), animated: null, classification: 'animated' },
        'compressed',
      ),
    ).toBe(true);
    expect(isViewerPreview(detail(), 'thumbnail')).toBe(true);
  });
  it.each(['svg', 'ico', 'tiff', 'heic', 'heif'])(
    'uses only the existing thumbnail for %s',
    (format) => {
      const special = { ...detail(), format };
      expect(initialViewerVersion(special)).toBe('thumbnail');
      expect(initialViewerVersion({ ...detail([]), format })).toBe('thumbnail');
    },
  );
  it('honors the media classification and excludes undecodable MIME types', () => {
    expect(
      initialViewerVersion({ ...detail(), classification: 'preview_only' }),
    ).toBe('thumbnail');
    const record = detail();
    record.versions = record.versions.map((item) => ({
      ...item,
      mime: item.kind === 'thumbnail' ? 'image/webp' : 'image/heic',
    }));
    expect(initialViewerVersion(record)).toBe('thumbnail');
    expect(viewerVersionReason(record, version(record))).toContain(
      '无法在查看器中预览',
    );
  });
  it('keeps an explicitly missing or attachment version unavailable', () => {
    const record = detail(['thumbnail']);
    expect(viewerVersionReason(record, version(record))).toBe(
      '此版本尚未保存。',
    );
    expect(
      viewerVersionReason(detail(), {
        ...version(detail()),
        previewPath: null,
      }),
    ).toContain('附件下载');
    expect(
      viewerVersionReason(detail(), {
        ...version(detail()),
        unavailableReason: '原图已经丢失',
      }),
    ).toBe('原图已经丢失');
  });
  it.each([
    [{ storage: { id: 'local', name: '本地', enabled: false } }, '存储已停用'],
    [{ trashedAt: '2026-10-02T00:00:00Z' }, '图片已移入回收站'],
    [{ deletionStatus: 'deleting' }, '图片正在删除'],
    [{ deletionStatus: 'cleanup_failed' }, '图片清理失败'],
  ] as const)('removes content after lifecycle changes', (change, reason) => {
    const record = { ...detail(), ...change } as LibraryDetail;
    expect(viewerVersionReason(record, version(record))).toContain(reason);
  });
});

class PreviewImage {
  static instances: PreviewImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  decode = vi.fn().mockResolvedValue(undefined);
  removeAttribute = vi.fn(() => {
    this.src = '';
  });
  constructor() {
    PreviewImage.instances.push(this);
  }
}
function preview(record = detail()) {
  PreviewImage.instances = [];
  vi.stubGlobal('Image', PreviewImage);
  const controller = new AbortController();
  const promise = readViewerPreview(record, controller.signal);
  return { promise, controller, image: PreviewImage.instances[0] };
}

it('waits for the actual delivery image and successful decode before navigation', async () => {
  const { promise, image } = preview();
  let finished = false;
  void promise.then(() => {
    finished = true;
  });
  expect(image.src).toBe('/i/image?type=compressed');
  expect(finished).toBe(false);
  let decoded!: () => void;
  image.decode.mockImplementation(
    () => new Promise<void>((resolve) => (decoded = resolve)),
  );
  image.onload!();
  expect(finished).toBe(false);
  decoded();
  await promise;
  expect(finished).toBe(true);
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
});

it('reports real image loading and decoding errors without choosing another version', async () => {
  const loading = preview();
  const loadingFailure = expect(loading.promise).rejects.toThrow('读取失败');
  loading.image.onerror!();
  await loadingFailure;
  expect(PreviewImage.instances).toHaveLength(1);
  expect(loading.image.src).toBe('/i/image?type=compressed');
  const decoding = preview();
  decoding.image.decode.mockRejectedValue(new Error('unsupported'));
  const decodingFailure = expect(decoding.promise).rejects.toThrow('无法解码');
  decoding.image.onload!();
  await decodingFailure;
  expect(PreviewImage.instances).toHaveLength(1);
});

it('cancels content loading and ignores a late decoder completion', async () => {
  const { promise, image, controller } = preview();
  let decoded!: () => void;
  image.decode.mockImplementation(
    () => new Promise<void>((resolve) => (decoded = resolve)),
  );
  image.onload!();
  const aborted = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await aborted;
  expect(image.removeAttribute).toHaveBeenCalledWith('src');
  expect(image.onload).toBeNull();
  decoded();
  await Promise.resolve();
});

it('allows an unavailable target as an explicit placeholder without loading bytes', async () => {
  const missing = preview(detail([]));
  await missing.promise;
  expect(PreviewImage.instances).toHaveLength(0);
  const disabled = preview({
    ...detail(),
    storage: { id: 'local', name: '本地', enabled: false },
  });
  await disabled.promise;
  expect(PreviewImage.instances).toHaveLength(0);
});
