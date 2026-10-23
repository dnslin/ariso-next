import { z, ZodError } from 'zod';
import {
  JsonBodyTooLargeError,
  readBoundedJson,
  readBoundedJsonBytes,
} from '../http/json.ts';
import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { BackupError } from './errors.ts';

type Runtime = ReturnType<typeof getServerRuntime>;
type Scope = 'backup' | 'restore';
export type BackupJobContext = { params: Promise<{ id: string }> };
export type RestoreTargetContext = {
  params: Promise<{ id: string; storageId: string }>;
};
export const backupHttpHeaders = { 'Cache-Control': 'no-store' };
const idSchema = z
  .string()
  .uuid('任务 ID 必须是 UUID')
  .transform((value) => value.toLowerCase());
export const backupPasswordInput = z.strictObject({
  password: z.string().min(1, '请输入备份密码'),
});

function json(request: Request, body: unknown, status = 200) {
  return request.method === 'HEAD'
    ? new Response(null, {
        status,
        headers: { ...backupHttpHeaders, 'Content-Type': 'application/json' },
      })
    : Response.json(body, { status, headers: backupHttpHeaders });
}

function failure(request: Request, error: unknown, scope: Scope) {
  const invalid =
    scope === 'backup' ? 'BACKUP_INVALID_INPUT' : 'RESTORE_INVALID_INPUT';
  if (error instanceof ZodError) {
    return json(
      request,
      {
        code: invalid,
        message:
          scope === 'backup' ? '请检查备份请求参数' : '请检查恢复请求参数',
        fields: error.issues.flatMap((issue) =>
          issue.code === 'unrecognized_keys'
            ? issue.keys.map((field) => ({ field, message: '未知字段' }))
            : [
                {
                  field: issue.path.map(String).join('.'),
                  message: issue.message,
                },
              ],
        ),
      },
      400,
    );
  }
  if (error instanceof JsonBodyTooLargeError || error instanceof SyntaxError)
    return json(
      request,
      {
        code: invalid,
        message:
          error instanceof JsonBodyTooLargeError
            ? error.message
            : '请求内容必须是有效的 JSON',
      },
      error instanceof JsonBodyTooLargeError ? 413 : 400,
    );
  const detail = error as { code?: unknown; status?: unknown } | null;
  if (
    error instanceof Error &&
    typeof detail?.code === 'string' &&
    typeof detail.status === 'number' &&
    detail.status >= 400 &&
    detail.status <= 599 &&
    (/^(BACKUP_|RESTORE_|SETUP_)/.test(detail.code) ||
      ['UNAUTHORIZED', 'INVALID_ORIGIN', 'INVALID_SETUP_CODE'].includes(
        detail.code,
      ))
  ) {
    return json(
      request,
      {
        code: detail.code,
        message: error.message,
        ...(detail.code === 'SETUP_ALREADY_COMPLETED'
          ? { redirectTo: '/login' }
          : {}),
      },
      detail.status,
    );
  }
  // Query wrappers can carry bound credentials; retain the underlying diagnostic instead.
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? error.cause
      : error;
  createRuntimeLogger(`backup.${scope}.http`, 'info').error(
    { err: cause, method: request.method, path: new URL(request.url).pathname },
    'Backup HTTP request failed',
  );
  return json(
    request,
    {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        scope === 'backup'
          ? '备份操作失败，请检查服务日志后重试'
          : '恢复操作失败，请检查服务日志后重试',
    },
    500,
  );
}

async function respond(
  request: Request,
  operation: () => unknown | Promise<unknown>,
  scope: Scope,
  status: number,
) {
  try {
    const result = await operation();
    if (result instanceof Response) {
      result.headers.set('Cache-Control', 'no-store');
      return result;
    }
    return json(request, result, status);
  } catch (error) {
    return failure(request, error, scope);
  }
}

/** Owner Cookie and current Origin are checked before route parameters or request content. */
export function backupResponse(
  request: Request,
  operation: (controller: Runtime['backups']) => unknown | Promise<unknown>,
  status = 200,
) {
  return respond(
    request,
    async () => {
      await requireOwner(request);
      return operation(getServerRuntime().backups);
    },
    'backup',
    status,
  );
}

/** The current initialization code authorizes every request; a job ID is never a credential. */
export function restoreResponse(
  request: Request,
  operation: (controller: Runtime['restore']) => unknown | Promise<unknown>,
  status = 200,
) {
  return respond(
    request,
    () => {
      const controller = getServerRuntime().restore;
      controller.authorize(request.headers.get('X-Ariso-Setup-Code') ?? '');
      return operation(controller);
    },
    'restore',
    status,
  );
}

export async function backupJobId(context: BackupJobContext) {
  return z.strictObject({ id: idSchema }).parse(await context.params).id;
}
export async function restoreTargetIds(context: RestoreTargetContext) {
  return z
    .strictObject({ id: idSchema, storageId: z.string().min(1) })
    .parse(await context.params);
}
export async function backupJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  return schema.parse(await readBoundedJson(request));
}
export function backupListQuery(request: Request) {
  const input: Record<string, string> = Object.create(null);
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(input, key))
      throw new BackupError('BACKUP_INVALID_INPUT', 400, '查询参数不能重复');
    input[key] = value;
  }
  return z
    .strictObject({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: idSchema.optional(),
    })
    .parse(input);
}
export async function requireEmptyRestoreBody(request: Request) {
  if ((await readBoundedJsonBytes(request)).byteLength)
    throw new BackupError(
      'RESTORE_INVALID_INPUT',
      400,
      '此恢复操作不接受请求内容',
    );
}

export function restoreUploadHeaders(request: Request) {
  if (
    request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase() !== 'application/octet-stream'
  )
    throw new BackupError(
      'RESTORE_UNSUPPORTED_CONTENT_TYPE',
      415,
      '请使用 application/octet-stream 上传备份文件',
    );
  const integer = z
    .string()
    .regex(/^\d+$/, '须为非负十进制整数')
    .transform(Number)
    .pipe(z.number().int().nonnegative().safe());
  return z
    .strictObject({
      offset: integer,
      total: integer.pipe(z.number().positive()),
    })
    .parse({
      offset: request.headers.get('Upload-Offset'),
      total: request.headers.get('Upload-Length'),
    });
}
