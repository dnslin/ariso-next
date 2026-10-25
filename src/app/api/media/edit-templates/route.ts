import { getServerRuntime } from '../../../../server/startup/server-start.ts';
import { editResponse } from '../../../../server/media/edit-http.ts';
import {
  createEditTemplate,
  listEditTemplates,
} from '../../../../server/media/edit-templates.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export function GET(request: Request) {
  return editResponse(request, () =>
    Response.json(
      { templates: listEditTemplates(getServerRuntime().connection.db) },
      { headers },
    ),
  );
}
export function POST(request: Request) {
  return editResponse(
    request,
    async () =>
      Response.json(
        createEditTemplate(
          getServerRuntime().connection.db,
          await request.json(),
        ),
        { status: 201, headers },
      ),
    true,
  );
}
