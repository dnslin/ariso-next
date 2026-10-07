import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { openFixture } from './fixture.ts';
import { options } from './options.ts';
import * as schema from './schema.ts';

type PasswordOptions = NonNullable<BetterAuthOptions['emailAndPassword']>;
type ResetOptions = {
  sendResetPassword: NonNullable<PasswordOptions['sendResetPassword']>;
  password?: PasswordOptions['password'];
  logger?: BetterAuthOptions['logger'];
  databaseHooks?: BetterAuthOptions['databaseHooks'];
  propagateDeliveryFailure?: boolean;
  onDeliveryError?: (error: unknown) => void;
};

// Library protocol experiment only. No production authentication imports it.
export function createResetFixtureAuth(
  db: ReturnType<typeof openFixture>['db'],
  origin: string,
  secret: string,
  reset: ResetOptions,
) {
  const deliveryFailures = new WeakSet<Request>();
  return betterAuth({
    ...options,
    baseURL: origin,
    secret,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    logger: reset.logger,
    databaseHooks: reset.databaseHooks,
    advanced: {
      ...options.advanced,
      ipAddress: { ipAddressHeaders: ['x-experiment-ip'] },
    },
    emailAndPassword: {
      ...options.emailAndPassword,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      password: reset.password,
      async sendResetPassword(data, request) {
        if (!request)
          throw new Error('The reset experiment requires an HTTP Request');
        if (reset.propagateDeliveryFailure === false)
          return reset.sendResetPassword(data, request);
        // The experiment exercises the handler, which passes this same Request
        // to the callback and after hook. The library catches callback rejects.
        try {
          await reset.sendResetPassword(data, request);
        } catch (error) {
          deliveryFailures.add(request);
          reset.onDeliveryError?.(error);
        }
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/request-password-reset') {
          if (!ctx.request)
            throw new APIError('BAD_REQUEST', {
              code: 'RESET_EXPERIMENT_REQUEST_REQUIRED',
              message: 'The reset experiment requires an HTTP Request',
            });
          if (ctx.body && typeof ctx.body === 'object')
            ctx.body.redirectTo = '/reset-password';
        }
        if (ctx.path === '/reset-password/:token' && ctx.query)
          ctx.query.callbackURL = '/reset-password';
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path !== '/request-password-reset' ||
          !ctx.request ||
          !deliveryFailures.has(ctx.request)
        )
          return;
        deliveryFailures.delete(ctx.request);
        throw new APIError('BAD_GATEWAY', {
          code: 'RESET_EMAIL_DELIVERY_FAILED',
          message: 'Reset email delivery failed; retry or use the local CLI',
        });
      }),
    },
  });
}

export function resetFixtureRequest(
  origin: string,
  endpoint: string,
  body: object,
  ip = '192.0.2.146',
) {
  return new Request(`${origin}/api/auth/${endpoint}`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'x-experiment-ip': ip,
    },
    body: JSON.stringify(body),
  });
}
