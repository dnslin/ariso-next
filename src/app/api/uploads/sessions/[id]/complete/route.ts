import {
  sessionResult,
  uploadResponse,
} from '../../../../../../server/upload/http.ts';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return uploadResponse(
    request,
    async ({ uploads }) =>
      sessionResult(await uploads.complete((await context.params).id)),
    202,
  );
}
