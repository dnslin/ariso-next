import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { editResponse } from '../../../../../server/media/edit-http.ts';
import {
  readImageEditContext,
  requestImageEdit,
} from '../../../../../server/media/edit-requests.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
export function GET(request: Request, context: Context) {
  return editResponse(request, async () =>
    Response.json(
      readImageEditContext(
        getServerRuntime().connection.db,
        (await context.params).id,
      ),
      { headers },
    ),
  );
}
export function POST(request: Request, context: Context) {
  return editResponse(
    request,
    async () =>
      Response.json(
        requestImageEdit(
          getServerRuntime().connection.db,
          (await context.params).id,
          await request.json(),
        ),
        { status: 202, headers },
      ),
    true,
  );
}
