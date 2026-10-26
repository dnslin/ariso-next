import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { editResponse } from '../../../../../server/media/edit-http.ts';
import {
  deleteEditTemplate,
  updateEditTemplate,
} from '../../../../../server/media/edit-templates.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };
export function PATCH(request: Request, context: Context) {
  return editResponse(
    request,
    async () =>
      Response.json(
        updateEditTemplate(
          getServerRuntime().connection.db,
          (await context.params).id,
          await request.json(),
        ),
        { headers },
      ),
    true,
  );
}
export function DELETE(request: Request, context: Context) {
  return editResponse(
    request,
    async () => {
      deleteEditTemplate(
        getServerRuntime().connection.db,
        (await context.params).id,
      );
      return Response.json({ deleted: true }, { headers });
    },
    true,
  );
}
