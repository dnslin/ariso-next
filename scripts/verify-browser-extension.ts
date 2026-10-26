import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { and, eq, gte } from 'drizzle-orm';
import { apikey } from '../src/server/identity/schema.ts';
import { mediaImages, mediaJobs } from '../src/server/media/schema.ts';
import { publicUploadCapabilitiesSchema } from '../src/server/upload/public-contract.ts';
import { password } from '../tests/integration/identity/auth-fixture.ts';
import { publicUploadFixture } from '../tests/integration/upload/api-fixture.ts';
import { scenarioPng } from '../tests/integration/upload/scenario-png.ts';

const commands = ['state', 'hold', 'release', 'revoke', 'stop'] as const;
type Command = (typeof commands)[number];
const holdDelayMs = 60_000;

export type SourceRequest = {
  at: string;
  method: string;
  path: string;
  status: number;
  authorizationPresent: boolean;
  cookiePresent: boolean;
};

export function parseBrowserExtensionFixtureCommand(line: string): Command {
  let command: unknown = line.trim();
  if (typeof command === 'string' && command.startsWith('{')) {
    const input = JSON.parse(command) as { command?: unknown };
    command = input.command;
  }
  if (!commands.includes(command as Command))
    throw new Error(`Expected ${commands.join(' | ')}`);
  return command as Command;
}

/** Controlled image source only; never proxy a URL or read an arbitrary file. */
export async function startExtensionSourceServer(
  images: Record<string, Buffer>,
  requests: SourceRequest[] = [],
) {
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ariso extension acceptance</title></head>
<body style="font:16px system-ui;max-width:900px;margin:32px auto;padding:0 16px"><h1>Ariso extension acceptance</h1>
<p>Controlled local fixtures. Right-click an image and choose Save to Ariso.</p>
<section><h2>Website image</h2><img id="source-image" src="/image.png" alt="Ariso controlled website image" width="320" height="240"></section>
<section><h2>Denied source</h2><img id="denied-image" src="/denied.png" alt="Ariso denied image (HTTP 403)" width="160" height="100"></section>
<section><h2>Redirected source</h2><img id="redirect-image" src="/redirect.png" alt="Ariso redirected image (HTTP 302)" width="160" height="100"></section>
<p><a href="/local.png" download="local-cobalt.png">Download local image</a> · <a href="/clipboard.png" download="clipboard-coral.png">Download clipboard image</a> · <a href="/slow.png" download="long-wait-amber.png">Download long-wait image</a></p></body></html>`;
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const method = request.method ?? 'GET';
    let status: number;
    if (!['GET', 'HEAD'].includes(method)) status = 405;
    else if (pathname === '/denied.png') status = 403;
    else if (pathname === '/redirect.png') status = 302;
    else if (pathname === '/' || images[pathname]) status = 200;
    else status = 404;
    requests.push({
      at: new Date().toISOString(),
      method,
      path: pathname,
      status,
      authorizationPresent: !!request.headers.authorization,
      cookiePresent: !!request.headers.cookie,
    });
    response.setHeader('Cache-Control', 'no-store');
    if (status === 302) response.setHeader('Location', '/image.png');
    if (status === 200)
      response.setHeader(
        'Content-Type',
        pathname === '/' ? 'text/html; charset=utf-8' : 'image/png',
      );
    response.statusCode = status;
    response.end(
      method === 'HEAD'
        ? undefined
        : status === 200
          ? pathname === '/'
            ? page
            : images[pathname]
          : status === 403
            ? 'Controlled source denied'
            : '',
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing source server port');
  return {
    // Separate host permission from the Ariso fixture's 127.0.0.1 origin.
    origin: `http://localhost:${address.port}`,
    async close() {
      if (!server.listening) return;
      const closed = new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      server.closeAllConnections();
      await closed;
    },
  };
}

const secrets = new Set([password]);
function safeFailure(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  // A failed startup assertion can contain a setup-code log from the fixture.
  message = message
    .split('\n')
    .map((line) => {
      try {
        const entry = JSON.parse(line) as { event?: string; code?: unknown };
        return entry.event === 'setup-code'
          ? JSON.stringify({ ...entry, code: '[redacted]' })
          : line;
      } catch {
        return line;
      }
    })
    .join('\n');
  for (const secret of secrets)
    if (secret) message = message.replaceAll(secret, '[redacted]');
  return message;
}
const emit = (value: object) =>
  process.stdout.write(`${JSON.stringify(value)}\n`);

export async function runBrowserExtensionFixture(options: {
  app: string;
  output: string;
}) {
  let fixture: Awaited<ReturnType<typeof publicUploadFixture>> | undefined;
  let source:
    Awaited<ReturnType<typeof startExtensionSourceServer>> | undefined;
  let input: ReturnType<typeof createInterface> | undefined;
  let stopRequested = false;
  let heldSince: number | null = null;
  let tokenRevoked = false;
  const reportPath = join(resolve(options.output), 'fixture.json');
  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    status: 'starting' as 'starting' | 'running' | 'stopped' | 'failed',
    node: process.version,
    app: resolve(options.app),
    origin: null as string | null,
    sourceOrigin: null as string | null,
    requests: [] as SourceRequest[],
    commands: [] as { at: string; command: Command }[],
    state: null as ReturnType<typeof snapshot>,
    error: null as string | null,
    cleanup: [] as { resource: string; status: string; error?: string }[],
  };
  function snapshot() {
    if (!fixture) return null;
    const db = fixture.connection.db;
    const images = db
      .select({
        id: mediaImages.id,
        originalName: mediaImages.originalName,
        visibility: mediaImages.visibility,
        processingStatus: mediaImages.processingStatus,
      })
      .from(mediaImages)
      .all();
    const jobs = db
      .select({
        id: mediaJobs.id,
        imageId: mediaJobs.imageId,
        kind: mediaJobs.kind,
        status: mediaJobs.status,
        createdAt: mediaJobs.createdAt,
        nextAttemptAt: mediaJobs.nextAttemptAt,
      })
      .from(mediaJobs)
      .all();
    return {
      holding: heldSince !== null,
      tokenRevoked,
      count: images.length,
      images,
      jobs,
    };
  }
  const save = () =>
    writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  const requestStop = () => {
    stopRequested = true;
    input?.close();
  };
  await mkdir(resolve(options.output), { recursive: true });
  process.on('SIGINT', requestStop);
  process.on('SIGTERM', requestStop);
  try {
    fixture = await publicUploadFixture(resolve(options.app));
    secrets.add(fixture.cookie);
    const token = await fixture.createToken({
      name: 'Browser extension acceptance',
    });
    secrets.add(token.key);
    const capabilities = await fixture.request('/api/upload/capabilities', {
      headers: { authorization: `Bearer ${token.key}` },
    });
    if (capabilities.status !== 200)
      throw new Error(
        `GET /api/upload/capabilities returned HTTP ${capabilities.status}; build the current standalone first`,
      );
    publicUploadCapabilitiesSchema.parse(await capabilities.json());
    const [local, clipboard, web, slow, privateImage] = await Promise.all(
      ['#356baf', '#e78478', '#87b8a8', '#d1b358', '#745a72'].map(scenarioPng),
    );
    if (web.equals(fixture.bytes))
      throw new Error(
        'Controlled source image must differ from the upload fixture',
      );
    const files = {
      localImagePath: join(fixture.directory, 'local-cobalt.png'),
      clipboardImagePath: join(fixture.directory, 'clipboard-coral.png'),
      slowImagePath: join(fixture.directory, 'long-wait-amber.png'),
      privateImagePath: join(fixture.directory, 'private-plum.png'),
    };
    await Promise.all([
      writeFile(files.localImagePath, local),
      writeFile(files.clipboardImagePath, clipboard),
      writeFile(files.slowImagePath, slow),
      writeFile(files.privateImagePath, privateImage),
    ]);
    source = await startExtensionSourceServer(
      {
        '/image.png': web,
        '/local.png': local,
        '/clipboard.png': clipboard,
        '/slow.png': slow,
        '/private.png': privateImage,
      },
      report.requests,
    );
    const configPath = join(fixture.directory, 'extension-connection.json');
    await writeFile(
      configPath,
      JSON.stringify(
        {
          origin: fixture.origin,
          key: token.key,
          tokenId: token.token.id,
          sourceOrigin: source.origin,
          sourceImageUrl: `${source.origin}/image.png`,
          ...files,
        },
        null,
        2,
      ),
      { mode: 0o600, flag: 'wx' },
    );
    report.origin = fixture.origin;
    report.sourceOrigin = source.origin;
    report.status = 'running';
    report.state = snapshot();
    await save();
    emit({
      event: 'ready',
      configPath,
      origin: fixture.origin,
      sourceOrigin: source.origin,
    });
    if (!stopRequested) {
      input = createInterface({ input: process.stdin, crlfDelay: Infinity });
      for await (const line of input) {
        if (stopRequested) break;
        if (!line.trim()) continue;
        try {
          const command = parseBrowserExtensionFixtureCommand(line);
          report.commands.push({ at: new Date().toISOString(), command });
          const db = fixture.connection.db;
          if (command === 'stop') break;
          if (command === 'hold') {
            const startedAt = Date.now();
            db.$client.exec(
              `CREATE TRIGGER IF NOT EXISTS hold_browser_extension_job AFTER INSERT ON media_jobs WHEN NEW.kind = 'process' BEGIN UPDATE media_jobs SET next_attempt_at = CAST(strftime('%s','now') AS INTEGER) * 1000 + ${holdDelayMs} WHERE id = NEW.id; END`,
            );
            heldSince ??= startedAt;
          } else if (command === 'release') {
            db.$client.exec(
              'DROP TRIGGER IF EXISTS hold_browser_extension_job',
            );
            if (heldSince !== null)
              db.update(mediaJobs)
                .set({ nextAttemptAt: null })
                .where(
                  and(
                    eq(mediaJobs.kind, 'process'),
                    eq(mediaJobs.status, 'queued'),
                    gte(mediaJobs.createdAt, new Date(heldSince)),
                  ),
                )
                .run();
            heldSince = null;
          } else if (command === 'revoke') {
            db.delete(apikey).where(eq(apikey.id, token.token.id)).run();
            tokenRevoked = true;
          }
          report.state = snapshot();
          await save();
          emit({ event: command, ...report.state });
        } catch (error) {
          process.stderr.write(
            `${JSON.stringify({ event: 'command-error', message: safeFailure(error) })}\n`,
          );
        }
      }
    }
    report.state = snapshot();
    report.status = 'stopped';
  } catch (error) {
    report.status = 'failed';
    report.error = safeFailure(error);
    throw error;
  } finally {
    input?.close();
    const cleanup = await Promise.allSettled([
      source?.close(),
      fixture?.close(),
    ]);
    report.cleanup = cleanup.map((result, index) => ({
      resource:
        index === 0 ? 'source-server' : 'ariso-fixture-and-private-files',
      status: result.status,
      ...(result.status === 'rejected' && {
        error: safeFailure(result.reason),
      }),
    }));
    if (cleanup.some((result) => result.status === 'rejected')) {
      report.status = 'failed';
      process.exitCode = 1;
    }
    report.finishedAt = new Date().toISOString();
    await save();
    process.off('SIGINT', requestStop);
    process.off('SIGTERM', requestStop);
    emit({ event: 'stopped', status: report.status });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      app: { type: 'string', default: '.next/standalone' },
      output: { type: 'string', default: 'test-results/browser-extension' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help)
    process.stdout.write(
      'Usage: node scripts/verify-browser-extension.ts [--app .next/standalone] [--output test-results/browser-extension]\nstdin: state | hold | release | revoke | stop (or {"command":"state"})\nhold delays each new process job by 60 real seconds; release can end the hold early. Observe at least 40 seconds before release for long-request acceptance.\nPrivate connection JSON is temporary; never copy its contents to reports.\n',
    );
  else
    await runBrowserExtensionFixture({
      app: values.app!,
      output: values.output!,
    }).catch((error) => {
      process.stderr.write(
        `Browser extension fixture failed: ${safeFailure(error)}\n`,
      );
      process.exitCode = 1;
    });
}
