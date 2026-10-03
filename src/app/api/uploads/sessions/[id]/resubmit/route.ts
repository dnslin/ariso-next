import { z } from 'zod';
import {
  readUploadJson,
  submissionResult,
  uploadResponse,
} from '../../../../../../server/upload/http.ts';
import { UploadError } from '../../../../../../server/upload/errors.ts';

export const runtime = 'nodejs';
const inputSchema = z.strictObject({ requestId: z.string().min(1).max(255) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return uploadResponse(
    request,
    async ({ uploads }) => {
      const input = inputSchema.safeParse(await readUploadJson(request));
      if (!input.success)
        throw new UploadError('UPLOAD_INVALID_INPUT', input.error.message);
      return submissionResult(
        await uploads.resubmit((await context.params).id, input.data.requestId),
      );
    },
    201,
  );
}
