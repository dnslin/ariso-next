import type {
  LibraryCopyRequest,
  LibraryCopyResponse,
} from '../../server/library/copy-types';

export class CopyRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// SQLite BINARY compares UTF-8 bytes; Unicode code-point order has the same order.
function compareIds(left: string, right: string) {
  const a = Array.from(left);
  const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const difference = a[index].codePointAt(0)! - b[index].codePointAt(0)!;
    if (difference) return difference;
  }
  return a.length - b.length;
}

/** All chunks use the explicit selection and query captured when the panel opened. */
export async function requestCopy(
  request: LibraryCopyRequest,
  signal: AbortSignal,
): Promise<LibraryCopyResponse & { text: string }> {
  const items: LibraryCopyResponse['items'] = [];
  const unavailable: LibraryCopyResponse['unavailable'] = [];
  let sort: LibraryCopyResponse['sort'] = 'uploaded_desc';
  for (let offset = 0; offset < request.ids.length; offset += 200) {
    signal.throwIfAborted();
    const response = await fetch('/api/images/copy', {
      method: 'POST',
      signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        ids: request.ids.slice(offset, offset + 200),
      }),
    });
    let body: (LibraryCopyResponse & { message?: string }) | null;
    try {
      body = await response.json();
    } catch {
      throw new CopyRequestError(
        `复制响应无法读取（HTTP ${response.status}），请重试。`,
        response.status,
      );
    }
    if (!response.ok)
      throw new CopyRequestError(
        body?.message ?? `复制请求失败（HTTP ${response.status}），请重试。`,
        response.status,
      );
    if (!body)
      throw new CopyRequestError(
        `复制响应为空（HTTP ${response.status}），请重试。`,
        response.status,
      );
    items.push(...body.items);
    unavailable.push(...body.unavailable);
    sort = body.sort;
  }
  signal.throwIfAborted();
  items.sort((a, b) => {
    const order = a.sortKey.value - b.sortKey.value;
    return order
      ? sort.endsWith('desc')
        ? -order
        : order
      : compareIds(a.sortKey.id, b.sortKey.id);
  });
  return {
    items,
    unavailable,
    sort,
    text: items.map((item) => item.line).join('\n'),
  };
}

export async function writeCopyText(text: string) {
  if (!text) return 'empty' as const;
  try {
    await navigator.clipboard.writeText(text);
    return 'copied' as const;
  } catch {
    return 'manual' as const;
  }
}
