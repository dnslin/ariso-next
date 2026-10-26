import { z } from 'zod';
import { imageEditRecipeSchema } from '../../../../../../shared/image-editing.ts';
import { editResponse } from '../../../../../../server/media/edit-http.ts';
import { getServerRuntime } from '../../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const inputSchema = z.strictObject({
  sourceObjectId: z.string().uuid(),
  recipe: imageEditRecipeSchema,
  mode: z.enum(['copy', 'overwrite']).default('copy'),
  target: z.enum(['original', 'watermark']).default('original'),
});

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return editResponse(request, async () => {
    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    const bytes = await getServerRuntime().editPreviews.render(
      id,
      input,
      request.signal,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
