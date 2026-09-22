import { readObject } from '../../../src/server/storage/local.ts';
import { finished } from 'node:stream/promises';
import type { ReadStream } from 'node:fs';
import { responseStream } from './stream.ts';
import { makeHeaders, preconditionStatus } from './headers.ts';

// These states and gates are test controls, not a media model or production API.
export type Scenario = {
  visibility: 'public' | 'private';
  ready: boolean;
  unavailable: boolean;
  enabled: boolean;
  version: 'original' | 'thumbnail' | 'compressed' | 'watermark';
  objectId: string;
  displayName: string;
  contentType: string;
  extension: string;
  size: number;
  gate: boolean;
  fault?: 'first-read' | 'mid-read' | 'counter';
};
export const defaults: Scenario = {
  visibility: 'public',
  ready: true,
  unavailable: false,
  enabled: true,
  version: 'original',
  objectId: 'sample',
  displayName: '旅行.final',
  contentType: 'image/png',
  extension: 'png',
  size: 0,
  gate: false,
};
export function createCase(state: Scenario) {
  return {
    state,
    opened: 0,
    closed: 0,
    started: 0,
    events: [] as { actualVersion: string; occurredAt: string }[],
    errors: [] as string[],
    releases: [] as (() => void)[],
  };
}
export type Case = ReturnType<typeof createCase>;
const common = {
  'Cache-Control': 'private, no-store, no-transform',
  'X-Content-Type-Options': 'nosniff',
};
function denied(state: Scenario, owner: boolean): [number, string] | undefined {
  if (state.visibility === 'private' && !owner)
    return [401, 'OWNER_LOGIN_REQUIRED'];
  if (!state.ready && !owner) return [409, 'IMAGE_NOT_READY'];
  if (state.unavailable) return [404, 'IMAGE_UNAVAILABLE'];
  if (!state.enabled) return [409, 'STORAGE_DISABLED'];
}
function failure(request: Request, status: number, code: string) {
  return new Response(
    request.method === 'HEAD'
      ? null
      : JSON.stringify({ code, message: '交付实验请求未完成' }),
    {
      status,
      headers: { ...common, 'Content-Type': 'application/json' },
    },
  );
}
async function close(source: ReadStream) {
  source.destroy();
  await finished(source, { cleanup: true }).catch(() => undefined);
}
async function gate(probe: Case, signal: AbortSignal) {
  if (!probe.state.gate) return;
  await new Promise<void>((resolve) => {
    const release = () => {
      signal.removeEventListener('abort', release);
      resolve();
    };
    probe.releases.push(release);
    signal.addEventListener('abort', release, { once: true });
    if (signal.aborted) release();
  });
}

export async function deliver(
  request: Request,
  probe: Case,
  root: string,
  readOwner: () => Promise<boolean>,
) {
  let source: ReadStream | undefined;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const owner = await readOwner();
      const selected = { ...probe.state };
      const initial = denied(selected, owner);
      if (initial) return failure(request, ...initial);
      const object = await readObject(
        root,
        { id: 'probe', localPath: 'files', enabled: selected.enabled },
        selected.objectId,
        selected.contentType,
      );
      source = object.stream;
      probe.opened++;
      source.once('close', () => {
        probe.closed++;
      });
      source.on('error', (error) => {
        probe.errors.push(error.message);
      });
      if (object.size !== selected.size)
        throw new Error(
          `Size mismatch for ${selected.objectId}: ${object.size} != ${selected.size}`,
        );
      await gate(probe, request.signal);
      request.signal.throwIfAborted();
      const finalOwner = await readOwner();
      const current = { ...probe.state };
      const rejected = denied(current, finalOwner);
      if (rejected) {
        await close(source);
        return failure(request, ...rejected);
      }
      if (
        current.objectId !== selected.objectId ||
        current.version !== selected.version
      ) {
        await close(source);
        if (attempt === 1) return failure(request, 409, 'IMAGE_CHANGED');
        continue;
      }
      const headers = makeHeaders({
        ...current,
        imageId: 'probe-image',
        size: object.size,
        actualVersion: current.version,
        download: new URL(request.url).searchParams.get('download') === '1',
      });
      const status = preconditionStatus(request, headers.get('etag')!);
      if (status !== 200 || request.method === 'HEAD') {
        await close(source);
        if (status === 412) return failure(request, 412, 'PRECONDITION_FAILED');
        return new Response(null, { status, headers });
      }
      const stream = source;
      const body = responseStream(
        stream,
        request.signal,
        () => {
          probe.started++;
          if (
            !finalOwner &&
            current.visibility === 'public' &&
            current.ready &&
            current.version !== 'thumbnail'
          ) {
            probe.events.push({
              actualVersion: current.version,
              occurredAt: new Date().toISOString(),
            });
            if (current.fault === 'counter')
              throw new Error('Injected analytics consumer failure');
          }
        },
        (error) => probe.errors.push(String(error)),
        async (chunks) => {
          if (
            current.fault === 'first-read' ||
            (current.fault === 'mid-read' && chunks === 1)
          ) {
            // Inject a disk read failure into a REAL file stream; network remains real Next HTTP.
            stream.destroy(
              Object.assign(new Error(`Injected EIO: ${current.objectId}`), {
                code: 'EIO',
              }),
            );
          }
          if (chunks > 0)
            await new Promise((resolve) => setTimeout(resolve, 5));
        },
      );
      return new Response(body, { headers });
    }
    throw new Error('Unreachable delivery attempt');
  } catch (error) {
    if (source) await close(source);
    probe.errors.push(String(error));
    return failure(
      request,
      (error as { code?: string }).code === 'STORAGE_OBJECT_MISSING'
        ? 404
        : 500,
      (error as { code?: string }).code === 'STORAGE_OBJECT_MISSING'
        ? 'STORAGE_OBJECT_MISSING'
        : 'DELIVERY_FAILED',
    );
  }
}
