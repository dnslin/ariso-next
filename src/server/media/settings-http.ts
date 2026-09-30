import { ZodError } from 'zod';
import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';

export async function mediaSettingsResponse(
  request: Request,
  operation: (
    db: ReturnType<typeof getServerRuntime>['connection']['db'],
  ) => unknown | Promise<unknown>,
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    return Response.json(await operation(getServerRuntime().connection.db), {
      headers,
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json(
        {
          code: 'MEDIA_SETTINGS_INVALID',
          message: '请检查图片处理设置字段',
          ...(error instanceof ZodError
            ? {
                fields: error.issues.flatMap((issue) =>
                  issue.code === 'unrecognized_keys'
                    ? issue.keys.map((field) => ({
                        field,
                        message: '未知字段',
                      }))
                    : [{ field: issue.path.join('.'), message: issue.message }],
                ),
              }
            : {}),
        },
        { status: error instanceof ZodError ? 422 : 400, headers },
      );
    }
    const detail = error as { code?: string; status?: number };
    if (detail.status && detail.status < 500 && error instanceof Error) {
      return Response.json(
        { code: detail.code, message: error.message },
        { status: detail.status, headers },
      );
    }
    createRuntimeLogger('media.settings', 'info').error(
      { err: error instanceof Error ? (error.cause ?? error) : error },
      'Media settings request failed',
    );
    return Response.json(
      {
        code: 'MEDIA_SETTINGS_FAILED',
        message: '图片处理设置操作失败，请检查服务日志',
      },
      { status: 500, headers },
    );
  }
}
