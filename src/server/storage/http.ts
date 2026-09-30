import { ZodError } from 'zod';
import { requireOwner } from '../identity/owner.ts';
import { createSecretCrypto } from '../runtime/crypto.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { resolve } from 'node:path';

export async function storageResponse(
  request: Request,
  operation: (
    db: ReturnType<typeof getServerRuntime>['connection']['db'],
    context: {
      storageRoot: string;
      secretCrypto: ReturnType<typeof createSecretCrypto>;
    },
  ) => unknown | Promise<unknown>,
  status = 200,
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    const { connection, config } = getServerRuntime();
    return Response.json(
      await operation(connection.db, {
        storageRoot: resolve(config.dataDir, 'storage'),
        secretCrypto: createSecretCrypto(config.encryptionKey),
      }),
      { status, headers },
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json(
        {
          code: 'STORAGE_INVALID_INPUT',
          message: '请检查存储配置字段',
          ...(error instanceof ZodError
            ? {
                fields: error.issues.map((issue) => ({
                  field: issue.path.join('.'),
                  message: issue.message,
                })),
              }
            : {}),
        },
        { status: 400, headers },
      );
    }
    const detail = error as {
      code?: string;
      status?: number;
      storageId?: string;
      key?: string;
      serviceCode?: string;
      requestId?: string;
    };
    const status =
      detail?.status ??
      (detail?.code === 'STORAGE_INVALID_INPUT'
        ? 400
        : detail?.code === 'STORAGE_TIMEOUT'
          ? 504
          : detail?.code === 'STORAGE_OPERATION_FAILED' ||
              detail?.code === 'STORAGE_BUCKET_UNSUPPORTED'
            ? 502
            : detail?.code === 'STORAGE_NOT_FOUND'
              ? 404
              : [
                    'STORAGE_DISABLED',
                    'STORAGE_IN_USE',
                    'STORAGE_TEST_REQUIRED',
                    'STORAGE_TEST_STALE',
                    'STORAGE_REFERENCES_UNAVAILABLE',
                  ].includes(detail?.code ?? '')
                ? 409
                : 500);
    if (
      (status < 500 || status === 502 || status === 504) &&
      error instanceof Error
    ) {
      if (status === 502 || status === 504) {
        createRuntimeLogger('storage.http', 'info').error(
          { err: error, path: new URL(request.url).pathname },
          'Remote storage operation failed',
        );
      }
      return Response.json(
        {
          code: detail.code,
          message: error.message,
          storageId: detail.storageId,
          key: detail.key,
          serviceCode: detail.serviceCode,
          requestId: detail.requestId,
        },
        { status, headers },
      );
    }
    // Drizzle query errors contain bound values. Keep the underlying diagnostic, not SQL parameters.
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause
        : error;
    createRuntimeLogger('storage.http', 'info').error(
      { err: cause, path: new URL(request.url).pathname },
      'Storage request failed',
    );
    return Response.json(
      {
        code: 'STORAGE_INTERNAL_ERROR',
        message: '存储操作失败，请检查服务日志后重试',
      },
      { status: 500, headers },
    );
  }
}
