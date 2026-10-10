import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launch, stop } from '../tests/integration/runtime/process-helpers.ts';

/** Disposable production app/data; the shared runner owns the Ego space. */
export async function runBrandingBrowser({
  spaceId,
  pageLabel,
  output,
  runBrowser,
  signal,
}) {
  const root = await mkdtemp(join(tmpdir(), 'ariso-branding-browser-'));
  let server;
  const credentials = {
    email: 'branding-owner@example.test',
    password: randomBytes(24).toString('hex'),
  };
  try {
    signal.throwIfAborted();
    const app = join(root, 'app');
    await cp(resolve('.next/standalone'), app, {
      recursive: true,
      verbatimSymlinks: true,
    });
    signal.throwIfAborted();
    server = await launch(app, root, {
      HOST: '127.0.0.1',
      PATH: process.env.PATH,
    });
    const loopback = `http://127.0.0.1:${server.port}`;
    const origin = `http://branding-${server.port}.localhost:${server.port}`;
    const deadline = Date.now() + 30000;
    while (true) {
      signal.throwIfAborted();
      assert.equal(server.child.exitCode, null, 'Branding server exited');
      try {
        const response = await fetch(`${loopback}/api/health`, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
        });
        if (response.status === 200) break;
      } catch (error) {
        signal.throwIfAborted();
        if (Date.now() >= deadline) throw error;
      }
      assert.ok(Date.now() < deadline, 'Branding server health timed out');
      await delay(100, undefined, { signal });
    }
    const setupCodes = server
      .logs()
      .split('\n')
      .flatMap((line) => {
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          return [];
        }
        return entry.module === 'identity.setup' && entry.event === 'setup-code'
          ? [entry.code]
          : [];
      });
    assert.equal(setupCodes.length, 1, 'One setup code required');
    const samples = [];
    for (const [kind, file, format, mime, width, height] of [
      ['logo', 'source.png', 'PNG', 'image/png', 64, 48],
      ['logo', 'static.jpg', 'JPEG', 'image/jpeg', 64, 48],
      ['logo', 'static.webp', 'WEBP', 'image/webp', 64, 48],
      ['logo', 'static.svg', 'SVG', 'image/svg+xml', 64, 48],
      ['favicon', 'source.png', 'PNG', 'image/png', 64, 48],
      ['favicon', 'multiple.ico', 'ICO', 'image/x-icon', 64, 64],
      ['favicon', 'static.svg', 'SVG', 'image/svg+xml', 64, 48],
    ])
      samples.push({
        kind,
        format,
        mime,
        width,
        height,
        data: (
          await readFile(resolve('tests/fixtures/media-formats', file))
        ).toString('base64'),
      });
    signal.throwIfAborted();
    await runBrowser(
      '../e2e/branding.mjs',
      {
        spaceId,
        pageLabel,
        origin,
        output,
        setupCode: setupCodes[0],
        credentials,
        samples,
      },
      'branding.log',
    );
  } finally {
    try {
      if (server) await stop(server.child, server.closed);
    } finally {
      try {
        if (server) {
          const safeLogs = server
            .logs()
            .split('\n')
            .map((line) => {
              let entry;
              try {
                entry = JSON.parse(line);
              } catch {
                return line;
              }
              if (
                entry.module === 'identity.setup' &&
                entry.event === 'setup-code'
              )
                return JSON.stringify({ ...entry, code: '[redacted]' });
              return line;
            })
            .join('\n')
            .replaceAll(credentials.password, '[redacted]');
          await writeFile(join(output, 'branding-server.log'), safeLogs);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  }
}
