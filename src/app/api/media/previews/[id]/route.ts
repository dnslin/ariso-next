import { previewResponse } from '../../../../../server/media/preview-http.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return previewResponse(request, async () =>
    getServerRuntime().mediaQueue.previews.get((await context.params).id),
  );
}

export function DELETE(request: Request, context: Context) {
  return previewResponse(request, async () =>
    getServerRuntime().mediaQueue.previews.cancel((await context.params).id),
  );
}
