import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { apiKey } from '@better-auth/api-key';
import { and, eq } from 'drizzle-orm';
import { getServerRuntime } from '../startup/server-start.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import * as schema from './schema.ts';
import { readSetupOwner } from './setup.ts';
import { githubProfileSchema } from './validation.ts';

type Runtime = Pick<
  ReturnType<typeof getServerRuntime>,
  'connection' | 'config' | 'github'
>;
type LoginCredential = Pick<
  typeof schema.account.$inferSelect,
  'id' | 'userId' | 'password'
>;

function createAuth(runtime: Runtime, origin: string) {
  const logger = createRuntimeLogger('identity.auth', runtime.config.logLevel);
  return betterAuth({
    baseURL: origin,
    basePath: '/api/auth',
    secret: runtime.config.betterAuthSecret,
    trustedOrigins: [origin],
    database(options: BetterAuthOptions) {
      const adapter = drizzleAdapter(runtime.connection.db, {
        provider: 'sqlite',
        schema,
        transaction: false,
      })(options);
      const create = adapter.create;
      adapter.create = async (input) => {
        try {
          return await create(input);
        } catch (error) {
          const cause =
            error instanceof Error && error.cause instanceof Error
              ? error.cause
              : error;
          // 两个回调可同时通过前置查询；由现有唯一约束决定赢家，再把冲突带回账号页。
          if (
            input.model === 'account' &&
            input.data.providerId === 'github' &&
            cause instanceof Error &&
            'code' in cause &&
            cause.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
            cause.message ===
              'UNIQUE constraint failed: account.user_id, account.provider_id'
          )
            throw new APIError('FOUND', undefined, {
              Location: `${origin}/settings/account?github=error&error=github_already_linked`,
            });
          throw error;
        }
      };
      return adapter;
    },
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: {
      validateUserInfo({ source }, ctx) {
        if (source.oauth?.providerId !== 'github') return;
        const profile = githubProfileSchema.safeParse(source.oauth.profile);
        if (!profile.success)
          return {
            error: 'github_profile_invalid',
            errorDescription: 'GitHub 账号信息无效，请重新授权',
          };
        if (source.action === 'link-account') {
          const existing = runtime.connection.db
            .select({ accountId: schema.account.accountId })
            .from(schema.account)
            .where(eq(schema.account.providerId, 'github'))
            .get();
          if (existing && existing.accountId !== String(profile.data.id))
            return {
              error: 'github_already_linked',
              errorDescription: '已绑定 GitHub 账号，请先解绑再更换',
            };
        }
        // Better Auth 将同一个请求 context 传给随后的 account create/update hook。
        (
          ctx.context as typeof ctx.context & { githubLogin?: string }
        ).githubLogin = profile.data.login;
      },
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
    account: {
      additionalFields: {
        githubLogin: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
      },
      accountLinking: {
        disableImplicitLinking: true,
        allowDifferentEmails: true,
      },
    },
    socialProviders: runtime.github.enabled
      ? {
          github: {
            clientId: runtime.github.clientId,
            clientSecret: runtime.github.clientSecret!,
            disableSignUp: true,
          },
        }
      : {},
    databaseHooks: {
      account: {
        create: {
          before: async (account, ctx) => ({
            data: account.providerId === 'github' ? githubAccountData(ctx) : {},
          }),
        },
        update: {
          before: async (account, ctx) => ({
            data: account.providerId === 'github' ? githubAccountData(ctx) : {},
          }),
        },
      },
    },
    onAPIError: { errorURL: `${origin}/login?github=error` },
    plugins: [
      apiKey({
        references: 'user',
        requireName: true,
        storage: 'database',
        disableKeyHashing: false,
        startingCharactersConfig: { shouldStore: false },
        enableSessionForAPIKeys: false,
        keyExpiration: {
          defaultExpiresIn: null,
          disableCustomExpiresTime: false,
          minExpiresIn: 1 / 86400,
          maxExpiresIn: Number.POSITIVE_INFINITY,
        },
        rateLimit: { enabled: false },
        permissions: { defaultPermissions: { upload: ['create'] } },
      }),
    ],
    rateLimit: { enabled: true, storage: 'memory' },
    advanced: {
      // 插件先读取全部 Key 再分页；SQLite LIMIT -1 避免默认 100 行截断。
      database: { defaultFindManyLimit: -1 },
      cookiePrefix: 'ariso',
      disableOriginCheck: false,
      disableCSRFCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-in/social' && ctx.body?.provider !== 'github')
          throw new APIError('BAD_REQUEST', {
            code: 'PROVIDER_NOT_FOUND',
            message: '仅支持 GitHub 登录',
          });
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
          const loginCredential =
            typeof ctx.body.email === 'string'
              ? runtime.connection.db
                  .select({
                    id: schema.account.id,
                    userId: schema.account.userId,
                    password: schema.account.password,
                  })
                  .from(schema.account)
                  .innerJoin(
                    schema.user,
                    eq(schema.account.userId, schema.user.id),
                  )
                  .where(
                    and(
                      eq(schema.user.email, ctx.body.email),
                      eq(schema.account.providerId, 'credential'),
                    ),
                  )
                  .get()
              : undefined;
          return { context: { context: { loginCredential } } };
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email' || !ctx.context.newSession) return;
        const created = ctx.context.newSession.session;
        const original = (
          ctx.context as typeof ctx.context & {
            loginCredential?: LoginCredential;
          }
        ).loginCredential;
        // 已创建 session 后同步复核：改密在此前提交则拒绝；此后提交会撤销已有 session。
        const unchanged = runtime.connection.db.transaction(
          (tx) => {
            const current = tx
              .select({
                id: schema.account.id,
                password: schema.account.password,
              })
              .from(schema.account)
              .where(
                and(
                  eq(schema.account.userId, created.userId),
                  eq(schema.account.providerId, 'credential'),
                ),
              )
              .get();
            if (
              original?.userId === created.userId &&
              current?.id === original.id &&
              current.password === original.password
            )
              return true;
            // 库已生成成功 Cookie 与回跳头，拒绝时不能把它们交付给客户端。
            ctx.context.responseHeaders?.delete('set-cookie');
            ctx.context.responseHeaders?.delete('location');
            tx.delete(schema.session)
              .where(eq(schema.session.id, created.id))
              .run();
            return false;
          },
          { behavior: 'immediate' },
        );
        if (!unchanged) {
          ctx.context.setNewSession(null);
          // 在删除事务提交后抛错，避免回滚刚撤销的 session。
          throw new APIError('UNAUTHORIZED', {
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: '邮箱或密码已变化，请重新登录',
          });
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

function githubAccountData(ctx: { context: object } | null) {
  const githubLogin = (ctx?.context as { githubLogin?: string } | undefined)
    ?.githubLogin;
  return {
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    ...(githubLogin !== undefined && { githubLogin }),
  };
}

const processState = globalThis as typeof globalThis & {
  arisoAuthInstances?: WeakMap<
    Runtime,
    { origin: string; auth: ReturnType<typeof createAuth> }
  >;
};

/** 导入不查库。无所有者是正常 setup 状态；已有所有者缺少必需记录是数据错误。 */
export function getAuth(runtime: Runtime = getServerRuntime()) {
  const db = runtime.connection.db;
  const identity = readSetupOwner(db, runtime.connection.db.$client.name);
  if (!identity) return null;
  const origin = new URL(identity.siteSettings.publicUrl).origin;
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
    '/api/auth/sign-in/social': 'POST',
    '/api/auth/callback/github': 'GET',
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
