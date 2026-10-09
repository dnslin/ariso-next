import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { getAuth } from '../../../src/server/identity/auth.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { parseRuntimeEnv } from '../../../src/server/runtime/env.ts';

type Input = {
  database: string;
  origin: string;
  secret: string;
  encryptionKey: string;
  token: string;
  password: string;
};
type Result = { status: number; body: unknown; cookies: string[] };

export async function launchPasswordResetProcess(input: Input) {
  const child = fork(fileURLToPath(import.meta.url), [], {
    execArgv: [],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const consuming = Promise.withResolvers<void>();
  const result = Promise.withResolvers<Result>();
  const closed = once(child, 'close');
  let logs = '';
  child.stdout?.on('data', (chunk) => {
    logs += chunk;
  });
  child.stderr?.on('data', (chunk) => {
    logs += chunk;
  });
  child.on('message', (message) => {
    const event = message as { type: string; result: Result };
    if (event.type === 'consuming') consuming.resolve();
    if (event.type === 'result') result.resolve(event.result);
  });
  child.on('error', (error) => {
    consuming.reject(error);
    result.reject(error);
  });
  child.on('close', (code) => {
    if (code !== 0) {
      const error = new Error(
        `Production password reset child exited ${code}: ${logs}`,
      );
      consuming.reject(error);
      result.reject(error);
    }
  });
  // Recovery credentials stay on the private IPC channel, outside argv/environment.
  child.send({ type: 'configure', input });
  return {
    child,
    consuming: consuming.promise,
    result: result.promise,
    resume: () => child.send({ type: 'resume' }),
    async stop() {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGTERM');
      await closed;
    },
  };
}

async function run() {
  const configured = Promise.withResolvers<Input>();
  const resumed = Promise.withResolvers<void>();
  process.on('message', (message) => {
    const event = message as { type: string; input: Input };
    if (event.type === 'configure') configured.resolve(event.input);
    if (event.type === 'resume') resumed.resolve();
  });
  const input = await configured.promise;
  const connection = openRuntimeDatabase(input.database);
  try {
    const auth = getAuth({
      connection,
      github: { enabled: false, clientId: '', clientSecret: null },
      config: parseRuntimeEnv({
        BETTER_AUTH_SECRET: input.secret,
        ARISO_ENCRYPTION_KEY: input.encryptionKey,
        LOG_LEVEL: 'error',
      }),
    })!;
    const context = await auth.$context;
    const consume = context.adapter.consumeOne;
    context.adapter.consumeOne = async (operation) => {
      // Both children have completed native findMany before either DELETE RETURNING.
      process.send?.({ type: 'consuming' });
      await resumed.promise;
      return consume(operation);
    };
    const response = await auth.handler(
      new Request(`${input.origin}/api/auth/reset-password`, {
        method: 'POST',
        headers: { origin: input.origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          token: input.token,
          newPassword: input.password,
        }),
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
if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
