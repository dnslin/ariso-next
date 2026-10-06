import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { getAuth } from './auth.ts';
import { requireOwnerSession } from './owner.ts';

type TokenAuth = NonNullable<ReturnType<typeof getAuth>>;
type TokenRecord = Pick<
  Awaited<ReturnType<TokenAuth['api']['createApiKey']>>,
  'id' | 'name' | 'enabled' | 'createdAt' | 'expiresAt'
>;

/** 列表和更新只交付管理需要的字段，不交付哈希、前缀或部分原文。 */
export function publicUploadToken(token: TokenRecord) {
  return {
    id: token.id,
    name: token.name,
    enabled: token.enabled,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
  };
}

export async function readUploadTokenInput<T>(
  request: Request,
  schema: z.ZodType<T>,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw Object.assign(new Error('请提交有效的 JSON Token 信息'), {
      status: 400,
      code: 'INVALID_UPLOAD_TOKEN_INPUT',
    });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw Object.assign(new Error('请检查 Token 信息'), {
      status: 400,
      code: 'INVALID_UPLOAD_TOKEN_INPUT',
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return parsed.data;
}

/** Token 管理使用真实 Cookie，插件从原请求 Headers 读取所有者。 */
export async function uploadTokenResponse(
  request: Request,
  operation: (
    auth: TokenAuth,
  ) => Promise<{ response: unknown; headers: Headers }>,
) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  try {
    await requireOwnerSession(request);
    const result = await operation(getAuth()!);
    result.headers.set('Cache-Control', 'no-store');
    return Response.json(result.response, { headers: result.headers });
  } catch (error) {
    if (isAPIError(error)) {
      const nativeHeaders = new Headers(error.headers);
      for (const [name, value] of nativeHeaders)
        if (name !== 'set-cookie') headers.set(name, value);
      for (const cookie of nativeHeaders.getSetCookie())
        headers.append('set-cookie', cookie);
      headers.set('Cache-Control', 'no-store');
    }
    if (isAPIError(error) && error.statusCode < 500) {
      const messages: Record<string, string> = {
        KEY_NOT_FOUND: 'Token 不存在或已撤销，请刷新列表',
        UNAUTHORIZED_SESSION: '会话已失效，请重新登录',
        INVALID_NAME_LENGTH: '名称须为 1–32 个字符',
        NAME_REQUIRED: '请输入名称',
      };
      return Response.json(
        {
          code: error.body?.code,
          message: messages[error.body?.code ?? ''] ?? 'Token 操作未完成',
        },
        { status: error.statusCode, headers },
      );
    }
    const detail = error as {
      status?: number;
      code?: string;
      fields?: { field: string; message: string }[];
    };
    if (
      error instanceof Error &&
      typeof detail.status === 'number' &&
      detail.status < 500 &&
      typeof detail.code === 'string'
    )
      return Response.json(
        {
          code: detail.code,
          message: error.message,
          ...(detail.fields && { fields: detail.fields }),
        },
        { status: detail.status, headers },
      );
    // Drizzle 包装错误包含查询参数；日志保留底层故障和数据库位置。
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause
        : error;
    const runtime = getServerRuntime();
    createRuntimeLogger('identity.tokens', runtime.config.logLevel).error(
      { err: cause, databasePath: runtime.connection.db.$client.name },
      'Upload Token management failed',
    );
    return Response.json(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Token 操作结果尚未确认，请核对列表后重试',
      },
      { status: 500, headers },
    );
  }
}

/** 供公共单文件上传组合；这里只验证凭据，不接纳或创建上传。 */
export async function verifyUploadToken(
  request: Request,
  auth: TokenAuth | null = getAuth(),
) {
  if (
    request.method !== 'POST' ||
    new URL(request.url).pathname !== '/api/upload'
  )
    return null;
  const bearer = /^Bearer (\S+)$/i.exec(
    request.headers.get('authorization') ?? '',
  );
  if (!auth || !bearer) return null;
  const result = await auth.api.verifyApiKey({
    body: { key: bearer[1], permissions: { upload: ['create'] } },
  });
  // 插件 1.7.5 允许恰好到期；消费已返回的 expiresAt 修正边界，无需二次查库。
  if (
    !result.valid ||
    !result.key ||
    (result.key.expiresAt && Date.now() >= result.key.expiresAt.getTime())
  )
    return null;
  return { tokenId: result.key.id, ownerId: result.key.referenceId };
}
