import { respondToArchive } from '../../../../../server/delivery/archive-http.ts';
import { requireOwner } from '../../../../../server/identity/owner.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return respondToArchive(request, async () => {
    const { id } = await context.params;
    return getServerRuntime().archive.download(id, request, async () => {
      await requireOwner(request);
    });
  });
}

export function HEAD() {
  return new Response(null, {
    status: 405,
    headers: { Allow: 'GET', 'Cache-Control': 'private, no-store' },
  });
}
