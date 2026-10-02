import { uploadResponse } from '../../../../../../server/upload/http.ts';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return uploadResponse(
    request,
    async ({ uploads }) =>
      await uploads.begin(
        (await context.params).id,
        request.headers.get('origin'),
      ),
    200,
  );
}
