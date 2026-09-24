import {
  readUploadJson,
  sessionResult,
  uploadResponse,
} from '../../../../server/upload/http.ts';
import { UploadError } from '../../../../server/upload/errors.ts';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return uploadResponse(request, async ({ uploads }) => {
    const input = await readUploadJson(request);
    if (
      !input ||
      typeof input !== 'object' ||
      !('sessionId' in input) ||
      typeof input.sessionId !== 'string'
    )
      throw new UploadError('UPLOAD_INVALID_INPUT', '需要上传会话 ID');
    return sessionResult(await uploads.retryCleanup(input.sessionId));
  });
}
