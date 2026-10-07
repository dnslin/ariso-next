import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { openFixture } from './fixture.ts';
import {
  createResetFixtureAuth,
  resetFixtureRequest,
} from './reset-fixture.ts';

type ResetProcessInput = {
  database: string;
  origin: string;
  secret: string;
  token: string;
  newPassword: string;
  pauseBeforeConsume?: boolean;
  pauseBeforeHash?: boolean;
};
type ResetProcessResult = { status: number; body: unknown; cookies: string[] };

// Secrets travel over the private IPC channel, never argv or environment.
export async function launchResetProcess(input: ResetProcessInput) {
  const child = fork(fileURLToPath(import.meta.url), [], {
    execPath: process.execPath,
    execArgv: [],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const ready = Promise.withResolvers<void>();
  const consuming = Promise.withResolvers<void>();
  const consumed = Promise.withResolvers<void>();
  const result = Promise.withResolvers<ResetProcessResult>();
  let logs = '';
  child.stdout?.on('data', (chunk) => {
    logs += chunk;
  });
  child.stderr?.on('data', (chunk) => {
    logs += chunk;
  });
  child.on('message', (message) => {
    const event = message as { type: string; result?: ResetProcessResult };
    if (event.type === 'ready') ready.resolve();
    if (event.type === 'before-consume') consuming.resolve();
    if (event.type === 'consumed') consumed.resolve();
    if (event.type === 'result') result.resolve(event.result!);
  });
  child.on('error', (error) => {
    ready.reject(error);
    result.reject(error);
  });
  const closed = once(child, 'close');
  child.on('close', (code) => {
    if (code !== 0) {
      const error = new Error(`Reset experiment exited ${code}: ${logs}`);
      ready.reject(error);
      result.reject(error);
    }
  });
  child.send({ type: 'configure', input });
  await ready.promise;
  return {
    child,
    consuming: consuming.promise,
    consumed: consumed.promise,
    result: result.promise,
    start: () => child.send({ type: 'start' }),
    resumeConsume: () => child.send({ type: 'resume-consume' }),
    resumeHash: () => child.send({ type: 'resume-hash' }),
    async stop() {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGTERM');
      await closed;
    },
  };
}

async function resetProcess() {
  const configured = Promise.withResolvers<ResetProcessInput>();
  const start = Promise.withResolvers<void>();
  const resumeConsume = Promise.withResolvers<void>();
  const resumeHash = Promise.withResolvers<void>();
  process.on('message', (message) => {
    const event = message as { type: string; input?: ResetProcessInput };
    if (event.type === 'configure') configured.resolve(event.input!);
    if (event.type === 'start') start.resolve();
    if (event.type === 'resume-consume') resumeConsume.resolve();
    if (event.type === 'resume-hash') resumeHash.resolve();
  });
  const input = await configured.promise;
  const connection = openFixture(input.database);
  try {
    const auth = createResetFixtureAuth(
      connection.db,
      input.origin,
      input.secret,
      {
        sendResetPassword: async () => {},
        password: {
          async hash(password) {
            process.send?.({ type: 'consumed' });
            if (input.pauseBeforeHash) await resumeHash.promise;
            return hashPassword(password);
          },
        },
        databaseHooks: {
          verification: {
            delete: {
              async before() {
                process.send?.({ type: 'before-consume' });
                if (input.pauseBeforeConsume) await resumeConsume.promise;
              },
            },
          },
        },
      },
    );
    await auth.$context;
    process.send?.({ type: 'ready' });
    await start.promise;
    const response = await auth.handler(
      resetFixtureRequest(input.origin, 'reset-password', {
        token: input.token,
        newPassword: input.newPassword,
      }),
    );
    process.send?.({
      type: 'result',
      result: {
        status: response.status,
        body: await response.json(),
        cookies: response.headers.getSetCookie(),
      },
    });
  } finally {
    connection.close();
    process.disconnect?.();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await resetProcess();
