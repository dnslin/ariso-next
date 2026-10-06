import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { openFixture, seedOwner } from './fixture.ts';
import type { GithubConfig } from './github-fixture.ts';
import { launchIdentity } from './http-process.ts';
import { user } from './schema.ts';

type Owner = { email: string; password: string; secret: string };

async function readJson<T>(path: string): Promise<T> {
  const content = await readFile(path, 'utf8');
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Invalid JSON file: ${path}`, { cause: error });
  }
}

const credentials: string[] = [];
function redact(message: string) {
  const keys =
    /^(code|state|client_?secret|access_?token|refresh_?token|password|secret)$/i;
  let result = message.replace(/https?:\/\/[^\s"'<>]+/g, (value) => {
    try {
      const url = new URL(value);
      for (const key of new Set(url.searchParams.keys())) {
        if (keys.test(key)) url.searchParams.set(key, '[redacted]');
      }
      return url.toString();
    } catch {
      return value;
    }
  });
  result = result
    .replace(
      /([?&](?:code|state|client_secret|access_token|refresh_token)=)[^&\s"']+/gi,
      '$1[redacted]',
    )
    .replace(
      /("(?:password|secret|clientSecret|code|state|accessToken|refreshToken)"\s*:\s*")[^"]*"/gi,
      '$1[redacted]"',
    );
  for (const credential of credentials) {
    if (credential) result = result.split(credential).join('[redacted]');
  }
  return result;
}

const controller = new AbortController();
const interrupt = () => controller.abort();
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
let connection: ReturnType<typeof openFixture> | undefined;
let server: Awaited<ReturnType<typeof launchIdentity>> | undefined;
try {
  assert.equal(process.versions.node.split('.')[0], '24');
  assert.ok(
    process.argv[2] && process.argv[3],
    'Usage: node tests/experiments/identity/serve-github.ts <data-directory> <port>',
  );
  const directory = resolve(process.argv[2]);
  const port = Number(process.argv[3]);
  assert.ok(
    Number.isInteger(port) && port > 0 && port <= 65535,
    'Invalid port',
  );
  const origin = `http://127.0.0.1:${port}`;
  const githubPath = join(directory, 'github.json');
  const ownerPath = join(directory, 'owner.json');
  const originPath = join(directory, 'origin.json');
  const dbPath = join(directory, 'auth.db');
  await mkdir(directory, { recursive: true });
  controller.signal.throwIfAborted();
  const github = await readJson<GithubConfig>(githubPath);
  credentials.push(github.clientSecret);
  let owner: Owner;
  try {
    owner = await readJson<Owner>(ownerPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const provider = await readJson<{ email: string }>(
      join(directory, 'provider-email.json'),
    );
    owner = {
      email: provider.email,
      password: randomBytes(24).toString('hex'),
      secret: randomBytes(32).toString('hex'),
    };
    await writeFile(ownerPath, JSON.stringify(owner, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  credentials.push(owner.password, owner.secret);
  try {
    await writeFile(originPath, JSON.stringify({ origin }, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  controller.signal.throwIfAborted();
  connection = openFixture(dbPath);
  if (!connection.db.select({ id: user.id }).from(user).get()) {
    await seedOwner(connection.db, owner.email, owner.password);
  }
  connection.close();
  connection = undefined;
  controller.signal.throwIfAborted();
  server = await launchIdentity(
    dbPath,
    originPath,
    owner.secret,
    port,
    githubPath,
  );
  const deadline = Date.now() + 30000;
  while (!server.logs().includes('Ready in')) {
    controller.signal.throwIfAborted();
    assert.ok(
      server.child.exitCode === null &&
        server.child.signalCode === null &&
        Date.now() < deadline,
      'GitHub experiment did not become ready',
    );
    await setTimeout(100, undefined, { signal: controller.signal });
  }
  controller.signal.throwIfAborted();
  console.log(`Ready: ${origin}\nData: ${directory}\nOwner: ${ownerPath}`);
  await Promise.race([
    once(controller.signal, 'abort'),
    once(server.child, 'close').then(() => {
      throw new Error('GitHub experiment server exited');
    }),
  ]);
} catch (error) {
  if (!controller.signal.aborted) {
    console.error(
      redact(
        `${error instanceof Error ? error.stack : String(error)}\n${server?.logs() ?? ''}`,
      ),
    );
    process.exitCode = 1;
  }
} finally {
  connection?.close();
  if (server) await server.stop();
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
