import { trashImage } from '../../../../../server/media/trash.ts';
import { respondToTrashMutation } from '../trash-response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return respondToTrashMutation(request, context, trashImage);
}
