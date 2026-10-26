import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { editResponse } from '../../../../../server/media/edit-http.ts';
import { readImageEditRequest } from '../../../../../server/media/edit-requests.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return editResponse(request, async () =>
    Response.json(
      readImageEditRequest(
        getServerRuntime().connection.db,
        (await context.params).id,
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  );
}
