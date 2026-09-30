import { z } from 'zod';
import { storageResponse } from '../../../../../server/storage/http.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { readCorsTestState } from '../../../../../server/storage/cors.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const inputSchema = z.strictObject({ revision: z.number().int().positive() });
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return storageResponse(request, async (db) =>
    readCorsTestState(db, (await context.params).id),
  );
}
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return storageResponse(
    request,
    async () => {
      const { id } = await context.params;
      const input = inputSchema.parse(await request.json());
      return getServerRuntime().storageProbes.startCors(
        id,
        input.revision,
        request.headers.get('origin'),
      );
    },
    201,
  );
}
