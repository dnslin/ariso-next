import { respondToMediaCleanup } from '../../../../../server/media/cleanup-http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return respondToMediaCleanup(request, context, 'read');
}
