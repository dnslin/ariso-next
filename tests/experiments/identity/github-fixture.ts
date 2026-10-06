import { readFileSync } from 'node:fs';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { and, eq } from 'drizzle-orm';
import { openFixture } from './fixture.ts';
import { options } from './options.ts';
import * as schema from './schema.ts';

export type GithubConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
};

// Protocol experiment only. Credentials are captured at startup; origin stays live.
export function createGithubAuth(
  db: ReturnType<typeof openFixture>['db'],
  origin: string,
  secret: string,
  github: GithubConfig,
) {
  const withoutTokens = {
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  };
  return betterAuth({
    ...options,
    baseURL: origin,
    secret,
    trustedOrigins: [origin],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    account: {
      ...options.account,
      accountLinking: {
        disableImplicitLinking: true,
        allowDifferentEmails: true,
      },
    },
    socialProviders: github.enabled
      ? { github: { ...github, disableSignUp: true } }
      : {},
    databaseHooks: {
      account: {
        // Hooks merge their result into the original data, so omission is insufficient.
        create: {
          before: async (account) => ({
            data: account.providerId === 'github' ? withoutTokens : {},
          }),
        },
        update: { before: async () => ({ data: withoutTokens }) },
      },
    },
  });
}

export function openGithubHttpFixture(
  databasePath: string,
  originPath: string,
  github: GithubConfig,
  secret: string,
) {
  const connection = openFixture(databasePath);
  let current: { origin: string; auth: ReturnType<typeof createGithubAuth> };
  function getAuth() {
    const { origin } = JSON.parse(readFileSync(originPath, 'utf8')) as {
      origin: string;
    };
    if (!current || current.origin !== origin) {
      current = {
        origin,
        auth: createGithubAuth(connection.db, origin, secret, github),
      };
    }
    return current.auth;
  }
  return {
    getAuth,
    close: connection.close,
    async manage(request: Request) {
      const auth = getAuth();
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session)
        return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 });
      if (
        request.headers.get('origin') !== new URL(auth.options.baseURL!).origin
      )
        return Response.json({ code: 'INVALID_ORIGIN' }, { status: 403 });
      if (request.method === 'POST') {
        return auth.api.linkSocialAccount({
          headers: request.headers,
          body: { provider: 'github', callbackURL: '/', disableRedirect: true },
          asResponse: true,
        });
      }
      const account = connection.db
        .select({ id: schema.account.id })
        .from(schema.account)
        .where(
          and(
            eq(schema.account.userId, session.user.id),
            eq(schema.account.providerId, 'github'),
          ),
        )
        .get();
      if (!account)
        return Response.json({ code: 'ACCOUNT_NOT_FOUND' }, { status: 404 });
      return auth.api.unlinkAccount({
        headers: request.headers,
        body: { accountId: account.id },
        asResponse: true,
      });
    },
  };
}
