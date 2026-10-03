import { previewResponse } from '../../../../../../server/media/preview-http.ts';
import { getServerRuntime } from '../../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return previewResponse(request, async () =>
    getServerRuntime().mediaQueue.previews.result((await context.params).id),
  );
}
