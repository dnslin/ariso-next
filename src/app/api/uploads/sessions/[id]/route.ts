import {
  readUploadJson,
  sessionResult,
  uploadResponse,
} from '../../../../../server/upload/http.ts';
export const runtime = 'nodejs';
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return uploadResponse(request, async ({ uploads }) => {
    const input = await readUploadJson(request, { optional: true });
    const transferFailed =
      !!input &&
      typeof input === 'object' &&
      'reason' in input &&
      input.reason === 'transfer-failed';
    return sessionResult(
      await uploads.cancel((await context.params).id, transferFailed),
    );
  });
}
