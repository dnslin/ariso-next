import { previewResponse } from '../../../../server/media/preview-http.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return previewResponse(
    request,
    () => getServerRuntime().mediaQueue.previews.receive(request),
    202,
  );
}
