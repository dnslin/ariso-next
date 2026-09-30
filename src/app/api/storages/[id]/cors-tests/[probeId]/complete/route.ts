import { z } from 'zod';
import { storageResponse } from '../../../../../../../server/storage/http.ts';
import { getServerRuntime } from '../../../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const inputSchema = z.strictObject({
  results: z
    .array(
      z.strictObject({
        method: z.enum(['PUT', 'GET', 'HEAD']),
        status: z.number().int().min(0).max(599),
        responseType: z.enum(['cors', 'basic', 'opaque', 'error']),
        error: z.string().max(2000).optional(),
      }),
    )
    .max(3)
    .refine(
      (results) =>
        new Set(results.map((result) => result.method)).size === results.length,
      '方法不能重复',
    ),
});
export function POST(
  request: Request,
  context: { params: Promise<{ id: string; probeId: string }> },
) {
  return storageResponse(request, async () => {
    const { id, probeId } = await context.params;
    const input = inputSchema.parse(await request.json());
    return getServerRuntime().storageProbes.finishCors(
      id,
      probeId,
      request.headers.get('origin'),
      input.results,
    );
  });
}
