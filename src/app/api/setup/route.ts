import { hashPassword } from 'better-auth/crypto';
import {
  insertSetupOwner,
  requireSetupOpen,
  SetupError,
  verifySetupCode,
} from '../../../server/identity/setup.ts';
import { setupInputSchema } from '../../../server/identity/validation.ts';
import { prepareInitialMedia } from '../../../server/media/settings.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { initializeSiteSettings } from '../../../server/site/settings.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';
import { resolveUploadStorage } from '../../../server/storage/defaults.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const { connection, setup, config } = getServerRuntime();
  try {
    requireSetupOpen(connection.db, setup.databasePath);
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return json(
        {
          code: 'INVALID_SETUP_INPUT',
          message: '请提交完整的 JSON 初始化信息',
        },
        400,
      );
    }
    const parsed = setupInputSchema.safeParse(body);
    if (!parsed.success)
      return json(
        {
          code: 'INVALID_SETUP_INPUT',
          message: '请检查初始化信息',
          fields: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400,
      );
    const input = parsed.data;
    verifySetupCode(connection.db, setup, input.code);
    const passwordHash = await hashPassword(input.password);
    connection.db.transaction(
      (tx) => {
        verifySetupCode(tx, setup, input.code);
        const storage = resolveUploadStorage(tx);
        if (storage.type !== 'local')
          throw new Error('初始化默认存储必须为本地存储');
        initializeSiteSettings(tx, input);
        prepareInitialMedia(tx);
        insertSetupOwner(tx, input.email, passwordHash);
      },
      { behavior: 'immediate' },
    );
    setup.code = null;
    return json({ code: 'SETUP_COMPLETED', redirectTo: '/login' }, 200);
  } catch (err) {
    if (err instanceof SetupError && err.status < 500)
      return json(
        {
          code: err.code,
          message: err.message,
          ...(err.code === 'SETUP_ALREADY_COMPLETED'
            ? { redirectTo: '/login' }
            : {}),
        },
        err.status,
      );
    // Drizzle 查询错误可能附带绑定参数（包括密码哈希）；仅记录底层诊断。
    const cause =
      err instanceof Error && err.cause instanceof Error ? err.cause : err;
    createRuntimeLogger('identity.setup', config.logLevel).error(
      { err: cause, databasePath: connection.db.$client.name },
      'Initialization request failed',
    );
    return json(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: '初始化失败，请检查服务日志后重试',
      },
      500,
    );
  }
}
