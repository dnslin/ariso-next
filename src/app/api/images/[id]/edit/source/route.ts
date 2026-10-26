import { z } from 'zod';
import { responseStream } from '../../../../../../server/delivery/stream.ts';
import {
  editResponse,
  editRuntime,
} from '../../../../../../server/media/edit-http.ts';
import { readEditSource } from '../../../../../../server/media/edit-source.ts';
import { readMediaObject } from '../../../../../../server/media/storage.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return editResponse(request, async () => {
    const media = editRuntime();
    const id = (await context.params).id;
    const objectId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get('objectId'));
    const { object, storage } = readEditSource(media, id, objectId);
    const source = await readMediaObject(
      media,
      storage,
      object.key,
      object.mime!,
      request.signal,
    );
    source.stream.on('error', (error) =>
      media.logger.error(
        { err: error, imageId: id, objectId },
        'Image edit source stream failed',
      ),
    );
    return new Response(
      responseStream(
        source.stream,
        request.signal,
        () => undefined,
        (error) =>
          media.logger.error(
            { err: error, imageId: id },
            'Image edit source delivery failed',
          ),
      ),
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': object.mime!,
          'Content-Length': String(object.byteSize),
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  });
}
