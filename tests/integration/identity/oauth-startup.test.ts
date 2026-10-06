import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getAuth } from '../../../src/server/identity/auth.ts';
import {
  captureGithubSettings,
  updateGithubSettings,
} from '../../../src/server/identity/github-settings.ts';
import { githubSettings } from '../../../src/server/identity/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { initializeRuntimePaths } from '../../../src/server/runtime/paths.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { startServer } from '../../../src/server/startup/server-start.ts';
import { prepareInitialStorage } from '../../../src/server/storage/defaults.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: ReturnType<typeof startServer> | undefined;
let env: Record<string, string>;
const state = globalThis as typeof globalThis & {
  arisoServerRuntime?: ReturnType<typeof startServer>;
};
const origin = 'http://localhost:3181';
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-oauth-startup-'));
  initializeRuntimePaths(join(directory, 'data'));
  env = {
    DATA_DIR: join(directory, 'data'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    LOG_LEVEL: 'fatal',
  };
  connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, {
    storage: join(env.DATA_DIR, 'storage'),
  });
  await seedAuthOwner(connection, origin);
  const crypto = createSecretCrypto(
    Buffer.from(env.ARISO_ENCRYPTION_KEY, 'hex'),
  );
  updateGithubSettings(
    connection.db,
    crypto,
    captureGithubSettings(connection.db, crypto),
    {
      enabled: true,
      clientId: 'startup-client',
      clientSecret: 'startup-secret',
    },
  );
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
});
afterEach(async () => {
  await runtime?.stop();
  runtime = undefined;
  delete state.arisoServerRuntime;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  connection?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

it('the real Web startup captures credentials before its first authentication request, and only a restarted runtime sees saved changes', async () => {
  runtime = startServer();
  const crypto = createSecretCrypto(runtime.config.encryptionKey);
  updateGithubSettings(connection.db, crypto, runtime.github, {
    enabled: false,
    clientId: 'saved-client',
    clientSecret: 'saved-secret',
  });
  const currentOrigin = 'http://127.0.0.1:3181';
  connection.db.update(siteSettings).set({ publicUrl: currentOrigin }).run();
  const auth = getAuth(runtime)!;
  expect(auth.options.socialProviders).toMatchObject({
    github: {
      clientId: 'startup-client',
      clientSecret: 'startup-secret',
      disableSignUp: true,
    },
  });
  expect(auth.options.baseURL).toBe(currentOrigin);
  const request = await auth.api.signInSocial({
    body: {
      provider: 'github',
      callbackURL: `${currentOrigin}/admin`,
      disableRedirect: true,
    },
    asResponse: true,
  });
  const url = new URL((await request.json()).url);
  expect(url.searchParams.get('client_id')).toBe('startup-client');
  expect(url.searchParams.get('redirect_uri')).toBe(
    `${currentOrigin}/api/auth/callback/github`,
  );
  await runtime.stop();
  delete state.arisoServerRuntime;
  runtime = startServer();
  expect(runtime.github).toEqual({
    enabled: false,
    clientId: 'saved-client',
    clientSecret: 'saved-secret',
  });
  const restarted = getAuth(runtime)!;
  expect(
    (
      await restarted.api.signInSocial({
        body: { provider: 'github' },
        asResponse: true,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await restarted.api.signInEmail({
        body: { email, password },
        asResponse: true,
      })
    ).status,
  ).toBe(200);
});

it.each([true, false])(
  'prestart rejects an undecryptable saved GitHub Secret even when enabled=%s, retains data and succeeds after restoring the key',
  (enabled) => {
    connection.db.update(githubSettings).set({ enabled }).run();
    const rows = connection.db.select().from(githubSettings).all();
    const migrationCount = connection.db.$client
      .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations')
      .get();
    const wrongKey = randomBytes(32).toString('hex');
    const run = (key: string) =>
      spawnSync(process.execPath, [resolve('src/cli/prestart.ts')], {
        env: {
          ...process.env,
          ...env,
          ARISO_ENCRYPTION_KEY: key,
          NODE_OPTIONS: '',
        },
        encoding: 'utf8',
        timeout: 15000,
      });
    const failed = run(wrongKey);
    expect(failed.status).toBe(1);
    expect(failed.stdout, failed.stderr).toContain(
      'identity/github/clientSecret',
    );
    expect(failed.stdout).toContain('密文认证失败');
    for (const secret of [
      'startup-secret',
      env.BETTER_AUTH_SECRET,
      env.ARISO_ENCRYPTION_KEY,
      wrongKey,
      rows[0].clientSecretEncrypted!,
    ])
      expect(failed.stdout + failed.stderr).not.toContain(secret);
    expect(connection.db.select().from(githubSettings).all()).toEqual(rows);
    expect(
      connection.db.$client
        .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations')
        .get(),
    ).toEqual(migrationCount);
    const recovered = run(env.ARISO_ENCRYPTION_KEY);
    expect(recovered.status, recovered.stdout + recovered.stderr).toBe(0);
    expect(connection.db.select().from(githubSettings).all()).toEqual(rows);
  },
);

it('Web startup rejects malformed ciphertext without creating a runtime and recovers with the saved ciphertext', () => {
  const original = connection.db.select().from(githubSettings).get()!
    .clientSecretEncrypted;
  connection.db
    .update(githubSettings)
    .set({ enabled: false, clientSecretEncrypted: 'invalid-ciphertext' })
    .run();
  expect(() => startServer()).toThrow(
    'identity/github/clientSecret: 密文格式无效',
  );
  expect(state.arisoServerRuntime).toBeUndefined();
  expect(
    connection.db.select().from(githubSettings).get()!.clientSecretEncrypted,
  ).toBe('invalid-ciphertext');
  connection.db
    .update(githubSettings)
    .set({ clientSecretEncrypted: original })
    .run();
  runtime = startServer();
  expect(runtime.github.clientSecret).toBe('startup-secret');
});
