import { z } from 'zod';
import { storageResponse } from '../../../../../server/storage/http.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const inputSchema = z.strictObject({
  revision: z.number().int().positive(),
  wholeBucketHasNoLockRules: z.boolean().optional(),
});
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return storageResponse(request, async () => {
    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    return getServerRuntime().storageProbes.test(id, input, request.signal);
  });
}
