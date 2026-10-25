import { getServerRuntime } from '../../../../../../server/startup/server-start.ts';
import { editResponse } from '../../../../../../server/media/edit-http.ts';
import { retryImageEdit } from '../../../../../../server/media/edit-requests.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return editResponse(
    request,
    async () =>
      Response.json(
        retryImageEdit(
          getServerRuntime().connection.db,
          (await context.params).id,
        ),
        { status: 202, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    true,
  );
}
