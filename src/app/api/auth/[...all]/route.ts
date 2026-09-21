import { handleAuthRequest } from '../../../../server/identity/auth.ts';
import { createRuntimeLogger } from '../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  try {
    return await handleAuthRequest(request);
  } catch (err) {
    createRuntimeLogger(
      'identity.auth',
      getServerRuntime().config.logLevel,
    ).error({ err }, 'Authentication request failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '认证服务异常' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as HEAD,
  handle as OPTIONS,
};
