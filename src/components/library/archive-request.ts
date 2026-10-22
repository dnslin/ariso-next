import type {
  ArchivePreparation,
  ArchiveRequest,
} from '../../server/library/archive-types';

export class ArchiveRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requestArchivePreparation(
  input: ArchiveRequest,
  signal: AbortSignal,
): Promise<ArchivePreparation> {
  const response = await fetch('/api/images/archives', {
    method: 'POST',
    signal,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  let body: (ArchivePreparation & { message?: string }) | null;
  try {
    body = await response.json();
  } catch {
    throw new ArchiveRequestError(
      `打包下载响应无法读取（HTTP ${response.status}），请重试。`,
      response.status,
    );
  }
  if (!response.ok || !body)
    throw new ArchiveRequestError(
      body?.message ?? `打包下载请求失败（HTTP ${response.status}），请重试。`,
      response.status,
    );
  return body;
}

export function startArchiveDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.append(link);
  link.click();
  link.remove();
}
