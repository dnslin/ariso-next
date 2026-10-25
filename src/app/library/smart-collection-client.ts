import type { SmartCollectionRules } from '../../server/library/smart-rules';

export class SmartCollectionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function smartCollectionRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new SmartCollectionRequestError(
      init?.method && init.method !== 'GET'
        ? '连接中断，提交结果尚未确认。请先核对集合列表，勿重复创建。'
        : '集合读取失败，请检查网络后重试。',
      0,
    );
  }
  const body = await response.json();
  if (!response.ok)
    throw new SmartCollectionRequestError(
      body.message ?? '集合操作失败，请重试',
      response.status,
    );
  return body as T;
}
export async function resolveCollectionRules(rules: SmartCollectionRules) {
  return smartCollectionRequest<{ query: string }>(
    '/api/library/collections/resolve',
    { method: 'POST', body: JSON.stringify(rules) },
  );
}
