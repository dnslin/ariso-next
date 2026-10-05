type FieldMessage = { field: string; message: string };

export class AccountRequestError extends Error {
  readonly code?: string;
  readonly fields: FieldMessage[];
  constructor(
    readonly status: number,
    body: unknown,
  ) {
    const failure =
      body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const message =
      'message' in failure && typeof failure.message === 'string'
        ? failure.message
        : '账号请求失败';
    const code =
      'code' in failure && typeof failure.code === 'string'
        ? failure.code
        : undefined;
    super(`${message}（HTTP ${status}${code ? ` / ${code}` : ''}）`);
    this.code = code;
    this.fields =
      'fields' in failure && Array.isArray(failure.fields)
        ? failure.fields.filter(
            (field): field is FieldMessage =>
              field !== null &&
              typeof field === 'object' &&
              typeof field.field === 'string' &&
              typeof field.message === 'string',
          )
        : [];
  }
}

export async function accountRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let body;
  try {
    body = await response.json();
  } catch (cause) {
    if (!response.ok)
      throw new AccountRequestError(response.status, {
        message: '账号响应格式异常',
      });
    throw new Error(`无法读取账号修改结果（HTTP ${response.status}）`, {
      cause,
    });
  }
  if (!response.ok) throw new AccountRequestError(response.status, body);
  return body;
}

export async function readAccountEmail(signal?: AbortSignal): Promise<string> {
  const account = await accountRequest<{ email: string } | null>(
    '/api/account',
    { signal },
  );
  if (typeof account?.email !== 'string')
    throw new Error('账号响应缺少登录邮箱');
  return account.email;
}
