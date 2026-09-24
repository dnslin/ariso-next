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
      sessionResult(await uploads.receive((await context.params).id, request)),
    202,
  );
}
