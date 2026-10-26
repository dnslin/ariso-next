import { browser } from 'wxt/browser';
import type { SourceRequest } from './types';
import { originPattern } from './permissions';

export const sourceRequestsKey = 'ariso.sourceRequest.';
export function sourceOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('图片来源地址无效');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('首版仅支持可直接读取的 HTTP(S) 网页图片');
  return url.origin;
}
export async function readSourceRequests(): Promise<SourceRequest[]> {
  const stored = await browser.storage.session.get(null);
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(sourceRequestsKey))
    .map(([, request]) => request as SourceRequest);
}
export function subscribeSourceRequests(
  listener: (requests: SourceRequest[]) => void,
) {
  let generation = 0;
  let subscribed = true;
  const changed = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (
      subscribed &&
      area === 'session' &&
      Object.keys(changes).some((key) => key.startsWith(sourceRequestsKey))
    ) {
      const current = ++generation;
      void readSourceRequests()
        .then((requests) => {
          if (subscribed && current === generation) listener(requests);
        })
        .catch((error) => {
          if (subscribed && current === generation)
            console.error('读取网页图片任务失败', error);
        });
    }
  };
  browser.storage.onChanged.addListener(changed);
  return () => {
    subscribed = false;
    generation++;
    browser.storage.onChanged.removeListener(changed);
  };
}
export async function dismissSourceRequest(id: string) {
  await browser.storage.session.remove(sourceRequestsKey + id);
}
export function hasSourcePermission(url: string) {
  sourceOrigin(url);
  return browser.permissions.contains({ origins: [originPattern(url)] });
}
export async function authorizeAndFetchSource(
  request: SourceRequest,
  maxFileBytes: number,
) {
  sourceOrigin(request.url);
  const permission = browser.permissions.request({
    origins: [originPattern(request.url)],
  });
  if (!(await permission))
    throw new Error('未允许读取图片来源网站，图片尚未加入队列');
  return fetchSource(request, maxFileBytes);
}
export async function fetchSource(
  request: SourceRequest,
  maxFileBytes: number,
): Promise<File> {
  sourceOrigin(request.url);
  const response = await fetch(request.url, {
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(60000),
  }).catch(() => {
    throw new Error(
      '无法读取网页图片，来源可能需要登录、已失效或存在防盗链限制。可改用本地图片。',
    );
  });
  if (!response.ok)
    throw new Error(
      `来源返回 HTTP ${response.status}，本次没有向 Ariso 上传图片`,
    );
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxFileBytes) {
    await response.body?.cancel();
    throw new Error('网页图片超过站点单图大小限制');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('图片来源没有返回文件内容');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxFileBytes) {
      await reader.cancel();
      throw new Error('网页图片超过站点单图大小限制');
    }
    chunks.push(new Uint8Array(value));
  }
  if (!bytes) throw new Error('图片来源返回了空文件');
  const mime =
    (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  const url = new URL(request.url);
  let name: string;
  try {
    name = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  } catch {
    name = '';
  }
  const supported =
    /\.(png|jpe?g|gif|webp|svg|avif|heic|heif|tiff?|bmp|ico)$/i.test(name);
  if (
    (!mime.startsWith('image/') && !supported) ||
    (mime &&
      !mime.startsWith('image/') &&
      !['application/octet-stream', 'binary/octet-stream'].includes(mime))
  )
    throw new Error('来源未返回可识别的图片文件');
  if (!name)
    name = `网页图片.${mime.split('/')[1]?.replace('svg+xml', 'svg') || 'png'}`;
  return new File(chunks, name, { type: mime || 'application/octet-stream' });
}
