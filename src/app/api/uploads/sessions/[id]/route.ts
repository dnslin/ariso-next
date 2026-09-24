import {
  sessionResult,
  uploadResponse,
} from '../../../../../server/upload/http.ts';
export const runtime = 'nodejs';
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return uploadResponse(request, async ({ uploads }) =>
    sessionResult(await uploads.cancel((await context.params).id)),
  );
}
