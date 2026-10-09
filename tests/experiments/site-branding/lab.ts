import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ZodError } from 'zod';
import { inspectImageFile } from '../../../src/server/media/file-formats.ts';
import { analyzeMediaError } from '../../../src/server/media/errors.ts';
import { startMediaTool } from '../../../src/server/media/tools.ts';
import { startSvgPreview } from '../../../src/server/media/svg.ts';
import { createMediaResources } from '../../../src/server/media/resources.ts';
import {
  receiveMultipart,
  MultipartReceiveError,
} from '../../../src/server/upload/multipart.ts';

export const BRAND_MAX_BYTES = 5 * 1024 * 1024;
type Kind = 'logo' | 'favicon';

function invalid(cause: unknown) {
  return Object.assign(
    new Error('Invalid or non-static brand image', { cause }),
    {
      code: 'SITE_ASSET_INVALID',
      status: 400,
    },
  );
}

/** Experiment only: reuse the installed content readers and native decoders. */
export async function validateBrandFile(
  path: string,
  workspace: string,
  kind: Kind,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  await access(path);
  let contentExitCode = 1;
  try {
    const facts = await inspectImageFile(path, workspace, signal);
    const allowed =
      kind === 'logo' ? ['PNG', 'JPEG', 'WEBP', 'SVG'] : ['PNG', 'ICO', 'SVG'];
    if (!allowed.includes(facts.format))
      throw Object.assign(
        new Error(`Unsupported ${kind} format: ${facts.format}`),
        {
          code: 'SITE_ASSET_TYPE_UNSUPPORTED',
          status: 415,
        },
      );
    // ICO entries are alternative sizes, not animation frames.
    if (facts.animated || (facts.format !== 'ICO' && facts.pageCount !== 1))
      throw invalid('Animated or multi-image brand asset');
    if (facts.format === 'SVG') {
      contentExitCode = 2;
      const tool = startSvgPreview(
        path,
        join(workspace, 'preview.png'),
        workspace,
        signal,
      );
      const error = await tool.settled;
      if (error) throw error;
      const dimensions = JSON.parse((await tool.child).stdout) as {
        width: number;
        height: number;
      };
      return {
        format: facts.format,
        mime: facts.mime,
        extension: facts.extension,
        ...dimensions,
      };
    }
    // Signature and ping alone can accept truncation. Decode every ICO size too.
    const tool = startMediaTool(
      'magick',
      [
        '-limit',
        'memory',
        '256MiB',
        '-limit',
        'map',
        '0',
        '-limit',
        'thread',
        '1',
        '-regard-warnings',
        `${facts.coder}:${path}`,
        'null:',
      ],
      { workspace, cancelSignal: signal, timeout: 30_000 },
    );
    const error = await tool.settled;
    if (error) throw error;
    if (facts.width === null || facts.height === null)
      throw invalid('Missing image dimensions');
    return {
      format: facts.format,
      mime: facts.mime,
      extension: facts.extension,
      width: facts.width,
      height: facts.height,
    };
  } catch (cause) {
    const detail = cause as { code?: string; exitCode?: number };
    if (
      cause instanceof ZodError ||
      detail.code === 'MEDIA_IDENTIFICATION_FAILED' ||
      (detail.exitCode === contentExitCode &&
        analyzeMediaError(cause).code === 'MEDIA_PROCESS_FAILED')
    )
      throw invalid(cause);
    if (detail.code === 'MEDIA_FORMAT_UNSUPPORTED')
      throw Object.assign(new Error('Unsupported brand image', { cause }), {
        code: 'SITE_ASSET_TYPE_UNSUPPORTED',
        status: 415,
      });
    throw cause;
  }
}

export async function receiveBrandFile(
  request: Request,
  path: string,
  signal: AbortSignal,
  onProgress?: (bytes: number) => void,
) {
  try {
    return await receiveMultipart(request, {
      path,
      signal,
      maxBytes: BRAND_MAX_BYTES,
      resources: createMediaResources(),
      onProgress,
    });
  } catch (cause) {
    if (cause instanceof MultipartReceiveError) {
      if (cause.code === 'UPLOAD_CANCELLED') throw cause;
      if (cause.code === 'UPLOAD_FILE_TOO_LARGE')
        throw Object.assign(new Error('Brand asset exceeds 5 MiB', { cause }), {
          code: 'SITE_ASSET_TOO_LARGE',
          status: 413,
        });
      if (cause.status === 400) throw invalid(cause);
    }
    throw cause;
  }
}

/** Loopback fixture, not an application route. The reference is deliberately in memory. */
export async function startBrandFixture(
  root: string,
  faults: {
    beforeWrite?: () => Promise<void>;
    beforeCommit?: () => Promise<void>;
  } = {},
) {
  await mkdir(root, { recursive: true });
  const current: Partial<Record<Kind, { key: string; mime: string }>> = {};
  const requests: string[] = [];
  const diagnostics: string[] = [];
  const active = new Map<AbortController, Promise<void>>();
  async function handle(
    incoming: IncomingMessage,
    response: ServerResponse,
    controller: AbortController,
  ) {
    const pathname = new URL(incoming.url!, 'http://localhost').pathname;
    requests.push(pathname);
    incoming.once('aborted', () =>
      controller.abort(new Error('Client disconnected')),
    );
    response.once('close', () => {
      if (!response.writableFinished)
        controller.abort(new Error('Client disconnected'));
    });
    const json = (status: number, body: object) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(body));
    };
    try {
      if (incoming.method === 'GET' && pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          '<!doctype html><title>Brand protocol fixture</title><main>Brand protocol fixture</main>',
        );
        return;
      }
      if (
        incoming.method === 'PUT' &&
        ['/branding/logo', '/branding/favicon'].includes(pathname)
      ) {
        const kind = pathname.endsWith('/logo') ? 'logo' : 'favicon';
        const workspace = join(root, `request-${randomUUID()}`);
        await mkdir(workspace);
        const source = join(workspace, 'untrusted-input');
        let candidate: string | undefined;
        let committed = false;
        try {
          const request = new Request(`${origin}${pathname}`, {
            method: 'PUT',
            headers: incoming.headers as HeadersInit,
            body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
            duplex: 'half',
          } as RequestInit);
          const { byteSize } = await receiveBrandFile(
            request,
            source,
            controller.signal,
          );
          const facts = await validateBrandFile(
            source,
            workspace,
            kind,
            controller.signal,
          );
          const key = `${randomUUID()}.${facts.extension}`;
          candidate = join(root, key);
          controller.signal.throwIfAborted();
          await faults.beforeWrite?.();
          controller.signal.throwIfAborted();
          await rename(source, candidate);
          controller.signal.throwIfAborted();
          await faults.beforeCommit?.();
          controller.signal.throwIfAborted();
          const previous = current[kind];
          current[kind] = { key, mime: facts.mime };
          committed = true;
          if (previous) await rm(join(root, previous.key));
          json(200, {
            url: `/branding/${key}`,
            mime: facts.mime,
            format: facts.format,
            bytes: byteSize,
          });
        } finally {
          if (candidate && !committed) await rm(candidate, { force: true });
          await rm(workspace, { recursive: true, force: true });
        }
        return;
      }
      if (incoming.method === 'GET') {
        const asset = Object.values(current).find(
          (item) => pathname === `/branding/${item.key}`,
        );
        if (asset) {
          const bytes = await readFile(join(root, asset.key));
          const svg = asset.mime === 'image/svg+xml';
          response.writeHead(200, {
            'Content-Type': asset.mime,
            'Content-Length': bytes.length,
            'Content-Disposition': `${svg ? 'attachment' : 'inline'}; filename="${asset.key}"`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
            ...(svg
              ? { 'Content-Security-Policy': "sandbox; default-src 'none'" }
              : {}),
          });
          response.end(bytes);
          return;
        }
      }
      json(404, { code: 'NOT_FOUND' });
    } catch (cause) {
      diagnostics.push(cause instanceof Error ? cause.stack! : String(cause));
      const error = cause as { status?: number; code?: string };
      if (!response.destroyed)
        json(error.status ?? 500, {
          code: error.code ?? 'SITE_ASSET_IO_FAILED',
        });
    }
  }
  const server = createServer((incoming, response) => {
    const controller = new AbortController();
    const done = handle(incoming, response, controller).finally(() =>
      active.delete(controller),
    );
    active.set(controller, done);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  return {
    origin,
    requests,
    diagnostics,
    readCurrent: (kind: Kind) => current[kind] ?? null,
    async close() {
      for (const controller of active.keys())
        controller.abort(new Error('Brand fixture closing'));
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server.closeAllConnections();
      await Promise.all([closed, ...active.values()]);
    },
  };
}
