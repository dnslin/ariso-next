import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { getAuth } from '../../../src/server/identity/auth.ts';
import { apikey } from '../../../src/server/identity/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { parseRuntimeEnv } from '../../../src/server/runtime/env.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';

it('the production plugin lists every Cookie-owned Token beyond the adapter default 100 records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-token-list-'));
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  try {
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
    const origin = 'http://localhost:3000';
    const ownerId = await seedAuthOwner(connection, origin);
    const auth = getAuth({
      connection,
      config: parseRuntimeEnv({
        DATA_DIR: directory,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      }),
    })!;
    const login = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({ origin }),
      asResponse: true,
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    for (let index = 0; index < 105; index++)
      await auth.api.createApiKey({
        body: { userId: ownerId, name: `client-${index}` },
      });
    const result = await auth.api.listApiKeys({
      headers: new Headers({ cookie }),
    });
    expect(result.apiKeys).toHaveLength(105);
    expect(new Set(result.apiKeys.map((token) => token.id))).toEqual(
      new Set(
        connection.db
          .select()
          .from(apikey)
          .all()
          .map((token) => token.id),
      ),
    );
  } finally {
    connection.close();
    await rm(directory, { recursive: true, force: true });
  }
});
