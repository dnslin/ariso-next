import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { writeSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const startup = new URL(
  '../../../src/server/startup/server-start.ts',
  import.meta.url,
);
const setup = new URL('../../../src/server/identity/setup.ts', import.meta.url);
if (process.argv[2] === 'imports') {
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.ARISO_ENCRYPTION_KEY;
  await import(setup.href);
  await import(startup.href);
  assert.equal(existsSync(process.env.DATA_DIR), false);
} else if (process.argv[2] === 'prestart') {
  await import('../../../src/cli/prestart.ts');
  assert.equal(process.exitCode ?? 0, 0);
  assert.equal(existsSync(join(process.env.DATA_DIR, 'ariso.db')), true);
} else if (
  process.argv[2].startsWith('crash-') ||
  process.argv[2] === 'recover'
) {
  const { startServer } = await import(startup.href);
  const runtime = startServer();
  const { POST } = await import('../../../src/app/api/setup/route.ts');
  const payload = {
    code: runtime.setup.code ?? 'old-code',
    email: 'owner@example.com',
    password: 'a-valid-password',
    publicUrl: 'http://localhost',
    timeZone: 'UTC',
  };
  const mode = process.argv[2];
  const client = runtime.connection.db.$client;
  if (mode === 'crash-hash') {
    // Observe the actual Better Auth Node scrypt job, without replacing hashing.
    // Kill while its promise is pending, before setup can enter a transaction.
    let scryptId;
    const killDuringHash = () => {
      assert.equal(client.inTransaction, false);
      writeSync(2, 'real SCRYPTREQUEST observed; inTransaction=false\n');
      process.kill(process.pid, 'SIGKILL');
    };
    createHook({
      init(id, type) {
        if (type === 'SCRYPTREQUEST') {
          scryptId = id;
          setImmediate(killDuringHash);
        }
      },
      before(id) {
        // If the worker completes first, still stop before its callback resolves.
        if (id === scryptId) killDuringHash();
      },
    }).enable();
  } else if (mode === 'crash-committed') {
    // Test-only boundary probe: complete the actual transaction, then kill before
    // POST clears the code or creates its HTTP response. No production hook.
    const transaction = runtime.connection.db.transaction.bind(
      runtime.connection.db,
    );
    runtime.connection.db.transaction = (...args) => {
      const result = transaction(...args);
      // Media polling also commits transactions while the password is hashing.
      // Interrupt only the committed owner setup, not an unrelated queue poll.
      if (
        !client.inTransaction &&
        client.prepare('SELECT COUNT(*) AS count FROM user').get().count === 1
      )
        process.kill(process.pid, 'SIGKILL');
      return result;
    };
  } else if (mode.startsWith('crash-')) {
    const table = mode.slice('crash-'.length);
    assert.ok(
      ['site_settings', 'media_settings', 'user', 'account'].includes(table),
    );
    // TEMP trigger belongs only to this connection. Kill after the real insert
    // so reopening the database must recover its uncommitted WAL transaction.
    client.function('test_kill_process', () =>
      process.kill(process.pid, 'SIGKILL'),
    );
    client.exec(
      `CREATE TEMP TRIGGER test_crash AFTER INSERT ON "${table}" BEGIN SELECT test_kill_process(); END`,
    );
  }
  const wasComplete = runtime.setup.code === null;
  const response = await POST(
    new Request('http://localhost/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  assert.equal(mode, 'recover', 'crash probe did not terminate the process');
  assert.equal(response.status, wasComplete ? 409 : 200);
  const result = await response.json();
  assert.equal(result.redirectTo, '/login');
  assert.equal(
    result.code,
    wasComplete ? 'SETUP_ALREADY_COMPLETED' : 'SETUP_COMPLETED',
  );
  const { handleAuthRequest } =
    await import('../../../src/server/identity/auth.ts');
  const login = await handleAuthRequest(
    new Request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
      }),
    }),
  );
  assert.equal(login.status, 200);
  assert.ok(login.headers.get('set-cookie')?.includes('session_token'));
  runtime.connection.close();
} else {
  const first = await import(`${startup.href}?generation=1`);
  const second = await import(`${startup.href}?generation=2`);
  assert.notEqual(first, second);
  const runtime = first.startServer();
  assert.ok(runtime.setup.code);
  assert.equal(second.startServer(), runtime);
  assert.equal(first.startServer(), runtime);
  assert.equal(second.getServerRuntime().setup.code, runtime.setup.code);
  runtime.connection.close();
}
