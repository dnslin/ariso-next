import type { UploadController } from './controller.ts';

export type UploadInputFailure = {
  reason: 'format' | 'empty' | 'size' | 'capacity' | 'name' | 'closed';
  message: string;
};

const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/heic-sequence': 'heic',
  'image/heif-sequence': 'heif',
  'image/gif': 'gif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/svg+xml': 'svg',
};
const extensions = /\.(jpe?g|png|webp|avif|bmp|tiff?|heic|heif|gif|ico|svg)$/iu;
const unpreviewable = /\.(tiff?|heic|heif|svg)$/iu;
export const uploadAccept =
  '.jpg,.jpeg,.png,.webp,.avif,.bmp,.tif,.tiff,.heic,.heif,.gif,.ico,.svg';

/** Candidate checks only. The server identifies the actual uploaded format. */
export function isUploadImage(file: File) {
  if (extensions.test(file.name) || mimeExtensions[file.type]) return true;
  const name = file.name.split(/[\\/]/u).at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  // Hidden/extensionless files often have no MIME in the browser. Let the server
  // identify them; an explicitly unsupported suffix/MIME is still rejected.
  return (
    (!file.type || file.type === 'application/octet-stream') &&
    (dot <= 0 || dot === name.length - 1)
  );
}
export function canPreviewUpload(file: File) {
  return (
    (extensions.test(file.name) || !!mimeExtensions[file.type]) &&
    !unpreviewable.test(file.name) &&
    !['tiff', 'heic', 'heif', 'svg'].includes(mimeExtensions[file.type])
  );
}

export type UploadInputSource =
  | { kind: 'files'; files: Iterable<File> }
  | { kind: 'drop'; entries: readonly (FileSystemEntry | File)[] }
  | { kind: 'clipboard'; files: readonly File[] };
export type UploadInputReport = {
  discovered: number;
  added: number;
  rejected: Record<
    'format' | 'empty' | 'size' | 'capacity' | 'permission' | 'name',
    number
  >;
  cancelled: boolean;
  permissionError?: string;
};

/** Capture while the drop's data store is still readable, before any await. */
export function captureUploadDrop(
  transfer: Pick<DataTransfer, 'items' | 'files'>,
): UploadInputSource {
  const entries: (FileSystemEntry | File)[] = [];
  for (const item of transfer.items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    const file = entry ? null : item.getAsFile();
    if (entry) entries.push(entry);
    else if (file) entries.push(file);
  }
  if (!entries.length) entries.push(...transfer.files);
  return { kind: 'drop', entries };
}
/** Text and URLs are deliberately outside the upload input contract. */
export function captureUploadClipboard(
  transfer: Pick<DataTransfer, 'items'>,
): UploadInputSource {
  const files: File[] = [];
  for (const item of transfer.items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return { kind: 'clipboard', files };
}

/** Directory readers may return several batches; never materialize a whole tree. */
export async function scanUploadInput(
  source: UploadInputSource,
  controller: Pick<UploadController, 'add'>,
  options: {
    signal?: AbortSignal;
    onProgress?: (report: UploadInputReport) => void;
  } = {},
): Promise<UploadInputReport> {
  const report: UploadInputReport = {
    discovered: 0,
    added: 0,
    rejected: {
      format: 0,
      empty: 0,
      size: 0,
      capacity: 0,
      permission: 0,
      name: 0,
    },
    cancelled: false,
  };
  const publish = () =>
    options.onProgress?.({ ...report, rejected: { ...report.rejected } });
  const check = () => {
    if (options.signal?.aborted || report.cancelled) {
      report.cancelled = true;
      return false;
    }
    return true;
  };
  let visited = 0;
  const yieldSegment = async () => {
    if (++visited % 20 === 0) await new Promise((done) => setTimeout(done, 0));
    return check();
  };
  const read = <T>(
    entry: FileSystemEntry,
    operation: (
      done: (value: T) => void,
      fail: (error: DOMException) => void,
    ) => void,
  ) =>
    new Promise<T>((resolve, reject) => {
      const signal = options.signal;
      const abort = () =>
        finish(
          undefined,
          signal?.reason ?? new DOMException('扫描已取消', 'AbortError'),
        );
      const finish = (value?: T, error?: unknown) => {
        signal?.removeEventListener('abort', abort);
        if (error !== undefined) reject(error);
        else resolve(value as T);
      };
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      try {
        operation(
          (value) => finish(value),
          (error) => finish(undefined, error),
        );
      } catch (error) {
        finish(undefined, error);
      }
    }).catch((error: unknown) => {
      if (check()) {
        report.rejected.permission++;
        report.permissionError = `${entry.fullPath || entry.name}：${error instanceof Error ? error.message : String(error)}`;
        publish();
      }
      return null;
    });
  let screenshot = 0;
  const pastedAt = Date.now();
  const add = (file: File) => {
    if (!check()) return;
    report.discovered++;
    if (
      source.kind === 'clipboard' &&
      (!file.name || file.name === 'image.png')
    ) {
      const extension = mimeExtensions[file.type];
      if (extension)
        file = new File(
          [file],
          `粘贴图片-${pastedAt}-${++screenshot}.${extension}`,
          {
            type: file.type,
            lastModified: file.lastModified,
          },
        );
    }
    const failure = controller.add(file);
    if (!failure) report.added++;
    else if (failure.reason === 'closed') report.cancelled = true;
    else report.rejected[failure.reason]++;
    publish();
  };
  const visit = async (entry: FileSystemEntry | File): Promise<void> => {
    if (!check()) return;
    if (entry instanceof File) add(entry);
    else if (entry.isFile) {
      const file = await read<File>(entry, (done, fail) =>
        (entry as FileSystemFileEntry).file(done, fail),
      );
      if (file) add(file);
    } else if (entry.isDirectory) {
      const reader = await read<FileSystemDirectoryReader>(entry, (done) =>
        done((entry as FileSystemDirectoryEntry).createReader()),
      );
      if (!reader) {
        await yieldSegment();
        return;
      }
      while (check()) {
        const children = await read<FileSystemEntry[]>(entry, (done, fail) =>
          reader.readEntries(done, fail),
        );
        if (!children?.length) break;
        for (const child of children) {
          await visit(child);
          if (!check()) break;
        }
      }
    }
    await yieldSegment();
  };
  publish();
  if (source.kind === 'drop') {
    for (const entry of source.entries) {
      await visit(entry);
      if (!check()) break;
    }
  } else {
    for (const file of source.files) {
      if (!check()) break;
      add(file);
      await yieldSegment();
    }
  }
  check();
  publish();
  return report;
}
