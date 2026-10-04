import { resolve } from 'node:path';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openFixture } from '../identity/fixture.ts';
import { options } from '../identity/options.ts';
import * as identitySchema from '../identity/schema.ts';
import * as keySchema from './schema.ts';
import { uploadKeyPlugin } from './options.ts';

export function openKeyFixture(path: string) {
  const connection = openFixture(path);
  try {
    migrate(connection.db, {
      migrationsFolder: resolve('tests/experiments/api-key/drizzle'),
      migrationsTable: 'api_key_experiment_migrations',
    });
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

export function createKeyAuth(
  db: ReturnType<typeof openKeyFixture>['db'],
  origin: string,
  secret: string,
  logger?: BetterAuthOptions['logger'],
) {
  return betterAuth({
    ...options,
    baseURL: origin,
    secret,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { ...identitySchema, ...keySchema },
      transaction: false,
    }),
    plugins: [uploadKeyPlugin()],
    logger,
  });
}

export type KeyAuth = ReturnType<typeof createKeyAuth>;

// Plugin 1.7.5 accepts equality; use its returned expiry without another DB read.
export async function verifyUploadKey(auth: KeyAuth, key: string) {
  const result = await auth.api.verifyApiKey({
    body: { key, permissions: { upload: ['create'] } },
  });
  return !!(
    result.valid &&
    result.key &&
    (!result.key.expiresAt || Date.now() < result.key.expiresAt.getTime())
  );
}
