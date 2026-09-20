import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { betterAuth } from 'better-auth';
import { hashPassword } from 'better-auth/crypto';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { options } from './options.ts';
import * as schema from './schema.ts';

export function openFixture(path: string) {
  const connection = openRuntimeDatabase(path);
  migrate(connection.db, {
    migrationsFolder: resolve('tests/experiments/identity/drizzle'),
  });
  return connection;
}

// Only the credential persistence contract, not the product setup workflow.
export async function seedOwner(
  db: ReturnType<typeof openFixture>['db'],
  email: string,
  password: string,
) {
  const hash = await hashPassword(password);
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(schema.user).values({ id, name: 'Owner', email }).run();
    tx.insert(schema.account)
      .values({
        id: randomUUID(),
        userId: id,
        accountId: id,
        providerId: 'credential',
        password: hash,
        updatedAt: new Date(),
      })
      .run();
  });
  return id;
}

export function createFixtureAuth(
  db: ReturnType<typeof openFixture>['db'],
  origin: string,
  secret: string,
  transaction = false,
) {
  return betterAuth({
    ...options,
    baseURL: origin,
    secret,
    database: drizzleAdapter(db, { provider: 'sqlite', schema, transaction }),
    advanced: {
      ...options.advanced,
      // Trusted only inside this loopback experiment, never a deployment policy.
      ipAddress: { ipAddressHeaders: ['x-experiment-ip'] },
    },
  });
}

export function openHttpFixture(
  databasePath: string,
  configPath: string,
  secret: string,
) {
  const connection = openRuntimeDatabase(databasePath);
  let current: { origin: string; auth: ReturnType<typeof createFixtureAuth> };
  return {
    getAuth() {
      const { origin } = JSON.parse(readFileSync(configPath, 'utf8')) as {
        origin: string;
      };
      if (!current || current.origin !== origin) {
        current = {
          origin,
          auth: createFixtureAuth(connection.db, origin, secret),
        };
      }
      return current.auth;
    },
    close: connection.close,
  };
}
