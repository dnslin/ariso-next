import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { getServerRuntime } from '../startup/server-start.ts';
import { readSiteSettings } from '../site/settings.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import * as schema from './schema.ts';
import { readSetupOwner } from './setup.ts';

type Runtime = ReturnType<typeof getServerRuntime>;

function createAuth(runtime: Runtime, origin: string) {
  const logger = createRuntimeLogger('identity.auth', runtime.config.logLevel);
  return betterAuth({
    baseURL: origin,
    basePath: '/api/auth',
    secret: runtime.config.betterAuthSecret,
    trustedOrigins: [origin],
    database: drizzleAdapter(runtime.connection.db, {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: {
      additionalFields: {
        ownerSlot: {
          type: 'number',
          required: true,
          defaultValue: 1,
          input: false,
          returned: false,
        },
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false },
    },
    account: { accountLinking: { disableImplicitLinking: true } },
    rateLimit: { enabled: true, storage: 'memory' },
    advanced: {
      cookiePrefix: 'ariso',
      disableOriginCheck: false,
      disableCSRFCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === '/sign-in/email' &&
          ctx.body !== null &&
          typeof ctx.body === 'object' &&
          !Array.isArray(ctx.body)
        ) {
          if (typeof ctx.body?.email === 'string') {
            ctx.body.email = ctx.body.email.trim().toLowerCase();
          }
          // 本产品没有短会话选项；客户端不能改变已确认的 7 天策略。
          ctx.body.rememberMe = true;
        }
      }),
    },
    logger: {
      log(level, message, ...args) {
        logger[level]({ details: args }, message);
      },
    },
  });
}

const processState = globalThis as typeof globalThis & {
  arisoAuthInstances?: WeakMap<
    Runtime,
    { origin: string; auth: ReturnType<typeof createAuth> }
  >;
};

/** 导入不查库。无所有者是正常 setup 状态；已有所有者缺少必需记录是数据错误。 */
export function getAuth(runtime = getServerRuntime()) {
  const db = runtime.connection.db;
  if (!readSetupOwner(db, runtime.connection.db.$client.name)) return null;
  const settings = readSiteSettings(db)!;
  const origin = new URL(settings.publicUrl).origin;
  const instances = (processState.arisoAuthInstances ??= new WeakMap());
  let current = instances.get(runtime);
  if (!current || current.origin !== origin) {
    current = { origin, auth: createAuth(runtime, origin) };
    instances.set(runtime, current);
  }
  return current.auth;
}

/** 仅放行本任务已交付的库路径；后续能力由所属任务扩展。 */
export async function handleAuthRequest(request: Request) {
  const auth = getAuth();
  if (!auth)
    return Response.json(
      { code: 'SETUP_REQUIRED', message: '请先完成初始化' },
      {
        status: 409,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  const allowed = {
    '/api/auth/sign-in/email': 'POST',
    '/api/auth/sign-out': 'POST',
    '/api/auth/get-session': 'GET',
  };
  const pathname = new URL(request.url).pathname;
  if (
    !Object.hasOwn(allowed, pathname) ||
    allowed[pathname as keyof typeof allowed] !== request.method
  ) {
    return Response.json(
      { code: 'NOT_FOUND', message: '认证接口不存在' },
      {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
  const response = await auth.handler(request);
  // Better Auth 1.7.5 会吞掉退出时的数据库异常并返回 success。
  // 验证原 Cookie 已失效后才交付清 Cookie 响应；失败留给调用方重试。
  if (pathname === '/api/auth/sign-out' && response.ok) {
    const remaining = await auth.api.getSession({
      headers: request.headers,
      query: { disableRefresh: true },
    });
    if (remaining) throw new Error('退出失败：数据库中的会话尚未撤销');
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
