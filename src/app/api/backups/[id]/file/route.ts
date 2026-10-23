import { Readable } from 'node:stream';
import { create as contentDisposition } from 'content-disposition';
import {
  backupJobId,
  backupResponse,
  type BackupJobContext,
} from '../../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function headers(file: { fileName: string; size: number }) {
  return {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(file.size),
    'Content-Disposition': contentDisposition(file.fileName),
    'X-Content-Type-Options': 'nosniff',
  };
}
export function GET(request: Request, context: BackupJobContext) {
  return backupResponse(request, async (controller) => {
    const file = await controller.download(await backupJobId(context));
    const body = Readable.toWeb(file.stream, {
      strategy: { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength },
    });
    const abort = () => {
      file.stream.destroy();
    };
    file.stream.once('close', () =>
      request.signal.removeEventListener('abort', abort),
    );
    if (request.signal.aborted) abort();
    else request.signal.addEventListener('abort', abort, { once: true });
    return new Response(body as ReadableStream<Uint8Array>, {
      headers: headers(file),
    });
  });
}
export function HEAD(request: Request, context: BackupJobContext) {
  return backupResponse(request, async (controller) => {
    const file = await controller.fileInfo(await backupJobId(context));
    return new Response(null, { headers: headers(file) });
  });
}
